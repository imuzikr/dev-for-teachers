"use client";

import { createPortal } from "react-dom";
import { backdropClose } from "@/lib/modal";
import { resourceHref, resourceLinkLabel } from "./BookProjectPreview";
import RichTextDisplay from "./RichTextDisplay";
import ActivityTemplate from "./ActivityTemplate";

function modalUrlSlot(href, label) {
  if (href) {
    return (
      <a className="book-project-resource-link" href={href} target="_blank" rel="noreferrer">
        <span>제공 URL</span>
        <strong>{label}</strong>
      </a>
    );
  }

  return (
    <div className="book-project-resource-link book-project-resource-link--empty" aria-label="제공 URL 없음">
      <span>제공 URL</span>
    </div>
  );
}

export default function BookPersonalItemViewModal({ detailItem, index, response, isTeacher, templateValues, onTemplateChange, onClose }) {
  const item = detailItem.source;
  const isResource = detailItem.kind === "resource";
  const itemLabel = isResource ? "자료" : "활동";
  const orderLabel = isResource ? `R${index + 1}` : String(index + 1).padStart(2, "0");
  const url = isResource ? item.url : item.bookUrl || item.url;
  const href = resourceHref(url);
  const linkLabel = resourceLinkLabel(url);
  const locked = item.locked === true;
  const requiresAnswer = !isResource && item.requiresAnswer !== false;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="modal-backdrop book-personal-expand-backdrop" {...backdropClose(onClose)}>
      <section className="modal book-personal-expand-modal" role="dialog" aria-modal="true" aria-labelledby="book-personal-expand-title" onClick={(event) => event.stopPropagation()}>
        <header className="book-personal-expand-head">
          <span>{orderLabel} · {itemLabel} 크게 보기</span>
          <h3 id="book-personal-expand-title">{item.title}</h3>
          <button type="button" className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </header>
        <div className="book-personal-expand-body">
          {modalUrlSlot(href, linkLabel)}
          {locked ? (
            <p className="book-personal-expand-locked">교사가 {itemLabel}를 열면 확인할 수 있습니다.</p>
          ) : !isTeacher && !isResource && item.templateEnabled === true ? (
            <ActivityTemplate content={item.content} values={templateValues} onChange={onTemplateChange} />
          ) : (
            <RichTextDisplay
              className="book-personal-expand-content"
              html={item.content}
              fallback={isResource ? "등록된 내용이 없습니다." : "활동 안내사항"}
            />
          )}
          {requiresAnswer && (
            <section className="book-personal-expand-response" aria-label={isTeacher ? "학생 답변" : "나의 답변"}>
              <span>{isTeacher ? "학생 답변" : "나의 답변"}</span>
              <p>{response || "아직 입력한 내용이 없습니다."}</p>
            </section>
          )}
        </div>
      </section>
    </div>,
    document.body
  );
}
