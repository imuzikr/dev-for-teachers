"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { backdropClose } from "@/lib/modal";

export default function ClassroomStepEditModal({ step, onSave, onClose }) {
  const [title, setTitle] = useState(step.title || "");
  const [description, setDescription] = useState(step.description || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef(null);
  const pending = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current.querySelector("input").focus();
    function keydown(event) {
      if (event.key === "Escape" && !pending.current) { event.preventDefault(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const controls = [...dialog.current.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled)')];
      const first = controls[0], last = controls.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  function close() { if (!pending.current) onClose(); }
  async function submit(event) {
    event.preventDefault();
    if (pending.current || !title.trim()) return;
    pending.current = true; setBusy(true); setError("");
    try {
      if (await onSave({ title: title.trim(), description }) === false) setError("저장하지 못했어요. 입력 내용은 유지됩니다. 다시 시도해 주세요.");
    } catch { setError("저장하지 못했어요. 다시 시도해 주세요."); }
    finally { pending.current = false; setBusy(false); }
  }
  return createPortal(<div className="modal-backdrop book-item-edit-backdrop" {...backdropClose(close)}>
    <form ref={dialog} className="modal book-step-settings-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={submit}>
      <header><h3 id={titleId}>STEP 편집</h3><button type="button" className="btn-close" aria-label="닫기" onClick={close} disabled={busy}>×</button></header>
      <label>STEP 제목<input value={title} onChange={event => setTitle(event.target.value)} maxLength={120} disabled={busy} required /></label>
      <label>학습 안내<textarea rows={5} value={description} onChange={event => setDescription(event.target.value)} disabled={busy} /></label>
      {error && <p role="alert" className="book-project-error">{error}</p>}
      <footer><button type="button" className="btn-outline" onClick={close} disabled={busy}>취소</button><button type="submit" className="btn-primary" disabled={busy || !title.trim()}>{busy ? "저장 중..." : "STEP 저장"}</button></footer>
    </form>
  </div>, document.body);
}
