"use client";

import { useEffect, useMemo, useState } from "react";
import { subscribeBookEntries, subscribeMyBookEntry } from "@/lib/store";
import { IconBook, IconLock, IconTrash } from "./StatusIcons";
import ClassEntry from "./ClassEntry";

function participantName(participant) {
  return participant.name || participant.realName || participant.displayName || "이름 미설정";
}

function activityDate(activity) {
  const value = activity?.createdAt;
  const date = typeof value?.toDate === "function" ? value.toDate() : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "날짜 없음";
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" }).format(date);
}

export default function BookWorkspace({
  activities,
  participants,
  user,
  isTeacher,
  hasClass,
  onAdd,
  onOpen,
  onDelete,
  onToggleLock,
}) {
  const [entriesByActivity, setEntriesByActivity] = useState({});

  useEffect(() => {
    if (!user?.uid || activities.length === 0) {
      setEntriesByActivity({});
      return;
    }
    const unsubscribers = activities.map((activity) => {
      const update = (entries) => {
        const list = Array.isArray(entries) ? entries : entries ? [entries] : [];
        setEntriesByActivity((current) => ({ ...current, [activity.id]: list }));
      };
      return isTeacher
        ? subscribeBookEntries(activity.id, update)
        : subscribeMyBookEntry(activity.id, user.uid, update);
    });
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [activities, isTeacher, user?.uid]);

  const progressByUser = useMemo(() => {
    const progress = new Map(participants.map((participant) => [participant.uid, new Set()]));
    activities.forEach((activity) => {
      (entriesByActivity[activity.id] ?? []).forEach((entry) => {
        if (progress.has(entry.authorId)) progress.get(entry.authorId).add(activity.id);
      });
    });
    return progress;
  }, [activities, entriesByActivity, participants]);

  return (
    <div className="book-library-layout">
      <aside className="book-library-side" aria-label="선생님이 준비한 활동과 자료">
        <div className="book-library-title">
          <div>
            <h2>활동 · 자료</h2>
            <p>선생님이 준비한 책방 활동</p>
          </div>
          {isTeacher && hasClass && (
            <button type="button" className="btn-primary book-add-icon" onClick={onAdd} title="활동 추가">
              +
            </button>
          )}
        </div>

        {!hasClass && !isTeacher ? (
          <ClassEntry compact title="책방에 참여하기" />
        ) : activities.length === 0 ? (
          <div className="book-library-empty">
            {isTeacher ? "아직 준비한 활동이 없습니다." : "선생님이 활동을 준비하고 있습니다."}
          </div>
        ) : (
          <div className="book-resource-list">
            {activities.map((activity) => (
              <article className="book-resource-card" key={activity.id}>
                <button type="button" className="book-resource-open" onClick={() => onOpen(activity)}>
                  <span className="book-resource-icon"><IconBook size={18} /></span>
                  <span className="book-resource-copy">
                    <strong>{activity.title}</strong>
                    <small>{activity.topic || "주제 미정"}</small>
                    <em>{activityDate(activity)}{activity.locked ? " · 잠김" : ""}</em>
                  </span>
                </button>
                {isTeacher && (
                  <div className="book-resource-actions">
                    <button type="button" className="btn-ghost" onClick={() => onToggleLock(activity)} title={activity.locked ? "잠금 해제" : "잠그기"}>
                      <IconLock size={15} />
                    </button>
                    <button type="button" className="btn-ghost role-danger-btn" onClick={() => onDelete(activity)} title="삭제">
                      <IconTrash size={15} />
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </aside>

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
              return (
                <article className="book-personal-card" key={participant.uid}>
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
                  {activities.length === 0 ? (
                    <p className="book-personal-empty">새 활동을 기다리고 있습니다.</p>
                  ) : (
                    <div className="book-personal-activities">
                      {activities.map((activity) => (
                        <button type="button" key={activity.id} onClick={() => onOpen(activity)}>
                          <span>{activity.title}</span>
                          <em className={completed.has(activity.id) ? "is-done" : ""}>
                            {completed.has(activity.id) ? "작성함" : "시작 전"}
                          </em>
                        </button>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
