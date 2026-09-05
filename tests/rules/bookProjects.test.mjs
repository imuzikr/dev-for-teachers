import { describe, it, before, after, beforeEach } from "node:test";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, serverTimestamp, setDoc, writeBatch } from "firebase/firestore";
import { makeEnv, asTeacher, seed } from "./helpers.mjs";

const projectPayload = (uid, overrides = {}) => ({
  classId: "cA",
  title: "개발자실 프로젝트",
  version: "version1",
  steps: [
    {
      id: "step1",
      title: "프로그램 설치",
      activities: [{ id: "act1", title: "Node.js 설치하기", locked: true }],
      resources: [{ id: "res1", title: "주기율표 웹 앱 제작", locked: false }],
      itemOrder: [
        { kind: "activity", id: "act1" },
        { kind: "resource", id: "res1" },
      ],
    },
  ],
  confirmableItemKeys: ["activity:act1", "resource:res1"],
  createdBy: uid,
  updatedAt: serverTimestamp(),
  ...overrides,
});

const resourcePayload = (uid, overrides = {}) => ({
  resourceId: "res1",
  classId: "cA",
  projectId: "cA",
  projectVersion: "version1",
  stepId: "step1",
  stepOrder: 0,
  resourceOrder: 0,
  title: "주기율표 웹 앱 제작",
  content: "자료 내용",
  url: "",
  locked: false,
  createdBy: uid,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...overrides,
});

const activityPayload = (uid, overrides = {}) => ({
  classId: "cA",
  projectId: "cA",
  projectVersion: "version1",
  stepId: "step1",
  stepOrder: 0,
  activityOrder: 0,
  type: "book",
  title: "Node.js 설치하기",
  content: "활동 내용",
  bookUrl: "",
  locked: true,
  createdBy: uid,
  createdAt: serverTimestamp(),
  ...overrides,
});

describe("개발자실 프로젝트 저장 규칙", () => {
  let env;

  before(async () => {
    env = await makeEnv("demo-rules-book-projects");
  });

  after(async () => {
    await env.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env, async (db) => {
      await setDoc(doc(db, "classes", "cA"), { createdBy: "teacherA", archived: false });
      await setDoc(doc(db, "classes", "archived"), { createdBy: "teacherA", archived: true });
    });
  });

  it("담당 교사는 프로젝트, 활동, 자료를 배치로 저장할 수 있다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    const batch = writeBatch(db);

    batch.set(doc(db, "bookActivities", "act1"), activityPayload("teacherA"));
    batch.set(doc(db, "bookResources", "res1"), resourcePayload("teacherA"));
    batch.set(doc(db, "bookProjects", "cA"), projectPayload("teacherA"));

    await assertSucceeds(batch.commit());
  });

  it("다른 반 교사는 프로젝트를 저장할 수 없다", async () => {
    const db = asTeacher(env, "teacherB").firestore();

    await assertFails(setDoc(doc(db, "bookProjects", "cA"), projectPayload("teacherB", { createdBy: "teacherB" })));
  });

  it("보관된 반에는 담당 교사도 프로젝트를 저장할 수 없다", async () => {
    const db = asTeacher(env, "teacherA").firestore();

    await assertFails(setDoc(
      doc(db, "bookProjects", "archived"),
      projectPayload("teacherA", { classId: "archived" })
    ));
  });
});
