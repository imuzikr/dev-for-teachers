"use client";

import { useState } from "react";
import { backdropClose } from "@/lib/modal";
import { IconTrash } from "./StatusIcons";

function IconEdit({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.5 19.5h4l10-10a2.12 2.12 0 0 0-3-3l-10 10-1 3Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/><path d="m14 8 3 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;
}

function IconCopy({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.7"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;
}

function resourceHref(url) {
  const trimmed = String(url ?? "").trim();
  if (!trimmed) return "";
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.href;
  } catch {
    return "";
  }
}

function resourceLinkLabel(url) {
  const href = resourceHref(url);
  if (!href) return "";

  try {
    const parsed = new URL(href);
    const host = parsed.hostname.replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/$/, "");
    return `${host}${path && path !== "/" ? path : ""}`;
  } catch {
    return href;
  }
}

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

export function ProjectDisplayItem({ item, kind, onOpen, onPreview, onEdit, onDelete }) {
  const [copied, setCopied] = useState(false);
  const content = kind === "activity" ? item.topic : item.content;
  const linkHref = kind === "resource" ? resourceHref(item.url) : "";
  const linkLabel = kind === "resource" ? resourceLinkLabel(item.url) : "";

  async function copyResource() {
    const text = [item.content, item.url].filter(Boolean).join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <article className="book-project-detail-item">
      <div className="book-project-detail-copy">
        <strong>{item.title}</strong>
        {content && <p>{content}</p>}
        {linkHref && (
          <a className="book-project-resource-link" href={linkHref} target="_blank" rel="noreferrer">
            <span>링크</span>
            <strong>{linkLabel}</strong>
          </a>
        )}
        {kind === "resource" && (
          <button type="button" className="btn-ghost book-project-copy-action" title="자료 복사" aria-label={copied ? "자료를 복사했습니다" : "자료 복사"} onClick={copyResource}>
            <IconCopy />
          </button>
        )}
      </div>
      <div className="book-project-detail-actions">
        <button type="button" className="btn-ghost" onClick={onOpen}>열기</button>
        <button type="button" className="btn-ghost" title="확대해서 보기" onClick={onPreview}>확대</button>
        {onEdit && (
          <button type="button" className="btn-ghost book-project-icon-action" title={`${kind === "activity" ? "활동" : "자료"} 수정`} aria-label={`${kind === "activity" ? "활동" : "자료"} 수정`} onClick={onEdit}>
            <IconEdit />
          </button>
        )}
        {onDelete && (
          <button type="button" className="btn-ghost role-danger-btn book-project-icon-action" title={`${kind === "activity" ? "활동" : "자료"} 삭제`} aria-label={`${kind === "activity" ? "활동" : "자료"} 삭제`} onClick={onDelete}>
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
  const linkHref = item.url ? resourceHref(item.url) : "";

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
          {linkHref && <a className="btn-outline book-step-preview-link" href={linkHref} target="_blank" rel="noreferrer">자료 링크 열기</a>}
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
