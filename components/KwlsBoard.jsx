"use client";

// =============================================================
// KWLS로 성찰하기 — 교사 화면 (개인 활동)
// -------------------------------------------------------------
// 곁텍스트 읽기·RAFT 글쓰기와 같은 흐름입니다.
//   1) 학생 목록 — 반 명단대로 한 명당 카드 한 장.
//   2) 학생 상세 — 네 칸(K·W·L·S)이 한 화면에 모두 펼쳐집니다(모달이 아닙니다).
//
// 각 칸의 '수업 시작'으로 그 칸만 학급 전체 화면에 띄웁니다. 방송 중에 다른
// 칸 버튼을 누르면 끄지 않아도 그리로 곧바로 전환됩니다.
//
// 학생 목록의 네모 넷은 K·W·L·S 순서 그대로라, 읽기 전 두 칸만 채우고 멈춘
// 학생과 읽은 뒤까지 마친 학생을 한눈에 가려낼 수 있습니다.
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { subscribeParatextEntries } from "@/lib/store";
import { useEntryCast } from "@/lib/useEntryCast";
import {
  KWLS_COLUMNS,
  KWLS_COLUMN_COUNT,
  kwlsChars,
  kwlsDone,
  kwlsFilledCount,
  kwlsPhaseDone,
  kwlsStarted,
} from "@/lib/kwls";
import { safeBookUrl } from "@/lib/paratext";
import { IconBook, IconLock } from "./StatusIcons";
import CastBar from "./CastBar";

// 방송할 수 있는 영역 — 네 칸 그대로
const REGIONS = KWLS_COLUMNS;
const REGION_COUNT = REGIONS.length; // 4

export default function KwlsBoard({
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

  const startedCount = cards.filter((c) => kwlsStarted(c.entry?.answers)).length;
  // 읽기 전 두 칸(K·W)을 마친 학생 — 본문을 읽기 시작해도 되는지 가늠하는 수
  const readyCount = cards.filter((c) => kwlsPhaseDone("before", c.entry?.answers)).length;
  const doneCount = cards.filter((c) => kwlsDone(c.entry?.answers)).length;

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
                  {kwlsFilledCount(openAnswers)} / {KWLS_COLUMN_COUNT}칸 ·
                  {" "}글 {kwlsChars(openAnswers)}자
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
            시작 {startedCount}명 · 읽기 전 마침 {readyCount}명 · 완성 {doneCount}명 /
            {" "}전체 {cards.length}명
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
        /* ── 학생 상세 — 네 칸을 한 화면에 ── */
        <div className="entry-detail-grid kwls-detail-grid">
          {REGIONS.map((r, i) => {
            const text = String(openAnswers[r.key] ?? "").trim();
            const live = cast.isCasting(open.uid, r.key);
            return (
              <section
                key={r.key}
                className={`entry-region kwls-region ${r.phase}${text ? " done" : ""}${
                  live ? " live" : ""
                }`}
              >
                <header className="paratext-card-head">
                  <span className="paratext-letter" aria-hidden="true">{r.letter}</span>
                  <span className="paratext-card-title">
                    <strong>{r.ko}</strong>
                    <em>{r.en}</em>
                  </span>
                  {cast.canCast && (
                    <button
                      type="button"
                      className={`btn-ghost dash-cast-btn${live ? " on" : ""}`}
                      onClick={() => castRegion(open, i)}
                      title={
                        live
                          ? "학생 화면을 원래대로 되돌립니다"
                          : "이 칸을 학급 전체 화면에 띄웁니다"
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

// 한 칸을 방송 꾸러미로. 낱말만 크게 뜨면 무슨 물음에 답한 것인지 알 수 없어
// 그 칸의 물음(prompt)을 함께 실어 보냅니다.
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
    index,
    total: REGION_COUNT,
    fields: [{ label: "", text: String(answers[r.key] ?? "").trim() }],
  };
}

// 학생 한 명의 카드 — 이름 + K·W·L·S 네모 + 진행 상황
function StudentCard({ card, casting, onOpen }) {
  const answers = card.entry?.answers ?? {};
  const filled = kwlsFilledCount(answers);
  const chars = kwlsChars(answers);
  const state = kwlsDone(answers) ? "done" : kwlsStarted(answers) ? "doing" : "none";

  return (
    <button
      type="button"
      className={`paratext-student-card ${state}${casting ? " casting" : ""}`}
      onClick={onOpen}
      aria-label={`${card.name} 학생의 KWLS 성찰 열기`}
    >
      <span className="paratext-student-head">
        <strong>{card.name}</strong>
        {card.studentId && <span className="paratext-student-no">{card.studentId}</span>}
        {casting && <span className="broadcast-live-dot" aria-hidden="true" />}
      </span>

      <span className="kwls-marks">
        {KWLS_COLUMNS.map((c) => (
          <i
            key={c.key}
            className={`paratext-mark ${String(answers[c.key] ?? "").trim() ? "done" : "empty"}`}
            title={`${c.letter} · ${c.ko}`}
          />
        ))}
      </span>

      <span className="paratext-student-meta">
        {!kwlsStarted(answers)
          ? "아직 시작 전"
          : `${filled} / ${KWLS_COLUMN_COUNT}칸 · 글 ${chars}자`}
      </span>
    </button>
  );
}
