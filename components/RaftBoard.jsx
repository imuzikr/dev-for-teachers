"use client";

// =============================================================
// RAFT 글쓰기 — 교사 화면 (개인 활동)
// -------------------------------------------------------------
// 곁텍스트 읽기와 같은 흐름입니다.
//   1) 학생 목록 — 반 명단대로 한 명당 카드 한 장.
//   2) 학생 상세 — 카드를 누르면 다섯 영역(역할·청중·형식·주제·글쓰기)이
//      한 화면에 모두 펼쳐집니다(모달이 아닙니다).
//
// 각 영역의 '수업 시작'으로 그 영역만 학급 전체 화면에 띄웁니다. 방송 중에
// 다른 영역 버튼을 누르면 끄지 않아도 그리로 곧바로 전환됩니다.
// 방송에는 '나는 …이 되어, …에게, … 형식으로' 문장을 함께 실어, 낱말 하나만
// 크게 떠서 무슨 말인지 모르는 일이 없게 합니다.
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { subscribeParatextEntries } from "@/lib/store";
import { useEntryCast } from "@/lib/useEntryCast";
import {
  RAFT_COLUMNS,
  RAFT_COLUMN_COUNT,
  RAFT_WRITING,
  raftPlanCount,
  raftSentence,
  raftStarted,
  raftWritingChars,
  raftDone,
} from "@/lib/raft";
import { safeBookUrl } from "@/lib/paratext";
import { IconBook, IconLock } from "./StatusIcons";
import CastBar from "./CastBar";

// 방송할 수 있는 영역 — 네 요소 + 글쓰기
const REGIONS = [
  ...RAFT_COLUMNS.map((c) => ({
    key: c.key,
    letter: c.letter,
    ko: c.ko,
    en: c.en,
    prompt: c.prompt,
  })),
  { key: RAFT_WRITING.key, letter: "", ko: RAFT_WRITING.ko, en: "", prompt: RAFT_WRITING.prompt },
];
const REGION_COUNT = REGIONS.length; // 5

export default function RaftBoard({
  activity,
  className = "",
  classId = null,
  user = null,
  roster = [],
  onBack,
}) {
  const [entries, setEntries] = useState([]);
  const [openUid, setOpenUid] = useState(null);

  useEffect(() => subscribeParatextEntries(activity.id, setEntries), [activity.id]);

  const bookUrl = safeBookUrl(activity.bookUrl);
  const cast = useEntryCast(classId, user);

  const cards = useMemo(() => {
    const byUid = new Map(entries.map((e) => [e.authorId, e]));
    const fromRoster = roster.map((s) => ({
      uid: s.uid,
      name: s.name,
      studentId: s.studentId,
      entry: byUid.get(s.uid) ?? null,
    }));
    const seen = new Set(roster.map((s) => s.uid));
    const strays = entries
      .filter((e) => !seen.has(e.authorId))
      .map((e) => ({
        uid: e.authorId,
        name: e.authorName || "이름 미설정",
        studentId: null,
        entry: e,
      }));
    return [...fromRoster, ...strays];
  }, [roster, entries]);

  const startedCount = cards.filter((c) => raftStarted(c.entry?.answers)).length;
  const doneCount = cards.filter((c) => raftDone(c.entry?.answers)).length;

  const open = openUid ? cards.find((c) => c.uid === openUid) ?? null : null;

  const castCard = cast.target ? cards.find((c) => c.uid === cast.target.uid) ?? null : null;
  const castIndex = cast.target ? REGIONS.findIndex((r) => r.key === cast.target.key) : -1;

  const livePayload = useMemo(() => {
    if (!castCard || castIndex < 0) return null;
    return buildPayload(activity, castCard, castIndex);
  }, [castCard, castIndex, activity]);
  cast.useLiveUpdate(livePayload);

  function castRegion(card, index) {
    cast.cast({ uid: card.uid, key: REGIONS[index].key }, buildPayload(activity, card, index));
  }

  function step(delta) {
    if (castIndex < 0 || !castCard) return;
    const next = castIndex + delta;
    if (next < 0 || next >= REGION_COUNT) return;
    castRegion(castCard, next);
  }

  const openAnswers = open?.entry?.answers ?? {};

  return (
    <main className="books-main">
      <div className="books-head">
        <div className="books-head-main">
          {open ? (
            <button type="button" className="btn-ghost" onClick={() => setOpenUid(null)}>
              ← 학생 목록
            </button>
          ) : (
            <button type="button" className="btn-ghost" onClick={onBack}>← 활동 목록</button>
          )}
          <h1 className="book-group-title">
            {open ? open.name : activity.title}
            {open ? (
              <>
                {open.studentId && (
                  <span className="book-group-class">{open.studentId}</span>
                )}
                <span className="book-group-topic">
                  {raftPlanCount(openAnswers)} / {RAFT_COLUMN_COUNT}칸 ·
                  {" "}글 {raftWritingChars(openAnswers)}자
                </span>
              </>
            ) : (
              <>
                <span className="book-group-topic">{activity.topic}</span>
                {className && <span className="book-group-class">{className}</span>}
              </>
            )}
          </h1>
          {bookUrl && !open && (
            <a
              className="btn-primary book-info-btn"
              href={bookUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <IconBook size={15} /> 도서 정보
            </a>
          )}
        </div>
        {!open && (
          <span className="paratext-sum">
            시작 {startedCount}명 · 완성 {doneCount}명 / 전체 {cards.length}명
          </span>
        )}
      </div>

      {cast.target && castCard && castIndex >= 0 && (
        <CastBar
          who={castCard.name}
          label={REGIONS[castIndex].ko}
          index={castIndex}
          total={REGION_COUNT}
          onPrev={castIndex > 0 ? () => step(-1) : null}
          onNext={castIndex < REGION_COUNT - 1 ? () => step(1) : null}
          onStop={cast.stop}
        />
      )}

      {activity.locked && !open && (
        <p className="book-locked-note">
          <IconLock size={15} /> 지금은 잠겨 있어 학생이 고칠 수 없어요.
        </p>
      )}

      {open ? (
        /* ── 학생 상세 — 다섯 영역을 한 화면에 ── */
        <>
          <p className="raft-sentence done">{raftSentence(openAnswers)}</p>
          <div className="entry-detail-grid raft-detail-grid">
            {REGIONS.map((r, i) => {
              const text = String(openAnswers[r.key] ?? "").trim();
              const live = cast.isCasting(open.uid, r.key);
              const isWriting = r.key === RAFT_WRITING.key;
              return (
                <section
                  key={r.key}
                  className={`entry-region${text ? " done" : ""}${live ? " live" : ""}${isWriting ? " wide" : ""}`}
                >
                  <header className="paratext-card-head">
                    {r.letter && (
                      <span className="paratext-letter" aria-hidden="true">{r.letter}</span>
                    )}
                    <span className="paratext-card-title">
                      <strong>{r.ko}</strong>
                      {r.en && <em>{r.en}</em>}
                    </span>
                    {cast.canCast && (
                      <button
                        type="button"
                        className={`btn-ghost dash-cast-btn${live ? " on" : ""}`}
                        onClick={() => castRegion(open, i)}
                        title={
                          live
                            ? "학생 화면을 원래대로 되돌립니다"
                            : "이 영역을 학급 전체 화면에 띄웁니다"
                        }
                      >
                        {live && <span className="broadcast-live-dot" aria-hidden="true" />}
                        {live ? "수업 종료" : "수업 시작"}
                      </button>
                    )}
                  </header>
                  <div className="entry-region-body">
                    <p className={`paratext-read-text${text ? "" : " empty"}`}>
                      {text || "아직 쓰지 않았어요"}
                    </p>
                  </div>
                </section>
              );
            })}
          </div>
        </>
      ) : cards.length === 0 ? (
        <p className="empty-note">
          아직 이 반에 들어온 학생이 없어요. 학생이 반에 들어오면 카드가 생깁니다.
        </p>
      ) : (
        <div className="paratext-card-grid">
          {cards.map((c) => (
            <StudentCard
              key={c.uid}
              card={c}
              casting={cast.target?.uid === c.uid}
              onOpen={() => setOpenUid(c.uid)}
            />
          ))}
        </div>
      )}
    </main>
  );
}

// 한 영역을 방송 꾸러미로. RAFT는 낱말 하나만 뜨면 무슨 말인지 알기 어려워서
// '나는 …이 되어…' 문장을 함께 실어 보냅니다.
function buildPayload(activity, card, index) {
  const r = REGIONS[index];
  const answers = card.entry?.answers ?? {};
  return {
    mode: "entry",
    activityTitle: activity.title ?? "",
    topic: activity.topic ?? "",
    writerName: card.name,
    letter: r.letter,
    label: r.ko,
    labelEn: r.en,
    prompt: r.prompt,
    note: raftSentence(answers),
    index,
    total: REGION_COUNT,
    fields: [{ label: "", text: String(answers[r.key] ?? "").trim() }],
  };
}

// 학생 한 명의 카드 — 이름 + 네 요소 네모 + 글자 수
function StudentCard({ card, casting, onOpen }) {
  const answers = card.entry?.answers ?? {};
  const plan = raftPlanCount(answers);
  const chars = raftWritingChars(answers);
  const state = raftDone(answers) ? "done" : raftStarted(answers) ? "doing" : "none";

  return (
    <button
      type="button"
      className={`paratext-student-card ${state}${casting ? " casting" : ""}`}
      onClick={onOpen}
      aria-label={`${card.name} 학생의 RAFT 글 열기`}
    >
      <span className="paratext-student-head">
        <strong>{card.name}</strong>
        {card.studentId && <span className="paratext-student-no">{card.studentId}</span>}
        {casting && <span className="broadcast-live-dot" aria-hidden="true" />}
      </span>

      <span className="raft-marks">
        {RAFT_COLUMNS.map((c) => (
          <i
            key={c.key}
            className={`paratext-mark ${String(answers[c.key] ?? "").trim() ? "done" : "empty"}`}
            title={`${c.letter} · ${c.ko}`}
          />
        ))}
      </span>

      <span className="paratext-student-meta">
        {!raftStarted(answers)
          ? "아직 시작 전"
          : `${plan} / ${RAFT_COLUMN_COUNT}칸 · 글 ${chars}자`}
      </span>
    </button>
  );
}
