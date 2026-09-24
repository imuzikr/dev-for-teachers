"use client";

import { createPortal } from "react-dom";
import { backdropClose } from "@/lib/modal";
import { resourceHref, resourceLinkLabel } from "./BookProjectPreview";
import RichTextDisplay from "./RichTextDisplay";
import { useContext, useState } from "react";
import { BookImagePresentationContext } from "./BookPresentationMode";
import BookItemImages from "./BookItemImages";
import BookItemUrlEditor from "./BookItemUrlEditor";
import BookItemUrlList from "./BookItemUrlList";
import ActivityTemplate from "./ActivityTemplate";
import ChecklistWarningModal from "./ChecklistWarningModal";

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

export default function BookPersonalItemViewModal({ detailItem, index, response, isTeacher, allowInteraction = false, saveLabel, hideResponse = false, templateValues = {}, onTemplateChange, onClose, panelTarget, onExpand, answerDraft, onAnswerChange, onSave, saving, failed, confirmed, onCopy, copied, checklistValues, onChecklistChange, onCheckAll, onUncheckAll, checklistStatus, onRetryChecklist, hasChecklist, checklistComplete = false, savedUrls, activityUrls, urlsReady = true }) {
  const [showChecklistWarning, setShowChecklistWarning] = useState(false);
  const presentImage = useContext(BookImagePresentationContext);
  const onPresent = isTeacher && !panelTarget && presentImage ? (index, inline = false) => presentImage(detailItem, index, inline) : null;
  const item = detailItem.source;
  const isResource = detailItem.kind === "resource";
  const itemLabel = isResource ? "자료" : "활동";
  const orderLabel = isResource ? `R${index + 1}` : String(index + 1).padStart(2, "0");
  const url = isResource ? item.url : item.bookUrl || item.url;
  const href = resourceHref(url);
  const linkLabel = resourceLinkLabel(url);
  const requiresAnswer = !isResource && item.templateEnabled !== true && item.requiresAnswer !== false;
  const interactive = !isTeacher || allowInteraction;

  if (typeof document === "undefined") return null;

  const content = (
      <section className={panelTarget ? "student-activity-detail" : "modal book-personal-expand-modal"} role={panelTarget ? undefined : "dialog"} aria-modal={panelTarget ? undefined : "true"} aria-label={item.title} onClick={(event) => event.stopPropagation()}>
        <header className="book-personal-expand-head">
          <span>{orderLabel} · {itemLabel}</span>
          <h3>{item.title}</h3>
          {panelTarget ? <button type="button" className="btn-outline" onClick={onExpand}>확대</button> : <button type="button" className="btn-close" onClick={onClose} aria-label="닫기">×</button>}
        </header>
        <div className="book-personal-expand-body">
          {modalUrlSlot(href, linkLabel)}
          {interactive && item.templateEnabled === true ? (
            <ActivityTemplate content={item.content} values={templateValues} onChange={onTemplateChange} hasChecklist={hasChecklist} checklistValues={checklistValues} onChecklistChange={onChecklistChange} />
          ) : (
            <RichTextDisplay
              className="book-personal-expand-content"
              html={item.content}
              previewImages={interactive}
              compactCode={interactive}
              onImageClick={onPresent ? (index) => onPresent(index, true) : undefined}
              checklistValues={checklistValues}
              onChecklistChange={onChecklistChange}
              fallback={isResource ? "등록된 내용이 없습니다." : "활동 안내사항"}
            />
          )}
          {!isResource && (
            <section className="student-activity-urls" aria-label={isTeacher ? "학생 활동 URL" : "나의 활동 URL"}>
              {!isTeacher && activityUrls && <>
                <BookItemUrlEditor urls={activityUrls.draft} onChange={activityUrls.change} disabled={!urlsReady || saving || activityUrls.saving} label="활동 URL" />
                <div className="student-activity-url-actions">
                  <button type="button" className="btn-outline" disabled={!urlsReady || saving || activityUrls.saving} onClick={() => activityUrls.save()}>{activityUrls.saving ? "URL 저장 중..." : "URL 저장"}</button>
                  {!urlsReady && <small role="status">저장한 URL을 불러오는 중...</small>}
                  {urlsReady && !activityUrls.saving && !activityUrls.dirty && !activityUrls.error && Array.isArray(savedUrls) && savedUrls.length > 0 && <small role="status">저장됨</small>}
                </div>
                {activityUrls.error && <p className="book-project-error" role="alert">{activityUrls.error}</p>}
              </>}
              <BookItemUrlList urls={savedUrls} />
            </section>
          )}
          {isTeacher && <BookItemImages images={item.images} onPresent={onPresent} />}
          {requiresAnswer && !hideResponse && (
            <section className="book-personal-expand-response" aria-label={interactive ? "나의 답변" : "학생 답변"}>
              <span>{interactive ? "나의 답변" : "학생 답변"}</span>
              {interactive && onAnswerChange ? <textarea aria-label="답변 내용" value={answerDraft} onChange={(event) => onAnswerChange(event.target.value)} disabled={saving || activityUrls?.saving} /> : <p>{response || "아직 입력한 내용이 없습니다."}</p>}
            </section>
          )}
          {interactive && (
            <div className="student-activity-detail-actions">
              {onCopy && !item.templateEnabled && <button type="button" className="btn-outline" onClick={onCopy}>{copied ? "복사됨" : "복사"}</button>}
              {onSave && hasChecklist && onCheckAll && <div className="student-checklist-bulk-actions">
                <button type="button" className="btn-outline student-checklist-check-all" disabled={saving || checklistStatus === "loading" || checklistStatus === "saving" || checklistComplete} onClick={onCheckAll}>모두 체크하기</button>
                {onUncheckAll && <button type="button" className="btn-outline student-checklist-check-all" disabled={saving || checklistStatus === "loading" || checklistStatus === "saving"} onClick={onUncheckAll}>모두 체크 해제하기</button>}
              </div>}
              {onSave && <button type="button" className="btn-primary" disabled={saving || activityUrls?.saving || (!isResource && activityUrls && !urlsReady) || checklistStatus === "loading" || (!hasChecklist && !requiresAnswer && confirmed)} onClick={async () => {
                if (hasChecklist && !checklistComplete) {
                  setShowChecklistWarning(true);
                  return;
                }
                const saved = await onSave();
                if (saved !== false && !panelTarget) onClose();
              }}>{saving ? "저장 중..." : saveLabel || (requiresAnswer ? "저장" : hasChecklist ? "확인" : confirmed ? "확인됨" : "확인")}</button>}
              {checklistStatus === "failed" && <small role="alert">체크 상태를 저장하지 못했어요.</small>}
              {checklistStatus === "failed" && <button type="button" className="btn-outline" onClick={onRetryChecklist}>다시 저장</button>}
              {failed && <p role="alert">저장하지 못했어요. 다시 시도해 주세요.</p>}
            </div>
          )}
          {!isTeacher && <BookItemImages images={item.images} previewImages />}
        </div>
      </section>
  );
  return <>{createPortal(panelTarget ? content : <div className="modal-backdrop book-personal-expand-backdrop" {...backdropClose(onClose)}>{content}</div>, panelTarget || document.body)}
    {showChecklistWarning && <ChecklistWarningModal onClose={() => setShowChecklistWarning(false)} onAcknowledge={() => {
      setShowChecklistWarning(false);
      if (!panelTarget) onClose();
    }} />}
  </>;
}
