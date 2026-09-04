"use client";

import { useState } from "react";
import BookPersonalDetail from "./BookPersonalDetail";
import { participantName } from "./BookPersonalDetailCards";
import { bookDetailSections, bookProjectItemCount } from "./bookProjectItems";

function ProjectFlowOverview({ project, sections, itemCount }) {
  if (sections.length === 0) return null;

  const activityCount = sections.reduce((total, section) => total + section.activities.length, 0);
  const resourceCount = sections.reduce((total, section) => total + section.resources.length, 0);

  return (
    <section className="book-project-flow-overview" aria-label="전체 프로젝트 구성">
      <header>
        <div>
          <span>전체 프로젝트 구성</span>
          <strong>{project?.title || "프로젝트 흐름"}</strong>
        </div>
        <div className="book-project-flow-summary" aria-label={`${sections.length}개 Step, 전체 ${itemCount}개 항목, ${activityCount}개 활동, ${resourceCount}개 자료`}>
          <span>{sections.length} Steps</span>
          <span>{itemCount} 항목</span>
          <span>{activityCount} 활동</span>
          <span>{resourceCount} 자료</span>
        </div>
      </header>
      <div className="book-project-flow-track">
        {sections.map((section, stepIndex) => (
          <article className="book-project-flow-step" key={section.id}>
            <div className="book-project-flow-step-head">
              <span>STEP {stepIndex + 1}</span>
              <strong>{section.title}</strong>
              <small>{section.activities.length} 활동 · {section.resources.length} 자료</small>
            </div>
            <div className="book-project-flow-items">
              {section.items.map((item, itemIndex) => {
                const locked = item.kind === "activity" && item.source?.locked;
                return (
                  <span
                    className={`book-project-flow-pill book-project-flow-pill--${item.kind}${locked ? " is-locked" : ""}`}
                    key={`${item.kind}:${item.id}`}
                    title={item.title}
                  >
                    <b>{item.kind === "activity" ? "A" : "R"}{itemIndex + 1}</b>
                    <em>{item.title}</em>
                    {locked && <i>잠김</i>}
                  </span>
                );
              })}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function BookPersonalDashboard({ participants, activities, sections: preparedSections = null, project = null, entriesByActivity = {}, progressByUser, user, isTeacher, onToggleActivityLock, onConfirmItem, saveDashboardText }) {
  const [selectedUid, setSelectedUid] = useState(null);
  const selected = participants.find((participant) => participant.uid === selectedUid) ?? null;
  const selectedProgress = selected ? progressByUser.get(selected.uid) ?? new Set() : new Set();
  const sections = preparedSections ?? bookDetailSections(project, activities);
  const itemCount = bookProjectItemCount(sections);

  if (selected) {
    return (
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
    );
  }

  return (
    <section className="book-personal-dashboard" aria-label="참여자 개인 카드">
      <ProjectFlowOverview project={project} sections={sections} itemCount={itemCount} />

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
                    <em>{completed.size}/{itemCount}</em>
                  </header>
                  <div className="book-personal-progress" aria-label={`활동과 자료 ${completed.size}개 확인`}>
                    <span style={{ width: `${itemCount ? (completed.size / itemCount) * 100 : 0}%` }} />
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
