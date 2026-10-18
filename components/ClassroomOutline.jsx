"use client";

import { IconBook, IconPen, IconCheckSquare } from "./StatusIcons";

export default function ClassroomOutline({ sections, stepId, itemKey, completed = new Set(), onSelect, onOverview }) {
  return <nav className="classroom-outline" aria-label="STEP과 활동 목록">
    <div className="classroom-outline-title"><strong>수업 차례</strong><span>{sections.length} STEPS</span></div>
    {sections.length === 0 && <p className="classroom-empty">아직 준비된 STEP이 없습니다.</p>}
    {sections.map((section, index) => <section className="classroom-outline-group" key={section.id}>
      <button type="button" className={`classroom-step-trigger${stepId === section.id && !itemKey ? " is-selected" : ""}`} aria-current={stepId === section.id && !itemKey ? "step" : undefined} onClick={() => onOverview(section.id)}>
        <small>STEP {String(index + 1).padStart(2, "0")}</small><strong>{section.title}</strong><span>{section.items.length}개 항목</span>
      </button>
      {section.items.map((item, itemIndex) => {
        const key = `${item.kind}:${item.id}`;
        const done = completed.has(key);
        return <button type="button" key={key} className={`classroom-outline-item${stepId === section.id && itemKey === key ? " is-selected" : ""}`} aria-current={stepId === section.id && itemKey === key ? "page" : undefined} onClick={() => onSelect(section.id, key)}>
          <span className={`classroom-item-symbol is-${item.kind}`} aria-hidden="true">{item.kind === "resource" ? <IconBook size={16} /> : <IconPen size={16} />}</span>
          <span><strong>{item.title}</strong><small>{itemIndex + 1}. {item.kind === "resource" ? "자료" : "활동"}</small></span>
          {done && <span className="classroom-item-done" aria-label="확인 완료"><IconCheckSquare size={16} checked /></span>}
        </button>;
      })}
    </section>)}
  </nav>;
}
