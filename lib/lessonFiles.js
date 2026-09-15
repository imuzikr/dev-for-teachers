import { collection, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp, runTransaction } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage, isFirebaseConfigured } from "./firebase";
import { validateLessonFile, lessonFileDisposition } from "./lessonFilePolicy";

const mockFiles = new Map();
const mockClassFiles = new Map();
const listeners = new Set();
function notify() { listeners.forEach(listener => listener()); }
function fileCollection(uid) { return collection(db, "lessonFiles", uid, "files"); }
function classFileCollection(classId) { return collection(db, "classes", classId, "lessonFiles"); }

export function subscribeClassLessonFiles(classId, onFiles, onError) {
  if (!classId) { onFiles([]); return () => {}; }
  if (isFirebaseConfigured) return onSnapshot(classFileCollection(classId), snapshot => {
    onFiles(snapshot.docs.map(item => ({ ...item.data(), id: item.id })));
  }, onError);
  const emit = () => onFiles([...(mockClassFiles.get(classId)?.values() ?? [])]);
  listeners.add(emit);
  emit();
  return () => listeners.delete(emit);
}

export async function setLessonFileDistribution(user, { classId, className, file, published }) {
  if (!user?.uid || user.uid !== file?.ownerId) throw new Error("본인의 자료만 배포할 수 있습니다.");
  if (!classId || typeof published !== "boolean") throw new Error("배포 정보가 올바르지 않습니다.");
  if (!isFirebaseConfigured) {
    const source = mockFiles.get(file.id);
    if (!source || source.deleting) throw new Error("자료를 찾을 수 없거나 삭제 중입니다.");
    const shares = mockClassFiles.get(classId) ?? new Map();
    const sharedClasses = { ...source.sharedClasses };
    if (published) {
      if (shares.has(file.id)) return;
      const { id, ownerId, name, size, extension, storagePath } = source;
      const downloadUrl = URL.createObjectURL(source.blob);
      shares.set(id, { id, ownerId, name, size, extension, storagePath, downloadUrl });
      sharedClasses[classId] = className || classId;
    } else {
      const share = shares.get(file.id);
      if (share) URL.revokeObjectURL(share.downloadUrl);
      shares.delete(file.id);
      delete sharedClasses[classId];
    }
    mockClassFiles.set(classId, shares);
    mockFiles.set(file.id, { ...source, sharedClasses });
    notify();
    return;
  }
  // Resolve the capability URL before the transaction; the source is rechecked inside it.
  const downloadUrl = published ? await lessonFileUrl(file) : null;
  const sourceRef = doc(fileCollection(user.uid), file.id);
  const shareRef = doc(classFileCollection(classId), file.id);
  await runTransaction(db, async transaction => {
    const sourceSnapshot = await transaction.get(sourceRef);
    const shareSnapshot = await transaction.get(shareRef);
    if (!sourceSnapshot.exists()) throw new Error("자료를 찾을 수 없습니다.");
    const source = sourceSnapshot.data();
    if (source.deleting) throw new Error("삭제 중인 자료는 배포할 수 없습니다.");
    if (published === shareSnapshot.exists()) return;
    const sharedClasses = { ...source.sharedClasses };
    if (published) {
      const { ownerId, name, size, extension, storagePath } = source;
      transaction.set(shareRef, { id: file.id, ownerId, name, size, extension, storagePath, downloadUrl });
      sharedClasses[classId] = className || classId;
    } else {
      transaction.delete(shareRef);
      delete sharedClasses[classId];
    }
    transaction.update(sourceRef, { sharedClasses, lastSharedClassId: classId });
  });
}

export function subscribeLessonFiles(uid, onFiles, onError) {
  if (!uid) { onFiles([]); return () => {}; }
  if (isFirebaseConfigured) return onSnapshot(fileCollection(uid), snapshot => {
    onFiles(snapshot.docs.map(item => ({ sharedClasses: {}, deleting: false, ...item.data(), id: item.id }))
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)));
  }, onError);
  const emit = () => onFiles([...mockFiles.values()].filter(file => file.ownerId === uid).reverse());
  listeners.add(emit);
  emit();
  return () => listeners.delete(emit);
}

export async function addLessonFile(user, file, onProgress) {
  if (!user?.uid) throw new Error("로그인이 필요합니다.");
  const extension = validateLessonFile(file);
  const id = crypto.randomUUID();
  const storagePath = `lesson-files/${user.uid}/${id}.${extension}`;
  const data = { ownerId: user.uid, name: file.name, size: file.size, extension, storagePath, sharedClasses: {}, deleting: false };
  if (!isFirebaseConfigured) {
    mockFiles.set(id, { id, ...data, blob: file });
    onProgress?.(1);
    notify();
    return;
  }
  const object = ref(storage, storagePath);
  // Force download, including active formats such as HTML and SVG.
  const task = uploadBytesResumable(object, file, {
    contentType: "application/octet-stream", contentDisposition: lessonFileDisposition(file.name),
  });
  await new Promise((resolve, reject) => task.on("state_changed", snapshot => {
    onProgress?.(snapshot.totalBytes ? snapshot.bytesTransferred / snapshot.totalBytes : 0);
  }, reject, resolve));
  try {
    await setDoc(doc(fileCollection(user.uid), id), { ...data, createdAt: serverTimestamp() });
  } catch (error) {
    try { await deleteObject(object); } catch (cleanupError) { console.warn("Lesson file cleanup failed", cleanupError.code); }
    throw error;
  }
}

export async function lessonFileUrl(file) {
  if (file.downloadUrl) return file.downloadUrl;
  if (!isFirebaseConfigured) {
    const stored = mockFiles.get(file.id);
    if (!stored) throw new Error("자료를 찾을 수 없습니다.");
    return URL.createObjectURL(stored.blob);
  }
  return getDownloadURL(ref(storage, file.storagePath));
}

export async function deleteLessonFile(user, file) {
  if (!user?.uid || user.uid !== file.ownerId) throw new Error("본인의 자료만 삭제할 수 있습니다.");
  if (!isFirebaseConfigured) {
    if (Object.keys(mockFiles.get(file.id)?.sharedClasses ?? {}).length) throw new Error("배포를 해제한 후 삭제할 수 있습니다.");
    mockFiles.delete(file.id); notify(); return;
  }
  const expected = `lesson-files/${user.uid}/${file.id}.${file.extension}`;
  if (file.storagePath !== expected) throw new Error("파일 경로가 올바르지 않습니다.");
  const sourceRef = doc(fileCollection(user.uid), file.id);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(sourceRef);
    if (!snapshot.exists()) return;
    const source = snapshot.data();
    if (Object.keys(source.sharedClasses ?? {}).length) throw new Error("배포를 해제한 후 삭제할 수 있습니다.");
    if (!source.deleting) transaction.update(sourceRef, { deleting: true });
  });
  try { await deleteObject(ref(storage, expected)); }
  catch (error) { if (error.code !== "storage/object-not-found") throw error; }
  await deleteDoc(sourceRef);
}
