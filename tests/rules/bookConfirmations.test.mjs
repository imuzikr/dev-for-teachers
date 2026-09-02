import { describe, it, before, after, beforeEach } from "node:test";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { makeEnv, asStudent, asTeacher, seed } from "./helpers.mjs";

const confirmation = (uid, overrides = {}) => ({
  classId: "cA",
  projectId: "cA",
  itemKind: "resource",
  itemId: "res1",
  itemTitle: "자료",
  stepId: "step1",
  authorId: uid,
  authorName: "학생A",
  confirmed: true,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...overrides,
});

const confirmationId = (kind, itemId, uid) => `cA|cA|${kind}|${itemId}|${uid}`;

describe("책방 활동·자료 확인 규칙", () => {
  let env;

  before(async () => {
    env = await makeEnv("demo-rules-book-confirmations");
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
        classId: "cA", projectId: "cA", type: "book", title: "열린 활동", locked: false,
      });
      await setDoc(doc(db, "bookActivities", "locked1"), {
        classId: "cA", projectId: "cA", type: "book", title: "잠긴 활동", locked: true,
      });
      await setDoc(doc(db, "bookResources", "res1"), {
        resourceId: "res1",
        classId: "cA",
        projectId: "cA",
        projectVersion: "v1",
        stepId: "step1",
        stepOrder: 0,
        resourceOrder: 0,
        title: "자료",
        content: "자료 내용",
        url: "",
        createdBy: "teacherA",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });
  });

  it("학생은 자료와 열린 활동을 확인할 수 있다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertSucceeds(setDoc(doc(db, "bookConfirmations", confirmationId("resource", "res1", "stu1")), confirmation("stu1")));
    await assertSucceeds(setDoc(
      doc(db, "bookConfirmations", confirmationId("activity", "act1", "stu1")),
      confirmation("stu1", { itemKind: "activity", itemId: "act1", itemTitle: "열린 활동" })
    ));
  });

  it("학생은 잠긴 활동을 확인할 수 없다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertFails(setDoc(
      doc(db, "bookConfirmations", confirmationId("activity", "locked1", "stu1")),
      confirmation("stu1", { itemKind: "activity", itemId: "locked1", itemTitle: "잠긴 활동" })
    ));
  });

  it("학생은 다른 학생 이름으로 확인할 수 없다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertFails(setDoc(doc(db, "bookConfirmations", confirmationId("resource", "res1", "stu2")), confirmation("stu2")));
  });

  it("학생은 확인 문서 경로를 속일 수 없다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertFails(setDoc(doc(db, "bookConfirmations", confirmationId("resource", "res1", "stu2")), confirmation("stu1")));
  });

  it("학생은 다른 학생의 확인 문서를 자기 것으로 덮어쓸 수 없다", async () => {
    await seed(env, (db) => setDoc(doc(db, "bookConfirmations", confirmationId("resource", "res1", "stu2")), confirmation("stu2")));
    const db = asStudent(env, "stu1").firestore();
    await assertFails(setDoc(doc(db, "bookConfirmations", confirmationId("resource", "res1", "stu2")), confirmation("stu1")));
  });

  it("프로젝트에 등록되지 않은 자료는 확인할 수 없다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertFails(setDoc(
      doc(db, "bookConfirmations", confirmationId("resource", "missing", "stu1")),
      confirmation("stu1", { itemId: "missing", itemTitle: "없는 자료" })
    ));
  });

  it("활동 id를 자료 확인으로 속일 수 없다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertFails(setDoc(
      doc(db, "bookConfirmations", confirmationId("resource", "act1", "stu1")),
      confirmation("stu1", { itemKind: "resource", itemId: "act1", itemTitle: "활동을 자료로 위장" })
    ));
  });

  it("활동 확인은 같은 프로젝트 활동에만 허용된다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertFails(setDoc(
      doc(db, "bookConfirmations", "cA|other|activity|act1|stu1"),
      confirmation("stu1", { projectId: "other", itemKind: "activity", itemId: "act1", itemTitle: "다른 프로젝트" })
    ));
  });

  it("교사는 반 전체 확인 진척도를 읽고 학생은 자기 확인만 읽는다", async () => {
    await seed(env, async (db) => {
      await setDoc(doc(db, "bookConfirmations", confirmationId("resource", "res1", "stu1")), confirmation("stu1"));
      await setDoc(doc(db, "bookConfirmations", confirmationId("resource", "res1", "stu2")), confirmation("stu2"));
    });

    const teacherDb = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(getDocs(query(collection(teacherDb, "bookConfirmations"), where("classId", "==", "cA"))));

    const studentDb = asStudent(env, "stu1").firestore();
    await assertSucceeds(getDoc(doc(studentDb, "bookConfirmations", confirmationId("resource", "res1", "stu1"))));
    await assertFails(getDoc(doc(studentDb, "bookConfirmations", confirmationId("resource", "res1", "stu2"))));
  });
});
