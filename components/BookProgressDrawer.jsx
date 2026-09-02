"use client";

import { bookConfirmationKey } from "@/lib/bookConfirmations";

function drawerItemState(confirmedCount, totalCount) {
  if (totalCount > 0 && confirmedCount === totalCount) return "is-all";
  if (confirmedCount >= Math.ceil(totalCount / 2) && confirmedCount > 0) return "is-many";
  if (confirmedCount > 0) return "is-some";
  return "is-none";
}

function confirmedStudents(participants, confirmationsByUser, item) {
  const key = bookConfirmationKey(item.kind, item.id);
  return participants.filter((participant) => confirmationsByUser.get(participant.uid)?.has(key));
}

export default function BookProgressDrawer({ sections, participants, confirmationsByUser, collapsed, onToggle }) {
  const totalItems = sections.reduce((sum, section) => sum + section.items.length, 0);
  const totalChecks = totalItems * participants.length;
  const confirmedChecks = sections.reduce((sum, section) => (
    sum + section.items.reduce((itemSum, item) => (
      itemSum + confirmedStudents(participants, confirmationsByUser, item).length
    ), 0)
  ), 0);

  return (
    <aside className={`book-progress-drawer${collapsed ? " is-collapsed" : ""}`} aria-label="학생 확인 진척도">
      <button
        type="button"
        className="book-progress-toggle"
        onClick={onToggle}
        aria-expanded={!collapsed}
        title={collapsed ? "진척도 펼치기" : "진척도 접기"}
      >
        <span aria-hidden="true">{collapsed ? "«" : "»"}</span>
        <strong>{collapsed ? "진척도" : "접기"}</strong>
      </button>

      <div className="book-progress-content" aria-hidden={collapsed ? "true" : undefined}>
        <header className="book-progress-head">
          <div>
            <span>학생 확인</span>
            <h2>진척도</h2>
          </div>
          <strong>{totalChecks ? Math.round((confirmedChecks / totalChecks) * 100) : 0}%</strong>
        </header>

        {sections.length === 0 ? (
          <p className="book-progress-empty">표시할 활동과 자료가 없습니다.</p>
        ) : (
          <div className="book-progress-steps">
            {sections.map((section, sectionIndex) => (
              <section className="book-progress-step" key={section.id}>
                <header>
                  <span>STEP {sectionIndex + 1}</span>
                  <strong>{section.title}</strong>
                </header>
                <div className="book-progress-items">
                  {section.items.map((item) => {
                    const students = confirmedStudents(participants, confirmationsByUser, item);
                    const state = drawerItemState(students.length, participants.length);
                    const studentNames = students.map((student) => student.name || student.realName || student.displayName).filter(Boolean).join(", ");
                    return (
                      <article
                        className={`book-progress-item ${state}`}
                        key={`${item.kind}:${item.id}`}
                        title={studentNames || "아직 확인한 학생이 없습니다"}
                      >
                        <span>{item.kind === "activity" ? "활동" : "자료"}</span>
                        <strong>{item.title}</strong>
                        <em>{students.length}/{participants.length}</em>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
