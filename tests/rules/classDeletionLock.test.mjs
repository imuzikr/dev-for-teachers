import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import {
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const firestoreRules = readFileSync(resolve(here, "../../firestore.rules"), "utf8");
const storageRules = readFileSync(resolve(here, "../../storage.rules"), "utf8");
const projectId = process.env.GCLOUD_PROJECT || "demo-class-deletion-lock";
assert.match(projectId, /^demo-/, "Rules tests must run against a demo project");
const hasStorageEmulator = !!process.env.FIREBASE_STORAGE_EMULATOR_HOST;
const bucketUrl = `gs://${projectId}`;
const image = "data:image/jpeg;base64,YWJj";
const hashFor = (letter) => letter.repeat(64);

function emulatorTarget(name, fallbackPort) {
  const raw = process.env[name];
  if (!raw) return { host: "127.0.0.1", port: fallbackPort };
  const value = raw.replace(/^https?:\/\//, "");
  const [host, port] = value.split(":");
  return { host, port: Number(port) };
}

function asAdmin(env, uid) {
  return env.authenticatedContext(uid, {
    role: "admin",
    email: `${uid}@hansung.hs.kr`,
    email_verified: true,
  });
}

function asTeacher(env, uid) {
  return env.authenticatedContext(uid, {
    role: "teacher",
    email: `${uid}@hansung.hs.kr`,
    email_verified: true,
  });
}

function asStudent(env, uid) {
  return env.authenticatedContext(uid, {
    email: `${uid}@hansung.hs.kr`,
    email_verified: true,
  });
}

function imagePath(classId, ownerUid, imageHash = hashFor("a")) {
  return `book-project-images/${classId}/${ownerUid}/${imageHash}.jpg`;
}

async function seed(env, fn) {
  await env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));
}

async function seedBaseData(env) {
  await seed(env, async (db) => {
    await setDoc(doc(db, "system", "admin"), { uid: "root" });
    await setDoc(doc(db, "classes", "cA"), {
      name: "Class A",
      createdBy: "teacherA",
      accessVersion: 2,
      archived: false,
      joinEnabled: false,
    });
    await setDoc(doc(db, "classes", "cArchived"), {
      name: "Archived Class",
      createdBy: "teacherA",
      accessVersion: 2,
      archived: true,
      joinEnabled: false,
    });
    await setDoc(doc(db, "memberships", "studentA_cA"), {
      uid: "studentA",
      classId: "cA",
      accessVersion: 2,
    });
    await setDoc(doc(db, "users", "studentA"), {
      role: "student",
      realName: "Student A",
      schoolName: "Hansung",
    });
    await setDoc(doc(db, "presence", "studentA_cA"), {
      uid: "studentA",
      classId: "cA",
      visible: true,
    });
    await setDoc(doc(db, "classDeletionJobs", "cA"), {
      classId: "cA",
      status: "running",
    });
  });
}

describe("class deletion maintenance lock rules", () => {
  let env;

  before(async () => {
    const config = {
      projectId,
      firestore: {
        rules: firestoreRules,
        ...emulatorTarget("FIRESTORE_EMULATOR_HOST", 8080),
      },
    };
    if (hasStorageEmulator) {
      config.storage = {
        rules: storageRules,
        ...emulatorTarget("FIREBASE_STORAGE_EMULATOR_HOST", 9199),
      };
    }
    env = await initializeTestEnvironment(config);
  });

  after(async () => {
    await env?.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
    if (hasStorageEmulator) {
      await env.clearStorage();
    }
    await seedBaseData(env);
  });

  it("permits existing client writes when no deletion lock is active", async () => {
    const adminDb = asAdmin(env, "root").firestore();
    const studentDb = asStudent(env, "studentA").firestore();

    await assertSucceeds(setDoc(doc(adminDb, "classes", "cB"), {
      name: "Class B",
      createdBy: "root",
      accessVersion: 2,
      archived: false,
    }));
    await assertSucceeds(updateDoc(doc(studentDb, "presence", "studentA_cA"), { visible: false }));

  });

  it("denies active-lock Firestore mutations for admins and students while preserving reads", async () => {
    await seed(env, async (db) => {
      await setDoc(doc(db, "system", "classDeletionLock"), { classId: "cA", active: true });
    });
    const adminDb = asAdmin(env, "root").firestore();
    const studentDb = asStudent(env, "studentA").firestore();

    await assertSucceeds(getDoc(doc(adminDb, "classes", "cA")));
    await assertSucceeds(getDoc(doc(adminDb, "users", "studentA")));
    await assertFails(updateDoc(doc(adminDb, "classes", "cA"), { archived: true }));
    await assertFails(setDoc(doc(adminDb, "classes", "cB"), {
      name: "Class B",
      createdBy: "root",
      accessVersion: 2,
      archived: false,
    }));
    await assertFails(updateDoc(doc(adminDb, "users", "studentA"), { realName: "Locked" }));
    await assertFails(updateDoc(doc(studentDb, "presence", "studentA_cA"), { visible: false }));
    await assertFails(setDoc(doc(studentDb, "classes", "cA", "questionSignals", "studentA"), {
      uid: "studentA",
      classId: "cA",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
  });

  it("keeps lock and job documents server-only", async () => {
    const adminDb = asAdmin(env, "root").firestore();
    const studentDb = asStudent(env, "studentA").firestore();

    await assertFails(setDoc(doc(adminDb, "system", "classDeletionLock"), {
      classId: "cA",
      active: true,
    }));

    await seed(env, async (db) => {
      await setDoc(doc(db, "system", "classDeletionLock"), { classId: "cA", active: true });
    });

    await assertFails(updateDoc(doc(adminDb, "system", "classDeletionLock"), { active: false }));
    await assertFails(deleteDoc(doc(adminDb, "system", "classDeletionLock")));
    await assertFails(getDoc(doc(studentDb, "classDeletionJobs", "cA")));
    await assertFails(setDoc(doc(studentDb, "classDeletionJobs", "cA"), { classId: "cA" }));
    await assertFails(deleteDoc(doc(studentDb, "classDeletionJobs", "cA")));
  });

  it("denies direct deletion of an active class", async () => {
    const adminDb = asAdmin(env, "root").firestore();
    await assertFails(deleteDoc(doc(adminDb, "classes", "cA")));
  });

  it("allows only the registered admin to delete an archived class without server credentials", async () => {
    const target = (ctx) => doc(ctx.firestore(), "classes", "cArchived");
    await assertFails(deleteDoc(target(env.unauthenticatedContext())));
    await assertFails(deleteDoc(target(asStudent(env, "studentA"))));
    await assertFails(deleteDoc(target(asTeacher(env, "teacherA"))));
    await assertFails(deleteDoc(target(asAdmin(env, "otherAdmin"))));
    await assertSucceeds(deleteDoc(target(asAdmin(env, "root"))));
  });

  it("does not bypass an unfinished server deletion lock", async () => {
    await seed(env, async (db) => {
      await setDoc(doc(db, "system", "classDeletionLock"), { classId: "cArchived", active: true });
    });
    await assertFails(deleteDoc(doc(asAdmin(env, "root").firestore(), "classes", "cArchived")));
  });

  it("allows the registered admin to delete known archived class records in-browser", async () => {
    await seed(env, async (db) => {
      await setDoc(doc(db, "memberships", "studentA_cArchived"), { uid: "studentA", classId: "cArchived" });
      await setDoc(doc(db, "classes", "cArchived", "attendanceRecords", "day-studentA"), { classId: "cArchived", uid: "studentA" });
      await setDoc(doc(db, "broadcasts", "cArchived"), { classId: "cArchived" });
      await setDoc(doc(db, "presence", "studentA_cArchived"), { uid: "studentA", classId: "cArchived" });
      await setDoc(doc(db, "studentNotes", "noteArchived"), { classId: "cArchived", teacherId: "teacherA", studentUid: "studentA" });
      await setDoc(doc(db, "studyBoards", "boardArchived"), { classId: "cArchived" });
      await setDoc(doc(db, "studyBoards", "boardArchived", "cards", "cardArchived"), { authorId: "studentA" });
      await setDoc(doc(db, "bookProjects", "cArchived"), { classId: "cArchived" });
      await setDoc(doc(db, "bookResources", "resourceArchived"), { classId: "cArchived" });
      await setDoc(doc(db, "bookHelpNotes", "helpArchived"), { classId: "cArchived" });
      await setDoc(doc(db, "bookActivities", "activityArchived"), { classId: "cArchived" });
      await setDoc(doc(db, "bookActivities", "activityArchived", "entries", "studentA"), { authorId: "studentA" });
      await setDoc(doc(db, "bookActivities", "activityArchived", "groups", "groupA"), { classId: "cArchived" });
      await setDoc(doc(db, "bookActivities", "activityArchived", "groups", "groupA", "words", "wordA"), { text: "word" });
      await setDoc(doc(db, "bookConfirmations", "confirmationArchived"), { classId: "cArchived", authorId: "studentA" });
      await setDoc(doc(db, "rewards", "rewardArchived"), { classId: "cArchived", uid: "studentA" });
      await setDoc(doc(db, "kwl", "kwlArchived"), { classId: "cArchived", userId: "studentA" });
      await setDoc(doc(db, "rewards", "rewardActive"), { classId: "cA", uid: "studentA" });
      await setDoc(doc(db, "kwl", "kwlActive"), { classId: "cA", userId: "studentA" });
    });

    const adminDb = asAdmin(env, "root").firestore();
    const archivedPaths = [
      "memberships/studentA_cArchived",
      "classes/cArchived/attendanceRecords/day-studentA",
      "broadcasts/cArchived",
      "presence/studentA_cArchived",
      "studentNotes/noteArchived",
      "studyBoards/boardArchived/cards/cardArchived",
      "studyBoards/boardArchived",
      "bookProjects/cArchived",
      "bookResources/resourceArchived",
      "bookHelpNotes/helpArchived",
      "bookActivities/activityArchived/entries/studentA",
      "bookActivities/activityArchived/groups/groupA/words/wordA",
      "bookActivities/activityArchived/groups/groupA",
      "bookActivities/activityArchived",
      "bookConfirmations/confirmationArchived",
      "rewards/rewardArchived",
      "kwl/kwlArchived",
    ];

    await assertFails(deleteDoc(doc(asAdmin(env, "otherAdmin").firestore(), "rewards", "rewardArchived")));
    await assertFails(deleteDoc(doc(adminDb, "rewards", "rewardActive")));
    await assertFails(deleteDoc(doc(adminDb, "kwl", "kwlActive")));
    await assertSucceeds(getDoc(doc(adminDb, "rewards", "rewardArchived")));
    await assertSucceeds(getDoc(doc(adminDb, "kwl", "kwlArchived")));
    await assertFails(getDoc(doc(asStudent(env, "studentA").firestore(), "rewards", "rewardArchived")));
    await assertSucceeds(getDocs(collectionGroup(adminDb, "words")));
    await assertFails(getDocs(collectionGroup(asStudent(env, "studentA").firestore(), "words")));
    for (const path of archivedPaths) {
      await assertSucceeds(deleteDoc(doc(adminDb, path)));
    }
  });

  it("keeps Storage on the original archived-class boundary during deletion jobs", { skip: !hasStorageEmulator }, async () => {
    const unlockedRef = asTeacher(env, "teacherA")
      .storage(bucketUrl)
      .ref(imagePath("cA", "teacherA", hashFor("c")));
    await assertSucceeds(unlockedRef.putString(image, "data_url", { contentType: "image/jpeg" }));
    await assertFails(unlockedRef.delete());

    await seed(env, async (db) => {
      await setDoc(doc(db, "system", "classDeletionLock"), { classId: "cArchived", active: true });
      await setDoc(doc(db, "classes", "cOther"), {
        name: "Other Class",
        createdBy: "teacherA",
        accessVersion: 2,
        archived: false,
        joinEnabled: false,
      });
    });

    await assertSucceeds(unlockedRef.getDownloadURL());
    const archivedTargetRef = asTeacher(env, "teacherA")
      .storage(bucketUrl)
      .ref(imagePath("cArchived", "teacherA", hashFor("d")));
    await assertFails(archivedTargetRef.putString(image, "data_url", { contentType: "image/jpeg" }));
    await assertFails(unlockedRef.delete());

    const otherClassRef = asTeacher(env, "teacherA")
      .storage(bucketUrl)
      .ref(imagePath("cOther", "teacherA", hashFor("e")));
    await assertSucceeds(otherClassRef.putString(image, "data_url", { contentType: "image/jpeg" }));
  });
});
