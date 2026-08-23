"use client";

// =============================================================
// 질문 게시판 — 슬랙/디스코드 스타일 3단 구조
//   [1단] 키워드(과목) 필터  [2단] 질문 카드 게시판  [3단] 공지사항
// =============================================================
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  subscribeQuestions,
  subscribeNotices,
  subscribeKeywords,
  subscribeStudyBoards,
  subscribeUserDirectory,
} from "@/lib/store";
import { isFirebaseConfigured } from "@/lib/firebase";
import { codeBlockHtml } from "@/lib/html";
import KeywordSidebar from "@/components/KeywordSidebar";
import QuestionCard from "@/components/QuestionCard";
import QuestionModal from "@/components/QuestionModal";
import NewQuestionForm from "@/components/NewQuestionForm";
import NoticePanel from "@/components/NoticePanel";
import TopNav from "@/components/TopNav";
import FilterMenu, { applyFilter } from "@/components/FilterMenu";
import InsightModal from "@/components/InsightModal";
import { IconWrite, IconInsight } from "@/components/StatusIcons";
import { sortPinnedQuestions } from "@/lib/questionRanking";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { isTeacher } from "@/lib/user";

// 파이썬 실행기(CodeMirror 등)는 무거워 지연 로딩 → 초기 로드/전환 속도 개선
const PythonRunner = dynamic(() => import("@/components/PythonRunner"), {
  ssr: false,
});

export default function BoardPage() {
  const router = useRouter();

  const [questions, setQuestions] = useState([]);
  const [notices, setNotices] = useState([]);
  const [keywordDocs, setKeywordDocs] = useState([]); // {id, name, order}
  const [studyBoards, setStudyBoards] = useState([]); // 공부방 보드 (수업으로 돌아가기 연계)
  const [keyword, setKeyword] = useState("전체");
  const [filter, setFilter] = useState("all"); // 피드 필터 (FilterMenu)
  const [selectedId, setSelectedId] = useState(null);
  const [writing, setWriting] = useState(false);
  const [insightOpen, setInsightOpen] = useState(false); // 내 인사이트 모음 모달
  const [fromInsight, setFromInsight] = useState(false); // 질문을 인사이트 목록에서 열었는지
  const [pyOpen, setPyOpen] = useState(false); // 파이썬 실행 패널
  const [askCode, setAskCode] = useState(null); // 실행기에서 넘어온 코드
  const user = useCurrentUser();
  useRequireAuth();
  const admin = user ? isTeacher(user) : false;

  // 실시간 구독 (컴포넌트가 사라지면 자동 해제)
  useEffect(() => {
    const unsubQ = subscribeQuestions(setQuestions);
    const unsubN = subscribeNotices(setNotices);
    const unsubK = subscribeKeywords(setKeywordDocs);
    const unsubB = subscribeStudyBoards(setStudyBoards);
    return () => {
      unsubQ();
      unsubN();
      unsubK();
      unsubB();
    };
  }, []);

  // 교사/관리자만 사용자 디렉터리(실명) 구독 — 작성자 배지에서 실명 확인용.
  // 학생은 보안 규칙상 users를 읽을 수 없으므로 구독하지 않습니다.
  useEffect(() => {
    if (!admin) return;
    return subscribeUserDirectory(() => {});
  }, [admin]);

  // ?open=<id> → 해당 질문 모달 자동 열기 / ?py=1 → 파이썬 실행기 자동 열기
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const openId = params.get("open");
    const py = params.get("py");
    if (openId) setSelectedId(openId);
    if (py === "1") setPyOpen(true);
    if (openId || py) {
      const url = new URL(window.location.href);
      url.searchParams.delete("open");
      url.searchParams.delete("py");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  // [개발용] 관리자/학생 보기 전환 시 화면 전체를 새 역할로 다시 그림
  const [, setRoleTick] = useState(0);
  useEffect(() => {
    const onRoleChange = () => setRoleTick((t) => t + 1);
    window.addEventListener("role-change", onRoleChange);
    return () => window.removeEventListener("role-change", onRoleChange);
  }, []);

  // 키워드 이름 목록 (order 순서대로)
  const keywordNames = useMemo(
    () => keywordDocs.map((k) => k.name),
    [keywordDocs]
  );

  // 키워드별 질문 수
  const counts = useMemo(() => {
    const c = { 전체: questions.length };
    keywordNames.forEach((kw) => {
      c[kw] = questions.filter((q) => q.keyword === kw).length;
    });
    return c;
  }, [questions, keywordNames]);

  // 선택된 키워드로 필터링 → 그 위에 피드 필터(미해결/내 글 등) 적용
  const byKeyword =
    keyword === "전체"
      ? questions
      : questions.filter((q) => q.keyword === keyword);
  const filtered = sortPinnedQuestions(
    applyFilter(byKeyword, filter, user?.uid ?? "")
  );

  // 모달에 표시할 질문 (목록이 갱신되면 answerCount도 함께 갱신되도록 id로 찾음)
  const selectedQuestion = questions.find((q) => q.id === selectedId) ?? null;

  // 내 인사이트 목록 — 최신순
  const myReflections = useMemo(
    () =>
      user
        ? questions
            .filter((q) => q.reflection && q.reflection.authorId === user.uid)
            .sort(
              (a, b) =>
                new Date(b.reflection.createdAt) -
                new Date(a.reflection.createdAt)
            )
        : [],
    [questions, user]
  );

  // 공부방 보드와 연계된 키워드 집합 — "수업으로 돌아가기" 버튼 활성화 판단
  const studyKeywords = useMemo(
    () => studyBoards.flatMap((b) =>
      Array.isArray(b.keywords) ? b.keywords : (b.keyword ? [b.keyword] : [])
    ).filter(Boolean),
    [studyBoards]
  );

  return (
    <div className="board-shell">
      {!isFirebaseConfigured && (
        <div className="demo-banner">
          <span className="demo-banner-full">⚠️ 데모 모드 — Firebase 설정 전이라 데이터가 브라우저에만 임시 저장됩니다 (새로고침 시 초기화). <code>lib/firebase.js</code>에 설정값을 입력하면 Firestore에 저장됩니다.</span>
          <span className="demo-banner-short">⚠️ 데모 모드 — 새로고침 시 초기화됩니다</span>
        </div>
      )}

      <TopNav
        active="board"
        onPython={() => setPyOpen((v) => !v)}
        pyActive={pyOpen}
      />

      <div className="three-cols">
        {/* 1단: 키워드 */}
        <KeywordSidebar
          keywordDocs={keywordDocs}
          selected={keyword}
          onSelect={setKeyword}
          counts={counts}
          isAdmin={admin}
        />

        {/* 2단: 질문 게시판 */}
        <main className="feed-col">
          <div className="feed-head">
            <h2>
              {keyword === "전체" ? "전체 질문" : `# ${keyword} 질문`}{" "}
              <span style={{ color: "var(--text-sub)", fontSize: 14 }}>
                {filtered.length}개
              </span>
            </h2>
            <div className="feed-actions">
              <FilterMenu value={filter} onChange={setFilter} />
              <button
                className="btn-ghost btn-insight"
                onClick={() => setInsightOpen(true)}
                title="내 인사이트 모음"
              >
                <IconInsight size={18} />{" "}
                <span className="btn-insight-label">인사이트 보기</span>
              </button>
              <button className="btn-primary" onClick={() => setWriting(true)}>
                <IconWrite size={18} /> 질문하기
              </button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="empty-note">
              {filter === "all"
                ? "아직 질문이 없어요. 첫 번째 질문을 올려 보세요!"
                : "이 필터에 해당하는 질문이 없어요."}
            </p>
          ) : (
            filtered.map((q) => (
              <QuestionCard
                key={q.id}
                question={q}
                onClick={() => setSelectedId(q.id)}
              />
            ))
          )}
        </main>

        {/* 3단: 공지사항 */}
        <NoticePanel notices={notices} />
      </div>

      {selectedQuestion && (
        <QuestionModal
          question={selectedQuestion}
          keywords={keywordNames}
          studyKeywords={studyKeywords}
          onClose={() => {
            setSelectedId(null);
            setFromInsight(false);
          }}
          onBackToStudy={() => router.push("/study")}
          onBackToInsight={
            fromInsight
              ? () => {
                  setSelectedId(null);
                  setFromInsight(false);
                  setInsightOpen(true);
                }
              : undefined
          }
        />
      )}
      {writing && (
        <NewQuestionForm
          defaultKeyword={keyword === "전체" ? "" : keyword}
          keywords={keywordNames}
          initialContent={askCode ? codeBlockHtml(askCode) : ""}
          onClose={() => {
            setWriting(false);
            setAskCode(null);
          }}
        />
      )}


      {insightOpen && (
        <InsightModal
          reflections={myReflections}
          onClose={() => setInsightOpen(false)}
          onOpen={(id) => {
            setInsightOpen(false);
            setFromInsight(true);
            setSelectedId(id);
          }}
        />
      )}

      {/* 파이썬 실행 슬라이드 패널 */}
      <PythonRunner
        open={pyOpen}
        onClose={() => setPyOpen(false)}
        onAskQuestion={(code) => {
          // 실행기의 코드를 코드 블록으로 담아 질문 작성 모달 열기
          setAskCode(code);
          setWriting(true);
        }}
        hasModalOpen={selectedQuestion !== null || writing}
      />
    </div>
  );
}
