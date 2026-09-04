"use client";

import { bookConfirmationKey } from "@/lib/bookConfirmations";
import { IconCopy, resourceHref, resourceLinkLabel } from "./BookProjectPreview";
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

export function BookPersonalResourceCard({
  detailItem,
  index,
  isTeacher,
  selectedProgress,
  copiedId,
  confirmState,
  onCopy,
  onConfirm,
}) {
  const resource = detailItem.source;
  const linkHref = resourceHref(resource.url);
  const linkLabel = resourceLinkLabel(resource.url);
  const confirmationKey = bookConfirmationKey("resource", resource.id);
  const confirmed = selectedProgress.has(confirmationKey);
  const locked = resource.locked === true;

  return (
    <article className={`book-personal-activity-card book-personal-resource-card${locked ? " is-locked" : ""}${confirmed ? " is-confirmed" : ""}`}>
      <header>
        <span className="book-personal-activity-order">R{index + 1}</span>
        <div className="book-personal-activity-copy">
          <span>자료 {index + 1}</span>
          <strong>{resource.title}</strong>
        </div>
        <button type="button" className="btn-ghost book-personal-copy-btn" title="자료 복사" aria-label={copiedId === resource.id ? "자료를 복사했습니다" : "자료 복사"} disabled={locked} onClick={() => onCopy(resource)}>
          <IconCopy size={13} />
        </button>
      </header>
      <div className="book-personal-card-body">
        {locked ? (
          <p className="book-personal-instruction">교사가 자료를 열면 확인할 수 있습니다.</p>
        ) : (
          <>
            {detailUrlSlot(linkHref, linkLabel)}
            <div className="book-personal-resource-content" aria-label="자료 내용">
              <span>자료 내용</span>
              <p>{resource.content || ""}</p>
            </div>
          </>
        )}
      </div>
      {!isTeacher && (
        <footer>
          <ConfirmButton confirmed={confirmed} disabled={locked || !onConfirm} pending={confirmState.pendingKey === confirmationKey} onClick={() => onConfirm(detailItem)} />
        </footer>
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
  confirmState,
  onDraftChange,
  onSave,
  onToggleActivityLock,
  onConfirm,
}) {
  const activity = detailItem.source;
  const confirmationKey = bookConfirmationKey("activity", activity.id);
  const confirmed = selectedProgress.has(confirmationKey);
  const locked = !!activity.locked;
  const activityHref = resourceHref(activity.bookUrl || activity.url);
  const activityLinkLabel = resourceLinkLabel(activity.bookUrl || activity.url);

  return (
    <article className={`book-personal-activity-card${locked ? " is-locked" : ""}${confirmed ? " is-confirmed" : ""}`}>
      <header>
        <span className="book-personal-activity-order">{String(index + 1).padStart(2, "0")}</span>
        <div className="book-personal-activity-copy">
          <span>활동 {index + 1}</span>
          <strong>{activity.title}</strong>
        </div>
        <em className={locked ? "is-locked" : confirmed ? "is-done" : ""} aria-label={locked ? "잠김" : undefined}>{locked ? <IconLock size={13} /> : confirmed ? "확인함" : "미확인"}</em>
      </header>
      <div className="book-personal-card-body">
        {detailUrlSlot(activityHref, activityLinkLabel)}
        <p className="book-personal-instruction">{activity.content || "활동 안내사항"}</p>
        <label className="book-personal-response">
          <span>{isTeacher ? "학생 답변" : "나의 답변"}</span>
          <textarea
            value={response}
            readOnly={isTeacher || locked}
            onChange={(event) => onDraftChange((current) => ({ ...current, [activity.id]: event.target.value }))}
            placeholder={locked ? "교사가 활동을 열면 입력할 수 있습니다." : isTeacher ? "아직 입력한 내용이 없습니다." : "선생님이 안내한 내용을 여기에 입력하세요."}
          />
        </label>
      </div>
      {isTeacher ? (
        <footer>
          <button type="button" className={locked ? "btn-primary" : "btn-outline"} disabled={!onToggleActivityLock} onClick={() => onToggleActivityLock(activity, !locked)}>
            {locked ? "활동 열기" : "활동 잠그기"}
          </button>
        </footer>
      ) : (
        <footer>
          {!locked && (
            <button type="button" className="btn-primary" disabled={saveState.savingId === activity.id} onClick={() => onSave(detailItem)}>
              {saveState.savingId === activity.id ? "저장 중..." : saveState.savedId === activity.id ? "저장됨" : saveState.failedId === activity.id ? "다시 저장" : "답변 저장"}
            </button>
          )}
          <ConfirmButton confirmed={confirmed} disabled={locked || !onConfirm} pending={confirmState.pendingKey === confirmationKey} onClick={() => onConfirm(detailItem)} />
        </footer>
      )}
    </article>
  );
}
