"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { bookConfirmationKey } from "@/lib/bookConfirmations";
import { backdropClose } from "@/lib/modal";
import { IconCopy, resourceHref, resourceLinkLabel } from "./BookProjectPreview";
import BookPersonalItemViewModal from "./BookPersonalItemViewModal";
import RichTextDisplay from "./RichTextDisplay";
import { IconLock } from "./StatusIcons";

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
      className={`btn-outline book-personal-confirm${confirmed ? " is-confirmed" : ""}`}
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

function StudentAnswerEditModal({ activity, response, saving, failed, onSave, onClose }) {
  const [draft, setDraft] = useState(response ?? "");

  useEffect(() => {
    setDraft(response ?? "");
  }, [response, activity.id]);

  if (typeof document === "undefined") return null;

  async function save() {
    const saved = await onSave(draft);
    if (saved !== false) onClose();
  }

  return createPortal(
    <div className="modal-backdrop book-answer-edit-backdrop" {...backdropClose(onClose)}>
      <section className="modal book-answer-edit-modal" role="dialog" aria-modal="true" aria-labelledby={`book-answer-edit-${activity.id}`} onClick={(event) => event.stopPropagation()}>
        <header className="book-answer-edit-head">
          <div>
            <span>나의 답변 작성</span>
            <h3 id={`book-answer-edit-${activity.id}`}>{activity.title}</h3>
          </div>
          <button type="button" className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </header>
        <label className="book-answer-edit-body">
          <span>답변 내용</span>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="선생님이 안내한 내용을 여기에 입력하세요."
            autoFocus
          />
        </label>
        {failed && <p className="book-answer-edit-error">저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.</p>}
        <footer className="book-answer-edit-footer">
          <button type="button" className="btn-outline" onClick={onClose}>닫기</button>
          <button type="button" className="btn-primary" disabled={saving} onClick={save}>
            {saving ? "저장 중..." : "저장"}
          </button>
        </footer>
      </section>
    </div>,
    document.body
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
  const linkHref = resourceHref(resource.url);
  const linkLabel = resourceLinkLabel(resource.url);
  const confirmationKey = bookConfirmationKey("resource", resource.id);
  const confirmed = selectedProgress.has(confirmationKey);
  const locked = resource.locked === true;

  return (
    <article className={`book-personal-activity-card book-personal-resource-card does-not-require-answer${locked ? " is-locked" : ""}${confirmed ? " is-confirmed" : ""}`}>
      <header>
        <span className="book-personal-activity-order">R{index + 1}</span>
        <div className="book-personal-activity-copy">
          <span>자료 {index + 1}</span>
          <strong>{resource.title}</strong>
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
        {locked ? (
          <p className="book-personal-instruction">교사가 자료를 열면 확인할 수 있습니다.</p>
        ) : (
          <>
            {detailUrlSlot(linkHref, linkLabel)}
            <div className="book-personal-resource-content" aria-label="자료 본문">
              <RichTextDisplay className="book-personal-resource-content-text" html={resource.content} />
            </div>
          </>
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
      {expanded && (
        <BookPersonalItemViewModal
          detailItem={detailItem}
          index={index}
          response=""
          isTeacher={isTeacher}
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
  const [editingAnswer, setEditingAnswer] = useState(false);
  const activity = detailItem.source;
  const confirmationKey = bookConfirmationKey("activity", activity.id);
  const confirmed = selectedProgress.has(confirmationKey);
  const locked = !!activity.locked;
  const activityHref = resourceHref(activity.bookUrl || activity.url);
  const activityLinkLabel = resourceLinkLabel(activity.bookUrl || activity.url);
  const requiresAnswer = activity.requiresAnswer !== false;
  const usesAnswerModal = requiresAnswer && !isTeacher;

  return (
    <article className={`book-personal-activity-card${locked ? " is-locked" : ""}${confirmed ? " is-confirmed" : ""}${requiresAnswer ? "" : " does-not-require-answer"}${usesAnswerModal ? " uses-answer-modal" : ""}`}>
      <header>
        <span className="book-personal-activity-order">{String(index + 1).padStart(2, "0")}</span>
        <div className="book-personal-activity-copy">
          <span>활동 {index + 1}</span>
          <strong>{activity.title}</strong>
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
        <RichTextDisplay className="book-personal-instruction" html={activity.content} fallback="활동 안내사항" />
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
              onClick={() => setEditingAnswer(true)}
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
      {expanded && (
        <BookPersonalItemViewModal
          detailItem={detailItem}
          index={index}
          response={response}
          isTeacher={isTeacher}
          onClose={() => setExpanded(false)}
        />
      )}
      {editingAnswer && (
        <StudentAnswerEditModal
          activity={activity}
          response={response}
          saving={saveState.savingId === activity.id}
          failed={saveState.failedId === activity.id}
          onSave={(nextResponse) => onSave(detailItem, nextResponse)}
          onClose={() => setEditingAnswer(false)}
        />
      )}
    </article>
  );
}
