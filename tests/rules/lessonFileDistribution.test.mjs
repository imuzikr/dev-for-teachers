import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { collection, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, writeBatch, runTransaction, serverTimestamp } from "firebase/firestore";

test("lesson publications require atomic linkage and protect originals", async () => {
  const projectId = process.env.GCLOUD_PROJECT;
  assert.match(projectId, /^demo-/);
  const target = key => { const [host, port] = process.env[key].split(":"); return { host, port: Number(port) }; };
  const env = await initializeTestEnvironment({ projectId,
    firestore: { rules: readFileSync("firestore.rules", "utf8"), ...target("FIRESTORE_EMULATOR_HOST") },
    storage: { rules: readFileSync("storage.rules", "utf8"), ...target("FIREBASE_STORAGE_EMULATOR_HOST") },
  });
  try {
    await env.clearFirestore();
    await env.clearStorage();
    const owner = env.authenticatedContext("teacher", { role: "teacher" });
    const other = env.authenticatedContext("other", { role: "teacher" });
    const student = env.authenticatedContext("student", { role: "student" });
    const admin = env.authenticatedContext("admin");
    const anonymous = env.unauthenticatedContext();
    const db = owner.firestore();
    const id = "12345678-1234-1234-1234-123456789abc";
    const path = `lesson-files/teacher/${id}.txt`;
    const source = (database = db, fileId = id, ownerId = "teacher") => doc(database, "lessonFiles", ownerId, "files", fileId);
    const share = (classId = "a", database = db, fileId = id) => doc(database, "classes", classId, "lessonFiles", fileId);
    const payload = { ownerId: "teacher", name: "lesson.txt", size: 14, extension: "txt", storagePath: path, createdAt: serverTimestamp() };
    await env.withSecurityRulesDisabled(async context => {
      const seed = context.firestore();
      await setDoc(doc(seed, "system", "admin"), { uid: "admin" });
      for (const [classId, createdBy, archived] of [["a", "teacher", false], ["b", "teacher", false], ["foreign", "other", false], ["archived", "teacher", true]]) {
        await setDoc(doc(seed, "classes", classId), { createdBy, name: classId, accessVersion: 2, archived });
      }
      await setDoc(doc(seed, "memberships", "student_a"), { uid: "student", classId: "a" });
    });
    const object = owner.storage(`gs://${projectId}`).ref(path);
    await assertSucceeds(object.putString("original bytes", "raw", { contentType: "application/octet-stream", contentDisposition: "attachment; filename*=UTF-8''lesson.txt" }));
    const downloadUrl = await object.getDownloadURL();
    const publication = { id, ownerId: "teacher", name: payload.name, size: payload.size, extension: "txt", storagePath: path, downloadUrl };
    await assertSucceeds(setDoc(source(), payload));
    const publish = (classId = "a", sharedClasses = { [classId]: classId }, overrides = {}, database = db) => {
      const batch = writeBatch(database);
      batch.update(source(database), { sharedClasses, lastSharedClassId: classId });
      batch.set(share(classId, database), { ...publication, ...overrides });
      return batch.commit();
    };
    const unpublish = (classId, sharedClasses) => {
      const batch = writeBatch(db);
      batch.update(source(), { sharedClasses, lastSharedClassId: classId });
      batch.delete(share(classId));
      return batch.commit();
    };
    await assertFails(setDoc(share(), publication));
    await assertFails(updateDoc(source(), { sharedClasses: { a: "a" }, lastSharedClassId: "a" }));
    await assertFails(publish("foreign"));
    await assertFails(publish("archived"));
    await assertFails(publish("a", { a: "a", b: "b" }));
    await assertFails(publish("a", { a: "a" }, { name: "forged" }));
    await assertFails(publish("a", { a: "a" }, { storagePath: "another/path" }));
    await assertFails(publish("a", { a: "a" }, {}, other.firestore()));
    await assertSucceeds(publish());
    await assertSucceeds(getDocs(collection(student.firestore(), "classes", "a", "lessonFiles")));
    await assertFails(getDocs(collection(student.firestore(), "classes", "b", "lessonFiles")));
    await assertFails(getDoc(share("a", other.firestore())));
    await assertFails(getDoc(share("a", anonymous.firestore())));
    await assertFails(getDoc(source(student.firestore())));
    await assertFails(getDoc(source(admin.firestore())));
    await assertFails(setDoc(share("a", student.firestore()), publication));
    await assertFails(deleteDoc(share("a", student.firestore())));
    assert.equal(await (await fetch(downloadUrl)).text(), "original bytes");
    await assertFails(student.storage(`gs://${projectId}`).ref(path).getDownloadURL());
    await assertFails(updateDoc(source(), { sharedClasses: {} }));
    await assertFails(updateDoc(source(), { sharedClasses: {}, lastSharedClassId: "a" }));
    await assertFails(deleteDoc(share()));
    await assertFails(deleteDoc(source()));
    await assertFails(updateDoc(source(), { deleting: true }));
    await assertFails(object.delete());
    await assertSucceeds(publish("b", { a: "a", b: "b" }));
    await assertSucceeds(unpublish("a", { b: "b" }));
    assert.equal((await getDoc(source())).exists(), true);
    assert.equal(await (await fetch(downloadUrl)).text(), "original bytes");
    await assertFails(updateDoc(source(), { deleting: true }));
    await assertFails(object.delete());
    await env.withSecurityRulesDisabled(context => updateDoc(doc(context.firestore(), "classes", "b"), { archived: true }));
    await assertSucceeds(unpublish("b", {}));
    await assertSucceeds(updateDoc(source(), { deleting: true }));
    await assertFails(updateDoc(source(), { deleting: false }));
    await assertFails(publish());
    await assertSucceeds(object.delete());
    await assertSucceeds(deleteDoc(source()));

    const adminId = "22345678-1234-1234-1234-123456789abc";
    const adminDb = admin.firestore();
    const adminSource = source(adminDb, adminId, "admin");
    const adminPayload = { ...payload, ownerId: "admin", storagePath: `lesson-files/admin/${adminId}.txt` };
    await assertSucceeds(setDoc(adminSource, adminPayload));
    const adminBatch = writeBatch(adminDb);
    adminBatch.update(adminSource, { sharedClasses: { foreign: "foreign" }, lastSharedClassId: "foreign" });
    adminBatch.set(share("foreign", adminDb, adminId), { ...publication, id: adminId, ownerId: "admin", storagePath: adminPayload.storagePath });
    await assertSucceeds(adminBatch.commit());

    await assertSucceeds(setDoc(source(), payload));
    const racePublish = runTransaction(db, async transaction => {
      const snapshot = await transaction.get(source());
      if (snapshot.data().deleting) throw new Error("deleting");
      transaction.update(source(), { sharedClasses: { a: "a" }, lastSharedClassId: "a" });
      transaction.set(share(), publication);
    });
    const raceDelete = runTransaction(db, async transaction => {
      const snapshot = await transaction.get(source());
      if (Object.keys(snapshot.data().sharedClasses ?? {}).length) throw new Error("shared");
      transaction.update(source(), { deleting: true });
    });
    const outcomes = await Promise.allSettled([racePublish, raceDelete]);
    assert.equal(outcomes.filter(result => result.status === "fulfilled").length, 1);
    const finalSource = (await getDoc(source())).data();
    assert.equal((await getDoc(share())).exists(), !finalSource.deleting);
  } finally { await env.cleanup(); }
});
