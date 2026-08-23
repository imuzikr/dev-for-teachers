// =============================================================
// 공부방 출석부 — classes/{cId}/attendanceRecords/{date_uid}
// =============================================================
import { describe, it, before, after, beforeEach } from "node:test";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { makeEnv, asStudent, asTeacher, seed } from "./helpers.mjs";

const DATE = "2026-08-23";
const recPath = (cId, uid, date = DATE) => ["classes", cId, "attendanceRecords", `${date}_${uid}`];

// 클라이언트(lib/store.js markStudyAttendance)가 실제로 보내는 형태
const payload = (cId, uid, date = DATE) => ({
  classId: cId,
  uid,
  date,
  name: "학생A",
  studentId: "30101",
  emoji: "🙂",
  attendedAt: serverTimestamp(),
  createdAt: serverTimestamp(),
});

describe("출석부 규칙", () => {
  let env;

  before(async () => {
    env = await makeEnv("demo-rules-attendance");
  });
  after(async () => {
    await env.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env, async (db) => {
      await setDoc(doc(db, "classes", "cA"), { createdBy: "teacherA", archived: false, name: "A반" });
      await setDoc(doc(db, "classes", "cB"), { createdBy: "teacherB", archived: false, name: "B반" });
      await setDoc(doc(db, "memberships", "stu1_cA"), { uid: "stu1", classId: "cA" });
      await setDoc(doc(db, "memberships", "stu2_cA"), { uid: "stu2", classId: "cA" });
    });
  });

  it("소속 학생은 자기 출석을 기록할 수 있다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertSucceeds(setDoc(doc(db, ...recPath("cA", "stu1")), payload("cA", "stu1")));
  });

  // 회귀 테스트 — 이 순서(사전 get 없이 바로 create)가 지켜져야 합니다.
  // 없는 문서를 get()으로 먼저 확인하면 읽기 규칙이 resource.data를 참조하는
  // 탓에 규칙 평가가 거부되어, 그날 첫 출석이 항상 실패했습니다.
  it("없는 출석 문서를 미리 읽으려 하면 거부된다 (사전 확인 금지 근거)", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertFails(getDoc(doc(db, ...recPath("cA", "stu1"))));
  });

  it("기록한 뒤에는 본인이 자기 출석을 읽을 수 있다", async () => {
    await seed(env, (db) => setDoc(doc(db, ...recPath("cA", "stu1")), { ...payload("cA", "stu1"), attendedAt: new Date(), createdAt: new Date() }));
    const db = asStudent(env, "stu1").firestore();
    await assertSucceeds(getDoc(doc(db, ...recPath("cA", "stu1"))));
  });

  it("남의 이름으로 출석을 기록할 수 없다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertFails(setDoc(doc(db, ...recPath("cA", "stu2")), payload("cA", "stu2")));
  });

  it("문서 ID가 '날짜_uid' 형식이 아니면 거부된다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertFails(setDoc(doc(db, "classes", "cA", "attendanceRecords", "아무거나"), payload("cA", "stu1")));
  });

  it("그 반 학생이 아니면 기록할 수 없다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertFails(setDoc(doc(db, ...recPath("cB", "stu1")), payload("cB", "stu1")));
  });

  it("보관된 반에는 기록할 수 없다", async () => {
    await seed(env, (db) => setDoc(doc(db, "classes", "cA"), { createdBy: "teacherA", archived: true, name: "A반" }));
    const db = asStudent(env, "stu1").firestore();
    await assertFails(setDoc(doc(db, ...recPath("cA", "stu1")), payload("cA", "stu1")));
  });

  it("시각을 서버 시각이 아닌 임의 값으로 넣으면 거부된다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertFails(
      setDoc(doc(db, ...recPath("cA", "stu1")), {
        ...payload("cA", "stu1"),
        attendedAt: new Date("2020-01-01"),
        createdAt: new Date("2020-01-01"),
      })
    );
  });

  it("한번 남긴 출석은 수정·삭제할 수 없다", async () => {
    await seed(env, (db) => setDoc(doc(db, ...recPath("cA", "stu1")), { ...payload("cA", "stu1"), attendedAt: new Date(), createdAt: new Date() }));
    const db = asStudent(env, "stu1").firestore();
    await assertFails(setDoc(doc(db, ...recPath("cA", "stu1")), { ...payload("cA", "stu1"), name: "고침" }));
    await assertFails(deleteDoc(doc(db, ...recPath("cA", "stu1"))));
  });

  it("담당 교사는 반 학생의 출석을 읽을 수 있고, 다른 반 교사는 읽을 수 없다", async () => {
    await seed(env, (db) => setDoc(doc(db, ...recPath("cA", "stu1")), { ...payload("cA", "stu1"), attendedAt: new Date(), createdAt: new Date() }));
    await assertSucceeds(getDoc(doc(asTeacher(env, "teacherA").firestore(), ...recPath("cA", "stu1"))));
    await assertFails(getDoc(doc(asTeacher(env, "teacherB").firestore(), ...recPath("cA", "stu1"))));
  });

  it("같은 반 다른 학생의 출석은 볼 수 없다", async () => {
    await seed(env, (db) => setDoc(doc(db, ...recPath("cA", "stu2")), { ...payload("cA", "stu2"), attendedAt: new Date(), createdAt: new Date() }));
    const db = asStudent(env, "stu1").firestore();
    await assertFails(getDoc(doc(db, ...recPath("cA", "stu2"))));
  });
});
