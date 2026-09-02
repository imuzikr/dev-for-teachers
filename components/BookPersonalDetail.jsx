"use client";

import { useEffect, useState } from "react";
import { bookConfirmationKey } from "@/lib/bookConfirmations";
import { saveBookDashboardText } from "@/lib/store";
import { BookPersonalActivityCard, BookPersonalResourceCard, dashboardText, participantEntry, participantName } from "./BookPersonalDetailCards";

export default function BookPersonalDetail({
  selected,
  sections,
  activities,
  entriesByActivity,
  selectedProgress,
  itemCount,
  user,
  isTeacher,
  onBack,
  onToggleActivityLock,
  onConfirmItem,
  saveDashboardText = saveBookDashboardText,
}) {
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [savedId, setSavedId] = useState(null);
  const [failedId, setFailedId] = useState(null);
  const [confirmingKey, setConfirmingKey] = useState(null);
  const [confirmFailedKey, setConfirmFailedKey] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    setDrafts(Object.fromEntries(activities.map((activity) => [
      activity.id,
      dashboardText(participantEntry(entriesByActivity, activity.id, selected.uid)),
    ])));
  }, [activities, entriesByActivity, selected.uid]);

  async function saveResponse(detailItem) {
    const activity = detailItem.source;
    setSavingId(activity.id);
    setSavedId(null);
    setFailedId(null);
    try {
      await saveDashboardText(activity.id, user, drafts[activity.id] ?? "");
      await onConfirmItem?.(detailItem);
      setSavedId(activity.id);
    } catch {
      setFailedId(activity.id);
    } finally {
      setSavingId(null);
    }
  }

  async function confirmItem(item) {
    const key = bookConfirmationKey(item.kind, item.id);
    setConfirmingKey(key);
    setConfirmFailedKey(null);
    try {
      await onConfirmItem?.(item);
    } catch {
      setConfirmFailedKey(key);
    } finally {
      setConfirmingKey(null);
    }
  }

  async function copyResource(resource) {
    const text = [resource.title, resource.content, resource.url].filter(Boolean).join("\n");
    await navigator.clipboard.writeText(text);
    setCopiedId(resource.id);
    window.setTimeout(() => setCopiedId(null), 1600);
  }

  return (
    <section className="book-personal-dashboard book-personal-detail" aria-label={isTeacher ? "참여자 활동 대시보드" : "나의 활동 대시보드"}>
      <header className="book-personal-detail-head">
        <button type="button" className="btn-outline" onClick={onBack}>← 개인 카드</button>
        <div>
          <span>{isTeacher ? "참여자 활동" : "나의 책방"}</span>
          <h2>{participantName(selected)} 활동 대시보드</h2>
          <p>{selected.schoolName || "학교 미입력"} · {selectedProgress.size}/{itemCount} 확인</p>
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
                {section.items.map((detailItem, index) => (
                  detailItem.kind === "resource"
                    ? (
                      <BookPersonalResourceCard
                        key={`resource:${detailItem.id ?? `${section.id}-${index}`}`}
                        detailItem={detailItem}
                        index={index}
                        isTeacher={isTeacher}
                        selectedProgress={selectedProgress}
                        copiedId={copiedId}
                        confirmState={{ pendingKey: confirmingKey, failedKey: confirmFailedKey }}
                        onCopy={copyResource}
                        onConfirm={onConfirmItem ? confirmItem : null}
                      />
                    ) : (
                      <BookPersonalActivityCard
                        key={`activity:${detailItem.id}`}
                        detailItem={detailItem}
                        index={index}
                        response={isTeacher ? dashboardText(participantEntry(entriesByActivity, detailItem.id, selected.uid)) : drafts[detailItem.id] ?? ""}
                        isTeacher={isTeacher}
                        selectedProgress={selectedProgress}
                        saveState={{ savingId, savedId, failedId }}
                        confirmState={{ pendingKey: confirmingKey, failedKey: confirmFailedKey }}
                        onDraftChange={setDrafts}
                        onSave={saveResponse}
                        onToggleActivityLock={onToggleActivityLock}
                        onConfirm={onConfirmItem ? confirmItem : null}
                      />
                    )
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
