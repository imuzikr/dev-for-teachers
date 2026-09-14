"use client";

import { useEffect, useState } from "react";
import { bookConfirmationKey } from "@/lib/bookConfirmations";
import { IconCopy, IconEdit, resourceHref, resourceLinkLabel } from "./BookProjectPreview";
import BookPersonalItemViewModal from "./BookPersonalItemViewModal";
import { IconCheckSquare, IconLock } from "./StatusIcons";
import { useStudentActivityPanel } from "./StudentActivityPanel";
import useStudentChecklist from "./useStudentChecklist";
import ChecklistWarningModal from "./ChecklistWarningModal";
import { BookItemImageIndicator } from "./BookItemImages";

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
        aria-pressed={item.isActive === true} title={`${item.title} ${item.isActive ? "비활동으로 전환" : "활동중으로 지정"}`}
        disabled={!onActivate || disabled} onClick={() => onActivate(item)}>{item.isActive ? "활동중" : "비활동"}</button>
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
  selectedProgress,
  copiedId,
  confirmState,
  onCopy,
  onConfirm,
  onPresent,
  onEdit,
  onActivate,
  activationDisabled,
  reorderProps,
}) {
  const [expanded, setExpanded] = useState(false);
  const [showChecklistWarning, setShowChecklistWarning] = useState(false);
  const resource = detailItem.source;
  const checklist = useStudentChecklist(detailItem);
  const checklistValues = checklist.values;
  const setChecklistValues = checklist.change;
  const checkAll = checklist.checkAll;
  const panel = useStudentActivityPanel();
  const panelKey = `resource:${resource.id}`;
  const openPanel = () => panel?.open(panelKey);
  const linkHref = resourceHref(resource.url);
  const linkLabel = resourceLinkLabel(resource.url);
  const confirmationKey = bookConfirmationKey("resource", resource.id);
  const confirmed = selectedProgress.has(confirmationKey) && (isTeacher || checklist.complete);
  const locked = !isTeacher && resource.locked === true;
  const save = onConfirm ? () => checklist.confirm(() => onConfirm(detailItem, checklist.confirmation)) : undefined;

  return (
    <article {...reorderProps?.card} aria-current={detailItem.isActive ? "true" : undefined} onClick={(event) => { if (!event.target.closest("button, a, input, textarea")) openPanel(); }} className={`book-personal-activity-card is-compact book-personal-resource-card does-not-require-answer${locked ? " is-locked" : ""}${confirmed ? " is-confirmed" : ""}${detailItem.isActive ? " is-current-activity" : ""}`}>
      <header>
        <CardOrder reorderProps={reorderProps}>R{index + 1}</CardOrder>
        <div className="book-personal-activity-copy">
          <span>자료 {index + 1}</span>
          <strong>{panel ? <button type="button" className="student-item-title" onClick={openPanel}>{resource.title}</button> : resource.title}</strong>
        </div>
        <div className="book-personal-card-head-actions">
          {!isTeacher && <em role="img" className={locked ? "is-locked" : confirmed ? "is-done" : ""} aria-label={locked ? "잠김" : confirmed ? "확인됨" : "미확인"} title={locked ? "잠김" : confirmed ? "확인됨" : "미확인"}>{locked ? <IconLock size={16} /> : <IconCheckSquare checked={confirmed} />}</em>}
          {isTeacher && onEdit && <button type="button" className="btn-ghost book-card-expand-btn" title="자료 수정" aria-label="자료 수정" onClick={() => onEdit(detailItem)}><IconEdit size={14} /></button>}
          {onCopy && <button type="button" className="btn-ghost book-personal-copy-btn" title={copiedId === resource.id ? "자료를 복사했습니다" : "자료 복사"} aria-label={copiedId === resource.id ? "자료를 복사했습니다" : "자료 복사"} disabled={locked && !isTeacher} onClick={() => onCopy(resource)}>
            <IconCopy size={13} />
          </button>}
          {isTeacher && <BookItemImageIndicator images={resource.images} />}
          <button type="button" className="btn-ghost book-personal-expand-btn book-card-expand-btn" title="자료 확대" aria-label="자료 확대" onClick={() => setExpanded(true)}>
            <IconExpand />
          </button>
        </div>
      </header>
      <div className="book-personal-card-body">
        {detailUrlSlot(locked ? "" : linkHref, linkLabel)}
      </div>
      {isTeacher && onPresent ? (
        <TeacherCardActions item={detailItem} onPresent={onPresent} onActivate={onActivate} disabled={activationDisabled} />
      ) : !isTeacher && (
        <footer className="book-personal-card-actions">
          <button type="button" className="btn-outline" disabled={locked || !save || confirmed || confirmState.pendingKey === confirmationKey || checklist.status === "loading" || checklist.status === "saving"} onClick={() => {
            if (checklist.hasChecklist && !checklist.complete) setShowChecklistWarning(true);
            else save();
          }}>{confirmState.pendingKey === confirmationKey ? "저장 중..." : confirmed ? "확인됨" : "확인"}</button>
          <button type="button" className="btn-primary" disabled={!panel} onClick={openPanel}>패널에서 열기</button>
        </footer>
      )}
      {!isTeacher && confirmState.failedKey === confirmationKey && <p role="alert">저장하지 못했어요. 다시 시도해 주세요.</p>}
      {showChecklistWarning && <ChecklistWarningModal onClose={() => setShowChecklistWarning(false)} />}
      {panel?.selectedKey === panelKey && panel.target && (
        <BookPersonalItemViewModal detailItem={detailItem} index={index} isTeacher={false} panelTarget={panel.target} onExpand={() => setExpanded(true)} confirmed={confirmed} saving={confirmState.pendingKey === confirmationKey} failed={confirmState.failedKey === confirmationKey} onSave={save} onCopy={() => onCopy(resource)} copied={copiedId === resource.id} checklistValues={checklistValues} onChecklistChange={setChecklistValues} onCheckAll={checkAll} onUncheckAll={checklist.uncheckAll} checklistStatus={checklist.status} onRetryChecklist={checklist.retry} hasChecklist={checklist.hasChecklist} checklistComplete={checklist.complete} />
      )}
      {expanded && (
        <BookPersonalItemViewModal
          detailItem={detailItem}
          index={index}
          response=""
          isTeacher={isTeacher}
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
  selectedProgress,
  saveState,
  onSave,
  onPresent,
  onEdit,
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
  const panel = useStudentActivityPanel();
  const panelKey = `activity:${activity.id}`;
  const openPanel = () => panel?.open(panelKey);
  const confirmationKey = bookConfirmationKey("activity", activity.id);
  const confirmed = selectedProgress.has(confirmationKey) && (isTeacher || checklist.complete);
  const locked = !isTeacher && activity.locked === true;
  const activityHref = resourceHref(activity.bookUrl || activity.url);
  const activityLinkLabel = resourceLinkLabel(activity.bookUrl || activity.url);
  const requiresAnswer = activity.requiresAnswer !== false;
  const save = onSave ? () => checklist.confirm(() => onSave(detailItem, requiresAnswer ? answerDraft : undefined, checklist.confirmation)) : undefined;

  return (
    <article {...reorderProps?.card} aria-current={detailItem.isActive ? "true" : undefined} onClick={(event) => { if (!event.target.closest("button, a, input, textarea")) openPanel(); }} className={`book-personal-activity-card is-compact${locked ? " is-locked" : ""}${confirmed ? " is-confirmed" : ""}${detailItem.isActive ? " is-current-activity" : ""}`}>
      <header>
        <CardOrder reorderProps={reorderProps}>{String(index + 1).padStart(2, "0")}</CardOrder>
        <div className="book-personal-activity-copy">
          <span>활동 {index + 1}</span>
          <strong>{panel ? <button type="button" className="student-item-title" onClick={openPanel}>{activity.title}</button> : activity.title}</strong>
        </div>
        <div className="book-personal-card-head-actions">
          {(!isTeacher || !onPresent) && <em role="img" className={locked ? "is-locked" : confirmed ? "is-done" : ""} aria-label={locked ? "잠김" : confirmed ? "확인됨" : "미확인"} title={locked ? "잠김" : confirmed ? "확인됨" : "미확인"}>{locked ? <IconLock size={16} /> : <IconCheckSquare checked={confirmed} />}</em>}
          {isTeacher && onEdit && <button type="button" className="btn-ghost book-card-expand-btn" title="활동 수정" aria-label="활동 수정" onClick={() => onEdit(detailItem)}><IconEdit size={14} /></button>}
          {isTeacher && <BookItemImageIndicator images={activity.images} />}
          <button type="button" className="btn-ghost book-personal-expand-btn book-card-expand-btn" title="활동 확대" aria-label="활동 확대" onClick={() => setExpanded(true)}>
            <IconExpand />
          </button>
        </div>
      </header>
      <div className="book-personal-card-body">
        {detailUrlSlot(locked && !isTeacher ? "" : activityHref, activityLinkLabel)}
      </div>
      {isTeacher && onPresent ? (
        <TeacherCardActions item={detailItem} onPresent={onPresent} onActivate={onActivate} disabled={activationDisabled} />
      ) : !isTeacher ? (
        <footer className="book-personal-card-actions">
          <button type="button" className="btn-outline" disabled={locked || !save || confirmed || saveState.savingId === activity.id || checklist.status === "loading" || checklist.status === "saving"} onClick={() => {
            if (checklist.hasChecklist && !checklist.complete) setShowChecklistWarning(true);
            else save();
          }}>{saveState.savingId === activity.id ? "저장 중..." : confirmed ? "확인됨" : "확인"}</button>
          <button type="button" className="btn-primary" disabled={!panel} onClick={openPanel}>패널에서 열기</button>
        </footer>
      ) : null}
      {!isTeacher && saveState.failedId === activity.id && <p role="alert">저장하지 못했어요. 다시 시도해 주세요.</p>}
      {showChecklistWarning && <ChecklistWarningModal onClose={() => setShowChecklistWarning(false)} />}
      {panel?.selectedKey === panelKey && panel.target && (
        <BookPersonalItemViewModal detailItem={detailItem} index={index} response={response} isTeacher={false} panelTarget={panel.target} onExpand={() => setExpanded(true)} templateValues={templateValues} onTemplateChange={setTemplateValues} answerDraft={answerDraft} onAnswerChange={setAnswerDraft} onSave={save} saving={saveState.savingId === activity.id} failed={saveState.failedId === activity.id} confirmed={confirmed} checklistValues={checklistValues} onChecklistChange={setChecklistValues} onCheckAll={checkAll} onUncheckAll={checklist.uncheckAll} checklistStatus={checklist.status} onRetryChecklist={checklist.retry} hasChecklist={checklist.hasChecklist} checklistComplete={checklist.complete} />
      )}
      {expanded && (
        <BookPersonalItemViewModal
          detailItem={detailItem}
          index={index}
          response={response}
          isTeacher={isTeacher}
          templateValues={templateValues}
          onTemplateChange={setTemplateValues}
          answerDraft={answerDraft}
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
          confirmed={confirmed}
          onClose={() => setExpanded(false)}
        />
      )}
    </article>
  );
}
