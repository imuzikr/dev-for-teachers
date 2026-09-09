"use client";

import { createPortal } from "react-dom";
import { backdropClose } from "@/lib/modal";
import { resourceHref, resourceLinkLabel } from "./BookProjectPreview";
import RichTextDisplay from "./RichTextDisplay";
import { useContext } from "react";
import { BookImagePresentationContext } from "./BookPresentationMode";
import BookItemImages from "./BookItemImages";
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

export default function BookPersonalItemViewModal({ detailItem, index, response, isTeacher, templateValues, onTemplateChange, onClose, panelTarget, onExpand, answerDraft, onAnswerChange, onSave, saving, failed, confirmed, onCopy, copied, checklistValues, onChecklistChange, checklistStatus, onRetryChecklist, hasChecklist }) {
  const presentImage = useContext(BookImagePresentationContext);
  const onPresent = isTeacher && !panelTarget && presentImage ? (index, inline = false) => presentImage(detailItem, index, inline) : null;
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

  const content = (
      <section className={panelTarget ? "student-activity-detail" : "modal book-personal-expand-modal"} role={panelTarget ? undefined : "dialog"} aria-modal={panelTarget ? undefined : "true"} aria-label={item.title} onClick={(event) => event.stopPropagation()}>
        <header className="book-personal-expand-head">
          <span>{orderLabel} · {itemLabel}</span>
          <h3>{item.title}</h3>
          {panelTarget ? <button type="button" className="btn-outline" onClick={onExpand}>확대</button> : <button type="button" className="btn-close" onClick={onClose} aria-label="닫기">×</button>}
        </header>
        <div className="book-personal-expand-body">
          {modalUrlSlot(locked && !isTeacher ? "" : href, linkLabel)}
          {locked ? (
            <p className="book-personal-expand-locked">교사가 {itemLabel}를 열면 확인할 수 있습니다.</p>
          ) : !isTeacher && !isResource && item.templateEnabled === true ? (
            <ActivityTemplate content={item.content} values={templateValues} onChange={onTemplateChange} hasChecklist={hasChecklist} checklistValues={checklistValues} onChecklistChange={onChecklistChange} />
          ) : (
            <RichTextDisplay
              className="book-personal-expand-content"
              html={item.content}
              previewImages={!isTeacher}
              onImageClick={onPresent ? (index) => onPresent(index, true) : undefined}
              checklistValues={checklistValues}
              onChecklistChange={onChecklistChange}
              fallback={isResource ? "등록된 내용이 없습니다." : "활동 안내사항"}
            />
          )}
          {!locked && <BookItemImages images={item.images} onPresent={onPresent} previewImages={!isTeacher} />}
          {requiresAnswer && !locked && (
            <section className="book-personal-expand-response" aria-label={isTeacher ? "학생 답변" : "나의 답변"}>
              <span>{isTeacher ? "학생 답변" : "나의 답변"}</span>
              {!isTeacher && onAnswerChange ? <textarea aria-label="답변 내용" value={answerDraft} onChange={(event) => onAnswerChange(event.target.value)} disabled={saving} /> : <p>{response || "아직 입력한 내용이 없습니다."}</p>}
            </section>
          )}
          {!isTeacher && !locked && (
            <div className="student-activity-detail-actions">
              {onCopy && <button type="button" className="btn-outline" onClick={onCopy}>{copied ? "복사됨" : "복사"}</button>}
              {onSave && <button type="button" className="btn-primary" disabled={saving || checklistStatus === "loading" || (!hasChecklist && !requiresAnswer && confirmed)} onClick={async () => {
                const saved = await onSave();
                if (requiresAnswer && saved !== false && !panelTarget) onClose();
              }}>{saving ? "저장 중..." : requiresAnswer ? "저장" : hasChecklist ? "확인" : confirmed ? "확인됨" : "확인"}</button>}
              {checklistStatus && checklistStatus !== "loading" && <small role="status">{checklistStatus === "saving" ? "자동 저장 중..." : checklistStatus === "failed" ? "체크 상태를 저장하지 못했어요." : "자동 저장됨"}</small>}
              {checklistStatus === "failed" && <button type="button" className="btn-outline" onClick={onRetryChecklist}>다시 저장</button>}
              {failed && <p role="alert">저장하지 못했어요. 다시 시도해 주세요.</p>}
            </div>
          )}
        </div>
      </section>
  );
  return createPortal(panelTarget ? content : <div className="modal-backdrop book-personal-expand-backdrop" {...backdropClose(onClose)}>{content}</div>, panelTarget || document.body);
}
