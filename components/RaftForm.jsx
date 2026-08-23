"use client";

// =============================================================
// RAFT 글쓰기 — 학생 입력 화면 (개인 활동)
// -------------------------------------------------------------
// 위쪽 네 열에 역할·청중·형식·주제를 정하고, 아래 넓은 칸에 그대로 글을 씁니다.
// 항목이 넷뿐이라 곁텍스트 읽기처럼 모달을 거치지 않고 화면에서 바로 씁니다.
//
// 네 요소를 정하면 머리말 아래에 '나는 …가 되어, …에게, … 형식으로, …에 대해
// 씁니다' 문장이 만들어집니다 — 무엇을 쓸지 스스로 확인하고 시작하도록.
//
// 저장은 자동입니다(입력을 멈추면 조용히 저장).
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { subscribeMyParatextEntry, saveParatextEntry } from "@/lib/store";
import {
  RAFT_COLUMNS,
  RAFT_COLUMN_COUNT,
  RAFT_FORMATS,
  RAFT_WRITING,
  emptyRaftAnswers,
  raftPlanCount,
  raftPlanDone,
  raftSentence,
  raftWritingChars,
} from "@/lib/raft";
import { safeBookUrl } from "@/lib/paratext";
import { IconBook, IconLock } from "./StatusIcons";

const SAVE_DELAY = 900; // ms — 이만큼 입력이 없으면 저장

export default function RaftForm({ activity, user, onBack }) {
  const [answers, setAnswers] = useState(emptyRaftAnswers);
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
        setAnswers({ ...emptyRaftAnswers(), ...(entry?.answers ?? {}) });
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

  const planCount = useMemo(() => raftPlanCount(answers), [answers]);
  const planDone = planCount === RAFT_COLUMN_COUNT;
  const chars = raftWritingChars(answers);

  return (
    <main className="books-main raft-main">
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
            {planCount} / {RAFT_COLUMN_COUNT}칸 · {chars}자
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
          {/* 정한 네 요소를 한 문장으로 — 무엇을 쓸지 스스로 확인하고 시작하게 */}
          <p className={`raft-sentence${planDone ? " done" : ""}`}>
            {raftSentence(answers)}
          </p>

          <div className="raft-grid">
            {RAFT_COLUMNS.map((c) => (
              <section
                key={c.key}
                className={`raft-col${String(answers[c.key] ?? "").trim() ? " filled" : ""}`}
              >
                <header className="raft-col-head">
                  <span className="paratext-letter" aria-hidden="true">{c.letter}</span>
                  <span className="paratext-card-title">
                    <strong>{c.ko}</strong>
                    <em>{c.en}</em>
                  </span>
                </header>
                <p className="raft-col-prompt">
                  {c.prompt}
                  {c.hint && <em className="paratext-hint">{c.hint}</em>}
                </p>
                <textarea
                  rows={3}
                  value={answers[c.key] ?? ""}
                  onChange={(e) => edit(c.key, e.target.value)}
                  placeholder={c.placeholder}
                  disabled={locked}
                />
                {/* 형식만 자주 쓰는 것을 눌러 넣을 수 있게 */}
                {c.key === "format" && !locked && (
                  <div className="raft-chips">
                    {RAFT_FORMATS.map((f) => (
                      <button
                        key={f}
                        type="button"
                        className={`raft-chip${answers.format === f ? " on" : ""}`}
                        onClick={() => edit("format", f)}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>

          <section className="raft-write">
            <header className="raft-write-head">
              <strong>{RAFT_WRITING.ko}</strong>
              <span className="raft-write-count">{chars}자</span>
            </header>
            <p className="raft-col-prompt">
              {planDone
                ? RAFT_WRITING.prompt
                : "먼저 위 네 칸을 정하면 무엇을 쓸지 뚜렷해집니다."}
            </p>
            <textarea
              rows={14}
              value={answers[RAFT_WRITING.key] ?? ""}
              onChange={(e) => edit(RAFT_WRITING.key, e.target.value)}
              placeholder={RAFT_WRITING.placeholder}
              disabled={locked}
            />
          </section>
        </>
      )}
    </main>
  );
}
