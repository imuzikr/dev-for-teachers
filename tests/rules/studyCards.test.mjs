// =============================================================
// 공부방 보드와 카드 — studyBoards/{bId}/cards/{cardId}
//  · 학생 카드는 문서 ID가 uid (보드당 1장 보장)
//  · 잠금(editMode) · 선생님 보드(notice) · 모둠 보드(group) 분기 확인
// =============================================================
import { describe, it, before, after, beforeEach } from "node:test";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { makeEnv, asStudent, asTeacher, seed } from "./helpers.mjs";

const card = (uid, extra = {}) => ({
  authorId: uid, title: "내 카드", content: "내용", ...extra,
});

describe("공부방 카드 규칙", () => {
  let env;

  before(async () => {
    env = await makeEnv("demo-rules-cards");
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
      // 주의: editMode는 반드시 넣어야 합니다. 규칙의 isBoardLocked()가
      // .get()이 아니라 .editMode로 직접 참조해서, 이 필드가 없으면 규칙
      // 평가 자체가 오류로 끝나 학생 쓰기가 통째로 막힙니다. addStudyBoard가
      // 항상 'open'을 넣으므로 실제 데이터와 같은 형태로 맞춥니다.
      // 일반 학생 카드 보드
      await setDoc(doc(db, "studyBoards", "open"), { classId: "cA", title: "열린 보드", type: "cards", editMode: "open" });
      // 잠긴 보드
      await setDoc(doc(db, "studyBoards", "locked"), { classId: "cA", title: "잠긴 보드", type: "cards", editMode: "locked" });
      // 선생님(공지) 보드
      await setDoc(doc(db, "studyBoards", "notice"), { classId: "cA", title: "선생님 보드", type: "notice", editMode: "open" });
    });
  });

  it("학생은 자기 uid 문서로 카드를 쓸 수 있다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertSucceeds(setDoc(doc(db, "studyBoards", "open", "cards", "stu1"), card("stu1")));
  });

  it("학생은 자기 uid가 아닌 문서 ID로 카드를 만들 수 없다 (보드당 1장 우회 방지)", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertFails(setDoc(doc(db, "studyBoards", "open", "cards", "stu1-두번째"), card("stu1")));
  });

  it("authorId를 남의 것으로 위조할 수 없다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertFails(setDoc(doc(db, "studyBoards", "open", "cards", "stu1"), card("stu2")));
  });

  it("보드가 잠기면 학생은 카드를 쓸 수 없다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertFails(setDoc(doc(db, "studyBoards", "locked", "cards", "stu1"), card("stu1")));
  });

  it("선생님 보드에는 학생이 쓸 수 없다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertFails(setDoc(doc(db, "studyBoards", "notice", "cards", "stu1"), card("stu1")));
  });

  it("학생은 남의 카드를 고칠 수 없다", async () => {
    await seed(env, (db) => setDoc(doc(db, "studyBoards", "open", "cards", "stu2"), card("stu2")));
    const db = asStudent(env, "stu1").firestore();
    await assertFails(updateDoc(doc(db, "studyBoards", "open", "cards", "stu2"), { content: "덮어쓰기" }));
  });

  it("학생은 자기 카드도 지울 수 없다 (되살릴 방법이 없어 교사만 허용)", async () => {
    await seed(env, (db) => setDoc(doc(db, "studyBoards", "open", "cards", "stu1"), card("stu1")));
    const db = asStudent(env, "stu1").firestore();
    await assertFails(deleteDoc(doc(db, "studyBoards", "open", "cards", "stu1")));
  });

  it("담당 교사는 잠긴 보드에도 쓰고 카드를 지울 수 있다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(setDoc(doc(db, "studyBoards", "locked", "cards", "teacherA"), card("teacherA")));
    await seed(env, (d) => setDoc(doc(d, "studyBoards", "open", "cards", "stu1"), card("stu1")));
    await assertSucceeds(deleteDoc(doc(db, "studyBoards", "open", "cards", "stu1")));
  });

  it("다른 반 교사는 이 반 보드에 쓸 수 없다", async () => {
    const db = asTeacher(env, "teacherB").firestore();
    await assertFails(setDoc(doc(db, "studyBoards", "open", "cards", "teacherB"), card("teacherB")));
  });

  it("보관된 반에서는 교사도 카드를 쓸 수 없다", async () => {
    await seed(env, (db) => setDoc(doc(db, "classes", "cA"), { createdBy: "teacherA", archived: true }));
    const db = asTeacher(env, "teacherA").firestore();
    await assertFails(setDoc(doc(db, "studyBoards", "open", "cards", "teacherA"), card("teacherA")));
  });

  // editMode가 없는 보드에서도 학생이 쓸 수 있어야 합니다. 규칙이 .editMode를
  // 직접 참조하던 시절엔 필드가 없으면 평가 오류로 끝나 쓰기가 통째로 막혔습니다.
  it("editMode 필드가 없는 보드에서도 학생이 카드를 쓸 수 있다", async () => {
    await seed(env, (db) =>
      setDoc(doc(db, "studyBoards", "nofield"), { classId: "cA", title: "필드 없는 보드", type: "cards" })
    );
    const db = asStudent(env, "stu1").firestore();
    await assertSucceeds(setDoc(doc(db, "studyBoards", "nofield", "cards", "stu1"), card("stu1")));
  });

  it("같은 반 학생은 서로의 카드를 읽을 수 있다 (개인 보드 = 함께 보기)", async () => {
    await seed(env, (db) => setDoc(doc(db, "studyBoards", "open", "cards", "stu2"), card("stu2")));
    const db = asStudent(env, "stu1").firestore();
    await assertSucceeds(getDoc(doc(db, "studyBoards", "open", "cards", "stu2")));
  });

  it("반 밖의 사람은 카드를 읽을 수 없다", async () => {
    await seed(env, (db) => setDoc(doc(db, "studyBoards", "open", "cards", "stu1"), card("stu1")));
    const db = asStudent(env, "outsider").firestore();
    await assertFails(getDoc(doc(db, "studyBoards", "open", "cards", "stu1")));
  });
});
