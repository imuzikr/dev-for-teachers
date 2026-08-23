// =============================================================
// 개인 활동 제출물 — bookActivities/{aId}/entries/{uid}
//  (곁텍스트 읽기 · RAFT · KWLS · 마인드맵 공용)
//
// 실명이 들어가는 제출물이라 같은 반이어도 남의 답은 보이지 않습니다.
// 교사가 학생을 대신해 쓰는 경로는 의도적으로 열지 않았습니다 —
// 마인드맵 교사 편집은 저장 없이 화면·방송에만 반영되는 임시 편집입니다.
// =============================================================
import { describe, it, before, after, beforeEach } from "node:test";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { makeEnv, asStudent, asTeacher, seed } from "./helpers.mjs";

const entry = (uid, answers = { K: "안다" }) => ({
  activityId: "act1", authorId: uid, authorName: "학생A", answers,
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
      await setDoc(doc(db, "classes", "cA"), { createdBy: "teacherA", archived: false });
      await setDoc(doc(db, "memberships", "stu1_cA"), { uid: "stu1", classId: "cA" });
      await setDoc(doc(db, "memberships", "stu2_cA"), { uid: "stu2", classId: "cA" });
      await setDoc(doc(db, "bookActivities", "act1"), {
        classId: "cA", type: "kwls", title: "KWLS", locked: false,
      });
      await setDoc(doc(db, "bookActivities", "locked1"), {
        classId: "cA", type: "kwls", title: "잠긴 활동", locked: true,
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

  it("남의 제출물 자리에 쓸 수 없다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertFails(setDoc(doc(db, "bookActivities", "act1", "entries", "stu2"), entry("stu2")));
  });

  it("활동이 잠기면 학생은 쓸 수 없다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertFails(setDoc(doc(db, "bookActivities", "locked1", "entries", "stu1"), entry("stu1")));
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

  // 마인드맵 '교사 임시 편집' 설계를 규칙으로 고정합니다.
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
