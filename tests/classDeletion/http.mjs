import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const projectId = "demo-class-deletion";
const base = process.env.CLASS_DELETION_TEST_URL || "http://localhost:3152";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8186");
assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST, "127.0.0.1:9296");
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9196");

const app = initializeApp({ projectId, storageBucket: projectId }, "class-deletion-http-test");
const db = getFirestore(app);
const bucket = getStorage(app).bucket();
const suffix = String(Date.now());
const classId = `http-${suffix}`;
const keepId = `keep-${suffix}`;
const image = `book-project-images/${classId}/admin/${"a".repeat(64)}.jpg`;
const shared = `book-project-images/${classId}/admin/${"b".repeat(64)}.jpg`;

async function account(label) {
  const response = await fetch("http://127.0.0.1:9196/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `${label}-${suffix}@example.test`, password: "Emulator-only-123!", returnSecureToken: true }),
  });
  assert.equal(response.status, 200);
  return response.json();
}

async function call(token, { method = "POST", origin = base, body } = {}) {
  return fetch(`${base}/api/admin/classes/${classId}/deletion`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json", Origin: origin },
    ...(method === "POST" ? { body: body || JSON.stringify({ classId, confirmation: `DELETE ${classId}` }) } : {}),
  });
}

try {
  const admin = await account("admin");
  const student = await account("student");
  await db.doc("system/admin").set({ uid: admin.localId });
  await db.doc(`classes/${classId}`).set({ archived: false, createdBy: admin.localId });
  assert.equal((await call(null)).status, 401);
  assert.equal((await call(student.idToken)).status, 403);
  assert.equal((await call(admin.idToken, { origin: "https://untrusted.example" })).status, 403);
  assert.equal((await call(admin.idToken)).status, 409);
  assert.equal((await db.doc("system/classDeletionLock").get()).data()?.active === true, false);
  await db.doc(`classes/${classId}`).update({ archived: true });
  await db.doc(`classes/${keepId}`).set({ archived: false });
  await db.doc(`bookActivities/${classId}`).set({ classId, images: [image, shared] });
  await db.doc(`bookActivities/${classId}/entries/student`).set({ content: "test entry" });
  await db.doc(`classes/${classId}/missing/parent/nested/record`).set({ content: "nested" });
  await db.doc(`bookProjects/${keepId}`).set({ classId: keepId, images: [`https://firebasestorage.googleapis.com/v0/b/${projectId}/o/${encodeURIComponent(shared)}?alt=media`] });
  await bucket.file(image).save(Buffer.from("exclusive-test-image"), { resumable: false, contentType: "image/jpeg" });
  await bucket.file(shared).save(Buffer.from("shared-test-image"), { resumable: false, contentType: "image/jpeg" });
  let result;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await call(admin.idToken);
    result = await response.json();
    assert.ok(response.status === 200 || response.status === 202, JSON.stringify(result));
    if (result.status === "completed") break;
  }
  assert.equal(result.status, "completed");
  assert.equal(result.deletedFiles, 1);
  assert.equal(result.retainedFiles, 1);
  assert.equal((await bucket.file(image).exists())[0], false);
  assert.equal((await bucket.file(shared).exists())[0], true);
  assert.equal((await db.doc(`classes/${classId}`).get()).exists, false);
  assert.equal((await db.doc(`classes/${classId}/missing/parent/nested/record`).get()).exists, false);
  assert.equal((await db.doc(`classes/${keepId}`).get()).exists, true);
  assert.equal((await db.doc("system/classDeletionLock").get()).data().active, false);
  assert.equal((await call(student.idToken, { method: "GET" })).status, 403);
  assert.deepEqual(await (await call(admin.idToken, { method: "GET" })).json(), result);
  assert.deepEqual(await (await call(admin.idToken)).json(), result);
  console.log("HTTP integration passed: real Auth/Firestore/Storage emulators; unauthorized, active, nested, shared, idempotent cases.");
} finally {
  await deleteApp(app);
}
