"use client";

import { useEffect, useState } from "react";
import { saveBookDashboardText } from "@/lib/store";
import { IconCopy, orderedStepItems, resourceHref, resourceLinkLabel } from "./BookProjectPreview";

function participantName(participant) {
  return participant.name || participant.realName || participant.displayName || "이름 미설정";
}

function participantEntry(entriesByActivity, activityId, uid) {
  return (entriesByActivity[activityId] ?? []).find((entry) => entry.authorId === uid) ?? null;
}

function dashboardText(entry) {
  if (typeof entry?.dashboardText === "string") return entry.dashboardText;
  if (typeof entry?.answers === "string") return entry.answers;
  return entry?.answers?.dashboardText ?? "";
}

function detailSections(project, activities) {
  if (!project?.steps?.length) {
    return activities.length ? [{ id: "activities", title: "활동", activities, resources: [], items: activities.map((activity) => ({ id: activity.id, kind: "activity", label: "활동", title: activity.title, source: activity })) }] : [];
  }

  const activityIds = new Set(activities.map((activity) => activity.id));
  return project.steps
    .map((step, index) => {
      const items = orderedStepItems(step)
        .filter((item) => item.kind === "resource" || activityIds.has(item.id));
      const activitiesInStep = items.filter((item) => item.kind === "activity");
      const resourcesInStep = items.filter((item) => item.kind === "resource");
      return {
        id: step.id ?? `step-${index + 1}`,
        title: step.title || `Step ${index + 1}`,
        activities: activitiesInStep,
        resources: resourcesInStep,
        items,
      };
    })
    .filter((section) => section.activities.length > 0 || section.resources.length > 0);
}

function DetailUrlSlot({ href, label }) {
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

export default function BookPersonalDashboard({ participants, activities, project = null, entriesByActivity = {}, progressByUser, user, isTeacher, onToggleActivityLock, saveDashboardText = saveBookDashboardText }) {
  const [selectedUid, setSelectedUid] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [savedId, setSavedId] = useState(null);
  const [failedId, setFailedId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const selected = participants.find((participant) => participant.uid === selectedUid) ?? null;
  const selectedProgress = selected ? progressByUser.get(selected.uid) ?? new Set() : new Set();
  const sections = detailSections(project, activities);

  useEffect(() => {
    if (!selected) return;
    setDrafts(Object.fromEntries(activities.map((activity) => [
      activity.id,
      dashboardText(participantEntry(entriesByActivity, activity.id, selected.uid)),
    ])));
  }, [activities, entriesByActivity, selected]);

  async function saveResponse(activity) {
    setSavingId(activity.id);
    setSavedId(null);
    setFailedId(null);
    try {
      await saveDashboardText(activity.id, user, drafts[activity.id] ?? "");
      setSavedId(activity.id);
    } catch {
      setFailedId(activity.id);
    } finally {
      setSavingId(null);
    }
  }

  async function copyResource(resource) {
    const text = [resource.title, resource.content, resource.url].filter(Boolean).join("\n");
    await navigator.clipboard.writeText(text);
    setCopiedId(resource.id);
    window.setTimeout(() => setCopiedId(null), 1600);
  }

  if (selected) {
    return (
      <section className="book-personal-dashboard book-personal-detail" aria-label={isTeacher ? "참여자 활동 대시보드" : "나의 활동 대시보드"}>
        <header className="book-personal-detail-head">
          <button type="button" className="btn-outline" onClick={() => setSelectedUid(null)}>← 개인 카드</button>
          <div>
            <span>{isTeacher ? "참여자 활동" : "나의 책방"}</span>
            <h2>{participantName(selected)} 활동 대시보드</h2>
            <p>{selected.schoolName || "학교 미입력"} · {selectedProgress.size}/{activities.length} 완료</p>
          </div>
        </header>
        {sections.length === 0 ? (
          <div className="book-dashboard-empty">선생님이 활동을 준비하고 있습니다.</div>
        ) : (
          <div className="book-personal-detail-steps" aria-label="프로젝트 활동과 자료 목록">
            {sections.map((section, sectionIndex) => (
              <section className="book-personal-step-section" key={section.id}>
                <header className="book-personal-step-head">
                  <span>STEP {sectionIndex + 1}</span>
                  <strong>{section.title}</strong>
                  <small>{section.activities.length} 활동 · {section.resources.length} 자료</small>
                </header>
                <div className="book-personal-detail-list" aria-label={`${section.title} 활동과 자료`}>
                  {section.items.map((detailItem, index) => {
                    if (detailItem.kind === "resource") {
                      const resource = detailItem.source;
                      const linkHref = resourceHref(resource.url);
                      const linkLabel = resourceLinkLabel(resource.url);
                      return (
                        <article className="book-personal-activity-card book-personal-resource-card" key={`resource:${resource.id ?? `${section.id}-${index}`}`}>
                          <header>
                            <span className="book-personal-activity-order">R{index + 1}</span>
                            <div className="book-personal-activity-copy">
                              <span>자료 {index + 1}</span>
                              <strong>{resource.title}</strong>
                            </div>
                            <button
                              type="button"
                              className="btn-ghost book-personal-copy-btn"
                              title="자료 복사"
                              aria-label={copiedId === resource.id ? "자료를 복사했습니다" : "자료 복사"}
                              onClick={() => copyResource(resource)}
                            >
                              <IconCopy size={13} />
                            </button>
                          </header>
                          <div className="book-personal-card-body">
                            <DetailUrlSlot href={linkHref} label={linkLabel} />
                            <div className="book-personal-response book-personal-resource-body">
                              <span>자료 내용</span>
                              <p>{resource.content || "등록된 자료 설명이 없습니다."}</p>
                            </div>
                          </div>
                        </article>
                      );
                    }
                    const activity = detailItem.source;
                    const completed = selectedProgress.has(activity.id);
                    const savedEntry = participantEntry(entriesByActivity, activity.id, selected.uid);
                    const response = isTeacher ? dashboardText(savedEntry) : drafts[activity.id] ?? "";
                    const locked = !!activity.locked;
                    const activityHref = resourceHref(activity.bookUrl || activity.url);
                    const activityLinkLabel = resourceLinkLabel(activity.bookUrl || activity.url);
                    return (
                      <article className={`book-personal-activity-card${locked ? " is-locked" : ""}`} key={`activity:${activity.id}`}>
                        <header>
                          <span className="book-personal-activity-order">{String(index + 1).padStart(2, "0")}</span>
                          <div className="book-personal-activity-copy">
                            <span>활동 {index + 1}</span>
                            <strong>{activity.title}</strong>
                          </div>
                          <em className={locked ? "is-locked" : completed ? "is-done" : ""}>{locked ? "잠김" : completed ? "작성함" : "시작 전"}</em>
                        </header>
                        <div className="book-personal-card-body">
                          <DetailUrlSlot href={activityHref} label={activityLinkLabel} />
                          <label className="book-personal-response">
                            <span>{isTeacher ? "학생 답변" : "나의 답변"}</span>
                            <textarea
                              value={response}
                              readOnly={isTeacher || locked}
                              onChange={(event) => setDrafts((current) => ({ ...current, [activity.id]: event.target.value }))}
                              placeholder={locked ? "교사가 활동을 열면 입력할 수 있습니다." : isTeacher ? "아직 입력한 내용이 없습니다." : "선생님이 안내한 내용을 여기에 입력하세요."}
                            />
                          </label>
                        </div>
                        {isTeacher ? (
                          <footer>
                            <button
                              type="button"
                              className={locked ? "btn-primary" : "btn-outline"}
                              disabled={!onToggleActivityLock}
                              onClick={() => onToggleActivityLock(activity, !locked)}
                            >
                              {locked ? "활동 열기" : "활동 잠그기"}
                            </button>
                          </footer>
                        ) : !locked && (
                          <footer>
                            <button type="button" className="btn-primary" disabled={savingId === activity.id} onClick={() => saveResponse(activity)}>
                              {savingId === activity.id ? "저장 중..." : savedId === activity.id ? "저장됨" : failedId === activity.id ? "다시 저장" : "답변 저장"}
                            </button>
                          </footer>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="book-personal-dashboard" aria-label="참여자 개인 카드">
      <div className="book-dashboard-head">
        <div>
          <h2>개인 카드</h2>
          <p>{isTeacher ? "참여자의 활동 진행 상황" : "나의 책방 활동 공간"}</p>
        </div>
        <span>{participants.length}명</span>
      </div>

      {participants.length === 0 ? (
        <div className="book-dashboard-empty">참여자가 들어오면 개인 카드가 여기에 만들어집니다.</div>
      ) : (
        <div className="book-personal-grid">
          {participants.map((participant) => {
            const completed = progressByUser.get(participant.uid) ?? new Set();
            const isOwn = !isTeacher && participant.uid === user?.uid;
            const canOpen = isTeacher || isOwn;
            return (
              <article className={`book-personal-card${canOpen ? " is-openable" : ""}`} key={participant.uid}>
                <button type="button" className="book-personal-card-trigger" disabled={!canOpen} onClick={() => setSelectedUid(participant.uid)} aria-label={canOpen ? `${participantName(participant)} 개인 카드 열기` : undefined}>
                  <header>
                    <span className="book-personal-avatar" aria-hidden="true">{participant.emoji || "·"}</span>
                    <span>
                      <strong>{participantName(participant)}</strong>
                      <small>{participant.schoolName || "학교 미입력"}</small>
                    </span>
                    <em>{completed.size}/{activities.length}</em>
                  </header>
                  <div className="book-personal-progress" aria-label={`활동 ${completed.size}개 완료`}>
                    <span style={{ width: `${activities.length ? (completed.size / activities.length) * 100 : 0}%` }} />
                  </div>
                  <p className="book-personal-card-hint">{isTeacher ? "학생 진행 현황" : isOwn ? "내 활동 목록 열기" : activities.length ? "활동 진행 현황" : "새 활동 대기 중"}</p>
                </button>
              </article>
            );
          })}
        </div>
      )}

    </section>
  );
}
