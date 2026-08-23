"use client";

// =============================================================
// 곁텍스트 읽기 — 교사 화면 (개인 활동)
// -------------------------------------------------------------
// 두 단계입니다.
//   1) 학생 목록 — 반 명단대로 한 명당 카드 한 장. 어디까지 썼는지 보입니다.
//   2) 학생 상세 — 카드를 누르면 그 학생의 여덟 영역이 한 화면에 모두 펼쳐집니다
//      (모달이 아니라 화면 전체를 씁니다).
//
// 각 영역에는 '수업 시작' 버튼이 있어, 그 영역만 학급 전체 화면에 띄웁니다.
// 방송 중에 다른 영역의 버튼을 누르면 끄지 않아도 그리로 곧바로 전환됩니다
// (방송 문서가 반마다 하나라 덮어쓰면 학생 화면이 그대로 바뀝니다).
// 위쪽 방송 막대에서 이전/다음 영역으로 넘기거나 방송을 끝낼 수 있습니다.
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { subscribeParatextEntries } from "@/lib/store";
import { useEntryCast } from "@/lib/useEntryCast";
import {
  PARATEXT_SECTIONS,
  PARATEXT_SECTION_COUNT,
  isSectionDone,
  isSectionStarted,
  paratextDoneCount,
  paratextCharCount,
  safeBookUrl,
} from "@/lib/paratext";
import { IconBook, IconLock } from "./StatusIcons";
import CastBar from "./CastBar";

export default function ParatextBoard({
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

  // 명단이 있으면 명단 순서대로, 없으면(명부를 아직 못 읽었으면) 쓴 학생만.
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

  const startedCount = cards.filter((c) => paratextCharCount(c.entry?.answers) > 0).length;
  const doneCount = cards.filter(
    (c) => paratextDoneCount(c.entry?.answers) === PARATEXT_SECTION_COUNT
  ).length;

  const open = openUid ? cards.find((c) => c.uid === openUid) ?? null : null;

  // 방송 중인 영역의 내용 — 학생이 고치면 방송도 따라 바뀌게 다시 보냅니다.
  const castCard = cast.target ? cards.find((c) => c.uid === cast.target.uid) ?? null : null;
  const livePayload = useMemo(() => {
    if (!castCard || !cast.target) return null;
    const at = PARATEXT_SECTIONS.findIndex((s) => s.key === cast.target.key);
    if (at < 0) return null;
    return buildPayload(activity, castCard, at);
  }, [castCard, cast.target, activity]);
  cast.useLiveUpdate(livePayload);

  function castSection(card, index) {
    const s = PARATEXT_SECTIONS[index];
    cast.cast({ uid: card.uid, key: s.key }, buildPayload(activity, card, index));
  }

  // 방송 막대의 이전/다음 — 같은 학생 안에서 영역만 옮깁니다.
  function step(delta) {
    if (!cast.target || !castCard) return;
    const at = PARATEXT_SECTIONS.findIndex((s) => s.key === cast.target.key);
    const next = at + delta;
    if (next < 0 || next >= PARATEXT_SECTION_COUNT) return;
    castSection(castCard, next);
  }

  const castIndex = cast.target
    ? PARATEXT_SECTIONS.findIndex((s) => s.key === cast.target.key)
    : -1;

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
                  {paratextDoneCount(open.entry?.answers)} / {PARATEXT_SECTION_COUNT}칸
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

      {/* 무엇을 방송 중인지 늘 보이게 — 학생 목록으로 나가도 남아 있습니다 */}
      {cast.target && castCard && castIndex >= 0 && (
        <CastBar
          who={castCard.name}
          label={PARATEXT_SECTIONS[castIndex].ko}
          index={castIndex}
          total={PARATEXT_SECTION_COUNT}
          onPrev={castIndex > 0 ? () => step(-1) : null}
          onNext={castIndex < PARATEXT_SECTION_COUNT - 1 ? () => step(1) : null}
          onStop={cast.stop}
        />
      )}

      {activity.locked && !open && (
        <p className="book-locked-note">
          <IconLock size={15} /> 지금은 잠겨 있어 학생이 고칠 수 없어요.
        </p>
      )}

      {open ? (
        /* ── 학생 상세 — 여덟 영역을 한 화면에 ── */
        <div className="entry-detail-grid">
          {PARATEXT_SECTIONS.map((s, i) => {
            const answers = open.entry?.answers ?? {};
            const live = cast.isCasting(open.uid, s.key);
            return (
              <section
                key={s.key}
                className={`entry-region${isSectionDone(s, answers) ? " done" : ""}${live ? " live" : ""}`}
              >
                <header className="paratext-card-head">
                  <span className="paratext-letter" aria-hidden="true">{s.letter}</span>
                  <span className="paratext-card-title">
                    <strong>{s.ko}</strong>
                    <em>{s.en}</em>
                  </span>
                  {cast.canCast && (
                    <button
                      type="button"
                      className={`btn-ghost dash-cast-btn${live ? " on" : ""}`}
                      onClick={() => castSection(open, i)}
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
                <p className="paratext-prompt">{s.prompt}</p>
                <div className="entry-region-body">
                  {s.fields.map((f) => {
                    const text = String(answers[f.key] ?? "").trim();
                    return (
                      <div key={f.key} className="paratext-read-field">
                        {f.label && <span className="paratext-read-label">{f.label}</span>}
                        <p className={`paratext-read-text${text ? "" : " empty"}`}>
                          {text || "아직 쓰지 않았어요"}
                        </p>
                      </div>
                    );
                  })}
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

// 한 영역을 방송 꾸러미로 — 학생 화면은 이 내용만 보고 그립니다.
function buildPayload(activity, card, index) {
  const s = PARATEXT_SECTIONS[index];
  const answers = card.entry?.answers ?? {};
  return {
    mode: "entry",
    activityTitle: activity.title ?? "",
    topic: activity.topic ?? "",
    writerName: card.name,
    letter: s.letter,
    label: s.ko,
    labelEn: s.en,
    prompt: s.prompt,
    index,
    total: PARATEXT_SECTION_COUNT,
    fields: s.fields.map((f) => ({
      label: f.label ?? "",
      text: String(answers[f.key] ?? "").trim(),
    })),
  };
}

// 학생 한 명의 카드 — 이름 + 항목별 네모 + 채운 칸 수
function StudentCard({ card, casting, onOpen }) {
  const answers = card.entry?.answers ?? {};
  const done = paratextDoneCount(answers);
  const chars = paratextCharCount(answers);
  const state = done === PARATEXT_SECTION_COUNT ? "done" : chars > 0 ? "doing" : "none";

  return (
    <button
      type="button"
      className={`paratext-student-card ${state}${casting ? " casting" : ""}`}
      onClick={onOpen}
      aria-label={`${card.name} 학생의 곁텍스트 읽기 열기`}
    >
      <span className="paratext-student-head">
        <strong>{card.name}</strong>
        {card.studentId && <span className="paratext-student-no">{card.studentId}</span>}
        {casting && <span className="broadcast-live-dot" aria-hidden="true" />}
      </span>

      <span className="paratext-marks">
        {PARATEXT_SECTIONS.map((s) => {
          const cls = isSectionDone(s, answers)
            ? "done"
            : isSectionStarted(s, answers)
              ? "doing"
              : "empty";
          return (
            <i
              key={s.key}
              className={`paratext-mark ${cls}`}
              title={`${s.letter} · ${s.ko}`}
            />
          );
        })}
      </span>

      <span className="paratext-student-meta">
        {chars === 0 ? "아직 시작 전" : `${done} / ${PARATEXT_SECTION_COUNT}칸 · ${chars}자`}
      </span>
    </button>
  );
}
