"use client";

import { useId, useState } from "react";
import { HelpSectionBody } from "./BookHelpSections";

export default function ClassroomHelpReader({ sections = [] }) {
  const [selectedId, setSelectedId] = useState(null);
  const answerId = useId();
  const selected = sections.find((section) => section.id === selectedId);

  if (sections.length === 0) {
    return <p className="classroom-help-empty">아직 등록된 도움 글 항목이 없습니다.</p>;
  }

  return <div className="classroom-help-reader">
    <nav className="classroom-help-questions" aria-label="도움 글 질문 목록">
      {sections.map((section, index) => <button
        type="button"
        key={section.id}
        className={`classroom-help-question${section.id === selectedId ? " is-selected" : ""}`}
        aria-pressed={section.id === selectedId}
        aria-controls={answerId}
        onClick={() => setSelectedId(section.id)}
      >
        <span aria-hidden="true">{index + 1}</span>
        <strong>{section.title || "제목 없는 항목"}</strong>
      </button>)}
    </nav>
    <section id={answerId} className="classroom-help-answer" aria-label="선택한 도움 글 답변" aria-live="polite">
      {selected ? <>
        <h4>{selected.title || "제목 없는 항목"}</h4>
        <HelpSectionBody section={selected} expanded />
      </> : <p className="classroom-help-prompt">질문을 선택하면 답변이 표시됩니다.</p>}
    </section>
  </div>;
}
