"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { backdropClose } from "@/lib/modal";
import BasicFormatEditor from "./BasicFormatEditor";

export default function BookProjectItemEditModal({ step, item, kind, saving, onSave, onClose }) {
  const itemLabel = kind === "resource" ? "자료" : "활동";
  const [mounted, setMounted] = useState(false);
  const [title, setTitle] = useState(item?.title ?? "");
  const [content, setContent] = useState(item?.content ?? "");
  const [url, setUrl] = useState(kind === "resource" ? item?.url ?? "" : item?.bookUrl || item?.url || "");
  const [requiresAnswer, setRequiresAnswer] = useState(item?.requiresAnswer !== false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setTitle(item?.title ?? "");
    setContent(item?.content ?? "");
    setUrl(kind === "resource" ? item?.url ?? "" : item?.bookUrl || item?.url || "");
    setRequiresAnswer(item?.requiresAnswer !== false);
  }, [item?.id, item?.title, item?.content, item?.url, item?.bookUrl, item?.requiresAnswer, kind]);

  if (!item || !mounted) return null;

  async function save() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    const trimmedUrl = url.trim();
    await onSave({
      title: trimmedTitle,
      content,
      ...(kind === "resource"
        ? { url: trimmedUrl }
        : { url: trimmedUrl, bookUrl: trimmedUrl, requiresAnswer }),
    });
  }

  return createPortal(
    <div className="modal-backdrop book-item-edit-backdrop" {...backdropClose(onClose)}>
      <section className="modal book-item-edit-modal" role="dialog" aria-modal="true" aria-labelledby="book-item-edit-title" onClick={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div>
            <span>{step?.title ?? "Step"} · {itemLabel} 크게 편집</span>
            <h3 id="book-item-edit-title">{title.trim() || `${itemLabel} 제목`}</h3>
          </div>
          <button type="button" className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </header>
        <div className="book-item-edit-body">
          <label className="book-item-edit-field">
            <span>{itemLabel} 제목</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={`${itemLabel} 제목`}
              aria-label={`${itemLabel} 제목`}
            />
          </label>
          <label className="book-item-edit-field">
            <span>링크 URL</span>
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder={`${itemLabel} 링크 URL (선택)`}
              aria-label={`${itemLabel} 링크 URL`}
              type="url"
            />
          </label>
          {kind === "activity" && (
            <div className="book-answer-setting book-answer-setting--modal" role="group" aria-label="학생 답변 설정">
              <div className="book-answer-setting-copy">
                <strong>학생 답변</strong>
                <span>{requiresAnswer ? "입력 칸을 보여줍니다" : "확인 버튼만 보여줍니다"}</span>
              </div>
              <div className="book-answer-segment">
                <button type="button" className={requiresAnswer ? "is-selected" : ""} aria-pressed={requiresAnswer} onClick={() => setRequiresAnswer(true)}>
                  답변 받기
                </button>
                <button type="button" className={!requiresAnswer ? "is-selected" : ""} aria-pressed={!requiresAnswer} onClick={() => setRequiresAnswer(false)}>
                  확인만
                </button>
              </div>
            </div>
          )}
          <BasicFormatEditor
            value={content}
            onChange={setContent}
            placeholder={kind === "activity" ? "활동 안내사항" : ""}
            ariaLabel={`${itemLabel} 내용`}
          />
        </div>
        <footer className="book-item-edit-footer">
          <button type="button" className="btn-outline" onClick={onClose}>닫기</button>
          <button type="button" className="btn-primary" disabled={saving || !title.trim()} onClick={save}>
            {saving ? "저장 중..." : `${itemLabel} 저장`}
          </button>
        </footer>
      </section>
    </div>,
    document.body
  );
}
