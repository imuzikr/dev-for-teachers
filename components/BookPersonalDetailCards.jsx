"use client";

import { useEffect, useState } from "react";
import { bookConfirmationKey } from "@/lib/bookConfirmations";
import { IconCopy, IconEdit, resourceHref, resourceLinkLabel } from "./BookProjectPreview";
import BookPersonalItemViewModal from "./BookPersonalItemViewModal";
import { IconCheckSquare, IconTrash } from "./StatusIcons";
import { useStudentActivityPanel } from "./StudentActivityPanel";
import useStudentChecklist from "./useStudentChecklist";
import useStudentActivityUrls from "./useStudentActivityUrls";
import ChecklistWarningModal from "./ChecklistWarningModal";
import { BookItemImageIndicator } from "./BookItemImages";
import TeacherActivityDemoView from "./TeacherActivityDemo";

export function participantEntry(entriesByActivity, activityId, uid) {
  return (entriesByActivity[activityId] ?? []).find((entry) => entry.authorId === uid) ?? null;
}

export function dashboardText(entry) {
  if (typeof entry?.dashboardText === "string") return entry.dashboardText;
  if (typeof entry?.answers === "string") return entry.answers;
  return entry?.answers?.dashboardText ?? "";
}

export function participantName(participant) {
  return participant.name || participant.realName || participant.displayName || "이름 미설정";
}

function detailUrlSlot(href, label) {
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

function IconExpand({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 4H4v4M4 4l6 6M16 4h4v4M20 4l-6 6M8 20H4v-4M4 20l6-6M16 20h4v-4M20 20l-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TeacherCardActions({ item, onPresent, onActivate, disabled }) {
  return (
    <footer className="book-personal-card-actions book-teacher-card-actions">
      <button type="button" className={item.isActive ? "btn-primary" : "btn-outline"}
        aria-pressed={item.isActive === true} title={`${item.title} ${item.isActive ? "활동 전으로 전환" : "활동중으로 지정"}`}
        disabled={!onActivate || disabled} onClick={() => onActivate(item)}>{item.isActive ? "활동중" : "활동 전"}</button>
      <button type="button" className="btn-primary book-presentation-card-btn" onClick={() => onPresent(item)}>발표 모드</button>
    </footer>
  );
}

function CardOrder({ children, reorderProps }) {
  return reorderProps
    ? <button type="button" className="book-personal-activity-order book-card-order-handle" {...reorderProps.handle}>{children}</button>
    : <span className="book-personal-activity-order">{children}</span>;
}

export function BookPersonalResourceCard({
  detailItem,
  index,
  isTeacher,
  participantLabel,
  selectedProgress,
  copiedId,
  confirmState,
  onCopy,
  onConfirm,
  onPresent,
  onEdit,
  onDelete,
  deletionDisabled,
  onActivate,
  activationDisabled,
  reorderProps,
}) {
  const [expanded, setExpanded] = useState(false);
  const [showChecklistWarning, setShowChecklistWarning] = useState(false);
  const resource = detailItem.source;
  const [templateValues, setTemplateValues] = useState({});
  const checklist = useStudentChecklist(detailItem);
  const checklistValues = checklist.values;
  const setChecklistValues = checklist.change;
  const checkAll = checklist.checkAll;
  const panel = useStudentActivityPanel();
  const panelKey = `resource:${resource.id}`;
  const openPanel = () => panel ? panel.open(panelKey) : isTeacher && onPresent && setExpanded(true);
  const isCurrent = panel?.readOnly ? panel.selectedKey === panelKey : detailItem.isActive;
  const linkHref = resourceHref(resource.url);
  const linkLabel = resourceLinkLabel(resource.url);
  const confirmationKey = bookConfirmationKey("resource", resource.id);
  const confirmed = selectedProgress.has(confirmationKey) && (isTeacher || checklist.complete);
  const save = onConfirm ? () => checklist.confirm(() => onConfirm(detailItem, checklist.confirmation)) : undefined;

  return (
    <article {...reorderProps?.card} aria-current={isCurrent ? "true" : undefined} onClick={(event) => { if (!event.target.closest("button, a, input, textarea")) openPanel(); }} className={`book-personal-activity-card is-compact book-personal-resource-card does-not-require-answer${confirmed ? " is-confirmed" : ""}${isCurrent ? " is-current-activity" : ""}`}>
      <header>
        <CardOrder reorderProps={reorderProps}>R{index + 1}</CardOrder>
        <div className="book-personal-activity-copy">
          <span>자료 {index + 1}</span>
          <strong>{panel || (isTeacher && onPresent) ? <button type="button" className="student-item-title" onClick={openPanel}>{resource.title}</button> : resource.title}</strong>
        </div>
        <div className="book-personal-card-head-actions">
          {!isTeacher && <em role="img" className={confirmed ? "is-done" : ""} aria-label={confirmed ? "확인됨" : "미확인"} title={confirmed ? "확인됨" : "미확인"}><IconCheckSquare checked={confirmed} /></em>}
          {isTeacher && onEdit && <button type="button" className="btn-ghost book-card-expand-btn" title="자료 수정" aria-label="자료 수정" onClick={() => onEdit(detailItem)}><IconEdit size={14} /></button>}
          {isTeacher && onDelete && <button type="button" className="btn-ghost book-card-expand-btn book-card-delete-btn" title="자료 삭제" aria-label="자료 삭제" disabled={deletionDisabled} onClick={() => onDelete(detailItem)}><IconTrash size={14} /></button>}
          {onCopy && <button type="button" className="btn-ghost book-personal-copy-btn" title={copiedId === resource.id ? "자료를 복사했습니다" : "자료 복사"} aria-label={copiedId === resource.id ? "자료를 복사했습니다" : "자료 복사"} onClick={() => onCopy(resource)}>
            <IconCopy size={13} />
          </button>}
          {isTeacher && <BookItemImageIndicator images={resource.images} />}
          <button type="button" className="btn-ghost book-personal-expand-btn book-card-expand-btn" title="자료 확대" aria-label="자료 확대" onClick={() => setExpanded(true)}>
            <IconExpand />
          </button>
        </div>
      </header>
      <div className="book-personal-card-body">
        {detailUrlSlot(linkHref, linkLabel)}
      </div>
      {isTeacher && onPresent ? (
        <TeacherCardActions item={detailItem} onPresent={onPresent} onActivate={onActivate} disabled={activationDisabled} />
      ) : isTeacher && panel ? (
        <footer className="book-personal-card-actions book-student-review-actions"><button type="button" className="btn-primary" onClick={openPanel}>패널에서 열기</button></footer>
      ) : !isTeacher && (
        <footer className="book-personal-card-actions">
          <button type="button" className="btn-outline" disabled={!panel?.isOpen || panel.selectedKey !== panelKey || !save || confirmed || confirmState.pendingKey === confirmationKey || checklist.status === "loading" || checklist.status === "saving"} onClick={() => {
            if (checklist.hasChecklist && !checklist.complete) setShowChecklistWarning(true);
            else save();
          }}>{confirmState.pendingKey === confirmationKey ? "저장 중..." : confirmed ? "확인됨" : "미확인"}</button>
          <button type="button" className="btn-primary" disabled={!panel} onClick={openPanel}>패널에서 열기</button>
        </footer>
      )}
      {!isTeacher && confirmState.failedKey === confirmationKey && <p role="alert">저장하지 못했어요. 다시 시도해 주세요.</p>}
      {showChecklistWarning && <ChecklistWarningModal onClose={() => setShowChecklistWarning(false)} />}
      {panel?.selectedKey === panelKey && panel.target && (
        <BookPersonalItemViewModal detailItem={detailItem} index={index} isTeacher={isTeacher} participantLabel={participantLabel} panelTarget={panel.target} onExpand={() => setExpanded(true)} templateValues={templateValues} onTemplateChange={setTemplateValues} confirmed={confirmed} saving={confirmState.pendingKey === confirmationKey} failed={confirmState.failedKey === confirmationKey} onSave={save} onCopy={() => onCopy(resource)} copied={copiedId === resource.id} checklistValues={checklistValues} onChecklistChange={setChecklistValues} onCheckAll={checkAll} onUncheckAll={checklist.uncheckAll} checklistStatus={checklist.status} onRetryChecklist={checklist.retry} hasChecklist={checklist.hasChecklist} checklistComplete={checklist.complete} />
      )}
      {expanded && isTeacher && onPresent ? <TeacherActivityDemoView detailItem={detailItem} index={index} onClose={() => setExpanded(false)} /> : expanded && (
        <BookPersonalItemViewModal
          detailItem={detailItem}
          index={index}
          response=""
          templateValues={templateValues}
          onTemplateChange={setTemplateValues}
          isTeacher={isTeacher}
          participantLabel={participantLabel}
          confirmed={confirmed}
          saving={confirmState.pendingKey === confirmationKey}
          failed={confirmState.failedKey === confirmationKey}
          onSave={save}
          checklistStatus={checklist.status}
          onRetryChecklist={checklist.retry}
          hasChecklist={checklist.hasChecklist} checklistComplete={checklist.complete}
          onCopy={() => onCopy(resource)}
          onCheckAll={checkAll} onUncheckAll={checklist.uncheckAll}
          copied={copiedId === resource.id}
          checklistValues={checklistValues}
          onChecklistChange={setChecklistValues}
          onClose={() => setExpanded(false)}
        />
      )}
    </article>
  );
}

export function BookPersonalActivityCard({
  detailItem,
  index,
  response,
  isTeacher,
  participantLabel,
  selectedProgress,
  saveState,
  allowStudentImages = false,
  savedUrls,
  savedImages,
  entryOwnerId,
  urlsReady = false,
  onSaveUrls,
  onSave,
  onPresent,
  onEdit,
  onDelete,
  deletionDisabled,
  onActivate,
  activationDisabled,
  reorderProps,
}) {
  const [expanded, setExpanded] = useState(false);
  const [showChecklistWarning, setShowChecklistWarning] = useState(false);
  const [templateValues, setTemplateValues] = useState({});
  const activity = detailItem.source;
  const checklist = useStudentChecklist(detailItem);
  const checklistValues = checklist.values;
  const setChecklistValues = checklist.change;
  const checkAll = checklist.checkAll;
  const [answerDraft, setAnswerDraft] = useState(response ?? "");
  useEffect(() => { setAnswerDraft(response ?? ""); }, [activity.id, response]);
  const imageScope = `${entryOwnerId ?? ""}:${activity.id}`;
  const [imageDraft, setImageDraft] = useState({ scope: imageScope, images: Array.isArray(savedImages) ? savedImages : [], dirty: false });
  const [imageBusyBySurface, setImageBusyBySurface] = useState({});
  const imagesBusy = Object.values(imageBusyBySurface).some(Boolean);
  const setImageBusy = (surface, busy) => setImageBusyBySurface((current) => ({ ...current, [surface]: busy }));
  useEffect(() => {
    const nextImages = Array.isArray(savedImages) ? savedImages : [];
    setImageDraft((current) => {
      if (current.scope !== imageScope) return { scope: imageScope, images: nextImages, dirty: false };
      return current.dirty ? current : { scope: imageScope, images: nextImages, dirty: false };
    });
  }, [imageScope, savedImages]);
  const panel = useStudentActivityPanel();
  const panelKey = `activity:${activity.id}`;
  const openPanel = () => panel ? panel.open(panelKey) : isTeacher && onPresent && setExpanded(true);
  const isCurrent = panel?.readOnly ? panel.selectedKey === panelKey : detailItem.isActive;
  const confirmationKey = bookConfirmationKey("activity", activity.id);
  const confirmed = selectedProgress.has(confirmationKey) && (isTeacher || checklist.complete);
  const activityHref = resourceHref(activity.bookUrl || activity.url);
  const activityLinkLabel = resourceLinkLabel(activity.bookUrl || activity.url);
  const requiresAnswer = activity.templateEnabled !== true && activity.requiresAnswer !== false;
  const activityUrls = useStudentActivityUrls({
    urls: savedUrls,
    scope: `${panel?.scope ?? ""}:${entryOwnerId ?? ""}:${activity.id}`,
    enabled: !isTeacher && Boolean(onSaveUrls),
    ready: urlsReady,
    onSave: (urls) => onSaveUrls(detailItem, urls),
  });
  const save = onSave ? () => activityUrls.save((urls) => {
    const studentImages = allowStudentImages && imageDraft.dirty ? imageDraft.images : undefined;
    const persist = async () => {
      const saved = await onSave(detailItem, requiresAnswer ? answerDraft : undefined, checklist.confirmation, urls, studentImages);
      if (saved !== false && studentImages !== undefined) {
        setImageDraft((current) => current.scope === imageScope ? { ...current, dirty: false } : current);
      }
      return saved;
    };
    return checklist.complete ? checklist.confirm(persist) : persist();
  }) : undefined;
  const urlViewProps = { savedUrls, activityUrls: !isTeacher && onSaveUrls ? activityUrls : undefined, urlsReady };

  return (
    <article {...reorderProps?.card} aria-current={isCurrent ? "true" : undefined} onClick={(event) => { if (!event.target.closest("button, a, input, textarea")) openPanel(); }} className={`book-personal-activity-card is-compact${confirmed ? " is-confirmed" : ""}${isCurrent ? " is-current-activity" : ""}`}>
      <header>
        <CardOrder reorderProps={reorderProps}>{String(index + 1).padStart(2, "0")}</CardOrder>
        <div className="book-personal-activity-copy">
          <span>활동 {index + 1}</span>
          <strong>{panel || (isTeacher && onPresent) ? <button type="button" className="student-item-title" onClick={openPanel}>{activity.title}</button> : activity.title}</strong>
        </div>
        <div className="book-personal-card-head-actions">
          {(!isTeacher || !onPresent) && <em role="img" className={confirmed ? "is-done" : ""} aria-label={confirmed ? "확인됨" : "미확인"} title={confirmed ? "확인됨" : "미확인"}><IconCheckSquare checked={confirmed} /></em>}
          {isTeacher && onEdit && <button type="button" className="btn-ghost book-card-expand-btn" title="활동 수정" aria-label="활동 수정" onClick={() => onEdit(detailItem)}><IconEdit size={14} /></button>}
          {isTeacher && onDelete && <button type="button" className="btn-ghost book-card-expand-btn book-card-delete-btn" title="활동 삭제" aria-label="활동 삭제" disabled={deletionDisabled} onClick={() => onDelete(detailItem)}><IconTrash size={14} /></button>}
          {isTeacher && <BookItemImageIndicator images={activity.images} />}
          {isTeacher && <BookItemImageIndicator images={savedImages} />}
          <button type="button" className="btn-ghost book-personal-expand-btn book-card-expand-btn" title="활동 확대" aria-label="활동 확대" onClick={() => setExpanded(true)}>
            <IconExpand />
          </button>
        </div>
      </header>
      <div className="book-personal-card-body">
        {detailUrlSlot(activityHref, activityLinkLabel)}
      </div>
      {isTeacher && onPresent ? (
        <TeacherCardActions item={detailItem} onPresent={onPresent} onActivate={onActivate} disabled={activationDisabled} />
      ) : isTeacher && panel ? (
        <footer className="book-personal-card-actions book-student-review-actions"><button type="button" className="btn-primary" onClick={openPanel}>패널에서 열기</button></footer>
      ) : !isTeacher ? (
        <footer className="book-personal-card-actions">
          <button type="button" className="btn-outline" disabled={!panel?.isOpen || panel.selectedKey !== panelKey || !save || !urlsReady || imagesBusy || activityUrls.saving || confirmed || saveState.savingId === activity.id || checklist.status === "loading" || checklist.status === "saving"} onClick={() => {
            if (checklist.hasChecklist && !checklist.complete) setShowChecklistWarning(true);
            else save();
          }}>{saveState.savingId === activity.id ? "저장 중..." : confirmed ? "확인됨" : "미확인"}</button>
          <button type="button" className="btn-primary" disabled={!panel} onClick={openPanel}>패널에서 열기</button>
        </footer>
      ) : null}
      {!isTeacher && saveState.failedId === activity.id && <p role="alert">저장하지 못했어요. 다시 시도해 주세요.</p>}
      {showChecklistWarning && <ChecklistWarningModal onClose={() => setShowChecklistWarning(false)} />}
      {panel?.selectedKey === panelKey && panel.target && (
        <BookPersonalItemViewModal {...urlViewProps} detailItem={detailItem} index={index} response={response} isTeacher={isTeacher} participantLabel={participantLabel} panelTarget={panel.target} onExpand={() => setExpanded(true)} templateValues={templateValues} onTemplateChange={setTemplateValues} answerDraft={answerDraft} onAnswerChange={setAnswerDraft} savedImages={savedImages} imageDraft={allowStudentImages ? imageDraft.images : undefined} onImageDraftChange={allowStudentImages ? (images) => setImageDraft({ scope: imageScope, images, dirty: true }) : undefined} imagesBusy={imagesBusy} onImagesBusyChange={(busy) => setImageBusy("panel", busy)} onSave={save} saving={saveState.savingId === activity.id} failed={saveState.failedId === activity.id} saveError={saveState.failedMessage} confirmed={confirmed} checklistValues={checklistValues} onChecklistChange={setChecklistValues} onCheckAll={checkAll} onUncheckAll={checklist.uncheckAll} checklistStatus={checklist.status} onRetryChecklist={checklist.retry} hasChecklist={checklist.hasChecklist} checklistComplete={checklist.complete} />
      )}
      {expanded && isTeacher && onPresent ? <TeacherActivityDemoView detailItem={detailItem} index={index} onClose={() => setExpanded(false)} /> : expanded && (
        <BookPersonalItemViewModal
          detailItem={detailItem}
          index={index}
          response={response}
          {...urlViewProps}
          isTeacher={isTeacher}
          participantLabel={participantLabel}
          templateValues={templateValues}
          onTemplateChange={setTemplateValues}
          answerDraft={answerDraft}
          savedImages={savedImages}
          imageDraft={allowStudentImages ? imageDraft.images : undefined}
          onImageDraftChange={allowStudentImages ? (images) => setImageDraft({ scope: imageScope, images, dirty: true }) : undefined}
          imagesBusy={imagesBusy}
          onImagesBusyChange={(busy) => setImageBusy("expanded", busy)}
          checklistValues={checklistValues}
          onChecklistChange={setChecklistValues}
          onAnswerChange={setAnswerDraft}
          onCheckAll={checkAll} onUncheckAll={checklist.uncheckAll}
          onSave={save}
          checklistStatus={checklist.status}
          onRetryChecklist={checklist.retry}
          hasChecklist={checklist.hasChecklist} checklistComplete={checklist.complete}
          saving={saveState.savingId === activity.id}
          failed={saveState.failedId === activity.id}
          saveError={saveState.failedMessage}
          confirmed={confirmed}
          onClose={() => setExpanded(false)}
        />
      )}
    </article>
  );
}
