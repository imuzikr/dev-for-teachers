"use client";

import { progressItems } from "./bookProgressItems";

export function progressStepGroups(sections) {
  const items = progressItems(sections);
  return sections.slice(0, 3).map((section, stepIndex) => ({
    section,
    stepIndex,
    items: items.filter((item) => item.sectionId === section.id).slice(0, 7),
  }));
}

export function ClassAverageProgress({ sections, participants, progressByUser, isTeacher }) {
  const stepGroups = progressStepGroups(sections);
  const visibleItemCount = stepGroups.reduce((total, group) => total + group.items.length, 0);
  const label = isTeacher ? "전체 평균 확인 상태" : "나의 전체 확인 상태";

  if (stepGroups.length === 0 || participants.length === 0) return null;

  return (
    <div className="book-dashboard-average-progress" aria-label={`${label}: ${visibleItemCount}개 항목, ${participants.length}명 기준`}>
      {stepGroups.map(({ section, stepIndex, items: groupItems }) => (
        <ol className={`book-dashboard-average-step${groupItems.length === 0 ? " is-empty" : ""}`} key={section.id} aria-label={`STEP ${stepIndex + 1} ${section.title} ${isTeacher ? "평균" : "나의"} 확인 상태`}>
          {groupItems.length === 0 ? (
            <li className="book-dashboard-average-empty" aria-label={`STEP ${stepIndex + 1} ${section.title}: 항목 없음`} />
          ) : (
            groupItems.map((item) => {
              const completedCount = participants.reduce((total, participant) => {
                const completed = progressByUser.get(participant.uid);
                return total + (completed?.has(item.key) ? 1 : 0);
              }, 0);
              const title = `STEP ${stepIndex + 1} ${item.kind === "activity" ? "활동" : "자료"} ${item.itemIndex + 1}: ${completedCount}/${participants.length} 확인`;
              return (
                <li
                  className="book-dashboard-average-cell"
                  key={`${item.kind}:${item.id}`}
                  title={title}
                  aria-label={title}
                >
                  <span style={{ width: `${(completedCount / participants.length) * 100}%` }} />
                </li>
              );
            })
          )}
        </ol>
      ))}
    </div>
  );
}

export function PersonalProgressGroups({ groups, completed, participantLabel }) {
  return (
    <div className="book-personal-progress-groups" aria-label={`${participantLabel} 확인 상태`}>
      {groups.map(({ section, stepIndex, items: groupItems }) => (
        <ol
          className={`book-personal-progress-cells step-${Math.min(stepIndex + 1, 3)}${groupItems.length === 0 ? " is-empty" : ""}`}
          key={section.id}
          aria-label={`STEP ${stepIndex + 1} ${section.title} 확인 상태`}
        >
          {groupItems.length === 0 ? (
            <li className="book-personal-progress-empty" aria-label={`STEP ${stepIndex + 1} ${section.title}: 항목 없음`} />
          ) : (
            groupItems.map((item) => {
              const checked = completed.has(item.key);
              const title = `${item.sectionTitle} ${item.kind === "activity" ? "활동" : "자료"} ${item.itemIndex + 1}: ${item.title}`;
              return (
                <li
                  className={`book-personal-progress-cell${checked ? " is-filled" : ""}`}
                  key={`${item.kind}:${item.id}`}
                  title={`${title}\n${checked ? "확인함" : "미확인"}`}
                  aria-label={`${title}, ${checked ? "확인함" : "미확인"}`}
                />
              );
            })
          )}
        </ol>
      ))}
    </div>
  );
}
