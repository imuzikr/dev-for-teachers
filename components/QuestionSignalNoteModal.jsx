"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { backdropClose } from "@/lib/modal";

export default function QuestionSignalNoteModal({ busy, error, onSend, onClose }) {
  const [note, setNote] = useState("");
  const dialogRef = useRef(null);
  const callbacksRef = useRef({ busy, onClose });
  const titleId = useId();
  const inputId = useId();
  const hintId = useId();

  useEffect(() => { callbacksRef.current = { busy, onClose }; }, [busy, onClose]);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector("textarea")?.focus();
    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!callbacksRef.current.busy) callbacksRef.current.onClose();
      }
      if (event.key !== "Tab") return;
      const controls = dialogRef.current?.querySelectorAll("button:not([disabled]), textarea:not([disabled])");
      if (!controls?.length) { event.preventDefault(); return; }
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  if (typeof document === "undefined") return null;
  const close = () => { if (!busy) onClose(); };
  return createPortal(
    <div className="modal-backdrop" {...backdropClose(close)}>
      <section ref={dialogRef} className="modal question-signal-note-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={busy} onClick={(event) => event.stopPropagation()}>
        <header className="question-signal-note-head">
          <h2 id={titleId}>질문하기</h2>
          <button type="button" className="btn-close" aria-label="닫기" disabled={busy} onClick={close}>×</button>
        </header>
        <label htmlFor={inputId}>메모 <span>(선택)</span></label>
        <textarea id={inputId} value={note} maxLength={1000} disabled={busy} aria-describedby={hintId} placeholder="어떤 도움이 필요한지 적어 주세요." onChange={(event) => setNote(event.target.value)} />
        <small id={hintId} className="question-signal-note-hint">{note.length.toLocaleString()} / 1,000자</small>
        {error && <p className="question-signal-note-error" role="alert">{error}</p>}
        <footer className="question-signal-note-actions">
          <button type="button" className="btn-outline" disabled={busy} onClick={() => onSend("")}>메모 없이 보내기</button>
          <button type="button" className="btn-primary" disabled={busy || !note.trim()} onClick={() => onSend(note)}>{busy ? "보내는 중..." : "메모와 함께 보내기"}</button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
