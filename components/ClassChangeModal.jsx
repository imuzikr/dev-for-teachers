"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { backdropClose } from "@/lib/modal";
import { isValidClassJoinCode, normalizeClassJoinCode } from "@/lib/store";

export default function ClassChangeModal({ joining, onJoin, onClose }) {
  const [mounted, setMounted] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const pending = useRef(false);
  const dialogRef = useRef(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!mounted) return;
    const previous = document.activeElement;
    dialogRef.current?.querySelector("input")?.focus();
    function handleKey(event) {
      if (event.key === "Escape" && !pending.current) onClose();
      if (event.key !== "Tab") return;
      const elements = [...dialogRef.current.querySelectorAll("button:not(:disabled), input:not(:disabled)")];
      const first = elements[0];
      const last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      if (previous?.isConnected) previous.focus();
    };
  }, [mounted, onClose]);

  async function submit(event) {
    event.preventDefault();
    if (joining || pending.current) return;
    if (!isValidClassJoinCode(code)) {
      setError("6자리 숫자 코드를 입력해 주세요.");
      return;
    }
    pending.current = true;
    setError("");
    try {
      if (await onJoin(code)) onClose();
      else setError("참여할 수 없는 코드입니다. 코드와 가입 허용 여부를 확인해 주세요.");
    } catch {
      setError("반에 참여하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      pending.current = false;
    }
  }

  if (!mounted) return null;
  return createPortal(
    <div className="modal-backdrop class-change-backdrop" {...backdropClose(() => { if (!pending.current && !joining) onClose(); })}>
      <section ref={dialogRef} className="modal class-change-modal" role="dialog" aria-modal="true" aria-labelledby="class-change-title">
        <header className="modal-head">
          <h3 id="class-change-title">반 변경</h3>
          <button type="button" className="btn-close" aria-label="닫기" disabled={joining} onClick={onClose}>×</button>
        </header>
        <form onSubmit={submit}>
          <label className="book-item-edit-field" htmlFor="class-change-code">
            <span>새 반 참여 코드</span>
            <input id="class-change-code" value={code} onChange={(event) => setCode(normalizeClassJoinCode(event.target.value).slice(0, 6))} inputMode="numeric" maxLength={6} autoComplete="off" placeholder="6자리 숫자" disabled={joining} aria-describedby={error ? "class-change-error" : undefined} aria-invalid={error ? true : undefined} />
          </label>
          {error && <p id="class-change-error" className="form-error" role="alert">{error}</p>}
          <footer className="book-item-edit-footer">
            <button type="button" className="btn-outline" disabled={joining} onClick={onClose}>취소</button>
            <button type="submit" className="btn-primary" disabled={joining}>{joining ? "참여 중..." : "참여하기"}</button>
          </footer>
        </form>
      </section>
    </div>, document.body
  );
}
