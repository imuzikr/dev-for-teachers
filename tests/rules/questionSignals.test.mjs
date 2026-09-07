// =============================================================
// 언제든 질문하기(손들기) — classes/{cId}/questionSignals/{uid}
// =============================================================
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as firestore from "firebase/firestore";
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

async function loadSignalStore(context) {
  const source = await readFile(new URL("../../lib/store.js", import.meta.url), "utf8");
  const identityStart = source.indexOf("function signalIdentity(");
  const identityEnd = source.indexOf("function sortQuestionSignals(", identityStart);
  const start = source.indexOf("export async function setQuestionSignal(");
  const end = source.indexOf("\n// -------------------------------------------------------------", start);
  assert.ok(identityStart >= 0 && identityEnd > identityStart && start >= 0 && end > start);
  const bindings = { ...firestore, ...context };
  return new Function(
    ...Object.keys(bindings),
    source.slice(identityStart, identityEnd)
      + source.slice(start, end).replace("export async function", "async function")
      + "\nreturn setQuestionSignal;",
  )(...Object.values(bindings));
}

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

  it("메모는 작성자와 담당 교사만 읽고 확인 후 삭제할 수 있다", async () => {
    const student = asStudent(env, "stu1").firestore();
    const save = await loadSignalStore({ db: student, isFirebaseConfigured: true });
    await save("cA", { uid: "stu1", realName: "학생A" }, true, "  질문 내용\n두 번째 줄  ");
    const ref = doc(student, ...sigPath("cA", "stu1"));
    assert.equal((await assertSucceeds(getDoc(ref))).data().note, "질문 내용\n두 번째 줄");
    const teacher = asTeacher(env, "teacherA").firestore();
    assert.equal((await assertSucceeds(getDoc(doc(teacher, ...sigPath("cA", "stu1"))))).data().note, "질문 내용\n두 번째 줄");
    const peer = asStudent(env, "stu2").firestore();
    await assertFails(getDoc(doc(peer, ...sigPath("cA", "stu1"))));
    const otherTeacher = asTeacher(env, "teacherB").firestore();
    await assertFails(getDoc(doc(otherTeacher, ...sigPath("cA", "stu1"))));
    await assertSucceeds(deleteDoc(doc(teacher, ...sigPath("cA", "stu1"))));
    assert.equal((await getDoc(ref)).exists(), false);
  });

  it("기존 메모를 수정하거나 메모 없이 보내기로 지울 수 있다", async () => {
    const db = asStudent(env, "stu1").firestore();
    const save = await loadSignalStore({ db, isFirebaseConfigured: true });
    const user = { uid: "stu1" };
    const ref = doc(db, ...sigPath("cA", "stu1"));
    await save("cA", user, true, "첫 메모");
    const createdAt = (await getDoc(ref)).data().createdAt;
    await save("cA", user, true, "수정 메모");
    assert.equal((await getDoc(ref)).data().note, "수정 메모");
    assert.ok((await getDoc(ref)).data().createdAt.isEqual(createdAt));
    await save("cA", user, true);
    assert.equal((await getDoc(ref)).data().note, "");
    await save("cA", user, false);
    assert.equal((await getDoc(ref)).exists(), false);
  });

  for (const note of ["", "가".repeat(1000)]) {
    it(`빈 메모와 1000자 경계 허용: ${note.length}자`, async () => {
      const db = asStudent(env, "stu1").firestore();
      await assertSucceeds(setDoc(doc(db, ...sigPath("cA", "stu1")), { ...payload("cA", "stu1"), note }));
    });
  }

  for (const note of ["가".repeat(1001), null, 123, { text: "질문" }]) {
    it(`잘못된 메모의 생성과 수정 거부: ${typeof note}, ${String(note).length}`, async () => {
      const db = asStudent(env, "stu1").firestore();
      const ref = doc(db, ...sigPath("cA", "stu1"));
      await assertFails(setDoc(ref, { ...payload("cA", "stu1"), note }));
      await assertSucceeds(setDoc(ref, payload("cA", "stu1")));
      await assertFails(setDoc(ref, { note, updatedAt: serverTimestamp() }, { merge: true }));
      const save = await loadSignalStore({ db, isFirebaseConfigured: true });
      await assert.rejects(save("cA", { uid: "stu1" }, true, note), /질문 메모/);
      assert.equal((await getDoc(ref)).data().note, undefined);
    });
  }

  it("구형 클라이언트는 메모 없이 기존 손들기를 갱신할 수 있다", async () => {
    const db = asStudent(env, "stu1").firestore();
    const ref = doc(db, ...sigPath("cA", "stu1"));
    await assertSucceeds(setDoc(ref, payload("cA", "stu1")));
    await assertSucceeds(setDoc(ref, { updatedAt: serverTimestamp() }, { merge: true }));
  });

  it("데모 저장도 메모를 정리하고 이전 내용을 비우며 잘못된 입력을 거부한다", async () => {
    const mock = {};
    let notifications = 0;
    const save = await loadSignalStore({ isFirebaseConfigured: false, mock, notifyQuestionSignals: () => { notifications += 1; } });
    const user = { uid: "stu1" };
    await save("cA", user, true, "  메모  ");
    assert.equal(mock.questionSignals.stu1_cA.note, "메모");
    await assert.rejects(save("cA", user, true, null), /질문 메모/);
    await assert.rejects(save("cA", user, true, "가".repeat(1001)), /1,000자/);
    assert.equal(mock.questionSignals.stu1_cA.note, "메모");
    await save("cA", user, true);
    assert.equal(mock.questionSignals.stu1_cA.note, "");
    await save("cA", user, false);
    assert.equal(mock.questionSignals.stu1_cA, undefined);
    assert.equal(notifications, 3);
  });

});
