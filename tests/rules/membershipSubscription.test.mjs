import { after, before, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import * as firestore from "firebase/firestore";
import { asStudent, makeEnv, seed } from "./helpers.mjs";

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
    { ...firestore, db, isFirebaseConfigured: true },
  );
}

it("first join waits for server acknowledgement before exposing project access, preserving existing memberships", { timeout: 15000 }, async () => {
  const { doc, setDoc, serverTimestamp, disableNetwork, enableNetwork, onSnapshot, getDoc } = firestore;
  await seed(env, async (db) => {
    await setDoc(doc(db, "classes", "new-class"), {
      createdBy: "teacher", archived: false, joinEnabled: true, joinCode: "123456",
    });
    await setDoc(doc(db, "memberships", "new-student_existing"), {
      uid: "new-student", classId: "existing",
    });
    await setDoc(doc(db, "bookProjects", "new-class"), { title: "First project" });
  });
  const db = asStudent(env, "new-student").firestore();
  const subscribe = await loadSubscription(db);
  let latest = [];
  let resolveUpdate;
  let update = new Promise((resolve) => { resolveUpdate = resolve; });
  let resolveJoined;
  const joined = new Promise((resolve) => { resolveJoined = resolve; });
  const stop = subscribe("new-student", (rows) => {
    latest = rows;
    resolveUpdate();
    if (rows.some((row) => row.classId === "new-class")) resolveJoined();
  });
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
    write = setDoc(membershipRef, {
      uid: "new-student", classId: "new-class", joinCode: "123456", joinedAt: serverTimestamp(),
    });
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
    await db.terminate();
  }
});
