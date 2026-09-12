import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const firestoreRules = readFileSync(resolve(here, "../../firestore.rules"), "utf8");
const storageRules = readFileSync(resolve(here, "../../storage.rules"), "utf8");
const projectId = process.env.GCLOUD_PROJECT || "demo-rules-test";
assert.match(projectId, /^demo-/, "Rules tests must run against a demo project");
const bucketUrl = `gs://${projectId}`;
const image = "data:image/jpeg;base64,YWJj";
const hash = "a".repeat(64);
const hashFor = (letter) => letter.repeat(64);

function emulatorTarget(name, fallbackPort) {
  const raw = process.env[name];
  if (!raw) return { host: "127.0.0.1", port: fallbackPort };
  const value = raw.replace(/^https?:\/\//, "");
  const [host, port] = value.split(":");
  return { host, port: Number(port) };
}

function asTeacher(env, uid) {
  return env.authenticatedContext(uid, {
    role: "teacher",
    email: `${uid}@hansung.hs.kr`,
    email_verified: true,
  });
}

function asUser(env, uid) {
  return env.authenticatedContext(uid, {
    email: `${uid}@hansung.hs.kr`,
    email_verified: true,
  });
}

function storageRef(env, uid, path, token = undefined) {
  const context = token ? env.authenticatedContext(uid, token) : asUser(env, uid);
  return context.storage(bucketUrl).ref(path);
}

function projectImagePath(classId, ownerUid, imageHash = hash) {
  return `book-project-images/${classId}/${ownerUid}/${imageHash}.jpg`;
}

describe("개발자실 프로젝트 Storage 이미지 규칙", { skip: !process.env.FIREBASE_STORAGE_EMULATOR_HOST }, () => {
  let env;

  before(async () => {
    env = await initializeTestEnvironment({
      projectId,
      firestore: {
        rules: firestoreRules,
        ...emulatorTarget("FIRESTORE_EMULATOR_HOST", 8080),
      },
      storage: {
        rules: storageRules,
        ...emulatorTarget("FIREBASE_STORAGE_EMULATOR_HOST", 9199),
      },
    });
  });

  after(async () => {
    await env.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
    await env.clearStorage();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "classes", "cA"), { createdBy: "teacherA", archived: false });
      await setDoc(doc(db, "classes", "cProfile"), { createdBy: "teacherProfile", archived: false });
      await setDoc(doc(db, "classes", "archived"), { createdBy: "teacherA", archived: true });
      await setDoc(doc(db, "classes", "adminClass"), { createdBy: "teacherA", archived: false });
      await setDoc(doc(db, "classes", "rootOwned"), { createdBy: "rootAdmin", archived: false });
      await setDoc(doc(db, "classes", "demotedOwned"), { createdBy: "demotedTeacher", archived: false });
      await setDoc(doc(db, "memberships", "studentA_cA"), { uid: "studentA", classId: "cA" });
      await setDoc(doc(db, "users", "teacherProfile"), { role: "teacher" });
      await setDoc(doc(db, "users", "rootAdmin"), { role: "admin" });
      await setDoc(doc(db, "users", "demotedTeacher"), { role: "student" });
      await setDoc(doc(db, "system", "admin"), { uid: "adminA" });
    });
  });

  it("allows class-owner teachers to create immutable JPEG project images", async () => {
    const ref = asTeacher(env, "teacherA").storage(bucketUrl).ref(projectImagePath("cA", "teacherA", hashFor("a")));
    await assertSucceeds(ref.putString(image, "data_url", { contentType: "image/jpeg" }));
    await assertSucceeds(ref.getDownloadURL());
    await assertFails(ref.putString(image, "data_url", { contentType: "image/jpeg" }));
    await assertFails(ref.delete());
  });

  it("allows teacher role fallback from users profile without custom claims", async () => {
    await assertSucceeds(
      storageRef(env, "teacherProfile", projectImagePath("cProfile", "teacherProfile", hashFor("b")))
        .putString(image, "data_url", { contentType: "image/jpeg" })
    );
  });

  it("allows no-claim root admin to upload images for a class they own", async () => {
    await assertSucceeds(
      storageRef(env, "rootAdmin", projectImagePath("rootOwned", "rootAdmin", hashFor("c")))
        .putString(image, "data_url", { contentType: "image/jpeg" })
    );
  });

  it("allows system admin to upload under their own uid for another teacher class", async () => {
    const ref = storageRef(env, "adminA", projectImagePath("adminClass", "adminA", hashFor("d")));
    await assertSucceeds(ref.putString(image, "data_url", { contentType: "image/jpeg" }));
    await assertSucceeds(ref.getDownloadURL());
  });

  it("allows class members to read class images and rejects outsiders", async () => {
    const path = projectImagePath("cA", "teacherA", hashFor("e"));
    await assertSucceeds(asTeacher(env, "teacherA").storage(bucketUrl).ref(path).putString(image, "data_url", { contentType: "image/jpeg" }));
    await assertSucceeds(storageRef(env, "studentA", path).getDownloadURL());
    await assertFails(storageRef(env, "studentB", path).getDownloadURL());
  });

  it("rejects non-owner, archived class, non-JPEG, oversized, and malformed path writes", async () => {
    await assertFails(asTeacher(env, "teacherB").storage(bucketUrl).ref(projectImagePath("cA", "teacherB", hashFor("f"))).putString(image, "data_url", { contentType: "image/jpeg" }));
    await assertFails(storageRef(env, "demotedTeacher", projectImagePath("demotedOwned", "demotedTeacher", hashFor("0"))).putString(image, "data_url", { contentType: "image/jpeg" }));
    await assertFails(asTeacher(env, "teacherA").storage(bucketUrl).ref(projectImagePath("archived", "teacherA", hashFor("1"))).putString(image, "data_url", { contentType: "image/jpeg" }));
    await assertFails(asTeacher(env, "teacherA").storage(bucketUrl).ref(projectImagePath("cA", "teacherA", "b".repeat(64))).putString("data:image/png;base64,YWJj", "data_url", { contentType: "image/png" }));
    await assertFails(asTeacher(env, "teacherA").storage(bucketUrl).ref(projectImagePath("cA", "teacherA", "c".repeat(64))).putString("data:image/jpeg;base64," + "a".repeat(900000), "data_url", { contentType: "image/jpeg" }));
    await assertFails(asTeacher(env, "teacherA").storage(bucketUrl).ref("book-project-images/cA/teacherA/not-a-hash.jpg").putString(image, "data_url", { contentType: "image/jpeg" }));
  });

  it("allows only the registered admin to list and delete archived class images", async () => {
    const archivedImagePath = projectImagePath("cA", "teacherA", hashFor("2"));
    const ownerRef = asTeacher(env, "teacherA").storage(bucketUrl).ref(archivedImagePath);
    await assertSucceeds(ownerRef.putString(image, "data_url", { contentType: "image/jpeg" }));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "classes", "cA"), { createdBy: "teacherA", archived: true });
    });

    await assertFails(storageRef(env, "studentA", archivedImagePath).delete());
    await assertFails(storageRef(env, "teacherA", archivedImagePath, { role: "teacher" }).delete());
    await assertFails(storageRef(env, "otherAdmin", archivedImagePath, { role: "admin" }).delete());
    await assertFails(storageRef(env, "studentA", "book-project-images/cA").listAll());
    await assertSucceeds(storageRef(env, "adminA", "book-project-images/cA").listAll());
    await assertSucceeds(storageRef(env, "adminA", archivedImagePath).delete());
  });
});
