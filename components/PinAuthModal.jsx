"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { backdropClose } from "@/lib/modal";
import { pinErrorMessage } from "@/lib/pinAuthClient";

export default function PinAuthModal({ mode, schoolName, realName, onSubmit, onClose }) {
  const [pin, setPin] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const root = useRef(null);
  const submitting = useRef(false);
  const registering = mode !== "login";
  const title = mode === "reset" ? "PIN 설정·재설정" : registering ? "4자리 PIN 등록" : "4자리 PIN 입력";

  useEffect(() => {
    if (error && !busy) root.current?.querySelector("input")?.focus();
  }, [error, busy]);

  useEffect(() => {
    const previousFocus = document.activeElement;
    root.current?.querySelector("input")?.focus();
    function handleKey(event) {
      if (event.key === "Escape" && !submitting.current) onClose();
      if (event.key !== "Tab") return;
      const controls = [...root.current.querySelectorAll("button:not(:disabled), input:not(:disabled)")];
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener("keydown", handleKey);
    return () => { document.removeEventListener("keydown", handleKey); previousFocus?.focus(); };
  }, [onClose]);

  async function submit(event) {
    event.preventDefault();
    if (submitting.current) return;
    if (!/^[0-9]{4}$/.test(pin)) { setError("숫자 4자리를 입력해 주세요."); return; }
    if (registering && pin !== confirmation) { setError("두 PIN이 일치하지 않습니다."); return; }
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await onSubmit({ pin, pinConfirm: registering ? confirmation : undefined });
    } catch (cause) {
      setPin("");
      setConfirmation("");
      setError(pinErrorMessage(cause));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return createPortal(
    <div className="modal-backdrop" {...backdropClose(() => !submitting.current && onClose())}>
      <section className="modal modal-auth pin-auth-modal" role="dialog" aria-modal="true" aria-labelledby="pin-modal-title" ref={root}>
        <div className="modal-head">
          <h3 id="pin-modal-title">{title}</h3>
          <button type="button" className="btn-close" aria-label="닫기" disabled={busy} onClick={onClose}>×</button>
        </div>
        <p className="pin-auth-identity">{schoolName} · {realName}</p>
        <form className="form-grid" onSubmit={submit}>
          <label htmlFor="login-pin">{registering ? "새 PIN" : "PIN"}</label>
          <input id="login-pin" type="password" inputMode="numeric" autoComplete={registering ? "new-password" : "current-password"} pattern="[0-9]{4}" minLength={4} maxLength={4} required disabled={busy} value={pin} onChange={(event) => setPin(event.target.value.replace(/[^0-9]/g, ""))} aria-describedby={error ? "pin-error" : undefined} />
          {registering && <>
            <label htmlFor="login-pin-confirm">PIN 다시 입력</label>
            <input id="login-pin-confirm" type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{4}" minLength={4} maxLength={4} required disabled={busy} value={confirmation} onChange={(event) => setConfirmation(event.target.value.replace(/[^0-9]/g, ""))} />
          </>}
          {error && <p id="pin-error" className="auth-error" role="alert">{error}</p>}
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? "확인 중..." : mode === "reset" ? "PIN 저장" : registering ? "등록하고 시작" : "시작하기"}</button>
        </form>
      </section>
    </div>, document.body,
  );
}
