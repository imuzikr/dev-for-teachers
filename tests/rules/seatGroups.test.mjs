// =============================================================
// 자리표 / 반 기본 모둠
//   classes/{cId}/seatLayouts/{layoutId}
//   classes/{cId}/groupAssignments/default
// 둘 다 교사 전용 자산입니다(학생은 읽기도 불가).
// =============================================================
import { describe, it, before, after, beforeEach } from "node:test";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { makeEnv, asStudent, asTeacher, seed } from "./helpers.mjs";

const seats = (n) => Array.from({ length: n }, (_, i) => (i === 0 ? "stu1" : null));
const groups = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: `group_${i + 1}`, index: i + 1, name: `${i + 1}모둠`, memberUids: [], members: [],
  }));

describe("자리표·기본 모둠 규칙", () => {
  let env;

  before(async () => {
    env = await makeEnv("demo-rules-seats");
  });
  after(async () => {
    await env.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env, async (db) => {
      await setDoc(doc(db, "classes", "cA"), { createdBy: "teacherA", archived: false });
      await setDoc(doc(db, "memberships", "stu1_cA"), { uid: "stu1", classId: "cA" });
    });
  });

  describe("자리표", () => {
    it("담당 교사는 기본 자리표를 저장할 수 있다", async () => {
      const db = asTeacher(env, "teacherA").firestore();
      await assertSucceeds(
        setDoc(doc(db, "classes", "cA", "seatLayouts", "default"), {
          classId: "cA", layoutId: "default", seats: seats(30), updatedBy: "teacherA",
        })
      );
    });

    it("날짜별 임시 자리표도 저장할 수 있다", async () => {
      const db = asTeacher(env, "teacherA").firestore();
      const id = "daily_2026-08-23";
      await assertSucceeds(
        setDoc(doc(db, "classes", "cA", "seatLayouts", id), {
          classId: "cA", layoutId: id, seats: seats(30), updatedBy: "teacherA",
        })
      );
    });

    it("자리 수가 30을 넘으면 거부된다", async () => {
      const db = asTeacher(env, "teacherA").firestore();
      await assertFails(
        setDoc(doc(db, "classes", "cA", "seatLayouts", "default"), {
          classId: "cA", layoutId: "default", seats: seats(31), updatedBy: "teacherA",
        })
      );
    });

    it("layoutId 필드가 문서 ID와 다르면 거부된다", async () => {
      const db = asTeacher(env, "teacherA").firestore();
      await assertFails(
        setDoc(doc(db, "classes", "cA", "seatLayouts", "default"), {
          classId: "cA", layoutId: "다른값", seats: seats(30), updatedBy: "teacherA",
        })
      );
    });

    it("학생은 자리표를 읽지도 쓰지도 못한다", async () => {
      await seed(env, (db) =>
        setDoc(doc(db, "classes", "cA", "seatLayouts", "default"), {
          classId: "cA", layoutId: "default", seats: seats(30),
        })
      );
      const db = asStudent(env, "stu1").firestore();
      await assertFails(getDoc(doc(db, "classes", "cA", "seatLayouts", "default")));
      await assertFails(
        setDoc(doc(db, "classes", "cA", "seatLayouts", "default"), {
          classId: "cA", layoutId: "default", seats: seats(30), updatedBy: "stu1",
        })
      );
    });

    it("다른 반 교사는 이 반 자리표에 손댈 수 없다", async () => {
      const db = asTeacher(env, "teacherB").firestore();
      await assertFails(
        setDoc(doc(db, "classes", "cA", "seatLayouts", "default"), {
          classId: "cA", layoutId: "default", seats: seats(30), updatedBy: "teacherB",
        })
      );
    });
  });

  describe("기본 모둠", () => {
    it("담당 교사는 기본 모둠을 저장할 수 있다", async () => {
      const db = asTeacher(env, "teacherA").firestore();
      await assertSucceeds(
        setDoc(doc(db, "classes", "cA", "groupAssignments", "default"), {
          classId: "cA", groups: groups(4), updatedBy: "teacherA",
        })
      );
    });

    it("모둠이 6개를 넘으면 거부된다", async () => {
      const db = asTeacher(env, "teacherA").firestore();
      await assertFails(
        setDoc(doc(db, "classes", "cA", "groupAssignments", "default"), {
          classId: "cA", groups: groups(7), updatedBy: "teacherA",
        })
      );
    });

    it("문서 ID가 'default'가 아니면 거부된다", async () => {
      const db = asTeacher(env, "teacherA").firestore();
      await assertFails(
        setDoc(doc(db, "classes", "cA", "groupAssignments", "other"), {
          classId: "cA", groups: groups(4), updatedBy: "teacherA",
        })
      );
    });

    it("학생은 기본 모둠을 읽지도 쓰지도 못한다", async () => {
      await seed(env, (db) =>
        setDoc(doc(db, "classes", "cA", "groupAssignments", "default"), {
          classId: "cA", groups: groups(4),
        })
      );
      const db = asStudent(env, "stu1").firestore();
      await assertFails(getDoc(doc(db, "classes", "cA", "groupAssignments", "default")));
      await assertFails(
        setDoc(doc(db, "classes", "cA", "groupAssignments", "default"), {
          classId: "cA", groups: groups(4), updatedBy: "stu1",
        })
      );
    });
  });
});
