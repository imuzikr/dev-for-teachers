import { describe, it, before, after, beforeEach } from "node:test";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { makeEnv, asStudent, asTeacher, seed } from "./helpers.mjs";

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

const trashPayload = (uid, overrides = {}) => ({
  classId: "cA",
  kind: "activity",
  title: "Node.js 설치하기",
  projectVersion: "version1",
  projectTitle: "개발자실 프로젝트",
  payload: { id: "act1", title: "Node.js 설치하기" },
  deletedBy: uid,
  deletedAt: serverTimestamp(),
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
      await setDoc(doc(db, "classes", "cA"), { createdBy: "teacherA", accessVersion: 2, archived: false });
      await setDoc(doc(db, "classes", "archived"), { createdBy: "teacherA", accessVersion: 2, archived: true });
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

  it("resource templates accept booleans only and retain teacher-only writes", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    for (const templateEnabled of [true, false]) {
      await assertSucceeds(setDoc(doc(db, "bookResources", "res1"), resourcePayload("teacherA", { templateEnabled })));
    }
    await assertFails(setDoc(doc(db, "bookResources", "res1"), resourcePayload("teacherA", { templateEnabled: "true" })));
    await assertFails(setDoc(doc(asStudent(env, "studentA").firestore(), "bookResources", "res1"), resourcePayload("studentA", { templateEnabled: true })));
    await assertFails(setDoc(doc(asTeacher(env, "teacherB").firestore(), "bookResources", "res1"), resourcePayload("teacherB", { templateEnabled: true })));
  });

  it("resource teacher descriptions are optional strings for the owning teacher only", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    for (const teacherDescription of ["교사용 설명", "", "한".repeat(6000)]) {
      await assertSucceeds(setDoc(doc(db, "bookResources", "res1"), resourcePayload("teacherA", { teacherDescription })));
    }
    await assertSucceeds(setDoc(doc(db, "bookResources", "res1"), resourcePayload("teacherA")));
    await assertFails(setDoc(doc(db, "bookResources", "res1"), resourcePayload("teacherA", { teacherDescription: 123 })));
    await assertFails(setDoc(doc(asStudent(env, "studentA").firestore(), "bookResources", "res1"), resourcePayload("studentA", { teacherDescription: "학생 작성" })));
    await assertFails(setDoc(doc(asTeacher(env, "teacherB").firestore(), "bookResources", "res1"), resourcePayload("teacherB", { teacherDescription: "다른 반 교사 작성" })));
  });

  it("다른 반 교사는 프로젝트를 저장할 수 없다", async () => {
    const db = asTeacher(env, "teacherB").firestore();

    await assertFails(setDoc(doc(db, "bookProjects", "cA"), projectPayload("teacherB", { createdBy: "teacherB" })));
  });

  it("담당 교사는 단계별 활성 항목 맵을 저장하고 기존 createdBy를 유지해 수정할 수 있다", async () => {
    await seed(env, async (db) => {
      await setDoc(doc(db, "bookProjects", "cA"), projectPayload("originalAdmin", { updatedAt: new Date(0) }));
    });
    const db = asTeacher(env, "teacherA").firestore();

    await assertSucceeds(updateDoc(doc(db, "bookProjects", "cA"), {
      activeItemByStep: { step1: "activity:act1", staleDeletedStep: "resource:old" },
      updatedAt: serverTimestamp(),
    }));
  });

  it("활성 항목 맵은 300개를 넘길 수 없다", async () => {
    await seed(env, async (db) => {
      await setDoc(doc(db, "bookProjects", "cA"), projectPayload("teacherA", { updatedAt: new Date(0) }));
    });
    const db = asTeacher(env, "teacherA").firestore();
    const activeItemByStep = Object.fromEntries(Array.from({ length: 301 }, (_, index) => [`step${index}`, "activity:act1"]));

    await assertFails(updateDoc(doc(db, "bookProjects", "cA"), {
      activeItemByStep,
      updatedAt: serverTimestamp(),
    }));
  });

  it("학생은 활성 항목을 쓸 수 없고 등록된 학생은 프로젝트를 읽을 수 있다", async () => {
    await seed(env, async (db) => {
      await setDoc(doc(db, "bookProjects", "cA"), projectPayload("teacherA", {
        activeItemByStep: { step1: "resource:res1" },
        updatedAt: new Date(0),
      }));
      await setDoc(doc(db, "memberships", "studentA_cA"), { uid: "studentA", classId: "cA", accessVersion: 2 });
    });
    const db = asStudent(env, "studentA").firestore();

    await assertSucceeds(getDoc(doc(db, "bookProjects", "cA")));
    await assertFails(updateDoc(doc(db, "bookProjects", "cA"), {
      activeItemByStep: { step1: "activity:act1" },
      updatedAt: serverTimestamp(),
    }));
  });

  for (const [label, makeContext] of [
    ["등록된 학생은", () => asStudent(env, "studentA")],
    ["반 밖의 학생은", () => asStudent(env, "outsider")],
    ["다른 반 교사는", () => asTeacher(env, "teacherB")],
  ]) {
    it(`${label} 활동·자료·프로젝트를 삭제하거나 프로젝트에서 항목을 제거할 수 없다`, async () => {
      await seed(env, async (db) => {
        await setDoc(doc(db, "bookProjects", "cA"), projectPayload("teacherA"));
        await setDoc(doc(db, "bookActivities", "act1"), activityPayload("teacherA"));
        await setDoc(doc(db, "bookResources", "res1"), resourcePayload("teacherA"));
        await setDoc(doc(db, "memberships", "studentA_cA"), { uid: "studentA", classId: "cA", accessVersion: 2 });
      });
      const db = makeContext().firestore();

      for (const [collectionName, id] of [["bookActivities", "act1"], ["bookResources", "res1"], ["bookProjects", "cA"]]) {
        await assertFails(deleteDoc(doc(db, collectionName, id)));
      }
      for (const field of ["activities", "resources"]) {
        const steps = projectPayload("teacherA").steps.map((step) => ({
          ...step,
          [field]: [],
          itemOrder: step.itemOrder.filter((item) => item.kind !== (field === "activities" ? "activity" : "resource")),
        }));
        await assertFails(updateDoc(doc(db, "bookProjects", "cA"), {
          steps,
          confirmableItemKeys: field === "activities" ? ["resource:res1"] : ["activity:act1"],
          updatedAt: serverTimestamp(),
        }));
      }
    });
  }

  it("담당 교사는 프로젝트에서 항목을 제거하고 활동·자료·프로젝트를 삭제할 수 있다", async () => {
    await seed(env, async (db) => {
      await setDoc(doc(db, "bookProjects", "cA"), projectPayload("teacherA"));
      await setDoc(doc(db, "bookActivities", "act1"), activityPayload("teacherA"));
      await setDoc(doc(db, "bookResources", "res1"), resourcePayload("teacherA"));
    });
    const db = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(updateDoc(doc(db, "bookProjects", "cA"), {
      steps: [{ id: "step1", title: "프로그램 설치", activities: [], resources: [], itemOrder: [] }],
      confirmableItemKeys: [],
      updatedAt: serverTimestamp(),
    }));
    for (const [collectionName, id] of [["bookActivities", "act1"], ["bookResources", "res1"], ["bookProjects", "cA"]]) {
      await assertSucceeds(deleteDoc(doc(db, collectionName, id)));
    }
  });

  it("담당 교사는 프로젝트 휴지통 스냅샷을 만들고 복원 후 삭제할 수 있다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    const trashRef = doc(db, "bookProjectTrash", "trash1");

    await assertSucceeds(setDoc(trashRef, trashPayload("teacherA")));
    await assertSucceeds(getDoc(trashRef));
    await assertSucceeds(getDocs(query(collection(db, "bookProjectTrash"), where("classId", "==", "cA"))));
    await assertFails(updateDoc(trashRef, { title: "수정된 제목" }));
    await assertSucceeds(deleteDoc(trashRef));
  });

  it("담당 교사는 legacy 프로젝트 휴지통 스냅샷에 null 버전을 저장할 수 있다", async () => {
    const db = asTeacher(env, "teacherA").firestore();

    await assertSucceeds(setDoc(
      doc(db, "bookProjectTrash", "legacyTrash"),
      trashPayload("teacherA", { projectVersion: null, payload: { project: { title: "legacy" } } })
    ));
  });

  it("학생과 다른 반 교사는 프로젝트 휴지통을 읽거나 쓸 수 없다", async () => {
    await seed(env, async (db) => {
      await setDoc(doc(db, "bookProjectTrash", "trash1"), {
        classId: "cA",
        kind: "activity",
        title: "Node.js 설치하기",
        projectVersion: "version1",
        projectTitle: "개발자실 프로젝트",
        payload: { id: "act1" },
        deletedBy: "teacherA",
        deletedAt: new Date(),
      });
      await setDoc(doc(db, "memberships", "studentA_cA"), { uid: "studentA", classId: "cA", accessVersion: 2 });
    });

    for (const db of [asStudent(env, "studentA").firestore(), asTeacher(env, "teacherB").firestore()]) {
      await assertFails(getDoc(doc(db, "bookProjectTrash", "trash1")));
      await assertFails(setDoc(doc(db, "bookProjectTrash", "trash2"), trashPayload("teacherB", { deletedBy: "teacherB" })));
      await assertFails(deleteDoc(doc(db, "bookProjectTrash", "trash1")));
    }
  });

  it("보관된 반에는 프로젝트 휴지통 스냅샷을 만들 수 없다", async () => {
    const db = asTeacher(env, "teacherA").firestore();

    await assertFails(setDoc(
      doc(db, "bookProjectTrash", "archivedTrash"),
      trashPayload("teacherA", { classId: "archived" })
    ));
  });

  it("보관된 반에는 담당 교사도 프로젝트를 저장할 수 없다", async () => {
    const db = asTeacher(env, "teacherA").firestore();

    await assertFails(setDoc(
      doc(db, "bookProjects", "archived"),
      projectPayload("teacherA", { classId: "archived" })
    ));
  });
  it("allows optional JPEG and HTTPS image arrays for owner activity and resource saves", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    for (const images of [[], ["data:image/jpeg;base64,YWJj", "https://example.com/image.jpg"], Array(8).fill("data:image/jpeg;base64,YWJj")]) {
      await assertSucceeds(setDoc(doc(db, "bookResources", "res1"), resourcePayload("teacherA", { images })));
      await assertSucceeds(setDoc(doc(db, "bookActivities", "act1"), activityPayload("teacherA", { images })));
    }
  });

  it("rejects malformed, unsafe, excessive and cumulatively oversized image arrays", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    const invalidImages = [null, "invalid", [123], ["javascript:alert(1)"],
      ["data:image/svg+xml;base64,YWJj"], Array(9).fill("https://example.com/image.jpg"),
      ["data:image/jpeg;base64," + "a".repeat(310000), "data:image/jpeg;base64," + "a".repeat(310000)]];
    for (const images of invalidImages) {
      await assertFails(setDoc(doc(db, "bookResources", "res1"), resourcePayload("teacherA", { images })));
      await assertFails(setDoc(doc(db, "bookActivities", "act1"), activityPayload("teacherA", { images })));
    }
  });

  it("accepts aligned image sizes and rejects invalid or mismatched metadata", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    const images = ["https://example.com/image.jpg", "https://example.com/two.jpg"];
    for (const [collection, payload] of [["bookResources", resourcePayload], ["bookActivities", activityPayload]]) {
      const ref = doc(db, collection, collection === "bookResources" ? "res1" : "act1");
      await assertSucceeds(setDoc(ref, payload("teacherA", { images, imageSizes: ["large", "small"] })));
      for (const imageSizes of [null, "medium", [], ["medium"], ["medium", "small", "large"], ["huge", "small"], [1, "small"]]) {
        await assertFails(setDoc(ref, payload("teacherA", { images, imageSizes })));
      }
    }
  });

});
