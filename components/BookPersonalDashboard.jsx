"use client";

import { useEffect, useState } from "react";
import BookPersonalDetail from "./BookPersonalDetail";
import { STUDENT_PROGRESS_COLORS } from "./bookProgressItems";
import { ClassAverageProgress, PersonalProgressGroups, progressStepGroups } from "./BookProgressBars";
import { participantName } from "./BookPersonalDetailCards";
import { bookDetailSections, bookProjectItemCount } from "./bookProjectItems";
import { IconLock, IconUnlock } from "./StatusIcons";

function ProjectFlowOverview({ project, sections, itemCount, isTeacher, onToggleItemLock }) {
  const activityCount = sections.reduce((total, section) => total + section.activities.length, 0);
  const resourceCount = sections.reduce((total, section) => total + section.resources.length, 0);
  const sectionIdentity = sections.map((section) => section.id).join("|");
  const [openStepId, setOpenStepId] = useState(null);

  useEffect(() => {
    setOpenStepId((current) => {
      const ids = sections.map((section) => section.id);
      return current && ids.includes(current) ? current : null;
    });
  }, [sectionIdentity]);

  function setStepOpen(stepId, open) {
    setOpenStepId((current) => (open ? stepId : current === stepId ? null : current));
  }

  if (sections.length === 0) return null;

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
          <details
            className="book-project-flow-step"
            key={section.id}
            open={openStepId === section.id}
            onToggle={(event) => setStepOpen(section.id, event.currentTarget.open)}
          >
            <summary className="book-project-flow-step-head">
              <span>
                <small>STEP {stepIndex + 1}</small>
                <strong>{section.title}</strong>
              </span>
              <em>{section.activities.length} 활동 · {section.resources.length} 자료</em>
              <b aria-hidden="true">+</b>
            </summary>
            <div className="book-project-flow-items">
              {section.items.map((item, itemIndex) => {
                const isActivity = item.kind === "activity";
                const locked = isActivity && item.source?.locked === true;
                const Tag = isActivity && isTeacher && onToggleItemLock ? "button" : "span";
                return (
                  <Tag
                    type={Tag === "button" ? "button" : undefined}
                    className={`book-project-flow-pill book-project-flow-pill--${item.kind}${locked ? " is-locked" : ""}`}
                    key={`${item.kind}:${item.id}`}
                    title={item.title}
                    aria-label={Tag === "button" ? `${item.title} ${locked ? "잠금 해제" : "잠그기"}` : undefined}
                    onClick={Tag === "button" ? () => onToggleItemLock(item, !locked) : undefined}
                  >
                    <b>{isActivity ? "A" : "R"}{itemIndex + 1}</b>
                    <em>{item.title}</em>
                    {isActivity && (
                      <i aria-label={locked ? "잠김" : "열림"}>
                        {locked ? <IconLock size={15} /> : <IconUnlock size={15} />}
                      </i>
                    )}
                  </Tag>
                );
              })}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

export default function BookPersonalDashboard({ participants, activities, sections: preparedSections = null, project = null, entriesByActivity = {}, progressByUser, user, isTeacher, onToggleActivityLock, onToggleProjectItemLock, onConfirmItem, saveDashboardText }) {
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
          <ProjectFlowOverview
            project={project}
            sections={sections}
            itemCount={itemCount}
            isTeacher={isTeacher}
            onToggleItemLock={onToggleProjectItemLock}
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
      <ProjectFlowOverview
        project={project}
        sections={sections}
        itemCount={itemCount}
        isTeacher={isTeacher}
        onToggleItemLock={onToggleProjectItemLock}
      />

      <div className="book-dashboard-head">
        <div className="book-dashboard-head-copy">
          <h2>개인 카드</h2>
          <p>{isTeacher ? "참여자의 활동 진행 상황" : "나의 개발자실 활동 공간"}</p>
        </div>
        <ClassAverageProgress
          sections={sections}
          participants={participants}
          progressByUser={progressByUser}
          isTeacher={isTeacher}
        />
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
