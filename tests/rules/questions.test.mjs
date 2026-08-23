// =============================================================
// 질문 — '나도 궁금해요'(meTooIds) 공감 규칙
//
// 게시판은 전체 공유라 누구나 남의 질문에 공감할 수 있습니다. 다만 공감 수와
// 주간 랭킹을 배열 길이로 세기 때문에(lib/questionRanking.js), 배열에 들어가는
// uid는 '한 사람당 하나'가 반드시 보장되어야 합니다.
// =============================================================
import { describe, it, before, after, beforeEach } from "node:test";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc } from "firebase/firestore";
import { makeEnv, asStudent, seed } from "./helpers.mjs";

const QID = "q1";
const question = (meTooIds) => ({
  authorId: "author1",
  title: "질문 제목",
  content: "내용",
  keyword: "화학 결합",
  resolved: false,
  answerCount: 0,
  meTooIds,
});

describe("나도 궁금해요(meTooIds) 규칙", () => {
  let env;

  before(async () => {
    env = await makeEnv("demo-rules-questions");
  });
  after(async () => {
    await env.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env, (db) => setDoc(doc(db, "questions", QID), question(["other1", "other2"])));
  });

  const ref = (ctx) => doc(ctx.firestore(), "questions", QID);

  it("남의 질문에 공감을 누르면 자기 uid가 하나 추가된다", async () => {
    const ctx = asStudent(env, "stu1");
    await assertSucceeds(updateDoc(ref(ctx), { meTooIds: ["other1", "other2", "stu1"] }));
  });

  it("공감을 취소하면 자기 uid만 빠진다", async () => {
    await seed(env, (db) => setDoc(doc(db, "questions", QID), question(["other1", "stu1"])));
    const ctx = asStudent(env, "stu1");
    await assertSucceeds(updateDoc(ref(ctx), { meTooIds: ["other1"] }));
  });

  // ── 핵심 회귀 테스트 ──
  // 규칙이 집합(toSet) 차집합으로만 검사하던 시절엔 아래가 전부 통과해서,
  // 공감 3명짜리 질문을 배열 길이 7로 부풀릴 수 있었습니다.
  it("자기 uid를 여러 번 넣어 공감 수를 부풀릴 수 없다", async () => {
    const ctx = asStudent(env, "stu1");
    await assertFails(
      updateDoc(ref(ctx), {
        meTooIds: ["other1", "other2", "stu1", "stu1", "stu1", "stu1", "stu1"],
      })
    );
  });

  it("이미 있던 uid를 복제해 부풀릴 수도 없다", async () => {
    const ctx = asStudent(env, "stu1");
    await assertFails(
      updateDoc(ref(ctx), { meTooIds: ["other1", "other1", "other2", "other2", "stu1"] })
    );
  });

  it("자기 uid 하나만 중복해도 거부된다 (경계값)", async () => {
    const ctx = asStudent(env, "stu1");
    await assertFails(updateDoc(ref(ctx), { meTooIds: ["other1", "other2", "stu1", "stu1"] }));
  });

  it("남의 uid를 대신 추가할 수 없다", async () => {
    const ctx = asStudent(env, "stu1");
    await assertFails(updateDoc(ref(ctx), { meTooIds: ["other1", "other2", "stu9"] }));
  });

  it("남의 공감을 지울 수 없다", async () => {
    const ctx = asStudent(env, "stu1");
    await assertFails(updateDoc(ref(ctx), { meTooIds: ["other1"] }));
  });

  it("자기 질문에는 공감할 수 없다", async () => {
    const ctx = asStudent(env, "author1");
    await assertFails(updateDoc(ref(ctx), { meTooIds: ["other1", "other2", "author1"] }));
  });

  it("공감을 핑계로 다른 필드를 함께 바꿀 수 없다", async () => {
    const ctx = asStudent(env, "stu1");
    await assertFails(
      updateDoc(ref(ctx), { meTooIds: ["other1", "other2", "stu1"], title: "제목 바꿔치기" })
    );
  });

  it("중복이 남아 있던 예전 데이터도 정상 토글로 정리된다", async () => {
    // 규칙이 고쳐지기 전에 부풀려진 문서가 남아 있어도, 중복 없는 배열로
    // 쓰는 정상 요청은 통과해 스스로 회복됩니다.
    await seed(env, (db) =>
      setDoc(doc(db, "questions", QID), question(["other1", "other1", "other2"]))
    );
    const ctx = asStudent(env, "stu1");
    await assertSucceeds(updateDoc(ref(ctx), { meTooIds: ["other1", "other2", "stu1"] }));
  });
});
