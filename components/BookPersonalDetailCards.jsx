"use client";

import { useEffect, useState } from "react";
import { bookConfirmationKey } from "@/lib/bookConfirmations";
import { IconCopy, resourceHref, resourceLinkLabel } from "./BookProjectPreview";
import BookPersonalItemViewModal from "./BookPersonalItemViewModal";
import RichTextDisplay from "./RichTextDisplay";
import ActivityTemplate from "./ActivityTemplate";
import { IconLock } from "./StatusIcons";
import { useStudentActivityPanel } from "./StudentActivityPanel";

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

function ConfirmButton({ confirmed, disabled, pending, onClick }) {
  return (
    <button
      type="button"
      className={`btn-primary book-personal-confirm${confirmed ? " is-confirmed" : ""}`}
      disabled={disabled || confirmed || pending}
      onClick={onClick}
    >
      {pending ? "확인 중" : confirmed ? "확인됨" : "확인"}
    </button>
  );
}

function IconExpand({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 4H4v4M4 4l6 6M16 4h4v4M20 4l-6 6M8 20H4v-4M4 20l6-6M16 20h4v-4M20 20l-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
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
}) {
  const [expanded, setExpanded] = useState(false);
  const resource = detailItem.source;
  const panel = useStudentActivityPanel();
  const panelKey = `resource:${resource.id}`;
  const openPanel = () => panel?.open(panelKey);
  const linkHref = resourceHref(resource.url);
  const linkLabel = resourceLinkLabel(resource.url);
  const confirmationKey = bookConfirmationKey("resource", resource.id);
  const confirmed = selectedProgress.has(confirmationKey);
  const locked = resource.locked === true;

  return (
    <article onClick={(event) => { if (!event.target.closest("button, a, input, textarea")) openPanel(); }} className={`book-personal-activity-card book-personal-resource-card does-not-require-answer${locked ? " is-locked" : ""}${confirmed ? " is-confirmed" : ""}`}>
      <header>
        <span className="book-personal-activity-order">R{index + 1}</span>
        <div className="book-personal-activity-copy">
          <span>자료 {index + 1}</span>
          <strong>{panel ? <button type="button" className="student-item-title" onClick={openPanel}>{resource.title}</button> : resource.title}</strong>
        </div>
        <div className="book-personal-card-head-actions">
          <button type="button" className="btn-ghost book-personal-copy-btn" title="자료 복사" aria-label={copiedId === resource.id ? "자료를 복사했습니다" : "자료 복사"} disabled={locked} onClick={() => onCopy(resource)}>
            <IconCopy size={13} />
          </button>
          <button type="button" className="btn-ghost book-personal-expand-btn" title="자료 확대" aria-label="자료 확대" onClick={() => setExpanded(true)}>
            <IconExpand />
          </button>
        </div>
      </header>
      <div className="book-personal-card-body">
        {detailUrlSlot(locked ? "" : linkHref, linkLabel)}
        {locked ? (
          <p className="book-personal-instruction">교사가 자료를 열면 확인할 수 있습니다.</p>
        ) : (
          <RichTextDisplay className="book-personal-instruction" html={resource.content} fallback="등록된 내용이 없습니다." />
        )}
      </div>
      {isTeacher && onPresent ? (
        <footer className="book-personal-card-actions">
          <button type="button" className="btn-primary book-presentation-card-btn" onClick={() => onPresent(detailItem)}>
            발표 모드
          </button>
        </footer>
      ) : !isTeacher && (
        <footer>
          <ConfirmButton confirmed={confirmed} disabled={locked || !onConfirm} pending={confirmState.pendingKey === confirmationKey} onClick={() => onConfirm(detailItem)} />
        </footer>
      )}
      {panel?.selectedKey === panelKey && panel.target && (
        <BookPersonalItemViewModal detailItem={detailItem} index={index} isTeacher={false} panelTarget={panel.target} onExpand={() => setExpanded(true)} confirmed={confirmed} saving={confirmState.pendingKey === confirmationKey} failed={confirmState.failedKey === confirmationKey} onSave={onConfirm ? () => onConfirm(detailItem) : undefined} onCopy={() => onCopy(resource)} copied={copiedId === resource.id} />
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
          onSave={onConfirm ? () => onConfirm(detailItem) : undefined}
          onCopy={() => onCopy(resource)}
          copied={copiedId === resource.id}
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
  onToggleActivityLock,
  onPresent,
}) {
  const [expanded, setExpanded] = useState(false);
  const [templateValues, setTemplateValues] = useState({});
  const activity = detailItem.source;
  const [answerDraft, setAnswerDraft] = useState(response ?? "");
  useEffect(() => { setAnswerDraft(response ?? ""); }, [activity.id, response]);
  const panel = useStudentActivityPanel();
  const panelKey = `activity:${activity.id}`;
  const openPanel = () => panel?.open(panelKey);
  const confirmationKey = bookConfirmationKey("activity", activity.id);
  const confirmed = selectedProgress.has(confirmationKey);
  const locked = !!activity.locked;
  const activityHref = resourceHref(activity.bookUrl || activity.url);
  const activityLinkLabel = resourceLinkLabel(activity.bookUrl || activity.url);
  const requiresAnswer = activity.requiresAnswer !== false;
  const usesAnswerModal = requiresAnswer && !isTeacher;

  return (
    <article onClick={(event) => { if (!event.target.closest("button, a, input, textarea")) openPanel(); }} className={`book-personal-activity-card${locked ? " is-locked" : ""}${confirmed ? " is-confirmed" : ""}${requiresAnswer ? "" : " does-not-require-answer"}${usesAnswerModal ? " uses-answer-modal" : ""}`}>
      <header>
        <span className="book-personal-activity-order">{String(index + 1).padStart(2, "0")}</span>
        <div className="book-personal-activity-copy">
          <span>활동 {index + 1}</span>
          <strong>{panel ? <button type="button" className="student-item-title" onClick={openPanel}>{activity.title}</button> : activity.title}</strong>
        </div>
        <div className="book-personal-card-head-actions">
          <em className={locked ? "is-locked" : confirmed ? "is-done" : ""} aria-label={locked ? "잠김" : undefined}>{locked ? <IconLock size={13} /> : confirmed ? "확인함" : "미확인"}</em>
          <button type="button" className="btn-ghost book-personal-expand-btn" title="활동 확대" aria-label="활동 확대" onClick={() => setExpanded(true)}>
            <IconExpand />
          </button>
        </div>
      </header>
      <div className="book-personal-card-body">
        {detailUrlSlot(activityHref, activityLinkLabel)}
        {!isTeacher && activity.templateEnabled === true && !locked ? (
          <ActivityTemplate content={activity.content} values={templateValues} onChange={setTemplateValues} />
        ) : <RichTextDisplay className="book-personal-instruction" html={activity.content} fallback="활동 안내사항" />}
      </div>
      {isTeacher && (onToggleActivityLock || onPresent) ? (
        <footer className="book-personal-card-actions">
          {onToggleActivityLock && (
            <button type="button" className={locked ? "btn-primary" : "btn-outline"} onClick={() => onToggleActivityLock(activity, !locked)}>
              {locked ? "활동 열기" : "활동 잠그기"}
            </button>
          )}
          {onPresent && (
            <button type="button" className="btn-primary book-presentation-card-btn" onClick={() => onPresent(detailItem)}>
              발표 모드
            </button>
          )}
        </footer>
      ) : !isTeacher ? (
        <footer>
          {requiresAnswer ? (
            <button
              type="button"
              className={`btn-primary book-personal-confirm${confirmed ? " is-confirmed" : ""}`}
              disabled={locked || saveState.savingId === activity.id || !onSave}
              onClick={() => setExpanded(true)}
            >
              작성
            </button>
          ) : (
            <button
              type="button"
              className={`btn-primary book-personal-confirm${confirmed ? " is-confirmed" : ""}`}
              disabled={locked || saveState.savingId === activity.id || !onSave}
              onClick={() => onSave(detailItem)}
            >
              {saveState.savingId === activity.id ? "확인 중" : confirmed || saveState.savedId === activity.id ? "확인됨" : saveState.failedId === activity.id ? "다시 확인" : "확인"}
            </button>
          )}
        </footer>
      ) : null}
      {panel?.selectedKey === panelKey && panel.target && (
        <BookPersonalItemViewModal detailItem={detailItem} index={index} response={response} isTeacher={false} panelTarget={panel.target} onExpand={() => setExpanded(true)} templateValues={templateValues} onTemplateChange={setTemplateValues} answerDraft={answerDraft} onAnswerChange={setAnswerDraft} onSave={onSave ? () => onSave(detailItem, requiresAnswer ? answerDraft : undefined) : undefined} saving={saveState.savingId === activity.id} failed={saveState.failedId === activity.id} confirmed={confirmed || saveState.savedId === activity.id} />
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
          onAnswerChange={setAnswerDraft}
          onSave={onSave ? () => onSave(detailItem, requiresAnswer ? answerDraft : undefined) : undefined}
          saving={saveState.savingId === activity.id}
          failed={saveState.failedId === activity.id}
          confirmed={confirmed || saveState.savedId === activity.id}
          onClose={() => setExpanded(false)}
        />
      )}
    </article>
  );
}
