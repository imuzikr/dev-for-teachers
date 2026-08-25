import { after, before, beforeEach, describe, it } from "node:test";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { asStudent, makeEnv, seed } from "./helpers.mjs";

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
      await setDoc(doc(db, "classes", "active"), { createdBy: "admin", archived: false });
      await setDoc(doc(db, "classes", "archived"), { createdBy: "admin", archived: true });
    });
  });

  it("로그인 사용자는 운영 중인 반에 자신을 등록할 수 있다", async () => {
    const db = asStudent(env, "studentA").firestore();
    await assertSucceeds(setDoc(doc(db, "memberships", "studentA_active"), {
      uid: "studentA",
      classId: "active",
      joinedAt: serverTimestamp(),
    }));
  });

  it("보관된 반에는 등록할 수 없다", async () => {
    const db = asStudent(env, "studentA").firestore();
    await assertFails(setDoc(doc(db, "memberships", "studentA_archived"), {
      uid: "studentA",
      classId: "archived",
      joinedAt: serverTimestamp(),
    }));
  });

  it("다른 사용자를 대신 등록할 수 없다", async () => {
    const db = asStudent(env, "studentA").firestore();
    await assertFails(setDoc(doc(db, "memberships", "studentB_active"), {
      uid: "studentB",
      classId: "active",
      joinedAt: serverTimestamp(),
    }));
  });

  it("허용되지 않은 필드를 추가할 수 없다", async () => {
    const db = asStudent(env, "studentA").firestore();
    await assertFails(setDoc(doc(db, "memberships", "studentA_active"), {
      uid: "studentA",
      classId: "active",
      joinedAt: serverTimestamp(),
      code: "OLD-CODE",
    }));
  });
});
