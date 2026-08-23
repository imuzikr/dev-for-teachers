"use client";

// =============================================================
// 곁텍스트 읽기 — 학생 입력 화면 (개인 활동)
// -------------------------------------------------------------
// 본문을 읽기 전에 표지·책날개·제목·목차·머리말·참고문헌·그림만 훑어보고
// 책의 내용을 미리 짐작해 적습니다. 항목은 lib/paratext.js가 정합니다.
//
// 카드를 누르면 그 항목만 크게 쓸 수 있는 모달이 열립니다 — 여덟 항목을
// 한 화면에 늘어놓고 좁은 칸에 쓰게 하는 대신, 한 번에 하나씩 편하게
// 쓰도록 한 선택입니다. 모달 안에서 이전/다음으로 항목을 옮겨 다닐 수 있어
// 닫았다 다시 여는 수고가 없습니다.
//
// 저장은 '자동'입니다 — 마지막 입력에서 잠시 손을 떼면 조용히 저장하고,
// 모달 안에 저장 상태만 알려 줍니다. 수업 중에 저장 버튼을 못 눌러
// 글이 날아가는 일이 없도록 한 선택입니다.
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { subscribeMyParatextEntry, saveParatextEntry } from "@/lib/store";
import { backdropClose } from "@/lib/modal";
import {
  PARATEXT_SECTIONS,
  PARATEXT_SECTION_COUNT,
  emptyParatextAnswers,
  isSectionDone,
  isSectionStarted,
  paratextDoneCount,
  safeBookUrl,
} from "@/lib/paratext";
import { IconBook, IconLock } from "./StatusIcons";

const SAVE_DELAY = 900; // ms — 이만큼 입력이 없으면 저장

// 카드에 보일 짧은 미리보기 — 이 항목에 쓴 글을 이어 붙여 한두 줄로.
function sectionPreview(section, answers) {
  const text = section.fields
    .map((f) => String(answers[f.key] ?? "").trim())
    .filter(Boolean)
    .join(" · ");
  return text;
}

export default function ParatextForm({ activity, user, onBack }) {
  const [answers, setAnswers] = useState(emptyParatextAnswers);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | saving | saved
  const [openIndex, setOpenIndex] = useState(null); // 모달로 연 항목 (PARATEXT_SECTIONS 인덱스)
  // 내가 고친 뒤로는 서버 값이 와도 덮어쓰지 않습니다(입력 중 글자가 튀는 것 방지)
  const dirtyRef = useRef(false);
  const timerRef = useRef(null);

  const locked = !!activity.locked;
  const bookUrl = safeBookUrl(activity.bookUrl);

  useEffect(() => {
    return subscribeMyParatextEntry(activity.id, user?.uid, (entry) => {
      if (!dirtyRef.current) {
        setAnswers({ ...emptyParatextAnswers(), ...(entry?.answers ?? {}) });
      }
      setLoaded(true);
    });
  }, [activity.id, user?.uid]);

  // 입력이 멈추면 저장 — 타자 한 글자마다 쓰지 않도록 잠깐 모았다 보냅니다.
  useEffect(() => {
    if (!dirtyRef.current || locked) return;
    clearTimeout(timerRef.current);
    setStatus("saving");
    timerRef.current = setTimeout(async () => {
      try {
        await saveParatextEntry(activity.id, user, answers);
        setStatus("saved");
      } catch {
        setStatus("idle");
      }
    }, SAVE_DELAY);
    return () => clearTimeout(timerRef.current);
  }, [answers, activity.id, user, locked]);

  function edit(key, value) {
    dirtyRef.current = true;
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  const done = useMemo(() => paratextDoneCount(answers), [answers]);
  const openSection = openIndex != null ? PARATEXT_SECTIONS[openIndex] : null;

  return (
    <main className="books-main paratext-main">
      <div className="books-head">
        <div className="books-head-main">
          <button type="button" className="btn-ghost" onClick={onBack}>← 활동 목록</button>
          <h1 className="book-group-title">
            {activity.title}
            <span className="book-group-topic">{activity.topic}</span>
          </h1>
          {bookUrl && (
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
        <div className="paratext-status">
          <span className="paratext-progress">
            {done} / {PARATEXT_SECTION_COUNT}칸
          </span>
          {locked ? (
            <span className="paratext-saved locked">
              <IconLock size={14} /> 잠김
            </span>
          ) : (
            status !== "idle" && (
              <span className="paratext-saved">
                {status === "saving" ? "저장 중…" : "저장됨"}
              </span>
            )
          )}
        </div>
      </div>

      {locked && (
        <p className="book-locked-note">
          <IconLock size={15} /> 지금은 잠겨 있어 고칠 수 없어요. 쓴 내용은 그대로 남아 있습니다.
        </p>
      )}

      <p className="books-intro">
        아직 본문은 읽지 마세요. 표지·제목·목차처럼 <b>본문을 둘러싼 것</b>만 보고
        어떤 책일지 짐작해 적어 봅니다. 카드를 누르면 크게 써 볼 수 있어요.
      </p>

      {!loaded ? (
        <p className="empty-note">불러오는 중이에요…</p>
      ) : (
        <div className="paratext-grid">
          {PARATEXT_SECTIONS.map((s, i) => {
            const doneFlag = isSectionDone(s, answers);
            const state = doneFlag ? "done" : isSectionStarted(s, answers) ? "doing" : "empty";
            const preview = sectionPreview(s, answers);
            return (
              <button
                key={s.key}
                type="button"
                className={`paratext-card ${state}`}
                onClick={() => setOpenIndex(i)}
              >
                <span className="paratext-card-head">
                  <span className="paratext-letter" aria-hidden="true">{s.letter}</span>
                  <span className="paratext-card-title">
                    <strong>{s.ko}</strong>
                    <em>{s.en}</em>
                  </span>
                  <span className="paratext-step">{i + 1}/{PARATEXT_SECTION_COUNT}</span>
                </span>
                <span className="paratext-prompt">{s.prompt}</span>
                {preview ? (
                  <span className="paratext-preview">{preview}</span>
                ) : (
                  <span className="paratext-preview empty">아직 쓰지 않았어요 — 눌러서 써 보세요</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {openSection && (
        <SectionModal
          section={openSection}
          index={openIndex}
          total={PARATEXT_SECTION_COUNT}
          answers={answers}
          locked={locked}
          status={status}
          onChange={edit}
          onPrev={openIndex > 0 ? () => setOpenIndex(openIndex - 1) : null}
          onNext={openIndex < PARATEXT_SECTION_COUNT - 1 ? () => setOpenIndex(openIndex + 1) : null}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </main>
  );
}

// 항목 하나를 크게 써 넣는 모달 — 이전/다음으로 닫지 않고 옮겨 다닙니다.
function SectionModal({ section, index, total, answers, locked, status, onChange, onPrev, onNext, onClose }) {
  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div
        className="modal paratext-write-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>
            <span className="paratext-letter" aria-hidden="true">{section.letter}</span>
            <span className="paratext-card-title">
              <strong>{section.ko}</strong>
              <em>{section.en}</em>
            </span>
          </h3>
          <button type="button" className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <div className="paratext-write-meta">
          <span className="paratext-step">{index + 1}/{total}</span>
          {locked ? (
            <span className="paratext-saved locked">
              <IconLock size={14} /> 잠김
            </span>
          ) : (
            status !== "idle" && (
              <span className="paratext-saved">
                {status === "saving" ? "저장 중…" : "저장됨"}
              </span>
            )
          )}
        </div>

        <p className="paratext-prompt">
          {section.prompt}
          {section.hint && <em className="paratext-hint">{section.hint}</em>}
        </p>

        <div className="paratext-fields">
          {section.fields.map((f, i) => (
            <label key={f.key} className="paratext-field">
              {f.label && (
                <span>
                  {f.label}
                  {f.optional && <em className="book-optional">선택</em>}
                </span>
              )}
              <textarea
                rows={Math.max(f.lines + 2, 5)}
                value={answers[f.key] ?? ""}
                onChange={(e) => onChange(f.key, e.target.value)}
                placeholder={f.placeholder}
                disabled={locked}
                autoFocus={i === 0}
              />
            </label>
          ))}
        </div>

        <div className="paratext-write-nav">
          <button type="button" className="btn-ghost" onClick={onPrev} disabled={!onPrev}>
            ← 이전 항목
          </button>
          <button type="button" className="btn-primary" onClick={onNext ?? onClose}>
            {onNext ? "다음 항목 →" : "마치기"}
          </button>
        </div>
      </div>
    </div>
  );
}
