"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { backdropClose } from "@/lib/modal";
import "./ChecklistWarningModal.css";

export default function ChecklistWarningModal({ onClose }) {
  const buttonRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const descriptionId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    buttonRef.current?.focus();
    function handleKey(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current();
      } else if (event.key === "Tab") {
        event.preventDefault();
        buttonRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKey, true);
    return () => {
      window.removeEventListener("keydown", handleKey, true);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return createPortal(<div className="modal-backdrop checklist-warning-backdrop" {...backdropClose(onClose)}>
    <section className="confirm-modal checklist-warning-modal" role="alertdialog" aria-modal="true" aria-label="미완료 할 일" aria-describedby={descriptionId} onClick={(event) => event.stopPropagation()}>
      <p id={descriptionId} className="confirm-desc">완료하지 않은 할 일이 남아 있습니다.<br />모든 할 일을 완료해야 확인으로 처리됩니다.</p>
      <button ref={buttonRef} type="button" className="btn-primary" onClick={onClose}>닫기</button>
    </section>
  </div>, document.body);
}
