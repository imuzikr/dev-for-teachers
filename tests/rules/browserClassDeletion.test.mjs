import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import * as firestoreSdk from "firebase/firestore";
import * as storageSdk from "firebase/storage";

const projectId = process.env.GCLOUD_PROJECT || "demo-class-deletion";
assert.match(projectId, /^demo-/);
const enabled = Boolean(process.env.FIREBASE_STORAGE_EMULATOR_HOST);
function target(name) {
  const host = process.env[name];
  assert.match(host || "", /^127\.0\.0\.1:\d+$/, `${name} must target a local emulator`);
  const [hostname, port] = host.split(":");
  return { host: hostname, port: Number(port) };
}
let env;
let deleteClassInBrowser;
const { doc, setDoc, getDoc, getDocs, collection } = firestoreSdk;
const bucketUrl = `gs://${projectId}`;
const filePath = (letter) => `book-project-images/target/root/${letter.repeat(64)}.jpg`;

before(async () => {
  if (!enabled) return;
  env = await initializeTestEnvironment({
    projectId,
    firestore: { ...target("FIRESTORE_EMULATOR_HOST"), rules: await readFile(new URL("../../firestore.rules", import.meta.url), "utf8") },
    storage: { ...target("FIREBASE_STORAGE_EMULATOR_HOST"), rules: await readFile(new URL("../../storage.rules", import.meta.url), "utf8") },
  });
  const context = vm.createContext({ console, setTimeout, clearTimeout, URL, Uint8Array });
  const source = await readFile(new URL("../../lib/classDeletionClient.js", import.meta.url), "utf8");
  const module = new vm.SourceTextModule(source, { context });
  await module.link((specifier) => {
    const exports = specifier === "firebase/firestore" ? firestoreSdk
      : specifier === "firebase/storage" ? storageSdk
        : specifier === "./firebase" ? { auth: null, db: null, storage: null } : null;
    assert(exports, `Unexpected dependency: ${specifier}`);
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    }, { context });
  });
  await module.evaluate();
  deleteClassInBrowser = module.namespace.deleteClassInBrowser;
  assert.equal(typeof deleteClassInBrowser, "function");
});

after(async () => { await env?.cleanup(); });

test("browser deletion atomically unlinks all owners while retaining originals and other class shares", { skip: !enabled }, async () => {
  await env.clearFirestore();
  await env.clearStorage();
  const ids = ["12345678-1234-1234-1234-123456789abc", "22345678-1234-1234-1234-123456789abc"];
  const owners = ["root", "teacher"];
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, "system/admin"), { uid: "root" });
    await setDoc(doc(db, "classes/target"), { createdBy: "teacher", archived: true, accessVersion: 2, name: "Target" });
    await setDoc(doc(db, "classes/other"), { createdBy: "teacher", archived: false, accessVersion: 2, name: "Other" });
    for (const [index, id] of ids.entries()) {
      const ownerId = owners[index];
      const storagePath = `lesson-files/${ownerId}/${id}.txt`;
      const source = { ownerId, name: "original.txt", size: 8, extension: "txt", storagePath,
        sharedClasses: index === 0 ? { target: "Target", other: "Other" } : { target: "Target" }, deleting: false };
      await setDoc(doc(db, `lessonFiles/${ownerId}/files/${id}`), source);
      await setDoc(doc(db, `classes/target/lessonFiles/${id}`), { id, ownerId, storagePath });
      if (index === 0) await setDoc(doc(db, `classes/other/lessonFiles/${id}`), { id, ownerId, storagePath });
      await ctx.storage(bucketUrl).ref(storagePath).putString("original", "raw", { contentType: "application/octet-stream" });
    }
  });
  const admin = env.authenticatedContext("root", { email_verified: true, firebase: { sign_in_provider: "google.com" } });
  const db = admin.firestore();
  const services = { db, storage: admin.storage(bucketUrl), auth: { currentUser: { uid: "root", getIdToken: async () => "rules-test-context" } } };
  const otherSource = doc(db, `lessonFiles/teacher/files/${ids[1]}`);
  await assertFails(getDoc(otherSource));
  await assertFails(firestoreSdk.updateDoc(otherSource, { sharedClasses: {}, lastSharedClassId: "target" }));
  const unlink = (actorDb, extra = {}) => {
    const batch = firestoreSdk.writeBatch(actorDb);
    batch.update(doc(actorDb, `lessonFiles/teacher/files/${ids[1]}`), { sharedClasses: {}, lastSharedClassId: "target", ...extra });
    batch.delete(doc(actorDb, `classes/target/lessonFiles/${ids[1]}`));
    return batch.commit();
  };
  await assertFails(unlink(db, { name: "tampered.txt" }));
  await assertFails(unlink(db, { deleting: true }));
  await assertFails(unlink(env.authenticatedContext("outsider", { role: "teacher" }).firestore()));
  await env.withSecurityRulesDisabled(ctx => firestoreSdk.updateDoc(doc(ctx.firestore(), "classes/target"), { archived: false }));
  await assertFails(unlink(db));
  await env.withSecurityRulesDisabled(ctx => firestoreSdk.updateDoc(doc(ctx.firestore(), "classes/target"), { archived: true }));
  const result = await deleteClassInBrowser("target", services);
  assert.equal(result.status, "completed");
  await env.withSecurityRulesDisabled(async ctx => {
    const checked = ctx.firestore();
    assert.equal((await getDoc(doc(checked, "classes/target"))).exists(), false);
    assert.equal((await getDocs(collection(checked, "classes/target/lessonFiles"))).size, 0);
    assert.equal((await getDoc(doc(checked, `classes/other/lessonFiles/${ids[0]}`))).exists(), true);
    assert.deepEqual((await getDoc(doc(checked, `lessonFiles/root/files/${ids[0]}`))).data().sharedClasses, { other: "Other" });
    assert.deepEqual((await getDoc(doc(checked, `lessonFiles/teacher/files/${ids[1]}`))).data().sharedClasses, {});
    for (const [index, id] of ids.entries()) {
      assert.equal((await ctx.storage(bucketUrl).ref(`lesson-files/${owners[index]}/${id}.txt`).getMetadata()).size, 8);
    }
  });
  const teacher = env.authenticatedContext("teacher", { role: "teacher" });
  await assertSucceeds(firestoreSdk.updateDoc(doc(teacher.firestore(), `lessonFiles/teacher/files/${ids[1]}`), { deleting: true }));
  await assertSucceeds(teacher.storage(bucketUrl).ref(`lesson-files/teacher/${ids[1]}.txt`).delete());
  await assertSucceeds(firestoreSdk.deleteDoc(doc(teacher.firestore(), `lessonFiles/teacher/files/${ids[1]}`)));
  await assertFails(firestoreSdk.updateDoc(doc(db, `lessonFiles/root/files/${ids[0]}`), { deleting: true }));
});

test("browser deletion stops before deleting class records if a publication cannot be unlinked", { skip: !enabled }, async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, "system/admin"), { uid: "root" });
    await setDoc(doc(db, "classes/target"), { createdBy: "root", archived: true, accessVersion: 2, name: "Target" });
    await setDoc(doc(db, "classes/target/lessonFiles/missing-source"), { ownerId: "teacher" });
    await setDoc(doc(db, "classes/target/attendanceRecords/keep"), { classId: "target" });
  });
  const admin = env.authenticatedContext("root", { email_verified: true, firebase: { sign_in_provider: "google.com" } });
  const db = admin.firestore();
  await assert.rejects(deleteClassInBrowser("target", { db, storage: admin.storage(bucketUrl),
    auth: { currentUser: { uid: "root", getIdToken: async () => "rules-test-context" } } }), { code: "class-deletion/lesson-unlink-failed" });
  assert.equal((await getDoc(doc(db, "classes/target"))).exists(), true);
  assert.equal((await getDoc(doc(db, "classes/target/lessonFiles/missing-source"))).exists(), true);
  assert.equal((await getDoc(doc(db, "classes/target/attendanceRecords/keep"))).exists(), true);
});

test("real browser SDK deletes archived class records and exclusive files without server credentials", { skip: !enabled }, async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "system/admin"), { uid: "root" });
    await setDoc(doc(db, "classes/target"), { createdBy: "root", archived: true, accessVersion: 2, name: "Target" });
    await setDoc(doc(db, "classes/other"), { createdBy: "root", archived: false, accessVersion: 2, name: "Preserved" });
    for (const name of ["attendanceRecords", "questionSignals", "seatLayouts", "groupAssignments"]) {
      await setDoc(doc(db, `classes/target/${name}/one`), { classId: "target" });
    }
    await setDoc(doc(db, "studyBoards/board"), { classId: "target" });
    for (let index = 0; index < 105; index += 1) {
      await setDoc(doc(db, `studyBoards/board/cards/card-${index}`), { authorId: "student", content: "Content" });
    }
    await setDoc(doc(db, "bookActivities/activity"), { classId: "target" });
    await setDoc(doc(db, "bookActivities/activity/entries/student"), { authorId: "student" });
    await setDoc(doc(db, "bookActivities/activity/groups/group"), {});
    await setDoc(doc(db, "bookActivities/activity/groups/group/words/word"), { word: "word" });
    await setDoc(doc(db, "bookActivities/activity/groups/missing/words/orphan"), { word: "orphan" });
    for (const name of ["bookResources", "bookHelpNotes", "bookConfirmations", "memberships", "presence", "studentNotes", "rewards", "kwl", "classJoinLookup", "classJoinClaims"]) {
      await setDoc(doc(db, `${name}/owned`), { classId: "target" });
    }
    await setDoc(doc(db, "classJoinSecrets/target"), { joinCode: "123456" });
    await setDoc(doc(db, "broadcasts/target"), { classId: "target" });
    await setDoc(doc(db, "bookProjects/target"), { classId: "target", image: filePath("a") });
    await setDoc(doc(db, "bookProjects/other"), { classId: "other", image: `https://firebasestorage.googleapis.com/v0/b/${projectId}/o/${encodeURIComponent(filePath("b"))}?alt=media` });
    await setDoc(doc(db, "users/student"), { role: "student" });
    await setDoc(doc(db, "questions/global"), { title: "Keep" });
    await setDoc(doc(db, "studyBoards/missing/cards/shared"), { image: filePath("c") });
    for (const letter of ["a", "b", "c"]) {
      await ctx.storage(bucketUrl).ref(filePath(letter)).putString("YWJj", "base64", { contentType: "image/jpeg" });
    }
  });
  const admin = env.authenticatedContext("root", { email_verified: true, firebase: { sign_in_provider: "google.com" } });
  const services = { db: admin.firestore(), storage: admin.storage(bucketUrl), auth: { currentUser: { uid: "root", getIdToken: async () => "rules-test-context" } } };
  await assert.rejects(deleteClassInBrowser("target", { ...services, auth: { currentUser: null } }));
  await assert.rejects(deleteClassInBrowser("other", services));
  const result = await deleteClassInBrowser("target", services);
  assert.equal(result.status, "completed");
  assert.equal(result.deletedFiles, 1);
  assert.equal(result.retainedFiles, 2);
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    assert.equal((await getDoc(doc(db, "classes/target"))).exists(), false);
    assert.equal((await getDoc(doc(db, "classes/other"))).exists(), true);
    assert.equal((await getDoc(doc(db, "bookProjects/other"))).exists(), true);
    assert.equal((await getDoc(doc(db, "users/student"))).exists(), true);
    assert.equal((await getDoc(doc(db, "questions/global"))).exists(), true);
    assert.equal((await getDocs(collection(db, "studyBoards/board/cards"))).size, 0);
    assert.equal((await getDocs(collection(db, "bookActivities/activity/groups/group/words"))).size, 0);
    assert.equal((await getDocs(collection(db, "bookActivities/activity/groups/missing/words"))).size, 0);
    assert.equal((await getDoc(doc(db, "broadcasts/target"))).exists(), false);
    assert.equal((await getDoc(doc(db, "classJoinSecrets/target"))).exists(), false);
    for (const name of ["attendanceRecords", "questionSignals", "seatLayouts", "groupAssignments"]) {
      assert.equal((await getDocs(collection(db, `classes/target/${name}`))).size, 0);
    }
    for (const name of ["bookResources", "bookHelpNotes", "bookConfirmations", "memberships", "presence", "studentNotes", "rewards", "kwl", "classJoinLookup", "classJoinClaims"]) {
      assert.equal((await getDoc(doc(db, `${name}/owned`))).exists(), false);
    }
    await assert.rejects(ctx.storage(bucketUrl).ref(filePath("a")).getMetadata(), { code: "storage/object-not-found" });
    assert.equal((await ctx.storage(bucketUrl).ref(filePath("b")).getMetadata()).fullPath, filePath("b"));
    assert.equal((await ctx.storage(bucketUrl).ref(filePath("c")).getMetadata()).fullPath, filePath("c"));
  });
});
