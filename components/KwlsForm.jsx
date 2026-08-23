"use client";

// =============================================================
// KWLS로 성찰하기 — 학생 입력 화면 (개인 활동)
// -------------------------------------------------------------
// K·W·L·S 네 칸을 한 화면에 나란히 두고 채웁니다. 읽기 전에 K·W를 적고,
// 다 읽은 뒤 L·S를 적는 활동이라 칸마다 '읽기 전 / 읽은 뒤' 딱지를 붙여
// 지금 어디를 채울 차례인지 헷갈리지 않게 했습니다.
//
// 읽기 전에 쓴 칸은 지우지 않고 그대로 둡니다 — 읽고 나서 무엇이 달라졌는지
// 스스로 견주어 보는 것이 이 활동의 핵심입니다.
//
// 저장은 자동입니다(입력을 멈추면 조용히 저장).
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { subscribeMyParatextEntry, saveParatextEntry } from "@/lib/store";
import {
  KWLS_COLUMNS,
  KWLS_COLUMN_COUNT,
  emptyKwlsAnswers,
  kwlsChars,
  kwlsFilledCount,
  kwlsPhaseDone,
} from "@/lib/kwls";
import { safeBookUrl } from "@/lib/paratext";
import { IconBook, IconLock } from "./StatusIcons";

const SAVE_DELAY = 900; // ms — 이만큼 입력이 없으면 저장

export default function KwlsForm({ activity, user, onBack }) {
  const [answers, setAnswers] = useState(emptyKwlsAnswers);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | saving | saved
  // 내가 고친 뒤로는 서버 값이 와도 덮어쓰지 않습니다(입력 중 글자가 튀는 것 방지)
  const dirtyRef = useRef(false);
  const timerRef = useRef(null);

  const locked = !!activity.locked;
  const bookUrl = safeBookUrl(activity.bookUrl);

  useEffect(() => {
    return subscribeMyParatextEntry(activity.id, user?.uid, (entry) => {
      if (!dirtyRef.current) {
        setAnswers({ ...emptyKwlsAnswers(), ...(entry?.answers ?? {}) });
      }
      setLoaded(true);
    });
  }, [activity.id, user?.uid]);

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

  const filled = useMemo(() => kwlsFilledCount(answers), [answers]);
  const chars = kwlsChars(answers);
  const beforeDone = kwlsPhaseDone("before", answers);
  const afterDone = kwlsPhaseDone("after", answers);

  return (
    <main className="books-main kwls-main">
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
            {filled} / {KWLS_COLUMN_COUNT}칸 · {chars}자
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

      {!loaded ? (
        <p className="empty-note">불러오는 중이에요…</p>
      ) : (
        <>
          {/* 언제 어느 칸을 채우는지 — 이 활동의 흐름을 한 줄로 */}
          <p className="kwls-guide">
            <span className={`kwls-guide-step${beforeDone ? " done" : ""}`}>
              <b>읽기 전</b> K·W를 채우고
            </span>
            <span className="kwls-guide-arrow" aria-hidden="true">→</span>
            <span className={`kwls-guide-step${afterDone ? " done" : ""}`}>
              <b>읽은 뒤</b> L·S를 채웁니다
            </span>
            <em>먼저 쓴 칸은 지우지 마세요 — 무엇이 달라졌는지 견주어 보는 것이 핵심이에요.</em>
          </p>

          <div className="kwls-grid">
            {KWLS_COLUMNS.map((c) => (
              <section
                key={c.key}
                className={`kwls-col ${c.phase}${
                  String(answers[c.key] ?? "").trim() ? " filled" : ""
                }`}
              >
                <header className="kwls-col-head">
                  <span className="paratext-letter" aria-hidden="true">{c.letter}</span>
                  <span className="paratext-card-title">
                    <strong>{c.ko}</strong>
                    <em>{c.en}</em>
                  </span>
                  <span className={`kwls-phase-tag ${c.phase}`}>
                    {c.phase === "before" ? "읽기 전" : "읽은 뒤"}
                  </span>
                </header>
                <p className="kwls-col-prompt">
                  {c.prompt}
                  {c.hint && <em className="paratext-hint">{c.hint}</em>}
                </p>
                <textarea
                  rows={9}
                  value={answers[c.key] ?? ""}
                  onChange={(e) => edit(c.key, e.target.value)}
                  placeholder={c.placeholder}
                  disabled={locked}
                  aria-label={`${c.ko} (${c.en})`}
                />
              </section>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
