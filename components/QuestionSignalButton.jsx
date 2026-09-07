"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  formatTime,
  setQuestionSignal,
  subscribeMyQuestionSignal,
  subscribeQuestionSignals,
} from "@/lib/store";

import QuestionSignalNoteModal from "./QuestionSignalNoteModal";

export default function QuestionSignalButton(props) {
  return <QuestionSignalControl key={`${props.classId}:${props.user?.uid}:${!!props.isTeacher}`} {...props} />;
}

function QuestionSignalControl({ classId, user, isTeacher = false }) {
  const [signals, setSignals] = useState([]);
  const [mine, setMine] = useState(null);
  const [open, setOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [clearingUid, setClearingUid] = useState(null);
  const [error, setError] = useState("");
  const wrapRef = useRef(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    setError("");
    if (!classId || !user?.uid) {
      setSignals([]);
      setMine(null);
      return;
    }
    if (isTeacher) return subscribeQuestionSignals(classId, setSignals);
    return subscribeMyQuestionSignal(classId, user.uid, setMine);
  }, [classId, user?.uid, isTeacher]);

  useEffect(() => {
    if (!open) return;
    function closeOutside(event) {
      if (!wrapRef.current?.contains(event.target)) setOpen(false);
    }
    function closeOnEscape(event) {
      if (event.key === "Escape") {
        setOpen(false);
        wrapRef.current?.querySelector("button")?.focus();
      }
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const dropdown = dropdownRef.current;
    if (!dropdown) return;
    function keepInViewport() {
      dropdown.style.transform = "";
      const bounds = dropdown.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const shift = bounds.left < 12 ? 12 - bounds.left : Math.min(0, viewportWidth - 12 - bounds.right);
      dropdown.style.transform = `translateX(${shift}px)`;
    }
    keepInViewport();
    dropdown.focus();
    window.addEventListener("resize", keepInViewport);
    window.addEventListener("scroll", keepInViewport, true);
    return () => {
      window.removeEventListener("resize", keepInViewport);
      window.removeEventListener("scroll", keepInViewport, true);
    };
  }, [open]);

  const active = isTeacher ? signals.length > 0 : !!mine;

  useEffect(() => {
    if (!active) setOpen(false);
  }, [active]);

  if (isTeacher && !active) return null;

  async function handleClick() {
    if (!classId || !user?.uid || busy) return;
    if (isTeacher) {
      setOpen((value) => !value);
      return;
    }
    if (!mine) {
      setError("");
      setComposing(true);
      return;
    }
    await sendSignal(false);
  }

  async function sendSignal(active, note = "") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await setQuestionSignal(classId, user, active, note);
      setComposing(false);
    } catch (err) {
      console.warn("[손들기] 질문 신호를 저장하지 못했어요:", err?.code, err?.message);
      setError("질문 신호를 보내지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function clearSignal(signal) {
    if (!signal?.uid || clearingUid) return;
    setClearingUid(signal.uid);
    setError("");
    try {
      await setQuestionSignal(classId, { uid: signal.uid }, false);
      setOpen(false);
      wrapRef.current?.querySelector("button")?.focus();
    } catch (err) {
      console.warn("[손들기] 질문 신호를 처리하지 못했어요:", err?.code, err?.message);
      setError("질문 신호를 처리하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setClearingUid(null);
    }
  }

  return (
    <div className="question-signal-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`question-signal-btn${active ? " on" : ""}`}
        onClick={handleClick}
        disabled={!classId || busy}
        aria-haspopup={isTeacher || !mine ? "dialog" : undefined}
        aria-expanded={isTeacher ? open : undefined}
        aria-label={isTeacher ? `질문하려고 손든 학생 ${signals.length}명 보기` : mine ? "질문 취소" : "질문하기"}
        title={isTeacher ? `손든 학생 ${signals.length}명` : mine ? "질문 취소" : "질문하기"}
      >
        <span className="question-signal-hand" aria-hidden="true">🖐️</span>
        {isTeacher && <span className="question-signal-count" aria-hidden="true">{signals.length}</span>}
        {!isTeacher && active && <span className="question-signal-dot" aria-hidden="true" />}
      </button>

      {error && !composing && !open && <p className="question-signal-error" role="alert">{error}</p>}

      {composing && <QuestionSignalNoteModal busy={busy} error={error} onSend={(note) => sendSignal(true, note)} onClose={() => { setComposing(false); setError(""); }} />}

      {isTeacher && open && (
        <div ref={dropdownRef} tabIndex={-1} className="question-signal-dropdown" role="dialog" aria-label="질문 대기 목록">
          <div className="question-signal-heading">질문 대기 {signals.length}명</div>
          {error && <p className="question-signal-note-error" role="alert">{error}</p>}
          <ul className="question-signal-list">
            {signals.map((signal) => (
              <li key={signal.id}>
                <div className="question-signal-item">
                  <span className="question-signal-avatar" aria-hidden="true">{signal.emoji || "🙂"}</span>
                  <span className="question-signal-name">
                    <strong>{signal.name || "이름 미설정"}</strong>
                    <small>{signal.studentId ? `${signal.studentId} · ` : ""}{formatTime(signal.createdAt)}</small>
                  </span>
                  <button
                    type="button"
                    className="question-signal-clear"
                    onClick={() => clearSignal(signal)}
                    disabled={!!clearingUid}
                    aria-label={`${signal.name || "학생"} 질문 처리 완료`}
                  >
                    {clearingUid === signal.uid ? "처리 중" : "확인"}
                  </button>
                </div>
                {signal.note && <p className="question-signal-note-text">{signal.note}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
