const { createHash, randomUUID } = require("node:crypto");

const CLASS_COLLECTIONS = new Set([
  "studyBoards", "bookActivities", "bookResources", "bookConfirmations",
  "bookHelpNotes", "bookProjects", "memberships", "presence", "studentNotes",
  "rewards", "kwl", "broadcasts", "classJoinClaims", "classJoinLookup",
]);
const INTERNAL = new Set(["classDeletionJobs", "classStorageRetentions"]);
const PAGE_SIZE = 40;
const LEASE_MS = 120000;
const key = (value) => createHash("sha256").update(value).digest("hex");

function failure(code, message) {
  return Object.assign(new Error(message), { code });
}

function validateClassId(classId) {
  if (typeof classId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(classId)) {
    throw failure("invalid-class", "Invalid class identifier.");
  }
}

function publicStatus(data) {
  if (!data) return null;
  return {
    status: data.status, phase: data.phase,
    deletedDocuments: data.deletedDocuments || 0,
    deletedFiles: data.deletedFiles || 0,
    retainedFiles: data.retainedFiles || 0,
  };
}

async function readClassDeletion(db, classId) {
  validateClassId(classId);
  return publicStatus((await db.doc(`classDeletionJobs/${classId}`).get()).data());
}

function ownedDocument(path, data, classId, inherited) {
  if (inherited) return true;
  const [collection, id, ...descendants] = path.split("/");
  if (descendants.length) return false;
  if (["classes", "classJoinSecrets"].includes(collection)) return id === classId;
  if (["bookProjects", "broadcasts"].includes(collection) && id === classId) {
    return !data?.classId || data.classId === classId;
  }
  return CLASS_COLLECTIONS.has(collection) && data?.classId === classId;
}

function imageReferences(value, classId, found = new Set()) {
  if (typeof value === "string") {
    let decoded = value;
    for (let count = 0; count < 2; count += 1) {
      try { decoded = decodeURIComponent(decoded); } catch { break; }
    }
    // Matching a path on an external host only retains extra files, never deletes them.
    const expression = new RegExp(`book-project-images/${classId}/[A-Za-z0-9_-]+/[a-f0-9]{64}\\.jpg`, "g");
    for (const match of decoded.matchAll(expression)) found.add(match[0]);
  } else if (Array.isArray(value)) {
    for (const item of value) imageReferences(item, classId, found);
  } else if (value && Object.getPrototypeOf(value) === Object.prototype) {
    for (const item of Object.values(value)) imageReferences(item, classId, found);
  }
  return found;
}

async function writeTasks(db, context, tasks) {
  const { jobRef, lease } = context;
  // Deterministic IDs let an interrupted discovery safely repeat without resetting work.
  for (let offset = 0; offset < tasks.length; offset += PAGE_SIZE) {
    const page = tasks.slice(offset, offset + PAGE_SIZE);
    await db.runTransaction(async (tx) => {
      const job = await tx.get(jobRef);
      if (job.data()?.lease !== lease) throw failure("lease-lost", "Deletion lease changed.");
      const refs = page.map((task) => jobRef.collection("scan").doc(key(task.path)));
      const existing = await tx.getAll(...refs);
      page.forEach((task, index) => {
        if (!existing[index].exists) tx.set(refs[index], { ...task, done: false, verified: false });
      });
    });
  }
}

async function acquire(db, classId, uid, bucket) {
  const jobRef = db.doc(`classDeletionJobs/${classId}`);
  const lockRef = db.doc("system/classDeletionLock");
  const classRef = db.doc(`classes/${classId}`);
  const lease = randomUUID();
  const job = await db.runTransaction(async (tx) => {
    const [jobSnap, lock, classroom] = await tx.getAll(jobRef, lockRef, classRef);
    const previous = jobSnap.data();
    if (previous?.status === "completed") {
      if (classroom.exists) throw failure("class-recreated", "A deleted class identifier was reused.");
      return previous;
    }
    if (lock.data()?.active && lock.data().classId !== classId) {
      throw failure("deletion-busy", "Another class deletion must finish first.");
    }
    if (previous?.leaseUntil > Date.now()) throw failure("deletion-busy", "Deletion is already running.");
    if (!previous && (!classroom.exists || classroom.data().archived !== true)) {
      throw failure("class-not-archived", "Archive the class before deleting it.");
    }
    if (previous && previous.bucket !== bucket.name) throw failure("bucket-mismatch", "Deletion bucket changed.");
    const next = {
      ...(previous || { status: "running", phase: "files", bucket: bucket.name,
        deletedDocuments: 0, deletedFiles: 0, retainedFiles: 0, createdAt: Date.now(), requestedBy: uid }),
      status: "running", lastErrorCode: null,
      lease, leaseUntil: Date.now() + LEASE_MS, updatedAt: Date.now(),
    };
    tx.set(jobRef, next);
    tx.set(lockRef, { active: true, classId });
    return next;
  });
  return { jobRef, lockRef, classRef, lease, job };
}

async function saveJob(db, context, patch, work = () => {}) {
  const { jobRef, lease } = context;
  await db.runTransaction(async (tx) => {
    const current = await tx.get(jobRef);
    if (current.data()?.lease !== lease) throw failure("lease-lost", "Deletion lease changed.");
    await work(tx);
    tx.update(jobRef, { ...patch, updatedAt: Date.now() });
  });
  Object.assign(context.job, patch);
}

async function listFiles(db, bucket, classId, context) {
  const [files, next] = await bucket.getFiles({
    prefix: `book-project-images/${classId}/`, autoPaginate: false, maxResults: PAGE_SIZE,
    ...(context.job.filePageToken ? { pageToken: context.job.filePageToken } : {}),
  });
  const manifest = [];
  for (const file of files) {
    if (!file.name.startsWith(`book-project-images/${classId}/`)) throw failure("invalid-file", "Unexpected storage path.");
    const metadata = file.metadata?.generation ? file.metadata : (await file.getMetadata())[0];
    if (!metadata.generation) throw failure("invalid-file", "Storage generation is missing.");
    const supported = new RegExp(`^book-project-images/${classId}/[A-Za-z0-9_-]+/[a-f0-9]{64}\\.jpg$`).test(file.name);
    manifest.push({ ref: context.jobRef.collection("files").doc(key(file.name)), data: {
      name: file.name, generation: String(metadata.generation), shared: !supported, done: false,
    } });
  }
  await saveJob(db, context, {}, async (tx) => {
    for (const item of manifest) tx.set(item.ref, item.data);
  });
  if (next?.pageToken) return saveJob(db, context, { filePageToken: next.pageToken });
  const collections = await db.listCollections();
  await writeTasks(db, context, collections.filter((ref) => !INTERNAL.has(ref.id))
    .map((ref) => ({ path: ref.path, type: "collection", owned: false })));
  return saveJob(db, context, { phase: "scan", filePageToken: null,
    topCollections: collections.filter((ref) => !INTERNAL.has(ref.id)).map((ref) => ref.id) });
}

async function scanTask(db, classId, context) {
  const pending = await context.jobRef.collection("scan").where("done", "==", false).limit(1).get();
  if (pending.empty) return saveJob(db, context, { phase: "delete-documents" });
  const taskRef = pending.docs[0].ref;
  const task = pending.docs[0].data();
  if (task.type === "collection") {
    // listDocuments includes missing parents with live subcollections, unlike a query.
    const documents = await db.collection(task.path).listDocuments();
    await writeTasks(db, context, documents.map((ref) => ({ path: ref.path, type: "document", owned: task.owned })));
    await saveJob(db, context, {}, async (tx) => { tx.update(taskRef, { done: true }); });
    return;
  }
  const ref = db.doc(task.path);
  const snapshot = await ref.get();
  const owned = ownedDocument(task.path, snapshot.data(), classId, task.owned);
  const children = await ref.listCollections();
  await writeTasks(db, context, children.map((child) => ({ path: child.path, type: "collection", owned })));
  if (!owned && snapshot.exists) {
    for (const name of imageReferences(snapshot.data(), classId)) {
      // Nonexistent candidates cannot create a deletion target.
      const fileRef = context.jobRef.collection("files").doc(key(name));
      if ((await fileRef.get()).exists) {
        await saveJob(db, context, {}, async (tx) => { tx.update(fileRef, { shared: true }); });
      }
    }
  }
  await saveJob(db, context, {}, async (tx) => {
    if (owned && task.path !== `classes/${classId}`) {
      tx.set(context.jobRef.collection("documents").doc(key(task.path)), {
        path: task.path, depth: task.path.split("/").length,
        updateTime: snapshot.updateTime || null,
      });
    }
    tx.update(taskRef, { done: true, actualOwned: owned, updateTime: snapshot.updateTime || null,
      children: children.map((child) => child.id) });
  });
}

async function removeFiles(db, bucket, classId, context) {
  const pending = await context.jobRef.collection("files").where("done", "==", false).limit(PAGE_SIZE).get();
  if (pending.empty) return saveJob(db, context, { phase: "cleanup" });
  for (const snapshot of pending.docs) {
    const item = snapshot.data();
    if (!item.name.startsWith(`book-project-images/${classId}/`)) throw failure("invalid-file", "Invalid manifest path.");
    if (!item.shared) {
      try {
        await bucket.file(item.name).delete({ ifGenerationMatch: item.generation });
      } catch (error) {
        if (Number(error.code) !== 404) throw error;
      }
    }
    await saveJob(db, context, {
      deletedFiles: context.job.deletedFiles + (item.shared ? 0 : 1),
      retainedFiles: context.job.retainedFiles + (item.shared ? 1 : 0),
    }, async (tx) => {
      tx.update(snapshot.ref, { done: true });
      if (item.shared) tx.set(db.doc(`classStorageRetentions/${key(item.name)}`), {
        name: item.name, classId, generation: item.generation, retainedAt: Date.now(),
        reason: "shared-or-unrecognized",
      });
    });
  }
}

async function removeDocuments(db, context) {
  const pending = await context.jobRef.collection("documents").orderBy("depth", "desc").limit(PAGE_SIZE).get();
  if (pending.empty) return saveJob(db, context, { phase: "verify" });
  await db.runTransaction(async (tx) => {
    const job = await tx.get(context.jobRef);
    if (job.data()?.lease !== context.lease) throw failure("lease-lost", "Deletion lease changed.");
    const targets = pending.docs.map((snapshot) => db.doc(snapshot.data().path));
    const current = await tx.getAll(...targets);
    for (let index = 0; index < pending.size; index += 1) {
      const expected = pending.docs[index].data().updateTime;
      if (current[index].exists && (!expected || !current[index].updateTime.isEqual(expected))) {
        throw failure("data-changed", "Data changed during deletion; administrator review is required.");
      }
      tx.delete(targets[index]);
      tx.delete(pending.docs[index].ref);
    }
    tx.update(context.jobRef, { deletedDocuments: job.data().deletedDocuments + current.filter((snap) => snap.exists).length });
  });
  context.job = (await context.jobRef.get()).data();
}

async function verifyDeleted(db, classId, context) {
  for (const name of CLASS_COLLECTIONS) {
    if (!(await db.collection(name).where("classId", "==", classId).limit(1).get()).empty) {
      throw failure("residual-data", "Class data remains; deletion is not complete.");
    }
  }
  for (const collection of await context.classRef.listCollections()) {
    if ((await collection.listDocuments()).length) throw failure("residual-data", "Class descendants remain.");
  }
  for (const name of ["bookProjects", "broadcasts", "classJoinSecrets"]) {
    const snap = await db.doc(`${name}/${classId}`).get();
    if (snap.exists && (!snap.data().classId || snap.data().classId === classId)) {
      throw failure("residual-data", "Class metadata remains.");
    }
  }
  const collections = await db.listCollections();
  if (collections.some((ref) => !INTERNAL.has(ref.id) && !context.job.topCollections.includes(ref.id))) {
    throw failure("data-changed", "A collection was added during deletion.");
  }
  await saveJob(db, context, { phase: "validate-references" });
}

async function validateReferences(db, context) {
  const pending = await context.jobRef.collection("scan").where("verified", "==", false).limit(PAGE_SIZE).get();
  if (pending.empty) return saveJob(db, context, { phase: "delete-files" });
  for (const snapshot of pending.docs) {
    const task = snapshot.data();
    if (task.type === "document" && !task.actualOwned && task.path !== "system/classDeletionLock") {
      const ref = db.doc(task.path);
      const current = await ref.get();
      if (current.exists !== Boolean(task.updateTime) ||
          (current.exists && !current.updateTime.isEqual(task.updateTime))) {
        throw failure("data-changed", "Retained data changed during deletion; files have not been removed.");
      }
      const children = await ref.listCollections();
      if (children.some((child) => !task.children.includes(child.id))) {
        throw failure("data-changed", "Retained subcollections changed during deletion.");
      }
    } else if (task.type === "collection" && !task.owned) {
      const refs = await db.collection(task.path).listDocuments();
      for (let offset = 0; offset < refs.length; offset += PAGE_SIZE) {
        const known = await db.getAll(...refs.slice(offset, offset + PAGE_SIZE)
          .map((ref) => context.jobRef.collection("scan").doc(key(ref.path))));
        if (known.some((entry) => !entry.exists)) throw failure("data-changed", "New records appeared during deletion.");
      }
    }
    await saveJob(db, context, {}, async (tx) => { tx.update(snapshot.ref, { verified: true }); });
  }
}

async function cleanup(db, context) {
  for (const name of ["scan", "files"]) {
    const rows = await context.jobRef.collection(name).limit(PAGE_SIZE).get();
    if (!rows.empty) {
      await saveJob(db, context, {}, async (tx) => {
        rows.docs.forEach((row) => tx.delete(row.ref));
      });
      return;
    }
  }
  await saveJob(db, context, { phase: "completed", status: "completed", leaseUntil: 0 }, async (tx) => {
    const [classroom, lock] = await tx.getAll(context.classRef, context.lockRef);
    if (classroom.exists && classroom.data().archived !== true) throw failure("data-changed", "Class was restored during deletion.");
    if (lock.data()?.classId !== context.classRef.id || lock.data()?.active !== true) throw failure("lease-lost", "Maintenance lock changed.");
    tx.delete(context.classRef);
    tx.set(context.lockRef, { active: false });
  });
}

async function advanceClassDeletion(db, bucket, classId, uid) {
  validateClassId(classId);
  if (!bucket?.name || !uid) throw failure("invalid-config", "Deletion requires a bucket and actor.");
  const context = await acquire(db, classId, uid, bucket);
  if (context.job.status === "completed") return publicStatus(context.job);
  try {
    const start = Date.now();
    for (let count = 0; count < 15 && Date.now() - start < 15000; count += 1) {
      await saveJob(db, context, { leaseUntil: Date.now() + LEASE_MS });
      const phase = context.job.phase;
      if (phase === "files") await listFiles(db, bucket, classId, context);
      else if (phase === "scan") await scanTask(db, classId, context);
      else if (phase === "delete-files") await removeFiles(db, bucket, classId, context);
      else if (phase === "delete-documents") await removeDocuments(db, context);
      else if (phase === "verify") await verifyDeleted(db, classId, context);
      else if (phase === "validate-references") await validateReferences(db, context);
      else if (phase === "cleanup") await cleanup(db, context);
      else if (phase === "completed") break;
      else throw failure("invalid-phase", "Unrecognized deletion phase.");
    }
    return publicStatus(context.job);
  } catch (error) {
    const safeCodes = new Set(["data-changed", "residual-data", "invalid-file", "invalid-phase", "lease-lost"]);
    await saveJob(db, context, { status: "failed", lastErrorCode: safeCodes.has(error.code) ? error.code : "operation-failed" });
    throw error;
  } finally {
    // Keep maintenance active on failure; a retry resumes the durable manifest.
    await db.runTransaction(async (tx) => {
      const current = await tx.get(context.jobRef);
      if (current.data()?.lease === context.lease) tx.update(context.jobRef, { leaseUntil: 0 });
    });
  }
}

async function purgeClassData(db, classId) {
  if (!/^(127\.0\.0\.1|localhost):[0-9]+$/.test(process.env.FIRESTORE_EMULATOR_HOST || "") || !db.projectId.startsWith("demo-")) {
    throw failure("emulator-only", "Use the authenticated deletion API outside emulator tests.");
  }
  const bucket = { name: "emulator-no-files", getFiles: async () => [[], null] };
  for (let iteration = 0; iteration < 1000; iteration += 1) {
    if ((await advanceClassDeletion(db, bucket, classId, "emulator-test")).status === "completed") return [];
  }
  throw failure("incomplete", "Deletion did not finish within the test limit.");
}

module.exports = { advanceClassDeletion, readClassDeletion, purgeClassData, imageReferences };
