"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  formatTime,
  subscribeAnswers,
  subscribeKeywords,
  subscribeQuestions,
  subscribeStudyBoards,
  subscribeMyStudyCards,
  toDate,
} from "@/lib/store";
import { isFirebaseConfigured } from "@/lib/firebase";
import { stripHtml } from "@/lib/html";
import { isTeacher as isTeacherRole } from "@/lib/user";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { getMeTooCount } from "@/lib/questionRanking";
import dynamic from "next/dynamic";
import TopNav from "@/components/TopNav";
import { IconRecord } from "@/components/StatusIcons";

// 활동 히트맵·레이더 차트는 무거워 지연 로딩
const ActivityHeatmap = dynamic(() => import("@/components/ActivityHeatmap"), {
  ssr: false,
});

const DAY_MS = 1000 * 60 * 60 * 24;

function StatCard({ label, value, tone, isActive, onClick }) {
  return (
    <button
      type="button"
      className={`admin-stat${tone ? ` tone-${tone}` : ""}${isActive ? " is-active" : ""}`}
      onClick={onClick}
    >
      <span>{label}</span>
      <strong>{value}</strong>
    </button>
  );
}

const STAT_LABELS = {
  ask: "내 질문",
  answer: "내 답변",
  resolved: "해결된 질문",
  metoo: "받은 궁금해요",
  insight: "인사이트",
};

const STAT_EMPTY = {
  ask: "아직 질문을 올리지 않았어요.",
  answer: "아직 답변을 남기지 않았어요.",
  resolved: "해결된 질문이 없어요.",
  metoo: "궁금해요를 받은 질문이 없어요.",
  insight: "아직 남긴 인사이트가 없어요.",
};

function EmptyPanel({ children }) {
  return <div className="admin-empty">{children}</div>;
}

function buildKeywordStats(questions, answerEvents, keywordNames) {
  const counts = new Map(keywordNames.map((keyword) => [keyword, 0]));

  questions.forEach((question) => {
    counts.set(question.keyword, (counts.get(question.keyword) ?? 0) + 1);
  });

  answerEvents.forEach((event) => {
    counts.set(event.question.keyword, (counts.get(event.question.keyword) ?? 0) + 1);
  });

  return [...counts.entries()]
    .map(([keyword, count]) => ({ keyword, count }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count || a.keyword.localeCompare(b.keyword, "ko"));
}


function recentEvents(questions, answerEvents) {
  const asked = questions.map((question) => ({
    id: `q-${question.id}`,
    type: "질문",
    title: question.title,
    keyword: question.keyword,
    createdAt: question.createdAt,
  }));

  const answered = answerEvents.map((event) => ({
    id: `a-${event.question.id}-${event.answer.id}`,
    type: "답변",
    title: event.question.title,
    keyword: event.question.keyword,
    createdAt: event.answer.createdAt,
  }));

  return [...asked, ...answered]
    .sort((a, b) => toDate(b.createdAt) - toDate(a.createdAt))
    .slice(0, 6);
}

function weeklyReflection(questions, answerEvents, keywordStats) {
  const now = Date.now();
  const weekQuestions = questions.filter(
    (question) => now - toDate(question.createdAt).getTime() <= DAY_MS * 7
  );
  const topKeyword = keywordStats[0]?.keyword;

  return [
    topKeyword
      ? `이번 주에는 ${topKeyword} 관련 활동이 가장 많았어요.`
      : "아직 이번 주 활동이 없어요.",
    weekQuestions.length > 0
      ? `${weekQuestions.length}개의 질문으로 헷갈린 개념을 기록했어요.`
      : "질문을 남기면 나중에 내가 헷갈린 개념을 다시 볼 수 있어요.",
    answerEvents.length > 0
      ? `${answerEvents.length}개의 답변으로 친구의 이해를 도왔어요.`
      : "친구의 질문에 짧은 힌트라도 남기면 학습 기록이 더 풍성해져요.",
  ];
}

export default function StudentReportPage() {
  const router = useRouter();
  const user = useCurrentUser();
  useRequireAuth();
  const [questions, setQuestions] = useState([]);
  const [keywordDocs, setKeywordDocs] = useState([]);
  const [answersByQuestion, setAnswersByQuestion] = useState({});
  const [activeStatKey, setActiveStatKey] = useState(null); // 통계 카드 드릴다운
  const [studyBoards, setStudyBoards] = useState([]);
  const [myCards, setMyCards] = useState([]); // 내가 낸 공부방 카드(전체)

  // 학습 리포트는 학생 화면 — 관리자 보기로 바뀌면 관리자 대시보드로 이동
  const isTeacher = user ? isTeacherRole(user) : false;
  useEffect(() => {
    if (isTeacher) router.replace("/admin");
  }, [isTeacher, router]);

  useEffect(() => {
    const unsubQ = subscribeQuestions(setQuestions);
    const unsubK = subscribeKeywords(setKeywordDocs);
    const unsubB = subscribeStudyBoards(setStudyBoards);
    return () => {
      unsubQ();
      unsubK();
      unsubB();
    };
  }, []);

  // 내 공부방 카드만 구독 (반 격리 규칙에 맞게 — 남의/다른 반 카드는 읽지 않음)
  useEffect(() => {
    if (!user) {
      setMyCards([]);
      return;
    }
    return subscribeMyStudyCards(user.uid, setMyCards);
  }, [user?.uid]);

  // 답변 구독 — 질문 id 집합이 바뀔 때만 재연결 (좋아요/해결 등 잦은
  // 업데이트로 questions 배열 참조가 바뀌어도 리스너를 재생성하지 않음)
  const questionIdsKey = useMemo(
    () => [...new Set(questions.map((q) => q.id))].sort().join(","),
    [questions]
  );
  useEffect(() => {
    if (!questionIdsKey) {
      setAnswersByQuestion({});
      return;
    }
    const ids = questionIdsKey.split(",");
    const unsubs = ids.map((id) =>
      subscribeAnswers(id, (answers) => {
        setAnswersByQuestion((prev) => ({ ...prev, [id]: answers }));
      })
    );
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [questionIdsKey]);

  const keywordNames = useMemo(
    () => keywordDocs.map((keyword) => keyword.name),
    [keywordDocs]
  );

  const answerEvents = useMemo(
    () =>
      questions.flatMap((question) =>
        (answersByQuestion[question.id] ?? []).map((answer) => ({
          question,
          answer,
        }))
      ),
    [answersByQuestion, questions]
  );

  const myQuestions = user
    ? questions.filter((question) => question.authorId === user.uid)
    : [];
  const myAnswerEvents = user
    ? answerEvents.filter((event) => event.answer.authorId === user.uid)
    : [];
  const resolvedQuestions = myQuestions.filter((question) => question.resolved).length;
  const totalMeToo = myQuestions.reduce(
    (sum, question) => sum + getMeTooCount(question),
    0
  );
  const keywordStats = buildKeywordStats(myQuestions, myAnswerEvents, keywordNames);
  const events = recentEvents(myQuestions, myAnswerEvents);
  const reflection = weeklyReflection(myQuestions, myAnswerEvents, keywordStats);
  // 내가 남긴 인사이트들 — 질문 문서의 reflection을 최신순으로 모읍니다.
  const myReflections = user
    ? questions
        .filter((q) => q.reflection && q.reflection.authorId === user.uid)
        .sort(
          (a, b) =>
            toDate(b.reflection.createdAt) - toDate(a.reflection.createdAt)
        )
    : [];

  // "나중에 쓸게요"로 미뤄둔 인사이트 목록
  const myPendingReflections = user
    ? myQuestions.filter((q) => q.reflectionPending)
    : [];

  // 공부방 활동 — 내가 작성한 카드를 보드별로 모읍니다 (수업 안내 보드 제외).
  const myStudyCards = useMemo(() => {
    if (!user) return [];
    return myCards
      .map((card) => {
        const board = studyBoards.find((b) => b.id === card.boardId);
        return board && board.type !== "notice" ? { board, card } : null;
      })
      .filter(Boolean)
      .sort((a, b) => toDate(b.card.createdAt) - toDate(a.card.createdAt));
  }, [studyBoards, myCards, user]);
  const studentBoardCount = studyBoards.filter((b) => b.type !== "notice").length;
  // 통계 카드 드릴다운 목록
  const statDetailItems = useMemo(() => {
    switch (activeStatKey) {
      case "ask":
        return myQuestions.map((q) => ({
          key: q.id,
          questionId: q.id,
          keyword: q.keyword,
          title: q.title,
          badge: q.resolved ? "✅ 해결됨" : "🙋 미해결",
          time: q.createdAt,
        }));
      case "answer": {
        const seen = new Set();
        return myAnswerEvents
          .filter((e) => {
            if (seen.has(e.question.id)) return false;
            seen.add(e.question.id);
            return true;
          })
          .map((e) => ({
            key: `a-${e.question.id}`,
            questionId: e.question.id,
            keyword: e.question.keyword,
            title: e.question.title,
            badge: null,
            time: e.answer.createdAt,
          }));
      }
      case "resolved":
        return myQuestions
          .filter((q) => q.resolved)
          .map((q) => ({
            key: q.id,
            questionId: q.id,
            keyword: q.keyword,
            title: q.title,
            badge: null,
            time: q.createdAt,
          }));
      case "metoo":
        return myQuestions
          .filter((q) => getMeTooCount(q) > 0)
          .sort((a, b) => getMeTooCount(b) - getMeTooCount(a))
          .map((q) => ({
            key: q.id,
            questionId: q.id,
            keyword: q.keyword,
            title: q.title,
            badge: `🙋 ${getMeTooCount(q)}`,
            time: q.createdAt,
          }));
      case "insight":
        return myQuestions
          .filter((q) => q.reflection)
          .sort((a, b) => toDate(b.reflection.createdAt) - toDate(a.reflection.createdAt))
          .map((q) => ({
            key: q.id,
            questionId: q.id,
            keyword: q.keyword,
            title: q.reflection.learned || q.title,
            badge: "💡",
            time: q.reflection.createdAt || q.createdAt,
          }));
      default:
        return [];
    }
  }, [activeStatKey, myQuestions, myAnswerEvents]);

  const maxKeyword = Math.max(1, ...keywordStats.map((item) => item.count));
  const totalActivity = myQuestions.length + myAnswerEvents.length;
  const askRatio =
    totalActivity === 0 ? 0 : Math.round((myQuestions.length / totalActivity) * 100);
  const answerRatio = totalActivity === 0 ? 0 : 100 - askRatio;

  const withReflection = myQuestions.filter((q) => q.reflection).length;
  const reflectionRate = myQuestions.length === 0 ? 0 : Math.round((withReflection / myQuestions.length) * 100);
  const resolveRate = myQuestions.length === 0 ? 0 : Math.round((resolvedQuestions / myQuestions.length) * 100);
  const latestActivity = events[0]?.createdAt ? formatTime(events[0].createdAt) : "아직 없음";

  const overviewValues = [
    Math.min(myQuestions.length / 10, 1),
    Math.min(myAnswerEvents.length / 10, 1),
    resolveRate / 100,
    reflectionRate / 100,
    Math.min(totalMeToo / 15, 1),
  ];

  // 관리자 보기로 전환된 경우 리포트를 그리지 않고 이동 대기 화면을 보여줍니다
  if (isTeacher) {
    return (
      <div className="admin-shell report-shell">
        <TopNav active="report" />
        <p className="empty-note">관리자 대시보드로 이동 중…</p>
      </div>
    );
  }

  return (
    <div className="admin-shell report-shell">
      {!isFirebaseConfigured && (
        <div className="demo-banner">
          ⚠️ 데모 모드 — Firebase 설정 전이라 데이터가 브라우저에만 임시
          저장됩니다 (새로고침 시 초기화). <code>lib/firebase.js</code>에
          설정값을 입력하면 Firestore에 저장됩니다.
        </div>
      )}

      <TopNav active="report" />

      <div className="report-layout">
        {/* 왼쪽: 인사이트 사이드 패널 */}
        <aside className="report-side">
          {myPendingReflections.length > 0 && (
            <>
              <div className="side-section-head pending-head">
                <h3>📝 인사이트 미완료</h3>
                <span>{myPendingReflections.length}건</span>
              </div>
              <div className="side-ref-list">
                {myPendingReflections.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    className="side-ref-item pending"
                    onClick={() => router.push(`/board?open=${q.id}`)}
                  >
                    <div className="side-ref-top">
                      <span className="keyword-chip"># {q.keyword}</span>
                      <time>{formatTime(q.createdAt)}</time>
                    </div>
                    <div className="side-ref-title">{q.title}</div>
                    <div className="side-ref-sub">
                      <span>인사이트를 기다리고 있어요</span>
                      <span className="side-ref-action">✏️ 쓰기</span>
                    </div>
                  </button>
                ))}
              </div>
              <div className="side-divider" />
            </>
          )}

          <div className="side-section-head">
            <h3 className="side-section-title"><IconRecord size={18} /> 내 인사이트 모음</h3>
            <span>{myReflections.length}개</span>
          </div>
          {myReflections.length === 0 ? (
            <p className="side-empty">
              질문이 해결되면 한 줄 인사이트를 남겨 보세요. 여기에 모여 나만의 학습 기록이 됩니다.
            </p>
          ) : (
            <div className="side-ref-list">
              {myReflections.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="side-ref-item"
                  onClick={() => router.push(`/board?open=${item.id}`)}
                >
                  <div className="side-ref-top">
                    <span className="keyword-chip"># {item.keyword}</span>
                    <time>{formatTime(item.reflection.createdAt)}</time>
                  </div>
                  <div className="side-ref-title">{item.title}</div>
                  {item.reflection.learned && (
                    <div className="side-ref-preview">💡 {item.reflection.learned}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </aside>

        {/* 오른쪽: 통계 및 활동 */}
        <main className="report-main">
        {!user ? (
          <EmptyPanel>학습 리포트를 불러오는 중입니다.</EmptyPanel>
        ) : (
          <>
        <section className="admin-hero report-hero">
          <div className="admin-student-title">
            <span className="avatar">{user.emoji}</span>
            <div>
              <h1>나의 학습 리포트</h1>
              <p>{user.displayName} · 최근 활동 {latestActivity}</p>
            </div>
          </div>
          <div className="admin-health">
            <span>질문 비율</span>
            <strong>{askRatio}%</strong>
          </div>
        </section>

        <ActivityHeatmap questions={myQuestions} answerEvents={myAnswerEvents} overviewValues={overviewValues} />

        <section className="admin-charts report-charts">
          <div className="admin-chart-panel">
            <div className="admin-panel-head">
              <h2>많이 나온 키워드</h2>
              <span>{keywordStats.length}개 과목</span>
            </div>
            {keywordStats.length === 0 ? (
              <EmptyPanel>질문이나 답변을 남기면 키워드가 쌓입니다.</EmptyPanel>
            ) : (
              <div className="keyword-bars">
                {keywordStats.map((item) => (
                  <div className="bar-row" key={item.keyword}>
                    <span>{item.keyword}</span>
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{ width: `${(item.count / maxKeyword) * 100}%` }}
                      />
                    </div>
                    <strong>{item.count}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="admin-chart-panel compact">
            <div className="admin-panel-head">
              <h2>참여 균형</h2>
              <span>{answerRatio}% 답변</span>
            </div>
            <div
              className="donut"
              style={{
                background:
                  totalActivity === 0
                    ? "conic-gradient(var(--neutral) 0 100%)"
                    : `conic-gradient(var(--primary) 0 ${askRatio}%, #5c9e68 ${askRatio}% 100%)`,
              }}
            >
              <span>{totalActivity}</span>
            </div>
            <div className="chart-legend centered">
              <span><i className="legend-ask" />질문 {myQuestions.length}</span>
              <span><i className="legend-answer" />답변 {myAnswerEvents.length}</span>
            </div>
          </div>

          <div className="admin-chart-panel compact">
            <div className="admin-panel-head">
              <h2>인사이트 완성률</h2>
              <span>{reflectionRate}% 완성</span>
            </div>
            {myQuestions.length === 0 ? (
              <EmptyPanel>질문 없음</EmptyPanel>
            ) : (
              <>
                <div
                  className="donut"
                  style={{
                    background: `conic-gradient(#5c9e68 0 ${reflectionRate}%, #e8e5dd ${reflectionRate}% 100%)`,
                  }}
                >
                  <span>{withReflection}</span>
                </div>
                <div className="chart-legend centered">
                  <span><i className="legend-answer" />작성 {withReflection}</span>
                  <span><i className="legend-neutral" />미작성 {myQuestions.length - withReflection}</span>
                </div>
              </>
            )}
          </div>

          <div className="admin-chart-panel compact">
            <div className="admin-panel-head">
              <h2>질문 해결 현황</h2>
              <span>{resolveRate}% 해결</span>
            </div>
            {myQuestions.length === 0 ? (
              <EmptyPanel>질문 없음</EmptyPanel>
            ) : (
              <>
                <div
                  className="donut"
                  style={{
                    background: `conic-gradient(#5c9e68 0 ${resolveRate}%, var(--primary) ${resolveRate}% 100%)`,
                  }}
                >
                  <span>{resolvedQuestions}</span>
                </div>
                <div className="chart-legend centered">
                  <span><i className="legend-answer" />해결 {resolvedQuestions}</span>
                  <span><i className="legend-ask" />미해결 {myQuestions.length - resolvedQuestions}</span>
                </div>
              </>
            )}
          </div>
        </section>

        <section className="admin-stats-grid">
          {[
            { key: "ask", label: "내 질문", value: myQuestions.length, tone: "ask" },
            { key: "answer", label: "내 답변", value: myAnswerEvents.length, tone: "answer" },
            { key: "resolved", label: "해결된 질문", value: resolvedQuestions, tone: "done" },
            { key: "metoo", label: "받은 궁금해요", value: totalMeToo, tone: "metoo" },
            { key: "insight", label: "인사이트", value: withReflection, tone: "insight" },
          ].map(({ key, label, value, tone }) => (
            <StatCard
              key={key}
              label={label}
              value={value}
              tone={tone}
              isActive={activeStatKey === key}
              onClick={() => setActiveStatKey((k) => (k === key ? null : key))}
            />
          ))}
        </section>

        {activeStatKey && (
          <section className="stat-detail">
            <div className="stat-detail-head">
              <h3>{STAT_LABELS[activeStatKey]}</h3>
              <span className="stat-detail-count">{statDetailItems.length}건</span>
            </div>
            {statDetailItems.length === 0 ? (
              <EmptyPanel>{STAT_EMPTY[activeStatKey]}</EmptyPanel>
            ) : (
              <div className="stat-detail-list">
                {statDetailItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className="stat-detail-item"
                    onClick={() => router.push(`/board?open=${item.questionId}`)}
                  >
                    <span className="keyword-chip"># {item.keyword}</span>
                    <span className="stat-detail-title">{item.title}</span>
                    {item.badge && (
                      <span className="stat-detail-badge">{item.badge}</span>
                    )}
                    <time>{formatTime(item.time)}</time>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        <section className="study-report">
          <div className="admin-panel-head">
            <h2>🧩 공부방 활동</h2>
            <span>
              {studentBoardCount > 0
                ? `${myStudyCards.length} / ${studentBoardCount} 보드 제출`
                : "활동 보드 없음"}
            </span>
          </div>
          {studentBoardCount === 0 ? (
            <EmptyPanel>아직 열린 수업 보드가 없어요.</EmptyPanel>
          ) : (
            <>
              {/* 보드별 제출 현황 막대 */}
              <div className="study-report-bar">
                <div
                  className="study-report-fill"
                  style={{
                    width: `${(myStudyCards.length / studentBoardCount) * 100}%`,
                  }}
                />
              </div>
              {myStudyCards.length === 0 ? (
                <EmptyPanel>
                  아직 작성한 카드가 없어요.{" "}
                  <button
                    className="link-button"
                    onClick={() => router.push("/study")}
                  >
                    공부방으로 가기 →
                  </button>
                </EmptyPanel>
              ) : (
                <div className="study-report-list">
                  {myStudyCards.map(({ board, card }) => (
                    <button
                      key={board.id}
                      type="button"
                      className="study-report-item"
                      onClick={() => router.push("/study")}
                    >
                      {board.keyword && (
                        <span className="keyword-chip"># {board.keyword}</span>
                      )}
                      <span className="study-report-title">{board.title}</span>
                      <span className="study-report-preview">
                        {stripHtml(card.content)}
                      </span>
                      <time>{formatTime(card.createdAt)}</time>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        <section className="report-reflection">
          <div className="admin-panel-head">
            <h2>이번 주 학습 길잡이</h2>
            <span>활동 요약</span>
          </div>
          <div className="reflection-grid">
            {reflection.map((item) => (
              <div className="reflection-item" key={item}>
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="admin-activity-panel">
          <div className="admin-panel-head">
            <h2>최근 내 활동</h2>
            <span>{events.length}건</span>
          </div>
          {events.length === 0 ? (
            <EmptyPanel>
              아직 기록된 활동이 없습니다. 질문을 올리거나 친구의 질문에 답변해 보세요.
            </EmptyPanel>
          ) : (
            <div className="activity-list">
              {events.map((event) => (
                <div className="activity-row" key={event.id}>
                  <span className={`activity-type ${event.type === "질문" ? "ask" : "answer"}`}>
                    {event.type}
                  </span>
                  <strong>{event.title}</strong>
                  <span>#{event.keyword}</span>
                  <time>{formatTime(event.createdAt)}</time>
                </div>
              ))}
            </div>
          )}
        </section>
          </>
        )}
        </main>
      </div>
    </div>
  );
}
