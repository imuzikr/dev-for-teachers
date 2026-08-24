"use client";

import { useEffect, useRef, useState } from "react";
import {
  formatTime,
  setQuestionSignal,
  subscribeMyQuestionSignal,
  subscribeQuestionSignals,
} from "@/lib/store";

export default function QuestionSignalButton({ classId, user, isTeacher = false }) {
  const [signals, setSignals] = useState([]);
  const [mine, setMine] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [clearingUid, setClearingUid] = useState(null);
  const [error, setError] = useState("");
  const wrapRef = useRef(null);

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
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
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
    setBusy(true);
    setError("");
    try {
      await setQuestionSignal(classId, user, !mine);
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
        aria-haspopup={isTeacher ? "menu" : undefined}
        aria-expanded={isTeacher ? open : undefined}
        aria-label={isTeacher ? `질문하려고 손든 학생 ${signals.length}명 보기` : mine ? "질문 취소" : "질문하기"}
        title={isTeacher ? `손든 학생 ${signals.length}명` : mine ? "질문 취소" : "질문하기"}
      >
        <span className="question-signal-hand" aria-hidden="true">🖐️</span>
        {isTeacher && <span className="question-signal-count" aria-hidden="true">{signals.length}</span>}
        {!isTeacher && active && <span className="question-signal-dot" aria-hidden="true" />}
      </button>

      {error && <p className="question-signal-error" role="alert">{error}</p>}

      {isTeacher && open && (
        <div className="question-signal-dropdown" role="menu">
          <div className="question-signal-heading">질문 대기 {signals.length}명</div>
          <ul className="question-signal-list">
            {signals.map((signal) => (
              <li key={signal.id}>
                <span className="question-signal-item">
                  <span className="question-signal-avatar" aria-hidden="true">{signal.emoji || "🙂"}</span>
                  <span className="question-signal-name">
                    <strong>{signal.name || "이름 미설정"}</strong>
                    <small>{signal.studentId ? `${signal.studentId} · ` : ""}{formatTime(signal.createdAt)}</small>
                  </span>
                  <button
                    type="button"
                    className="question-signal-clear"
                    onClick={() => clearSignal(signal)}
                    disabled={clearingUid === signal.uid}
                    aria-label={`${signal.name || "학생"} 질문 처리 완료`}
                  >
                    {clearingUid === signal.uid ? "처리 중" : "확인"}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
