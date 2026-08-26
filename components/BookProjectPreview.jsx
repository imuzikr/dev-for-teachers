"use client";

import { backdropClose } from "@/lib/modal";
import { IconTrash } from "./StatusIcons";

export function stepPreviewItems(step) {
  return [
    ...(step.activities ?? []).map((item) => ({
      id: item.id,
      kind: "activity",
      label: "활동",
      title: item.title,
      content: item.topic || "등록된 활동 내용이 없습니다.",
      source: item,
    })),
    ...(step.resources ?? []).map((item) => ({
      id: item.id,
      kind: "resource",
      label: "자료",
      title: item.title,
      content: item.content || "등록된 자료 내용이 없습니다.",
      url: item.url || "",
      source: item,
    })),
  ];
}

export function ProjectDisplayItem({ item, kind, onOpen, onPreview, onDelete }) {
  const content = kind === "activity" ? item.topic : item.content;
  return (
    <article className="book-project-detail-item">
      <div className="book-project-detail-copy">
        <strong>{item.title}</strong>
        {content && <p>{content}</p>}
      </div>
      <div className="book-project-detail-actions">
        {kind === "activity" && <button type="button" className="btn-ghost" onClick={onOpen}>활동 열기</button>}
        {kind === "resource" && item.url && (
          <a className="btn-ghost" href={item.url} target="_blank" rel="noreferrer">링크 열기</a>
        )}
        <button type="button" className="btn-ghost" onClick={onPreview}>전체보기</button>
        {onDelete && (
          <button type="button" className="btn-ghost role-danger-btn book-project-detail-delete" title="활동 삭제" aria-label="활동 삭제" onClick={onDelete}>
            <IconTrash size={14} />
          </button>
        )}
      </div>
    </article>
  );
}

export function ProjectSection({ title, empty, children }) {
  const items = Array.isArray(children) ? children : children ? [children] : [];
  return (
    <section className="book-project-section">
      <h3>{title}</h3>
      {items.length > 0 ? children : <p>{empty}</p>}
    </section>
  );
}

export function StepContentModal({ step, item, index, total, onMove, onOpenActivity, onClose }) {
  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <section className="modal book-step-preview-modal" role="dialog" aria-modal="true" aria-labelledby="book-step-preview-title" onClick={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div>
            <span>{step.title} · {item.label}</span>
            <h3 id="book-step-preview-title">{item.title}</h3>
          </div>
          <button type="button" className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </header>
        <div className="book-step-preview-body">
          <p>{item.content}</p>
          {item.url && <a href={item.url} target="_blank" rel="noreferrer">자료 링크 열기</a>}
        </div>
        <footer className="book-step-preview-footer">
          <span>{index + 1} / {total}</span>
          <div>
            <button type="button" className="btn-outline" disabled={total < 2} onClick={() => onMove(-1)}>이전</button>
            <button type="button" className="btn-outline" disabled={total < 2} onClick={() => onMove(1)}>다음</button>
            {onOpenActivity && <button type="button" className="btn-primary" onClick={onOpenActivity}>활동 열기</button>}
          </div>
        </footer>
      </section>
    </div>
  );
}
