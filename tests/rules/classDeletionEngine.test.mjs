import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const admin = require("firebase-admin");
const {
  advanceClassDeletion,
  readClassDeletion,
  purgeClassData,
} = require("../../functions/purgeClass.js");

const PROJECT_ID = "demo-class-deletion-engine";
const GONE = "engineGone";
const KEEP = "engineKeep";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);

function assertEmulatorOnly(db) {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST is required for engine deletion tests");
  assert.ok(db.projectId.startsWith("demo-"), `demo project required, got ${db.projectId}`);
}

class FakeFile {
  constructor(name, generation, options = {}) {
    this.name = name;
    this.metadata = options.inlineMetadata === false ? {} : { generation: String(generation) };
    this.generation = String(generation);
    this.deleted = 0;
    this.failuresRemaining = options.failures || 0;
    this.metadataReads = 0;
    this.deleteOptions = [];
  }

  async getMetadata() {
    this.metadataReads += 1;
    return [{ generation: this.generation }];
  }

  async delete(options = {}) {
    this.deleteOptions.push(options);
    assert.equal(String(options.ifGenerationMatch), this.generation);
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      const error = new Error(`delete failed for ${this.name}`);
      error.code = 503;
      throw error;
    }
    this.deleted += 1;
  }
}

class FakeBucket {
  constructor(files = [], name = "engine-test-bucket") {
    this.name = name;
    this.files = new Map(files.map((file) => [file.name, file]));
    this.listCalls = [];
  }

  async getFiles(options = {}) {
    this.listCalls.push(options);
    const all = [...this.files.values()].filter((file) => file.name.startsWith(options.prefix));
    const start = Number(options.pageToken || 0);
    const end = start + Number(options.maxResults || 40);
    const next = end < all.length ? { pageToken: String(end) } : null;
    return [all.slice(start, end), next];
  }

  file(name) {
    const file = this.files.get(name);
    if (!file) {
      return {
        delete: async () => {
          const error = new Error(`missing ${name}`);
          error.code = 404;
          throw error;
        },
      };
    }
    return file;
  }

  deletedNames() {
    return [...this.files.values()].filter((file) => file.deleted > 0).map((file) => file.name).sort();
  }
}

function imagePath(classId, uid, hash) {
  return `book-project-images/${classId}/${uid}/${hash}.jpg`;
}

function downloadUrl(path) {
  return `https://firebasestorage.googleapis.com/v0/b/demo/o/${encodeURIComponent(path)}?alt=media`;
}

async function clearProject(db) {
  assertEmulatorOnly(db);
  const collections = await db.listCollections();
  await Promise.all(collections.map((collectionRef) => db.recursiveDelete(collectionRef)));
}

async function setMany(db, entries) {
  let batch = db.batch();
  let count = 0;
  for (const [path, data] of entries) {
    batch.set(db.doc(path), data);
    count += 1;
    if (count % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (count % 400 !== 0) await batch.commit();
}

async function exists(db, path) {
  return (await db.doc(path).get()).exists;
}

async function drainDeletion(db, bucket, classId = GONE, uid = "root", max = 200) {
  let status = null;
  for (let attempt = 0; attempt < max; attempt += 1) {
    status = await advanceClassDeletion(db, bucket, classId, uid);
    if (status?.status === "completed") return status;
  }
  throw new Error(`deletion did not complete: ${JSON.stringify(status)}`);
}

async function seedRichFixture(db) {
  const sharedPath = imagePath(GONE, "teacherA", HASH_B);
  const exclusivePath = imagePath(GONE, "teacherA", HASH_A);
  const retainedLessonPath = imagePath(GONE, "teacherA", HASH_C);
  const entries = [
    [`classes/${GONE}`, { createdBy: "teacherA", archived: true, name: "Delete Me" }],
    [`classes/${GONE}/attendanceRecords/day-stu1`, { classId: GONE, uid: "stu1" }],
    [`classes/${GONE}/seatLayouts/default`, { classId: GONE, seats: [] }],
    [`classes/${GONE}/groupAssignments/default`, { classId: GONE, groups: [] }],
    [`classes/${GONE}/questionSignals/stu1`, { classId: GONE, uid: "stu1" }],
    [`classes/${GONE}/unknownNested/parent/children/leaf`, { value: "child under class-owned parent" }],
    [`classes/${GONE}/missingParents/orphan/grandchildren/leaf`, { value: "child under missing parent" }],

    [`studyBoards/boardGone`, { classId: GONE, title: "gone" }],
    [`studyBoards/boardGone/cards/card1`, { content: "gone card" }],
    [`bookActivities/activityGone`, { classId: GONE, title: "activity" }],
    [`bookActivities/activityGone/groups/group1/words/word1`, { text: "word" }],
    [`bookResources/resourceGone`, { classId: GONE, projectId: GONE, images: [downloadUrl(exclusivePath)] }],
    [`bookResources/resourceGone/comments/comment1`, { text: "nested resource data" }],
    [`bookConfirmations/${GONE}|${GONE}|resource|resourceGone|stu1`, { classId: GONE, projectId: GONE }],
    [`bookHelpNotes/helpGone`, { classId: GONE, title: "help" }],
    [`bookProjects/${GONE}`, { classId: GONE, images: [downloadUrl(exclusivePath)] }],
    [`bookProjects/projectGoneExtra`, { classId: GONE, images: [downloadUrl(exclusivePath)] }],
    [`memberships/stu1_${GONE}`, { classId: GONE, uid: "stu1" }],
    [`presence/stu1_${GONE}`, { classId: GONE, uid: "stu1" }],
    [`studentNotes/noteGone`, { classId: GONE, uid: "stu1" }],
    [`rewards/rewardGone`, { classId: GONE, uid: "stu1" }],
    [`kwl/kwlGone`, { classId: GONE, uid: "stu1" }],
    [`broadcasts/${GONE}`, { classId: GONE, mode: "slide" }],
    [`broadcasts/broadcastGoneExtra`, { classId: GONE, mode: "slide" }],
    [`classJoinSecrets/${GONE}`, { joinCode: "222222" }],
    ["classJoinClaims/stu1", { classId: GONE, joinCode: "222222" }],
    ["classJoinLookup/222222", { classId: GONE }],

    [`classes/${KEEP}`, { createdBy: "teacherA", archived: false, name: "Keep Me" }],
    [`classes/${KEEP}/attendanceRecords/day-stu9`, { classId: KEEP, uid: "stu9" }],
    ["studyBoards/boardKeep", { classId: KEEP, title: "keep" }],
    ["studyBoards/boardKeep/cards/card9", { content: "keep card" }],
    ["bookActivities/activityKeep", { classId: KEEP, title: "keep activity" }],
    ["bookResources/resourceKeep", { classId: KEEP, projectId: KEEP }],
    [`bookConfirmations/${KEEP}|${KEEP}|resource|resourceKeep|stu9`, { classId: KEEP, projectId: KEEP }],
    ["bookHelpNotes/helpKeep", { classId: KEEP, title: "keep help" }],
    [`bookProjects/${KEEP}`, { classId: KEEP, title: "keep project" }],
    ["bookProjects/codeOwnedByOther", { classId: KEEP, joinCode: GONE }],
    [`memberships/stu9_${KEEP}`, { classId: KEEP, uid: "stu9" }],
    [`presence/stu9_${KEEP}`, { classId: KEEP, uid: "stu9" }],
    ["studentNotes/noteKeep", { classId: KEEP, uid: "stu9" }],
    ["rewards/rewardKeep", { classId: KEEP, uid: "stu9" }],
    ["kwl/kwlKeep", { classId: KEEP, uid: "stu9" }],
    [`broadcasts/${KEEP}`, { classId: KEEP, mode: "slide" }],
    ["classJoinClaims/stu9", { classId: KEEP, joinCode: "111111" }],
    ["classJoinLookup/111111", { classId: KEEP }],
    [`classJoinSecrets/${KEEP}`, { joinCode: "111111" }],

    ["lessons/lesson1", {
      ownerId: "teacherA",
      slides: [{ imageUrl: downloadUrl(retainedLessonPath) }],
      images: [downloadUrl(sharedPath)],
    }],
    ["questions/sharedQuestion", { ownerId: "teacherA", images: [downloadUrl(sharedPath)] }],
  ];

  for (let index = 0; index < 45; index += 1) {
    entries.push([`studentNotes/batchGone${index}`, { classId: GONE, index }]);
  }

  await setMany(db, entries);
  return { exclusivePath, sharedPath, retainedLessonPath };
}

describe("class deletion engine", () => {
  let app;
  let db;

  before(async () => {
    assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "Start the Firestore emulator before this test");
    app = admin.initializeApp({ projectId: PROJECT_ID }, "class-deletion-engine-test");
    db = app.firestore();
    assertEmulatorOnly(db);
  });

  after(async () => {
    await app?.delete();
  });

  beforeEach(async () => {
    await clearProject(db);
  });

  it("deletes archived class data across manifests while preserving other classes and shared storage", async () => {
    const { exclusivePath, sharedPath, retainedLessonPath } = await seedRichFixture(db);
    const bucket = new FakeBucket([
      new FakeFile(exclusivePath, 10),
      new FakeFile(sharedPath, 11, { inlineMetadata: false }),
      new FakeFile(retainedLessonPath, 12),
      new FakeFile(`book-project-images/${GONE}/teacherA/not-a-hash.jpg`, 13),
    ]);

    const first = await advanceClassDeletion(db, bucket, GONE, "root");
    assert.equal(first.status, "running");
    assert.notEqual(first.phase, "completed");

    const status = await drainDeletion(db, bucket);
    assert.equal(status.status, "completed");
    assert.ok(status.deletedDocuments > 40);
    assert.deepEqual(bucket.deletedNames(), [exclusivePath].sort());
    assert.equal(bucket.files.get(sharedPath).metadataReads, 1);

    for (const path of [
      `classes/${GONE}`,
      `classes/${GONE}/attendanceRecords/day-stu1`,
      `classes/${GONE}/unknownNested/parent/children/leaf`,
      `classes/${GONE}/missingParents/orphan/grandchildren/leaf`,
      "studyBoards/boardGone/cards/card1",
      "bookActivities/activityGone/groups/group1/words/word1",
      "bookResources/resourceGone/comments/comment1",
      `bookConfirmations/${GONE}|${GONE}|resource|resourceGone|stu1`,
      "bookHelpNotes/helpGone",
      `bookProjects/${GONE}`,
      "classJoinClaims/stu1",
      "classJoinLookup/222222",
      `classJoinSecrets/${GONE}`,
    ]) {
      assert.equal(await exists(db, path), false, `${path} should be deleted`);
    }

    for (const path of [
      `classes/${KEEP}`,
      `classes/${KEEP}/attendanceRecords/day-stu9`,
      "studyBoards/boardKeep/cards/card9",
      "bookActivities/activityKeep",
      "bookResources/resourceKeep",
      `bookConfirmations/${KEEP}|${KEEP}|resource|resourceKeep|stu9`,
      "bookHelpNotes/helpKeep",
      `bookProjects/${KEEP}`,
      "bookProjects/codeOwnedByOther",
      `memberships/stu9_${KEEP}`,
      "classJoinClaims/stu9",
      "classJoinLookup/111111",
      `classJoinSecrets/${KEEP}`,
      "lessons/lesson1",
      "questions/sharedQuestion",
    ]) {
      assert.equal(await exists(db, path), true, `${path} should be preserved`);
    }

    const retention = await db.collection("classStorageRetentions").where("name", "==", sharedPath).get();
    assert.equal(retention.size, 1);
    const publicStatus = await readClassDeletion(db, GONE);
    assert.deepEqual(Object.keys(publicStatus).sort(), ["deletedDocuments", "deletedFiles", "phase", "retainedFiles", "status"]);
    assert.equal("lease" in publicStatus, false);
    assert.equal("leaseUntil" in publicStatus, false);
    assert.equal("bucket" in publicStatus, false);
    assert.equal("requestedBy" in publicStatus, false);
    assert.equal(publicStatus.status, "completed");
    assert.equal(publicStatus.deletedFiles, 1);
    assert.equal(publicStatus.retainedFiles, 3);

    await db.doc(`classes/${GONE}`).set({ archived: true, createdBy: "teacherA", reused: true });
    await assert.rejects(
      () => advanceClassDeletion(db, bucket, GONE, "root"),
      { code: "class-recreated" },
    );
    assert.equal(await exists(db, `classes/${GONE}`), true);
    assert.deepEqual(bucket.deletedNames(), [exclusivePath].sort());
  });

  it("keeps the global lock after a storage failure and resumes without duplicating deletes", async () => {
    const exclusivePath = imagePath(GONE, "teacherA", HASH_A);
    await setMany(db, [
      [`classes/${GONE}`, { archived: true, createdBy: "teacherA" }],
      ["studentNotes/failingFileClassNote", { classId: GONE }],
    ]);
    const bucket = new FakeBucket([new FakeFile(exclusivePath, 20, { failures: 1 })]);

    await assert.rejects(() => drainDeletion(db, bucket, GONE, "root", 30), { code: 503 });
    const failedPublicStatus = await readClassDeletion(db, GONE);
    assert.equal(failedPublicStatus.status, "failed");
    assert.equal("lastErrorCode" in failedPublicStatus, false);
    assert.equal((await db.doc(`classDeletionJobs/${GONE}`).get()).data().lastErrorCode, "operation-failed");
    assert.deepEqual((await db.doc("system/classDeletionLock").get()).data(), { active: true, classId: GONE });
    assert.equal((await db.doc(`classDeletionJobs/${GONE}`).get()).data().leaseUntil, 0);

    const status = await drainDeletion(db, bucket);
    assert.equal(status.status, "completed");
    assert.equal(bucket.files.get(exclusivePath).deleted, 1);
    const completedPublicStatus = await readClassDeletion(db, GONE);
    assert.equal(completedPublicStatus.status, "completed");
    assert.equal("lastErrorCode" in completedPublicStatus, false);
    assert.equal((await db.doc(`classDeletionJobs/${GONE}`).get()).data().lastErrorCode, null);

    const afterComplete = await advanceClassDeletion(db, bucket, GONE, "root");
    assert.equal(afterComplete.status, "completed");
    assert.equal(bucket.files.get(exclusivePath).deleted, 1);
    assert.deepEqual((await db.doc("system/classDeletionLock").get()).data(), { active: false });
  });

  it("refuses active classes before creating jobs or locks", async () => {
    await db.doc(`classes/${GONE}`).set({ archived: false, createdBy: "teacherA" });
    const bucket = new FakeBucket();

    await assert.rejects(() => advanceClassDeletion(db, bucket, GONE, "root"), { code: "class-not-archived" });
    assert.equal(await exists(db, `classDeletionJobs/${GONE}`), false);
    assert.equal(await exists(db, "system/classDeletionLock"), false);
  });

  it("refuses conflicting global jobs and unexpired leases", async () => {
    await setMany(db, [
      [`classes/${GONE}`, { archived: true, createdBy: "teacherA" }],
      [`classes/${KEEP}`, { archived: true, createdBy: "teacherA" }],
      ["system/classDeletionLock", { active: true, classId: KEEP }],
    ]);
    await assert.rejects(
      () => advanceClassDeletion(db, new FakeBucket(), GONE, "root"),
      { code: "deletion-busy" },
    );

    await clearProject(db);
    await setMany(db, [
      [`classes/${GONE}`, { archived: true, createdBy: "teacherA" }],
      [`classDeletionJobs/${GONE}`, {
        status: "running",
        phase: "files",
        bucket: "engine-test-bucket",
        lease: "held-by-other",
        leaseUntil: Date.now() + 60000,
        deletedDocuments: 0,
        deletedFiles: 0,
        retainedFiles: 0,
      }],
    ]);
    await assert.rejects(
      () => advanceClassDeletion(db, new FakeBucket(), GONE, "root"),
      { code: "deletion-busy" },
    );

    await clearProject(db);
    await db.doc(`classes/${GONE}`).set({ archived: true, createdBy: "teacherA" });
    const stealingBucket = {
      name: "engine-test-bucket",
      async getFiles() {
        await db.doc(`classDeletionJobs/${GONE}`).update({ lease: "stolen-by-concurrent-runner" });
        return [[], null];
      },
    };
    await assert.rejects(
      () => advanceClassDeletion(db, stealingBucket, GONE, "root"),
      { code: "lease-lost" },
    );
  });

  it("detects retained document changes before removing files", async () => {
    const exclusivePath = imagePath(GONE, "teacherA", HASH_A);
    await setMany(db, [
      [`classes/${GONE}`, { archived: true, createdBy: "teacherA" }],
      ["lessons/retainedChanged", { ownerId: "teacherA", title: "before", classId: KEEP }],
      ["system/classDeletionLock", { active: true, classId: GONE }],
      [`classDeletionJobs/${GONE}`, {
        status: "running",
        phase: "validate-references",
        bucket: "engine-test-bucket",
        leaseUntil: 0,
        deletedDocuments: 0,
        deletedFiles: 0,
        retainedFiles: 0,
        topCollections: ["classes", "lessons"],
      }],
      [`classDeletionJobs/${GONE}/files/exclusive`, {
        name: exclusivePath,
        generation: "30",
        shared: false,
        done: false,
      }],
    ]);
    const retainedBefore = await db.doc("lessons/retainedChanged").get();
    await db.doc(`classDeletionJobs/${GONE}/scan/retainedChanged`).set({
      path: "lessons/retainedChanged",
      type: "document",
      owned: false,
      actualOwned: false,
      updateTime: retainedBefore.updateTime,
      children: [],
      done: true,
      verified: false,
    });
    await db.doc("lessons/retainedChanged").update({ title: "out-of-band edit" });
    const bucket = new FakeBucket([new FakeFile(exclusivePath, 30)]);

    await assert.rejects(
      () => advanceClassDeletion(db, bucket, GONE, "root"),
      { code: "data-changed" },
    );

    assert.equal((await readClassDeletion(db, GONE)).status, "failed");
    assert.equal((await db.doc(`classDeletionJobs/${GONE}`).get()).data().lastErrorCode, "data-changed");
    assert.equal(bucket.files.get(exclusivePath).deleted, 0);
    assert.equal(await exists(db, "lessons/retainedChanged"), true);
    assert.equal(await exists(db, `classDeletionJobs/${GONE}/files/exclusive`), true);
  });

  it("resumes a partially discovered job through purgeClassData with emulator guardrails", async () => {
    await setMany(db, [
      [`classes/${GONE}`, { archived: true, createdBy: "teacherA" }],
      ["bookHelpNotes/helpResume", { classId: GONE }],
      ["classJoinLookup/333333", { classId: GONE }],
    ]);
    for (let index = 0; index < 50; index += 1) {
      await db.doc(`rewards/rewardResume${index}`).set({ classId: GONE, index });
    }

    const partial = await advanceClassDeletion(db, new FakeBucket([], "emulator-no-files"), GONE, "root");
    assert.equal(partial.status, "running");
    assert.notEqual(partial.phase, "completed");

    await assert.doesNotReject(() => purgeClassData(db, GONE));
    assert.equal(await exists(db, `classes/${GONE}`), false);
    assert.equal(await exists(db, "bookHelpNotes/helpResume"), false);
    assert.equal(await exists(db, "classJoinLookup/333333"), false);
    assert.equal((await readClassDeletion(db, GONE)).status, "completed");
  });
});
