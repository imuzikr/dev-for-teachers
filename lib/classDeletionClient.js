import { auth as defaultAuth, db as defaultDb, storage as defaultStorage } from "./firebase";
import {
  collection,
  collectionGroup,
  doc,
  getDocFromServer,
  getDocsFromServer,
  query,
  where,
  writeBatch,
} from "firebase/firestore";
import { deleteObject, list, ref as storageRef } from "firebase/storage";

const DELETE_BATCH_SIZE = 100;
const CLASS_IMAGE_PREFIX = "book-project-images";
const VALID_CLASS_ID = /^[A-Za-z0-9_-]{1,128}$/;
const CLASS_IMAGE_PATH = /^book-project-images\/([A-Za-z0-9_-]{1,128})\/[A-Za-z0-9_-]+\/[a-f0-9]{64}\.jpg$/i;
const ENCODED_OBJECT_PATH = /(?:\/o\/|[?&]name=)([^?&#]+)/g;
const PLAIN_OBJECT_PATH = /book-project-images\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]+\/[a-f0-9]{64}\.jpg/gi;

class ClassDeletionClientError extends Error {
  constructor(message, code = "class-deletion/failed") {
    super(message);
    this.name = "ClassDeletionClientError";
    this.code = code;
  }
}

function uniqueRefs(refs) {
  const seen = new Set();
  return refs.filter((ref) => {
    if (seen.has(ref.path)) return false;
    seen.add(ref.path);
    return true;
  });
}

function sortDescendantsFirst(refs) {
  return [...refs].sort((left, right) => {
    const depth = right.path.split("/").length - left.path.split("/").length;
    return depth || left.path.localeCompare(right.path);
  });
}

function dataOf(snapshot) {
  return snapshot.exists() ? snapshot.data() : null;
}

async function docsIn(ref) {
  return (await getDocsFromServer(ref)).docs;
}

async function docsWhere(db, name, field, value) {
  return docsIn(query(collection(db, name), where(field, "==", value)));
}

function throwClient(message, code) {
  throw new ClassDeletionClientError(message, code);
}

function addStoragePathCandidates(value, paths) {
  let candidate = value;
  for (let index = 0; index < 3; index += 1) {
    for (const match of candidate.matchAll(PLAIN_OBJECT_PATH)) paths.add(match[0]);
    try {
      const decoded = decodeURIComponent(candidate);
      if (decoded === candidate) return;
      candidate = decoded;
    } catch {
      return;
    }
  }
}

function extractStoragePaths(value, paths = new Set()) {
  if (typeof value === "string") {
    for (const match of value.matchAll(ENCODED_OBJECT_PATH)) {
      addStoragePathCandidates(match[1], paths);
    }
    addStoragePathCandidates(value, paths);
    return paths;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => extractStoragePaths(item, paths));
    return paths;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => extractStoragePaths(item, paths));
  }
  return paths;
}

function isClassImage(path, classId) {
  const match = path.match(CLASS_IMAGE_PATH);
  return match?.[1] === classId;
}

async function listAllStorageFiles(storage, classId) {
  const files = [];
  const queue = [storageRef(storage, `${CLASS_IMAGE_PREFIX}/${classId}/`)];
  while (queue.length > 0) {
    const prefix = queue.shift();
    let pageToken;
    do {
      const page = await list(prefix, { maxResults: DELETE_BATCH_SIZE, pageToken });
      files.push(...page.items);
      queue.push(...page.prefixes);
      pageToken = page.nextPageToken;
    } while (pageToken);
  }
  return files;
}

async function deleteStorageFiles(files) {
  let deletedFiles = 0;
  for (const file of files) {
    try {
      await deleteObject(file);
      deletedFiles += 1;
    } catch (error) {
      if (error?.code === "storage/object-not-found") {
        deletedFiles += 1;
        continue;
      }
      const failure = new ClassDeletionClientError("파일 삭제에 실패했어요. 일부 반 기록은 이미 삭제됐을 수 있지만 반은 남아 있어요. 잠시 후 같은 반 삭제를 다시 시도해 주세요.", "class-deletion/file-delete-failed");
      failure.cause = error;
      throw failure;
    }
  }
  return deletedFiles;
}

async function collectNestedDeleteRefs(db, classId) {
  const refs = [];
  for (const name of ["attendanceRecords", "questionSignals", "seatLayouts", "groupAssignments"]) {
    refs.push(...(await docsIn(collection(db, "classes", classId, name))).map((snapshot) => snapshot.ref));
  }
  const boards = await docsWhere(db, "studyBoards", "classId", classId);
  for (const board of boards) {
    refs.push(...(await docsIn(collection(board.ref, "cards"))).map((snapshot) => snapshot.ref), board.ref);
  }
  const activities = await docsWhere(db, "bookActivities", "classId", classId);
  const activityPaths = new Set(activities.map((activity) => activity.ref.path));
  for (const activity of activities) {
    refs.push(...(await docsIn(collection(activity.ref, "entries"))).map((snapshot) => snapshot.ref));
    const groups = await docsIn(collection(activity.ref, "groups"));
    for (const group of groups) {
      refs.push(...(await docsIn(collection(group.ref, "words"))).map((snapshot) => snapshot.ref), group.ref);
    }
    refs.push(activity.ref);
  }
  const orphanWords = (await docsIn(collectionGroup(db, "words")))
    .filter((snapshot) => {
      const activityPath = snapshot.ref.path.split("/groups/")[0];
      return activityPaths.has(activityPath);
    })
    .map((snapshot) => snapshot.ref);
  refs.push(...orphanWords);
  return refs;
}

async function directClassDocRef(db, name, classId) {
  const ref = doc(db, name, classId);
  const snapshot = await getDocFromServer(ref);
  if (!snapshot.exists()) return null;
  const value = snapshot.data();
  if (value?.classId && value.classId !== classId) return null;
  return ref;
}

async function collectTopDeleteRefs(db, classId) {
  const refs = [];
  for (const name of ["bookResources", "bookHelpNotes", "bookProjects", "bookConfirmations", "broadcasts", "memberships", "presence", "studentNotes", "classJoinClaims", "classJoinLookup", "rewards", "kwl"]) {
    refs.push(...(await docsWhere(db, name, "classId", classId)).map((snapshot) => snapshot.ref));
  }
  const directRefs = [
    await directClassDocRef(db, "classJoinSecrets", classId),
    await directClassDocRef(db, "bookProjects", classId),
    await directClassDocRef(db, "broadcasts", classId),
  ];
  for (const ref of directRefs) {
    if (ref) refs.push(ref);
  }
  return uniqueRefs(refs);
}

async function collectDeleteRefs(db, classId) {
  const classRef = doc(db, "classes", classId);
  return {
    classRef,
    refs: sortDescendantsFirst(uniqueRefs([
      ...(await collectNestedDeleteRefs(db, classId)),
      ...(await collectTopDeleteRefs(db, classId)),
    ].filter((ref) => ref.path !== classRef.path))),
  };
}

async function collectSurvivingRefs(db, deletePaths) {
  const snapshots = [];
  for (const name of ["classes", "lessons", "questions", "notices", "users", "bookResources", "bookProjects", "bookHelpNotes", "bookConfirmations", "broadcasts", "memberships", "presence", "studentNotes", "classJoinClaims", "classJoinLookup", "rewards", "kwl"]) {
    snapshots.push(...await docsIn(collection(db, name)));
  }
  const questions = snapshots.filter((snapshot) => snapshot.ref.path.startsWith("questions/"));
  for (const question of questions) snapshots.push(...await docsIn(collection(question.ref, "answers")));
  for (const name of ["answers", "cards", "entries", "words"]) {
    snapshots.push(...await docsIn(collectionGroup(db, name)));
  }
  const boards = (await docsIn(collection(db, "studyBoards"))).filter((snapshot) => !deletePaths.has(snapshot.ref.path));
  snapshots.push(...boards);
  for (const board of boards) snapshots.push(...(await docsIn(collection(board.ref, "cards"))).filter((snapshot) => !deletePaths.has(snapshot.ref.path)));
  const activities = (await docsIn(collection(db, "bookActivities"))).filter((snapshot) => !deletePaths.has(snapshot.ref.path));
  snapshots.push(...activities);
  for (const activity of activities) {
    snapshots.push(...(await docsIn(collection(activity.ref, "entries"))).filter((snapshot) => !deletePaths.has(snapshot.ref.path)));
    const groups = (await docsIn(collection(activity.ref, "groups"))).filter((snapshot) => !deletePaths.has(snapshot.ref.path));
    snapshots.push(...groups);
    for (const group of groups) snapshots.push(...(await docsIn(collection(group.ref, "words"))).filter((snapshot) => !deletePaths.has(snapshot.ref.path)));
  }
  const paths = new Set();
  snapshots
    .filter((snapshot) => !deletePaths.has(snapshot.ref.path))
    .forEach((snapshot) => extractStoragePaths(snapshot.data(), paths));
  return paths;
}

async function commitDeletes(db, refs) {
  let deletedDocuments = 0;
  for (let index = 0; index < refs.length; index += DELETE_BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = refs.slice(index, index + DELETE_BATCH_SIZE);
    chunk.forEach((ref) => batch.delete(ref));
    try {
      await batch.commit();
    } catch (error) {
      const failure = new ClassDeletionClientError("반 기록 삭제에 실패했어요. 반은 남아 있어요. 잠시 후 같은 반 삭제를 다시 시도해 주세요.", "class-deletion/document-delete-failed");
      failure.cause = error;
      failure.firebaseCode = error?.code;
      throw failure;
    }
    deletedDocuments += chunk.length;
  }
  return deletedDocuments;
}

export async function deleteClassInBrowser(classId, options = {}) {
  if (!VALID_CLASS_ID.test(classId)) {
    throwClient("반 ID가 올바르지 않아요.", "class-deletion/invalid-class-id");
  }
  const db = options.db ?? defaultDb;
  const auth = options.auth ?? defaultAuth;
  const storage = options.storage ?? defaultStorage;
  const currentUser = auth?.currentUser;
  if (!db || !storage || !currentUser?.uid || !currentUser?.getIdToken) {
    throwClient("관리자 로그인이 필요해요.", "class-deletion/auth-required");
  }
  await currentUser.getIdToken();
  const admin = dataOf(await getDocFromServer(doc(db, "system", "admin")));
  if (admin?.uid !== currentUser.uid) {
    throwClient("관리자만 반을 삭제할 수 있어요.", "class-deletion/admin-required");
  }
  const classRef = doc(db, "classes", classId);
  const classData = dataOf(await getDocFromServer(classRef));
  if (!classData) throwClient("삭제할 반을 찾지 못했어요.", "class-deletion/class-not-found");
  if (classData.archived !== true) {
    throwClient("보관된 반만 삭제할 수 있어요. 삭제 전에 먼저 반을 보관해 주세요.", "class-deletion/class-not-archived");
  }

  const manifest = await collectDeleteRefs(db, classId);
  const deletePaths = new Set([...manifest.refs.map((ref) => ref.path), manifest.classRef.path]);
  const survivingStoragePaths = await collectSurvivingRefs(db, deletePaths);
  const listedFiles = await listAllStorageFiles(storage, classId);
  const filesToDelete = listedFiles.filter((file) => isClassImage(file.fullPath, classId) && !survivingStoragePaths.has(file.fullPath));
  const retainedFiles = listedFiles.length - filesToDelete.length;
  const deletedChildren = await commitDeletes(db, manifest.refs);
  const deletedFiles = await deleteStorageFiles(filesToDelete);
  const deletedRoot = await commitDeletes(db, [manifest.classRef]);
  return { status: "completed", deletedDocuments: deletedChildren + deletedRoot, deletedFiles, retainedFiles };
}

export { ClassDeletionClientError };
