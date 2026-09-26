// =============================================================
// 개인 활동 제출물 — bookActivities/{aId}/entries/{uid}
//  (곁텍스트 읽기 · RAFT · KWLS · 책방 활동 공용)
//
// 실명이 들어가는 제출물이라 같은 반이어도 남의 답은 보이지 않습니다.
// 교사가 학생을 대신해 쓰는 경로는 의도적으로 열지 않았습니다 —
// 교사 임시 편집은 저장 없이 화면·방송에만 반영되는 임시 편집입니다.
// =============================================================
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { makeEnv, asStudent, asTeacher, seed } from "./helpers.mjs";

const entry = (uid, answers = { K: "안다" }, overrides = {}) => ({
  activityId: "act1", authorId: uid, authorName: "학생A", answers, ...overrides,
});

describe("개인 활동 제출물 규칙", () => {
  let env;

  before(async () => {
    env = await makeEnv("demo-rules-entries");
  });
  after(async () => {
    await env.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env, async (db) => {
      await setDoc(doc(db, "classes", "cA"), { createdBy: "teacherA", accessVersion: 2, archived: false });
      await setDoc(doc(db, "memberships", "stu1_cA"), { uid: "stu1", classId: "cA" });
      await setDoc(doc(db, "memberships", "stu2_cA"), { uid: "stu2", classId: "cA" });
      await setDoc(doc(db, "bookProjects", "cA"), {
        classId: "cA",
        title: "책방 프로젝트",
        version: "v1",
        steps: [],
        confirmableItemKeys: ["activity:act1"],
        createdBy: "teacherA",
        updatedAt: new Date(),
      });
      await setDoc(doc(db, "bookActivities", "act1"), {
        classId: "cA", projectId: "cA", projectVersion: "v1", type: "kwls", title: "KWLS", locked: false,
      });
      await setDoc(doc(db, "bookActivities", "locked1"), {
        classId: "cA", type: "kwls", title: "잠긴 활동", locked: true,
      });
      await setDoc(doc(db, "classes", "cArchived"), { createdBy: "teacherA", accessVersion: 2, archived: true });
      await setDoc(doc(db, "memberships", "stu1_cArchived"), { uid: "stu1", classId: "cArchived" });
      await setDoc(doc(db, "bookActivities", "lockedArchived"), {
        classId: "cArchived", type: "kwls", title: "보관된 잠긴 활동", locked: true,
      });
    });
  });

  it("학생은 자기 제출물을 쓰고 고칠 수 있다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertSucceeds(setDoc(doc(db, "bookActivities", "act1", "entries", "stu1"), entry("stu1")));
    await assertSucceeds(
      setDoc(doc(db, "bookActivities", "act1", "entries", "stu1"), entry("stu1", { K: "고쳤다" }))
    );
  });

  it("학생 URL은 열린 활동과 legacy 잠긴 활동에서 본인 제출물에 저장하고 비울 수 있다", async () => {
    const db = asStudent(env, "stu1").firestore();
    for (const activityId of ["act1", "locked1"]) {
      const ref = doc(db, "bookActivities", activityId, "entries", "stu1");
      await assertSucceeds(setDoc(ref, entry("stu1", { K: "기존 답변" }, {
        activityId, dashboardText: "결과 소개", urls: ["github.com/student/repo", "https://example.com/app"],
      })));
      await assertSucceeds(updateDoc(ref, { urls: ["https://example.com/revised"] }));
      const revised = await assertSucceeds(getDoc(ref));
      assert.deepEqual(revised.data().urls, ["https://example.com/revised"]);
      assert.equal(revised.data().dashboardText, "결과 소개");
      assert.deepEqual(revised.data().answers, { K: "기존 답변" });
      await assertSucceeds(updateDoc(ref, { urls: [] }));
      assert.deepEqual((await getDoc(ref)).data().urls, []);
    }
  });

  it("학생 URL도 본인과 담당 교사만 읽을 수 있고 학생 본인만 수정할 수 있다", async () => {
    await seed(env, db => setDoc(doc(db, "bookActivities", "act1", "entries", "stu1"), entry("stu1", {}, { urls: ["https://example.com/private"] })));
    const refFor = context => doc(context.firestore(), "bookActivities", "act1", "entries", "stu1");
    await assertSucceeds(getDoc(refFor(asStudent(env, "stu1"))));
    await assertSucceeds(getDoc(refFor(asTeacher(env, "teacherA"))));
    for (const context of [asStudent(env, "stu2"), asStudent(env, "outsider"), asTeacher(env, "teacherB")]) {
      await assertFails(getDoc(refFor(context)));
      await assertFails(updateDoc(refFor(context), { urls: [] }));
    }
    await assertFails(updateDoc(refFor(asTeacher(env, "teacherA")), { urls: [] }));
    const outsiderDb = asStudent(env, "outsider").firestore();
    await assertFails(setDoc(doc(outsiderDb, "bookActivities", "act1", "entries", "outsider"), entry("outsider", {}, { urls: ["https://example.com"] })));
    const studentDb = asStudent(env, "stu1").firestore();
    await assertFails(setDoc(doc(studentDb, "bookActivities", "lockedArchived", "entries", "stu1"), entry("stu1", {}, { activityId: "lockedArchived", urls: ["https://example.com"] })));
  });

  it("학생 URL 필드는 목록이어야 하며 기존 URL 없는 제출물은 계속 저장할 수 있다", async () => {
    const db = asStudent(env, "stu1").firestore();
    const ref = doc(db, "bookActivities", "act1", "entries", "stu1");
    await assertSucceeds(setDoc(ref, entry("stu1")));
    for (const urls of [null, "https://example.com", 123, { url: "https://example.com" }]) {
      await assertFails(updateDoc(ref, { urls }));
    }
    await assertSucceeds(updateDoc(ref, { urls: Array.from({ length: 40 }, (_, index) => "https://example.com/" + index) }));
  });

  it("남의 제출물 자리에 쓸 수 없다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertFails(setDoc(doc(db, "bookActivities", "act1", "entries", "stu2"), entry("stu2")));
  });

  it("학생은 legacy locked=true 활동에도 자기 답변을 쓸 수 있다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertSucceeds(setDoc(
      doc(db, "bookActivities", "locked1", "entries", "stu1"),
      entry("stu1", { K: "안다" }, { activityId: "locked1" })
    ));
  });

  it("학생은 confirmableItemKeys와 projectVersion이 없는 legacy 프로젝트 활동에 답변을 쓸 수 있다", async () => {
    await seed(env, async (db) => {
      await setDoc(doc(db, "bookProjects", "cA"), {
        classId: "cA",
        title: "기존 책방 프로젝트",
        version: "legacy",
        steps: [],
        createdBy: "teacherA",
        updatedAt: new Date(),
      });
      await setDoc(doc(db, "bookActivities", "legacyProjectAct"), {
        classId: "cA", projectId: "cA", type: "kwls", title: "기존 프로젝트 활동", locked: false,
      });
    });
    const db = asStudent(env, "stu1").firestore();

    await assertSucceeds(setDoc(
      doc(db, "bookActivities", "legacyProjectAct", "entries", "stu1"),
      entry("stu1", { K: "안다" }, { activityId: "legacyProjectAct" })
    ));
  });

  it("보관된 legacy 프로젝트 활동에는 답변을 쓸 수 없다", async () => {
    await seed(env, async (db) => {
      await setDoc(doc(db, "bookProjects", "cArchived"), {
        classId: "cArchived",
        title: "보관된 기존 책방 프로젝트",
        version: "legacy",
        steps: [],
        createdBy: "teacherA",
        updatedAt: new Date(),
      });
      await setDoc(doc(db, "bookActivities", "legacyArchivedAct"), {
        classId: "cArchived", projectId: "cArchived", type: "kwls", title: "보관된 기존 활동", locked: false,
      });
    });
    const db = asStudent(env, "stu1").firestore();

    await assertFails(setDoc(
      doc(db, "bookActivities", "legacyArchivedAct", "entries", "stu1"),
      entry("stu1", { K: "안다" }, { activityId: "legacyArchivedAct" })
    ));
  });

  it("프로젝트에서 제거되거나 현재 버전이 아닌 활동에는 답변을 쓸 수 없다", async () => {
    await seed(env, async (db) => {
      await setDoc(doc(db, "bookActivities", "removedAct"), {
        classId: "cA", projectId: "cA", projectVersion: "v1", type: "kwls", title: "삭제된 활동", locked: false,
      });
      await setDoc(doc(db, "bookActivities", "oldVersionAct"), {
        classId: "cA", projectId: "cA", projectVersion: "old", type: "kwls", title: "이전 버전 활동", locked: false,
      });
    });
    const db = asStudent(env, "stu1").firestore();

    await assertFails(setDoc(
      doc(db, "bookActivities", "removedAct", "entries", "stu1"),
      entry("stu1", { K: "안다" }, { activityId: "removedAct" })
    ));
    await assertFails(setDoc(
      doc(db, "bookActivities", "oldVersionAct", "entries", "stu1"),
      entry("stu1", { K: "안다" }, { activityId: "oldVersionAct" })
    ));
  });

  it("복원되어 현재 프로젝트 버전에 다시 포함된 활동에는 답변을 쓸 수 있다", async () => {
    await seed(env, async (db) => {
      await setDoc(doc(db, "bookProjects", "cA"), {
        classId: "cA",
        title: "복원된 책방 프로젝트",
        version: "v2",
        steps: [],
        confirmableItemKeys: ["activity:restoredAct"],
        createdBy: "teacherA",
        updatedAt: new Date(),
      });
      await setDoc(doc(db, "bookActivities", "restoredAct"), {
        classId: "cA", projectId: "cA", projectVersion: "v2", type: "kwls", title: "복원된 활동", locked: false,
      });
    });
    const db = asStudent(env, "stu1").firestore();

    await assertSucceeds(setDoc(
      doc(db, "bookActivities", "restoredAct", "entries", "stu1"),
      entry("stu1", { K: "안다" }, { activityId: "restoredAct" })
    ));
  });

  it("반 밖의 사람은 legacy locked=true 활동에 답변을 쓸 수 없다", async () => {
    const db = asStudent(env, "outsider").firestore();
    await assertFails(setDoc(
      doc(db, "bookActivities", "locked1", "entries", "outsider"),
      entry("outsider", { K: "안다" }, { activityId: "locked1" })
    ));
  });

  it("보관된 반에서는 legacy locked=true 활동 답변도 쓸 수 없다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertFails(setDoc(
      doc(db, "bookActivities", "lockedArchived", "entries", "stu1"),
      entry("stu1", { K: "안다" }, { activityId: "lockedArchived" })
    ));
  });

  it("같은 반이어도 남의 제출물은 읽을 수 없다", async () => {
    await seed(env, (db) => setDoc(doc(db, "bookActivities", "act1", "entries", "stu2"), entry("stu2")));
    const db = asStudent(env, "stu1").firestore();
    await assertFails(getDoc(doc(db, "bookActivities", "act1", "entries", "stu2")));
  });

  it("담당 교사는 학생 제출물을 읽을 수 있고, 다른 반 교사는 읽을 수 없다", async () => {
    await seed(env, (db) => setDoc(doc(db, "bookActivities", "act1", "entries", "stu1"), entry("stu1")));
    await assertSucceeds(
      getDoc(doc(asTeacher(env, "teacherA").firestore(), "bookActivities", "act1", "entries", "stu1"))
    );
    await assertFails(
      getDoc(doc(asTeacher(env, "teacherB").firestore(), "bookActivities", "act1", "entries", "stu1"))
    );
  });

  // '교사 임시 편집' 설계를 규칙으로 고정합니다.
  // 교사가 학생 제출물에 직접 쓸 수 있게 열어 두면, 수업 중 교사가 예시로
  // 고친 내용이 학생의 진짜 기록을 덮어써 버립니다.
  it("교사는 학생을 대신해 제출물을 쓸 수 없다 (임시 편집 설계 고정)", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertFails(setDoc(doc(db, "bookActivities", "act1", "entries", "stu1"), entry("stu1")));
  });

  it("제출물 삭제는 담당 교사만 할 수 있다", async () => {
    await seed(env, (db) => setDoc(doc(db, "bookActivities", "act1", "entries", "stu1"), entry("stu1")));
    await assertFails(
      deleteDoc(doc(asStudent(env, "stu1").firestore(), "bookActivities", "act1", "entries", "stu1"))
    );
    await assertSucceeds(
      deleteDoc(doc(asTeacher(env, "teacherA").firestore(), "bookActivities", "act1", "entries", "stu1"))
    );
  });

  it("반 밖의 사람은 쓸 수 없다", async () => {
    const db = asStudent(env, "outsider").firestore();
    await assertFails(setDoc(doc(db, "bookActivities", "act1", "entries", "outsider"), entry("outsider")));
  });
});
