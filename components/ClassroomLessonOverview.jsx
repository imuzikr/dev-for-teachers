"use client";

export default function ClassroomLessonOverview({ section, index, onSelect, renderAddItem, itemKey }) {
  if (!section) return <div className="classroom-empty">선생님이 수업을 준비하고 있습니다.</div>;
  return <article className="classroom-lesson-overview">
    <header className="classroom-lesson-banner"><small>STEP {index + 1}</small><h2>{section.title}</h2><p>이 차시의 목표와 진행 순서</p></header>
    <section className="classroom-step-description" aria-label="STEP 안내"><h3>학습 안내</h3>{section.description ? <p>{section.description}</p> : <p className="classroom-muted">아래 활동과 자료를 순서대로 살펴보세요.</p>}</section>
    <section className="classroom-overview-items"><h3>진행 순서</h3>
      {section.items.length === 0 && <p className="classroom-muted">등록된 활동이나 자료가 없습니다.</p>}
      {section.items.map((item, itemIndex) => <button type="button" className={`classroom-overview-row${itemKey === `${item.kind}:${item.id}` ? " is-selected" : ""}`} aria-current={itemKey === `${item.kind}:${item.id}` ? "page" : undefined} key={`${item.kind}:${item.id}`} onClick={() => onSelect(section.id, `${item.kind}:${item.id}`)}><span>{String(itemIndex + 1).padStart(2, "0")}</span><strong>{item.title}</strong><small>{item.kind === "resource" ? "자료" : "활동"}</small><span aria-hidden="true">→</span></button>)}
      {renderAddItem?.(section.id)}
    </section>
  </article>;
}
