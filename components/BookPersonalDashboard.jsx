"use client";

import { useState } from "react";
import { backdropClose } from "@/lib/modal";

function participantName(participant) {
  return participant.name || participant.realName || participant.displayName || "이름 미설정";
}

export default function BookPersonalDashboard({ participants, activities, progressByUser, user, isTeacher, onOpen }) {
  const [selectedUid, setSelectedUid] = useState(null);
  const selected = participants.find((participant) => participant.uid === selectedUid) ?? null;
  const selectedProgress = selected ? progressByUser.get(selected.uid) ?? new Set() : new Set();

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
            return (
              <article className={`book-personal-card${isOwn ? " is-openable" : ""}`} key={participant.uid}>
                <button type="button" className="book-personal-card-trigger" disabled={!isOwn} onClick={() => setSelectedUid(participant.uid)} aria-label={isOwn ? `${participantName(participant)} 개인 카드 열기` : undefined}>
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
                  <p className="book-personal-card-hint">{isOwn ? "내 활동 목록 열기" : activities.length ? "활동 진행 현황" : "새 활동 대기 중"}</p>
                </button>
              </article>
            );
          })}
        </div>
      )}

      {selected && (
        <div className="modal-backdrop" {...backdropClose(() => setSelectedUid(null))}>
          <section className="modal book-personal-modal" role="dialog" aria-modal="true" aria-labelledby="book-personal-modal-title" onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <div>
                <span>나의 책방 활동</span>
                <h3 id="book-personal-modal-title">{participantName(selected)}</h3>
                <p>{selected.schoolName || "학교 미입력"} · {selectedProgress.size}/{activities.length} 완료</p>
              </div>
              <button type="button" className="btn-close" onClick={() => setSelectedUid(null)} aria-label="닫기">×</button>
            </header>
            <div className="book-personal-modal-list">
              {activities.length === 0 ? (
                <p className="book-personal-empty">선생님이 활동을 준비하고 있습니다.</p>
              ) : activities.map((activity, index) => {
                const completed = selectedProgress.has(activity.id);
                return (
                  <article className="book-personal-activity-card" key={activity.id}>
                    <div>
                      <span>활동 {index + 1}</span>
                      <strong>{activity.title}</strong>
                      {activity.topic && <p>{activity.topic}</p>}
                    </div>
                    <footer>
                      <em className={completed ? "is-done" : ""}>{completed ? "작성함" : "시작 전"}</em>
                      <button type="button" className="btn-primary" onClick={() => onOpen(activity)}>{completed ? "다시 열기" : "활동 시작"}</button>
                    </footer>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
