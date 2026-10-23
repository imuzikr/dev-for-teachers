"use client";

import { useId, useRef, useState } from "react";
import { IconBook, IconPen, IconCheckSquare } from "./StatusIcons";

export default function ClassroomOutline({ sections, stepId, itemKey, completed = new Set(), showItems = true, onSelect, onOverview, onEditItem, onReorderItem, reorderDisabled = false, reorderError }) {
  const [editing, setEditing] = useState(false);
  const [openSteps, setOpenSteps] = useState(new Set());
  const [dropKey, setDropKey] = useState(null);
  const drag = useRef(null);
  const panelId = useId();
  const canEdit = !showItems && Boolean(onEditItem);
  const editMode = canEdit && editing;
  function toggleStep(id) {
    setOpenSteps(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  return <nav className="classroom-outline" aria-label={showItems ? "STEP과 활동 목록" : "STEP 목록"}>
    <div className="classroom-outline-title"><strong>수업 차례</strong><span>{sections.length} STEPS</span>{canEdit && <button type="button" className="classroom-outline-edit" aria-pressed={editMode} onClick={() => { setEditing(!editing); drag.current = null; setDropKey(null); }}>{editMode ? "편집 완료" : "편집"}</button>}</div>
    {editMode && <p className="classroom-outline-edit-hint">STEP을 펼친 뒤 항목을 클릭해 편집하세요. 드래그 또는 Alt + 방향키로 바꾼 순서는 바로 저장됩니다.</p>}
    {editMode && reorderDisabled && <p role="status" className="classroom-outline-edit-hint">순서 변경을 준비하거나 저장하고 있습니다.</p>}
    {editMode && reorderError && <p role="alert" className="book-project-error">{reorderError}</p>}
    {sections.length === 0 && <p className="classroom-empty">아직 준비된 STEP이 없습니다.</p>}
    {sections.map((section, index) => <section className="classroom-outline-group" key={section.id}>
      <button type="button" className={`classroom-step-trigger${stepId === section.id && (!showItems || !itemKey) ? " is-selected" : ""}`} aria-current={stepId === section.id && (!showItems || !itemKey) ? "step" : undefined} aria-expanded={editMode ? openSteps.has(section.id) : undefined} aria-controls={editMode ? `${panelId}-${section.id}` : undefined} onClick={() => editMode ? toggleStep(section.id) : onOverview(section.id)}>
        <small>STEP {String(index + 1).padStart(2, "0")}</small><strong>{section.title}</strong>{(showItems || editMode) && <span>{section.items.length}개 항목{editMode ? openSteps.has(section.id) ? " · 접기" : " · 펼치기" : ""}</span>}
      </button>
      {(showItems || editMode) && <div id={`${panelId}-${section.id}`} hidden={editMode && !openSteps.has(section.id)} className={editMode ? "classroom-outline-edit-items" : undefined}>
      {editMode && section.items.length === 0 && <p className="classroom-empty">등록된 활동과 자료가 없습니다.</p>}
      {section.items.map((item, itemIndex) => {
        const key = `${item.kind}:${item.id}`;
        const done = completed.has(key);
        return <button type="button" key={key} className={`classroom-outline-item${stepId === section.id && itemKey === key ? " is-selected" : ""}${dropKey === `${section.id}:${key}` ? " is-drop-target" : ""}`} aria-current={stepId === section.id && itemKey === key ? "page" : undefined} disabled={editMode && reorderDisabled} draggable={editMode && Boolean(onReorderItem) && !reorderDisabled}
          onDragStart={event => {
            if (!editMode || reorderDisabled || !onReorderItem) { event.preventDefault(); return; }
            drag.current = { sectionId: section.id, key };
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", key);
          }}
          onDragOver={event => {
            if (!editMode || reorderDisabled || drag.current?.sectionId !== section.id || drag.current.key === key) return;
            event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropKey(`${section.id}:${key}`);
          }}
          onDrop={event => {
            event.preventDefault();
            const source = drag.current?.sectionId === section.id ? section.items.find(row => `${row.kind}:${row.id}` === drag.current.key) : null;
            drag.current = null; setDropKey(null);
            if (editMode && !reorderDisabled && source && source !== item) onReorderItem?.({ ...source, stepId: section.id }, { ...item, stepId: section.id });
          }}
          onDragEnd={() => { drag.current = null; setDropKey(null); }}
          onKeyDown={event => {
            const direction = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[event.key];
            if (!editMode || reorderDisabled || !onReorderItem || !event.altKey || !direction) return;
            event.preventDefault(); onReorderItem({ ...item, stepId: section.id }, direction);
          }}
          onClick={() => editMode ? onEditItem({ ...item, stepId: section.id }) : onSelect(section.id, key)}>
          <span className={`classroom-item-symbol is-${item.kind}`} aria-hidden="true">{item.kind === "resource" ? <IconBook size={16} /> : <IconPen size={16} />}</span>
          <span><strong>{item.title}</strong><small>{itemIndex + 1}. {item.kind === "resource" ? "자료" : "활동"}</small></span>
          {done && <span className="classroom-item-done" aria-label="확인 완료"><IconCheckSquare size={16} checked /></span>}
          {editMode && <span className="classroom-outline-edit-label">편집</span>}
        </button>;
      })}</div>}
    </section>)}
  </nav>;
}
