// =============================================================
// 언제든 질문하기(손들기) — classes/{cId}/questionSignals/{uid}
// =============================================================
import { describe, it, before, after, beforeEach } from "node:test";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import {
  doc, getDoc, setDoc, deleteDoc, getDocs, collection, serverTimestamp,
} from "firebase/firestore";
import { makeEnv, asStudent, asTeacher, seed } from "./helpers.mjs";

const sigPath = (cId, uid) => ["classes", cId, "questionSignals", uid];
const payload = (cId, uid) => ({
  classId: cId,
  uid,
  name: "학생A",
  studentId: "30101",
  emoji: "🙂",
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});

describe("손들기 규칙", () => {
  let env;

  before(async () => {
    env = await makeEnv("demo-rules-signals");
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
    });
  });

  it("소속 학생은 손을 들고 내릴 수 있다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertSucceeds(setDoc(doc(db, ...sigPath("cA", "stu1")), payload("cA", "stu1")));
    await assertSucceeds(deleteDoc(doc(db, ...sigPath("cA", "stu1"))));
  });

  it("남을 대신해 손을 들 수 없다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertFails(setDoc(doc(db, ...sigPath("cA", "stu2")), payload("cA", "stu2")));
  });

  it("uid 필드를 남의 것으로 위조할 수 없다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertFails(
      setDoc(doc(db, ...sigPath("cA", "stu1")), { ...payload("cA", "stu1"), uid: "stu2" })
    );
  });

  it("그 반 학생이 아니면 손을 들 수 없다", async () => {
    const db = asStudent(env, "outsider").firestore();
    await assertFails(setDoc(doc(db, ...sigPath("cA", "outsider")), payload("cA", "outsider")));
  });

  it("담당 교사는 손든 학생 목록을 조회할 수 있다", async () => {
    await seed(env, (db) =>
      setDoc(doc(db, ...sigPath("cA", "stu1")), {
        ...payload("cA", "stu1"), createdAt: new Date(), updatedAt: new Date(),
      })
    );
    const db = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(getDocs(collection(db, "classes", "cA", "questionSignals")));
  });

  it("다른 반 교사는 목록을 조회할 수 없다", async () => {
    const db = asTeacher(env, "teacherB").firestore();
    await assertFails(getDocs(collection(db, "classes", "cA", "questionSignals")));
  });

  it("학생은 남의 손들기를 읽거나 목록을 훑을 수 없다", async () => {
    await seed(env, (db) =>
      setDoc(doc(db, ...sigPath("cA", "stu2")), {
        ...payload("cA", "stu2"), createdAt: new Date(), updatedAt: new Date(),
      })
    );
    const db = asStudent(env, "stu1").firestore();
    await assertFails(getDoc(doc(db, ...sigPath("cA", "stu2"))));
    await assertFails(getDocs(collection(db, "classes", "cA", "questionSignals")));
  });

  it("담당 교사는 학생의 손을 내려 줄 수 있다", async () => {
    await seed(env, (db) =>
      setDoc(doc(db, ...sigPath("cA", "stu1")), {
        ...payload("cA", "stu1"), createdAt: new Date(), updatedAt: new Date(),
      })
    );
    const db = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(deleteDoc(doc(db, ...sigPath("cA", "stu1"))));
  });
});
