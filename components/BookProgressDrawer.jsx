"use client";

import { bookConfirmationKey } from "@/lib/bookConfirmations";

const STUDENT_PROGRESS_COLORS = [
  "#bb6d52",
  "#b89a2d",
  "#9ca83a",
  "#5f9e64",
  "#279779",
  "#2c96a5",
  "#347fa8",
  "#6d62af",
  "#9b65aa",
  "#b75c7c",
];

function progressItems(sections) {
  return sections.flatMap((section, sectionIndex) => (
    section.items.map((item, itemIndex) => ({
      ...item,
      sectionId: section.id,
      sectionTitle: section.title,
      sectionIndex,
      itemIndex,
      key: bookConfirmationKey(item.kind, item.id),
    }))
  ));
}

function studentLabel(participant) {
  const name = participant.name || participant.realName || participant.displayName || "이름 미설정";
  return participant.studentId ? `${participant.studentId} ${name}` : name;
}

export default function BookProgressDrawer({ sections, participants, confirmationsByUser, collapsed, onToggle }) {
  const items = progressItems(sections);
  const totalItems = items.length;
  const totalChecks = totalItems * participants.length;
  const confirmedChecks = participants.reduce((sum, participant) => {
    const confirmed = confirmationsByUser.get(participant.uid) ?? new Set();
    return sum + items.filter((item) => confirmed.has(item.key)).length;
  }, 0);

  return (
    <aside className={`book-progress-drawer${collapsed ? " is-collapsed" : ""}`} aria-label="학생별 확인 진척도">
      <button
        type="button"
        className="book-progress-toggle"
        onClick={onToggle}
        aria-expanded={!collapsed}
        title={collapsed ? "진행 패널 펼치기" : "진행 패널 접기"}
      >
        <span aria-hidden="true">{collapsed ? "«" : "»"}</span>
        <strong>{collapsed ? "진행" : "접기"}</strong>
      </button>

      <div className="book-progress-content" aria-hidden={collapsed ? "true" : undefined}>
        <header className="book-progress-head">
          <div>
            <span>학생별 진행</span>
            <h2>전체 {confirmedChecks} / {totalChecks || 0}</h2>
            <small>참여 {participants.length}명 기준</small>
          </div>
        </header>

        {totalItems === 0 ? (
          <p className="book-progress-empty">표시할 활동과 자료가 없습니다.</p>
        ) : participants.length === 0 ? (
          <p className="book-progress-empty">표시할 학생이 없습니다.</p>
        ) : (
          <div className="book-progress-roster">
            {participants.map((participant, participantIndex) => {
              const confirmed = confirmationsByUser.get(participant.uid) ?? new Set();
              const confirmedCount = items.filter((item) => confirmed.has(item.key)).length;
              const ratio = totalItems ? Math.round((confirmedCount / totalItems) * 100) : 0;
              const color = STUDENT_PROGRESS_COLORS[participantIndex % STUDENT_PROGRESS_COLORS.length];

              return (
                <article
                  className="book-progress-student"
                  key={participant.uid}
                  style={{ "--student-color": color }}
                >
                  <header className="book-progress-student-head">
                    <span className="book-progress-dot" aria-hidden="true" />
                    <strong>{studentLabel(participant)}</strong>
                    <em>{confirmedCount}/{totalItems}칸</em>
                  </header>
                  <div className="book-progress-student-bar" aria-hidden="true">
                    <span style={{ width: `${ratio}%` }} />
                  </div>
                  <ol className="book-progress-student-cells" aria-label={`${studentLabel(participant)} 확인 상태`}>
                    {items.map((item) => {
                      const checked = confirmed.has(item.key);
                      const title = `${item.sectionTitle} ${item.kind === "activity" ? "활동" : "자료"} ${item.itemIndex + 1}: ${item.title}`;
                      return (
                        <li
                          className={`book-progress-student-cell${checked ? " is-filled" : ""}${item.itemIndex === 0 && item.sectionIndex > 0 ? " is-step-start" : ""}`}
                          key={`${participant.uid}:${item.kind}:${item.id}`}
                          title={`${title}\n${checked ? "확인함" : "미확인"}`}
                          aria-label={`${title}, ${checked ? "확인함" : "미확인"}`}
                        />
                      );
                    })}
                  </ol>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
