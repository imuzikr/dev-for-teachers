import { describe, it, before, after, beforeEach } from "node:test";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { makeEnv, asStudent, asTeacher, seed } from "./helpers.mjs";

const broadcast = (overrides = {}) => ({
  classId: "cA",
  mode: "bookPortfolio",
  projectId: "cA",
  participantUid: "stu1",
  studentName: "학생A",
  className: "1차시",
  startedBy: "teacherA",
  scrollSessionId: "sessionA",
  portfolioSessionId: "sessionA",
  portfolioChunkCount: 1,
  portfolioChunkBytes: [42],
  portfolioChunkIds: ["sessionA_0"],
  portfolioTotalBytes: 42,
  scrollPosition: { ratio: 0, anchor: -1, offset: 0, sequence: 0 },
  updatedAt: serverTimestamp(),
  ...overrides,
});

const chunk = (overrides = {}) => ({
  classId: "cA",
  sessionId: "sessionA",
  index: 0,
  html: "<main>학생별 차시 보고서</main>",
  bytes: 42,
  createdAt: serverTimestamp(),
  ...overrides,
});

describe("포트폴리오 발표 방송 규칙", () => {
  let env;

  before(async () => {
    env = await makeEnv("demo-rules-book-portfolio-broadcast");
  });
  after(async () => {
    await env.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env, async (db) => {
      await setDoc(doc(db, "classes", "cA"), { createdBy: "teacherA", accessVersion: 2, archived: false });
      await setDoc(doc(db, "classes", "cB"), { createdBy: "teacherB", accessVersion: 2, archived: false });
      await setDoc(doc(db, "memberships", "stu1_cA"), { uid: "stu1", classId: "cA" });
      await setDoc(doc(db, "memberships", "stu2_cB"), { uid: "stu2", classId: "cB" });
    });
  });

  it("담당 교사는 포트폴리오 방송 문서와 HTML 조각을 쓰고 지울 수 있다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    const broadcastRef = doc(db, "broadcasts", "cA");
    const chunkRef = doc(db, "broadcasts", "cA", "portfolioChunks", "sessionA_0");

    await assertSucceeds(setDoc(chunkRef, chunk()));
    await assertSucceeds(setDoc(broadcastRef, broadcast()));
    await assertSucceeds(deleteDoc(broadcastRef));
    await assertSucceeds(deleteDoc(chunkRef));
  });

  it("같은 반 학생은 방송과 HTML 조각을 읽을 수 있지만 쓸 수 없다", async () => {
    await seed(env, async (db) => {
      await setDoc(doc(db, "broadcasts", "cA"), broadcast());
      await setDoc(doc(db, "broadcasts", "cA", "portfolioChunks", "sessionA_0"), chunk());
    });
    const db = asStudent(env, "stu1").firestore();

    await assertSucceeds(getDoc(doc(db, "broadcasts", "cA")));
    await assertSucceeds(getDoc(doc(db, "broadcasts", "cA", "portfolioChunks", "sessionA_0")));
    await assertFails(getDocs(collection(db, "broadcasts", "cA", "portfolioChunks")));
    await assertFails(setDoc(doc(db, "broadcasts", "cA", "portfolioChunks", "sessionA_1"), chunk({ index: 1 })));
    await assertFails(deleteDoc(doc(db, "broadcasts", "cA", "portfolioChunks", "sessionA_0")));
  });

  it("같은 반 학생도 활성 세션과 시간이 맞지 않는 조각은 읽을 수 없다", async () => {
    await seed(env, async (db) => {
      await setDoc(doc(db, "broadcasts", "cA"), broadcast({ scrollSessionId: "sessionB", portfolioSessionId: "sessionB", portfolioChunkIds: ["sessionB_0"] }));
      await setDoc(doc(db, "broadcasts", "cA", "portfolioChunks", "sessionA_0"), chunk());
      await setDoc(doc(db, "broadcasts", "cA", "portfolioChunks", "sessionB_0"), chunk({ sessionId: "sessionB" }));
    });
    const db = asStudent(env, "stu1").firestore();

    await assertFails(getDoc(doc(db, "broadcasts", "cA", "portfolioChunks", "sessionA_0")));
    await assertSucceeds(getDoc(doc(db, "broadcasts", "cA", "portfolioChunks", "sessionB_0")));
  });

  it("하트비트가 오래 지난 포트폴리오 조각은 학생에게 공개하지 않는다", async () => {
    await seed(env, async (db) => {
      await setDoc(doc(db, "broadcasts", "cA"), broadcast({ updatedAt: new Date(Date.now() - 11 * 60 * 1000) }));
      await setDoc(doc(db, "broadcasts", "cA", "portfolioChunks", "sessionA_0"), chunk());
    });

    await assertFails(getDoc(doc(asStudent(env, "stu1").firestore(), "broadcasts", "cA", "portfolioChunks", "sessionA_0")));
  });

  it("다른 반 학생과 다른 교사는 포트폴리오 조각을 읽거나 쓸 수 없다", async () => {
    await seed(env, async (db) => {
      await setDoc(doc(db, "broadcasts", "cA"), broadcast());
      await setDoc(doc(db, "broadcasts", "cA", "portfolioChunks", "sessionA_0"), chunk());
    });

    await assertFails(getDoc(doc(asStudent(env, "stu2").firestore(), "broadcasts", "cA", "portfolioChunks", "sessionA_0")));
    await assertFails(getDoc(doc(asTeacher(env, "teacherB").firestore(), "broadcasts", "cA", "portfolioChunks", "sessionA_0")));
    await assertFails(setDoc(doc(asTeacher(env, "teacherB").firestore(), "broadcasts", "cA", "portfolioChunks", "sessionA_1"), chunk({ index: 1 })));
  });

  it("포트폴리오 조각은 반 ID와 크기 제한을 지켜야 한다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertFails(setDoc(doc(db, "broadcasts", "cA", "portfolioChunks", "badClass"), chunk({ classId: "cB" })));
    await assertFails(setDoc(doc(db, "broadcasts", "cA", "portfolioChunks", "badIndex"), chunk({ index: 40 })));
    await assertFails(setDoc(doc(db, "broadcasts", "cA", "portfolioChunks", "badSize"), chunk({ html: "x".repeat(760001), bytes: 760001 })));
  });
});
