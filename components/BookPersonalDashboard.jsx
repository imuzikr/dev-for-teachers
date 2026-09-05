"use client";

import { useState } from "react";
import BookPersonalDetail from "./BookPersonalDetail";
import BookProjectFlowOverview from "./BookProjectFlowOverview";
import { STUDENT_PROGRESS_COLORS } from "./bookProgressItems";
import { ClassAverageProgress, PersonalProgressGroups, progressStepGroups } from "./BookProgressBars";
import { participantName } from "./BookPersonalDetailCards";
import { bookDetailSections, bookProjectItemCount } from "./bookProjectItems";

export default function BookPersonalDashboard({ participants, activities, sections: preparedSections = null, project = null, entriesByActivity = {}, progressByUser, user, isTeacher, onToggleActivityLock, onToggleProjectItemLock, onConfirmItem, saveDashboardText, studentActiveStepId }) {
  const [selectedUid, setSelectedUid] = useState(null);
  const selected = participants.find((participant) => participant.uid === selectedUid) ?? null;
  const selectedProgress = selected ? progressByUser.get(selected.uid) ?? new Set() : new Set();
  const sections = preparedSections ?? bookDetailSections(project, activities);
  const itemCount = bookProjectItemCount(sections);
  const cardProgressGroups = progressStepGroups(sections);

  if (selected) {
    return (
      <>
        {isTeacher && (
          <BookProjectFlowOverview
            project={project}
            sections={sections}
            itemCount={itemCount}
            isTeacher={isTeacher}
            onToggleItemLock={onToggleProjectItemLock}
            studentActiveStepId={studentActiveStepId}
          />
        )}
        <BookPersonalDetail
          selected={selected}
          sections={sections}
          activities={activities}
          entriesByActivity={entriesByActivity}
          selectedProgress={selectedProgress}
          itemCount={itemCount}
          user={user}
          isTeacher={isTeacher}
          onBack={() => setSelectedUid(null)}
          onToggleActivityLock={onToggleActivityLock}
          onConfirmItem={onConfirmItem}
          saveDashboardText={saveDashboardText}
        />
      </>
    );
  }

  return (
    <section className="book-personal-dashboard" aria-label="참여자 개인 카드">
      <BookProjectFlowOverview
        project={project}
        sections={sections}
        itemCount={itemCount}
        isTeacher={isTeacher}
        onToggleItemLock={onToggleProjectItemLock}
        studentActiveStepId={studentActiveStepId}
      />

      <div className="book-dashboard-head">
        <div className="book-dashboard-head-copy">
          <h2>개인 카드</h2>
          <p>{isTeacher ? "참여자의 활동 진행 상황" : "나의 개발자실 활동 공간"}</p>
        </div>
        {isTeacher && (
          <ClassAverageProgress
            sections={sections}
            participants={participants}
            progressByUser={progressByUser}
            isTeacher={isTeacher}
          />
        )}
        <span>{participants.length}명</span>
      </div>

      {participants.length === 0 ? (
        <div className="book-dashboard-empty">참여자가 들어오면 개인 카드가 여기에 만들어집니다.</div>
      ) : (
        <div className="book-personal-grid">
          {participants.map((participant, participantIndex) => {
            const completed = progressByUser.get(participant.uid) ?? new Set();
            const isOwn = !isTeacher && participant.uid === user?.uid;
            const canOpen = isTeacher || isOwn;
            const studentColor = STUDENT_PROGRESS_COLORS[participantIndex % STUDENT_PROGRESS_COLORS.length];
            return (
              <article
                className={`book-personal-card${canOpen ? " is-openable" : ""}`}
                key={participant.uid}
                style={{ "--student-color": studentColor }}
              >
                <button type="button" className="book-personal-card-trigger" disabled={!canOpen} onClick={() => setSelectedUid(participant.uid)} aria-label={canOpen ? `${participantName(participant)} 개인 카드 열기` : undefined}>
                  <header>
                    <span className="book-personal-avatar" aria-hidden="true">{participant.emoji || "·"}</span>
                    <span>
                      <strong>{participantName(participant)}</strong>
                      <small>{participant.schoolName || "학교 미입력"}</small>
                    </span>
                    <em>{completed.size}/{itemCount}</em>
                  </header>
                  {cardProgressGroups.length > 0 ? (
                    <PersonalProgressGroups
                      groups={cardProgressGroups}
                      completed={completed}
                      participantLabel={participantName(participant)}
                    />
                  ) : (
                    <div className="book-personal-progress" aria-label={`활동과 자료 ${completed.size}개 확인`}>
                      <span style={{ width: `${itemCount ? (completed.size / itemCount) * 100 : 0}%` }} />
                    </div>
                  )}
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
