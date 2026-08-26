// =============================================================
// 기존 출석 기록 — classes/{cId}/attendanceRecords/{recordId}
// 학생 출석 기능은 제거되었고, 등록된 관리자만 과거 기록을 읽습니다.
// =============================================================
import { describe, it, before, after, beforeEach } from "node:test";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { makeEnv, asStudent, asAdmin, seed } from "./helpers.mjs";

const RECORD_PATH = ["classes", "cA", "attendanceRecords", "2026-08-23_stu1"];

describe("기존 출석 기록 규칙", () => {
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
      await setDoc(doc(db, "system", "admin"), { uid: "admin1", createdAt: new Date() });
      await setDoc(doc(db, "classes", "cA"), { createdBy: "admin1", archived: false, name: "A반" });
      await setDoc(doc(db, ...RECORD_PATH), {
        classId: "cA",
        uid: "stu1",
        date: "2026-08-23",
        attendedAt: new Date(),
        createdAt: new Date(),
      });
    });
  });

  it("학생은 자기 과거 출석 기록도 읽을 수 없다", async () => {
    await assertFails(getDoc(doc(asStudent(env, "stu1").firestore(), ...RECORD_PATH)));
  });

  it("등록된 관리자는 과거 출석 기록을 읽을 수 있다", async () => {
    await assertSucceeds(getDoc(doc(asAdmin(env, "admin1").firestore(), ...RECORD_PATH)));
  });

  it("등록되지 않은 admin 클레임 사용자는 읽을 수 없다", async () => {
    await assertFails(getDoc(doc(asAdmin(env, "otherAdmin").firestore(), ...RECORD_PATH)));
  });

  it("학생과 관리자 모두 새 출석 기록을 만들 수 없다", async () => {
    const data = { classId: "cA", uid: "stu2", date: "2026-08-24" };
    const path = ["classes", "cA", "attendanceRecords", "2026-08-24_stu2"];
    await assertFails(setDoc(doc(asStudent(env, "stu2").firestore(), ...path), data));
    await assertFails(setDoc(doc(asAdmin(env, "admin1").firestore(), ...path), data));
  });

  it("클라이언트에서는 기존 기록을 수정하거나 삭제할 수 없다", async () => {
    const adminDb = asAdmin(env, "admin1").firestore();
    await assertFails(setDoc(doc(adminDb, ...RECORD_PATH), { classId: "cA", uid: "stu1", date: "changed" }));
    await assertFails(deleteDoc(doc(adminDb, ...RECORD_PATH)));
  });
});
