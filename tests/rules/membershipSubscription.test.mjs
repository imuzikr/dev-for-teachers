import { after, before, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { initializeApp, deleteApp } from "firebase/app";
import * as firestore from "firebase/firestore";
import { makeEnv, seed } from "./helpers.mjs";

let env;
before(async () => {
  env = await makeEnv("demo-membership-subscription");
  await env.clearFirestore();
});
after(async () => { await env?.cleanup(); });

// Run the production subscription against the real SDK and emulator.
async function loadSubscription(db) {
  const source = await readFile(new URL("../../lib/store.js", import.meta.url), "utf8");
  const start = source.indexOf("export function subscribeMyMemberships(");
  const end = source.indexOf("export async function deleteClass(", start);
  assert.ok(start >= 0 && end > start);
  return runInNewContext(
    source.slice(start, end).replace("export function", "function") + "\nsubscribeMyMemberships;",
    { ...firestore, db, isFirebaseConfigured: true, uniqueClassIds: (ids) => [...new Set(ids)] },
  );
}

it("first join waits for server acknowledgement before exposing project access, preserving existing memberships", { timeout: 15000 }, async () => {
  const { doc, setDoc, serverTimestamp, disableNetwork, enableNetwork, onSnapshot, getDoc } = firestore;
  await seed(env, async (db) => {
    await setDoc(doc(db, "classes", "new-class"), {
      createdBy: "teacher", accessVersion: 2, archived: false, joinEnabled: true,
    });
    await setDoc(doc(db, "memberships", "new-student_existing"), {
      uid: "new-student", classId: "existing", accessVersion: 2,
    });
    await setDoc(doc(db, "classes", "existing"), { createdBy: "teacher", accessVersion: 2, archived: false });
    await setDoc(doc(db, "classJoinSecrets", "new-class"), { joinCode: "123456" });
    await setDoc(doc(db, "bookProjects", "new-class"), { title: "First project" });
  });
  const app = initializeApp({ projectId: "demo-membership-subscription" }, "membership-listener");
  const db = firestore.getFirestore(app);
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080").split(":");
  firestore.connectFirestoreEmulator(db, host, Number(port), { mockUserToken: { sub: "new-student" } });
  const subscribe = await loadSubscription(db);
  let latest = [];
  let resolveUpdate;
  let update = new Promise((resolve) => { resolveUpdate = resolve; });
  let resolveJoined;
  const joined = new Promise((resolve) => { resolveJoined = resolve; });
  const stop = subscribe("new-student", (rows) => {
    latest = rows;
    if (rows.some((row) => row.classId === "existing")) resolveUpdate();
    if (rows.some((row) => row.classId === "new-class")) resolveJoined();
  }, ["existing", "new-class"]);
  const membershipRef = doc(db, "memberships", "new-student_new-class");
  let stopPending = () => {};
  let write;
  try {
    await update;
    assert.deepEqual(Array.from(latest, (row) => row.classId), ["existing"]);
    await disableNetwork(db);
    const pending = new Promise((resolve) => {
      stopPending = onSnapshot(membershipRef, { includeMetadataChanges: true }, (snap) => {
        if (snap.metadata.hasPendingWrites) resolve();
      });
    });
    const batch = firestore.writeBatch(db);
    batch.set(doc(db, "classJoinClaims", "new-student"), {
      uid: "new-student", classId: "new-class", joinCode: "123456", createdAt: serverTimestamp(),
    });
    batch.set(membershipRef, {
      uid: "new-student", classId: "new-class", accessVersion: 2, joinedAt: serverTimestamp(),
    });
    write = batch.commit();
    await pending;
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(Array.from(latest, (row) => row.classId), ["existing"],
      "A pending join must not expose the class before its server permissions exist");
    stopPending();
    await enableNetwork(db);
    await write;
    await joined;
    assert.ok(latest.some((row) => row.classId === "new-class"), "Acknowledgement must publish the membership without refresh");
    assert.equal((await getDoc(doc(db, "bookProjects", "new-class"))).data().title, "First project");
  } finally {
    stop();
    stopPending();
    await enableNetwork(db);
    await write;
    await firestore.terminate(db);
    await deleteApp(app);
  }
});
