import { after, before, beforeEach, describe, it } from "node:test";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { asStudent, asTeacher, makeEnv, seed } from "./helpers.mjs";

describe("자동 반 참여 규칙", () => {
  let env;

  before(async () => {
    env = await makeEnv("demo-rules-memberships");
  });

  after(async () => {
    await env.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env, async (db) => {
      await setDoc(doc(db, "classes", "active"), {
        createdBy: "admin",
        archived: false,
        joinEnabled: true,
        joinCode: "111111",
      });
      await setDoc(doc(db, "classes", "closed"), {
        createdBy: "admin",
        archived: false,
        joinEnabled: false,
        joinCode: "222222",
      });
      await setDoc(doc(db, "classes", "archived"), {
        createdBy: "admin",
        archived: true,
        joinEnabled: true,
        joinCode: "333333",
      });
      await setDoc(doc(db, "classes", "internalSource"), {
        createdBy: "admin",
        archived: false,
        joinEnabled: true,
        joinCode: "444444",
        purpose: "internal",
      });
      await setDoc(doc(db, "classes", "internalNext"), {
        createdBy: "admin",
        archived: false,
        joinEnabled: true,
        joinCode: "555555",
        purpose: "internal",
      });
      await setDoc(doc(db, "classes", "otherTeacherInternal"), {
        createdBy: "otherTeacher",
        archived: false,
        joinEnabled: true,
        joinCode: "666666",
        purpose: "internal",
      });
      await setDoc(doc(db, "memberships", "studentA_internalSource"), {
        uid: "studentA",
        classId: "internalSource",
        joinCode: "444444",
        joinedAt: new Date("2026-09-01T00:00:00.000Z"),
      });
    });
  });

  it("로그인 사용자는 참여 코드가 맞는 운영 중인 반에 자신을 등록할 수 있다", async () => {
    const db = asStudent(env, "studentA").firestore();
    await assertSucceeds(setDoc(doc(db, "memberships", "studentA_active"), {
      uid: "studentA",
      classId: "active",
      joinCode: "111111",
      joinedAt: serverTimestamp(),
    }));
  });

  it("참여 코드가 틀리면 등록할 수 없다", async () => {
    const db = asStudent(env, "studentA").firestore();
    await assertFails(setDoc(doc(db, "memberships", "studentA_active"), {
      uid: "studentA",
      classId: "active",
      joinCode: "999999",
      joinedAt: serverTimestamp(),
    }));
  });

  it("참여 코드가 숫자 6자리가 아니면 등록할 수 없다", async () => {
    const db = asStudent(env, "studentA").firestore();
    await assertFails(setDoc(doc(db, "memberships", "studentA_active"), {
      uid: "studentA",
      classId: "active",
      joinCode: "11111",
      joinedAt: serverTimestamp(),
    }));
  });

  it("가입이 닫힌 반에는 등록할 수 없다", async () => {
    const db = asStudent(env, "studentA").firestore();
    await assertFails(setDoc(doc(db, "memberships", "studentA_closed"), {
      uid: "studentA",
      classId: "closed",
      joinCode: "222222",
      joinedAt: serverTimestamp(),
    }));
  });

  it("보관된 반에는 등록할 수 없다", async () => {
    const db = asStudent(env, "studentA").firestore();
    await assertFails(setDoc(doc(db, "memberships", "studentA_archived"), {
      uid: "studentA",
      classId: "archived",
      joinCode: "333333",
      joinedAt: serverTimestamp(),
    }));
  });

  it("다른 사용자를 대신 등록할 수 없다", async () => {
    const db = asStudent(env, "studentA").firestore();
    await assertFails(setDoc(doc(db, "memberships", "studentB_active"), {
      uid: "studentB",
      classId: "active",
      joinCode: "111111",
      joinedAt: serverTimestamp(),
    }));
  });

  it("허용되지 않은 필드를 추가할 수 없다", async () => {
    const db = asStudent(env, "studentA").firestore();
    await assertFails(setDoc(doc(db, "memberships", "studentA_active"), {
      uid: "studentA",
      classId: "active",
      joinCode: "111111",
      joinedAt: serverTimestamp(),
      code: "OLD-CODE",
    }));
  });

  it("교사는 같은 소유자의 교내용 차시에 기존 학생 소속을 이어 붙일 수 있다", async () => {
    const db = asTeacher(env, "admin").firestore();
    await assertSucceeds(setDoc(doc(db, "memberships", "studentA_internalNext"), {
      uid: "studentA",
      classId: "internalNext",
      joinCode: "",
      inheritedFromClassId: "internalSource",
      joinedAt: serverTimestamp(),
    }));
  });

  it("학생은 이미 속한 교내용 차시에서 같은 교사의 다른 교내용 차시로만 이어질 수 있다", async () => {
    const db = asStudent(env, "studentA").firestore();
    await assertSucceeds(setDoc(doc(db, "memberships", "studentA_internalNext"), {
      uid: "studentA",
      classId: "internalNext",
      joinCode: "",
      inheritedFromClassId: "internalSource",
      joinedAt: serverTimestamp(),
    }));
    await assertFails(setDoc(doc(db, "memberships", "studentA_otherTeacherInternal"), {
      uid: "studentA",
      classId: "otherTeacherInternal",
      joinCode: "",
      inheritedFromClassId: "internalSource",
      joinedAt: serverTimestamp(),
    }));
  });
});
