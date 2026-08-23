// =============================================================
// 반 삭제 — 하위 데이터가 하나도 남지 않는지 확인
//
// Firestore는 부모 문서를 지워도 하위 컬렉션을 함께 지우지 않습니다.
// 그래서 "반 문서를 지웠으니 끝"이라고 생각하면 출석부·자리표·기본 모둠·
// 손들기가 그대로 남고, 그 안에는 학생 실명과 학번이 들어 있습니다.
//
// 이 테스트는 반 하나에 딸릴 수 있는 모든 자료를 심어 놓고 지운 뒤,
// (1) 정말 하나도 남지 않는지 (2) 다른 반과 교사 자료는 멀쩡한지를 봅니다.
// 컬렉션이 새로 늘었는데 purgeClass.js에 추가하는 것을 잊으면 여기서 걸립니다.
//
// 규칙이 아니라 Cloud Functions 코드를 검사하므로 admin SDK를 씁니다
// (규칙을 우회하는 서버 로직이라 rules-unit-testing으로는 확인할 수 없음).
// =============================================================
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const admin = require("firebase-admin");
const { purgeClassData } = require("../../functions/purgeClass.js");

const PROJECT_ID = "demo-purge-test";
const KEEP = "cKeep"; // 남아 있어야 하는 다른 반
const GONE = "cGone"; // 지울 반

describe("반 삭제 시 하위 데이터 정리", () => {
  let app;
  let db;

  before(async () => {
    if (!process.env.FIRESTORE_EMULATOR_HOST) {
      process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
    }
    app = admin.initializeApp({ projectId: PROJECT_ID }, "purge-test");
    db = app.firestore();

    // ── 지울 반에 딸린 자료를 빠짐없이 심습니다 ──
    await db.doc(`classes/${GONE}`).set({ createdBy: "teacherA", archived: true, name: "지울 반" });

    // 반 문서의 하위 컬렉션 (실명·학번이 들어가는 곳)
    await db.doc(`classes/${GONE}/attendanceRecords/2026-08-23_stu1`).set({
      classId: GONE, uid: "stu1", date: "2026-08-23", name: "학생A", studentId: "30101",
    });
    await db.doc(`classes/${GONE}/seatLayouts/default`).set({ classId: GONE, layoutId: "default", seats: [] });
    await db.doc(`classes/${GONE}/groupAssignments/default`).set({
      classId: GONE, groups: [{ index: 1, members: [{ uid: "stu1", name: "학생A", studentId: "30101" }] }],
    });
    await db.doc(`classes/${GONE}/questionSignals/stu1`).set({
      classId: GONE, uid: "stu1", name: "학생A", studentId: "30101",
    });

    // 공부방 보드 + 카드(하위 컬렉션)
    await db.doc(`studyBoards/b1`).set({ classId: GONE, title: "보드", type: "cards", editMode: "open" });
    await db.doc(`studyBoards/b1/cards/stu1`).set({ authorId: "stu1", title: "카드", content: "내용" });

    // 책방 활동 + 모둠/낱말/제출물(2단계 하위 컬렉션)
    await db.doc(`bookActivities/a1`).set({ classId: GONE, type: "consonant", title: "닿소리" });
    await db.doc(`bookActivities/a1/groups/g1`).set({ activityId: "a1", groupName: "1모둠" });
    await db.doc(`bookActivities/a1/groups/g1/words/w1`).set({ authorId: "stu1", text: "낱말" });
    await db.doc(`bookActivities/a1/entries/stu1`).set({
      activityId: "a1", authorId: "stu1", authorName: "학생A", answers: { K: "안다" },
    });

    // classId로 묶인 최상위 기록들
    await db.doc(`rewards/${GONE}_stu1`).set({ classId: GONE, uid: "stu1", count: 5 });
    await db.doc(`studentNotes/n1`).set({ classId: GONE, studentUid: "stu1", text: "관찰 메모" });
    await db.doc(`kwl/k1`).set({ classId: GONE, userId: "stu1", date: "2026-08-23", K: "안다" });
    await db.doc(`presence/stu1_${GONE}`).set({ classId: GONE, uid: "stu1", visible: true });
    await db.doc(`joinCodes/CODE1`).set({ classId: GONE, createdBy: "teacherA" });
    await db.doc(`memberships/stu1_${GONE}`).set({ classId: GONE, uid: "stu1" });
    await db.doc(`broadcasts/${GONE}`).set({ classId: GONE, mode: "slide" });

    // ── 남아 있어야 하는 것들 ──
    await db.doc(`classes/${KEEP}`).set({ createdBy: "teacherA", archived: false, name: "남을 반" });
    await db.doc(`classes/${KEEP}/attendanceRecords/2026-08-23_stu9`).set({ classId: KEEP, uid: "stu9" });
    await db.doc(`studyBoards/b9`).set({ classId: KEEP, title: "남을 보드", type: "cards" });
    await db.doc(`bookActivities/a9`).set({ classId: KEEP, type: "consonant" });
    await db.doc(`rewards/${KEEP}_stu9`).set({ classId: KEEP, uid: "stu9", count: 3 });
    await db.doc(`memberships/stu9_${KEEP}`).set({ classId: KEEP, uid: "stu9" });
    // 수업 자료는 반이 아니라 교사(ownerId)에 귀속 — 반을 지워도 남아야 합니다.
    await db.doc(`lessons/l1`).set({ ownerId: "teacherA", title: "수업 자료" });

    // ── 실행 ──
    const warnings = await purgeClassData(db, GONE);
    assert.deepEqual(warnings, [], `파기 중 경고가 있으면 안 됩니다: ${JSON.stringify(warnings)}`);
  });

  after(async () => {
    await app.delete();
  });

  const gone = async (path) => {
    const snap = await db.doc(path).get();
    assert.equal(snap.exists, false, `남아 있으면 안 됩니다: ${path}`);
  };
  const kept = async (path) => {
    const snap = await db.doc(path).get();
    assert.equal(snap.exists, true, `지워지면 안 됩니다: ${path}`);
  };

  it("반 문서가 사라진다", async () => {
    await gone(`classes/${GONE}`);
  });

  it("반 하위 컬렉션이 남지 않는다 (출석부·자리표·기본 모둠·손들기)", async () => {
    await gone(`classes/${GONE}/attendanceRecords/2026-08-23_stu1`);
    await gone(`classes/${GONE}/seatLayouts/default`);
    await gone(`classes/${GONE}/groupAssignments/default`);
    await gone(`classes/${GONE}/questionSignals/stu1`);
  });

  it("공부방 보드와 카드가 남지 않는다", async () => {
    await gone("studyBoards/b1");
    await gone("studyBoards/b1/cards/stu1");
  });

  it("책방 활동의 2단계 하위 컬렉션까지 남지 않는다", async () => {
    await gone("bookActivities/a1");
    await gone("bookActivities/a1/groups/g1");
    await gone("bookActivities/a1/groups/g1/words/w1");
    await gone("bookActivities/a1/entries/stu1");
  });

  it("classId로 묶인 최상위 기록이 남지 않는다", async () => {
    await gone(`rewards/${GONE}_stu1`);
    await gone("studentNotes/n1");
    await gone("kwl/k1");
    await gone(`presence/stu1_${GONE}`);
    await gone("joinCodes/CODE1");
    await gone(`memberships/stu1_${GONE}`);
    await gone(`broadcasts/${GONE}`);
  });

  it("다른 반의 자료는 건드리지 않는다", async () => {
    await kept(`classes/${KEEP}`);
    await kept(`classes/${KEEP}/attendanceRecords/2026-08-23_stu9`);
    await kept("studyBoards/b9");
    await kept("bookActivities/a9");
    await kept(`rewards/${KEEP}_stu9`);
    await kept(`memberships/stu9_${KEEP}`);
  });

  it("교사의 수업 자료는 남는다 (반이 아니라 교사 소유)", async () => {
    await kept("lessons/l1");
  });

  it("이미 지워진 반에 다시 실행해도 안전하다 (멱등)", async () => {
    const warnings = await purgeClassData(db, GONE);
    assert.deepEqual(warnings, []);
  });
});
