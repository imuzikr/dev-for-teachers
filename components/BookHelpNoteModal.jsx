"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { backdropClose } from "@/lib/modal";
import { resourceHref, resourceLinkLabel } from "./BookProjectPreview";
import RichTextDisplay from "./RichTextDisplay";

export default function BookHelpNoteModal({ note, onClose }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  const titleId = useId();
  const href = resourceHref(note.url);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector("button")?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      } else if (event.key === "Tab") {
        const focusable = dialogRef.current?.querySelectorAll('button:not([disabled]), a[href]');
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="modal-backdrop book-personal-expand-backdrop" {...backdropClose(onClose)}>
      <section
        ref={dialogRef}
        className="modal book-personal-expand-modal book-help-note-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="book-personal-expand-head">
          <span>도움 글 크게 보기</span>
          <h3 id={titleId}>{note.title || "제목 없는 도움 글"}</h3>
          <button type="button" className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </header>
        <div className="book-personal-expand-body">
          {href && (
            <a className="book-project-resource-link" href={href} target="_blank" rel="noopener noreferrer">
              <span>제공 URL</span>
              <strong>{resourceLinkLabel(href)}</strong>
            </a>
          )}
          <RichTextDisplay
            className="book-personal-expand-content"
            html={note.content}
            fallback="등록된 내용이 없습니다."
          />
        </div>
      </section>
    </div>,
    document.body
  );
}
