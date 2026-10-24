"use client";

import { useId, useRef, useState } from "react";
import { IconBook, IconPen, IconCheckSquare, IconTrash } from "./StatusIcons";

export default function ClassroomOutline({ sections, stepId, itemKey, completed = new Set(), showItems = true, onSelect, onOverview, onEditItem, onReorderItem, onEditStep, onReorderStep, onDeleteStep, reorderDisabled = false, reorderError }) {
  const [editing, setEditing] = useState(false);
  const [openSteps, setOpenSteps] = useState(new Set());
  const [dropKey, setDropKey] = useState(null);
  const drag = useRef(null);
  const panelId = useId();
  const canEdit = !showItems && Boolean(onEditItem || onEditStep);
  const editMode = canEdit && editing;
  function toggleStep(id) {
    setOpenSteps(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function draggedItem() {
    const sourceSection = sections.find(section => section.id === drag.current?.sectionId);
    const source = sourceSection?.items.find(item => `${item.kind}:${item.id}` === drag.current?.key);
    return source ? { ...source, stepId: sourceSection.id } : null;
  }
  function over(event, section, item = null) {
    if (!editMode || reorderDisabled || !onReorderItem || !drag.current) return;
    event.preventDefault(); event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    if (drag.current.type === "step") { setDropKey(`${section.id}:step`); return; }
    setDropKey(`${section.id}:${item ? `${item.kind}:${item.id}` : "end"}`);
  }
  function drop(event, section, target = null) {
    event.preventDefault(); event.stopPropagation();
    if (drag.current?.type === "step") {
      const id = drag.current.sectionId;
      drag.current = null; setDropKey(null);
      if (editMode && !reorderDisabled) onReorderStep?.(id, section.id);
      return;
    }
    const source = draggedItem();
    drag.current = null; setDropKey(null);
    if (!editMode || reorderDisabled || !onReorderItem || !source) return;
    const destination = source.stepId !== section.id ? { stepId: section.id } : target ?? section.items.at(-1);
    if (!destination) return;
    onReorderItem(source, { ...destination, stepId: section.id });
    setOpenSteps(current => new Set([...current, section.id]));
  }
  return <nav className="classroom-outline" aria-label={showItems ? "STEP과 활동 목록" : "STEP 목록"}>
    <div className="classroom-outline-title"><strong>수업 차례</strong><span>{sections.length} STEPS</span>{canEdit && <button type="button" className="classroom-outline-edit" aria-pressed={editMode} onClick={() => { setEditing(!editing); drag.current = null; setDropKey(null); }}>{editMode ? "편집 완료" : "편집"}</button>}</div>
    {editMode && <p className="classroom-outline-edit-hint">드래그로 순서를 바꾸고, 편집 버튼으로 내용을 수정하세요. 다른 STEP에 놓으면 맨 마지막으로 이동하며 바로 저장됩니다.</p>}
    {editMode && reorderDisabled && <p role="status" className="classroom-outline-edit-hint">변경 사항을 저장하고 있습니다.</p>}
    {editMode && reorderError && <p role="alert" className="book-project-error">{reorderError}</p>}
    {sections.length === 0 && <p className="classroom-empty">아직 준비된 STEP이 없습니다.</p>}
    {sections.map((section, index) => <section className={`classroom-outline-group${[`${section.id}:end`, `${section.id}:step`].includes(dropKey) ? " is-step-drop-target" : ""}`} key={section.id} onDragOver={event => over(event, section)} onDrop={event => drop(event, section)}>
      <div className="classroom-outline-step-head" data-outline-step={section.id} draggable={editMode && !!onReorderStep && !reorderDisabled}
        onDragStart={event => {
          if (!editMode || reorderDisabled || !onReorderStep || event.target.closest(".classroom-outline-step-actions")) { event.preventDefault(); return; }
          event.stopPropagation(); drag.current = { type: "step", sectionId: section.id };
          event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", section.id);
        }}
        onDragEnd={() => { drag.current = null; setDropKey(null); }}
        onKeyDown={event => {
          const direction = { ArrowUp: -1, ArrowDown: 1 }[event.key];
          if (editMode && !reorderDisabled && onReorderStep && event.altKey && direction) { event.preventDefault(); onReorderStep(section.id, direction); }
        }}>
      <button type="button" className={`classroom-step-trigger${stepId === section.id && (!showItems || !itemKey) ? " is-selected" : ""}`} aria-current={stepId === section.id && (!showItems || !itemKey) ? "step" : undefined} aria-expanded={editMode ? openSteps.has(section.id) : undefined} aria-controls={editMode ? `${panelId}-${section.id}` : undefined} onClick={() => editMode ? toggleStep(section.id) : onOverview(section.id)}>
        <small>STEP {String(index + 1).padStart(2, "0")}</small><strong>{section.title}</strong>{(showItems || editMode) && <span>{section.items.length}개 항목{editMode ? openSteps.has(section.id) ? " · 접기" : " · 펼치기" : ""}</span>}
      </button>
      {editMode && <div className="classroom-outline-step-actions">
        {onEditStep && <button type="button" aria-label={`${section.title} STEP 편집`} disabled={reorderDisabled} onClick={() => onEditStep(section.id)}>편집</button>}
        {onDeleteStep && <button type="button" aria-label={`${section.title} STEP 삭제`} title={sections.length <= 1 ? "마지막 STEP은 삭제할 수 없습니다." : "STEP 삭제"} disabled={reorderDisabled || sections.length <= 1} onClick={() => onDeleteStep(section.id)}><IconTrash size={15} /></button>}
      </div>}
      </div>
      {(showItems || editMode) && <div id={`${panelId}-${section.id}`} hidden={editMode && !openSteps.has(section.id)} className={editMode ? "classroom-outline-edit-items" : undefined}>
        {editMode && section.items.length === 0 && <p className="classroom-empty">이곳에 놓으면 활동·자료가 이동합니다.</p>}
        {section.items.map((item, itemIndex) => {
          const key = `${item.kind}:${item.id}`;
          const done = completed.has(key);
          return <div key={key} data-outline-key={key} className={`classroom-outline-item${stepId === section.id && itemKey === key ? " is-selected" : ""}${dropKey === `${section.id}:${key}` ? " is-drop-target" : ""}`} draggable={editMode && Boolean(onReorderItem) && !reorderDisabled}
            onDragStart={event => {
              if (!editMode || reorderDisabled || !onReorderItem || event.target.closest(".classroom-outline-edit-item")) { event.preventDefault(); return; }
              drag.current = { type: "item", sectionId: section.id, key };
              event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", key);
            }}
            onDragOver={event => over(event, section, item)} onDrop={event => drop(event, section, item)}
            onDragEnd={() => { drag.current = null; setDropKey(null); }}
            onKeyDown={event => {
              const direction = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[event.key];
              if (!editMode || reorderDisabled || !onReorderItem || !event.altKey || !direction) return;
              event.preventDefault(); onReorderItem({ ...item, stepId: section.id }, direction);
            }}>
            <button type="button" className="classroom-outline-item-main" aria-current={stepId === section.id && itemKey === key ? "page" : undefined} onClick={() => onSelect(section.id, key)}>
              <span className={`classroom-item-symbol is-${item.kind}`} aria-hidden="true">{item.kind === "resource" ? <IconBook size={16} /> : <IconPen size={16} />}</span>
              <span><strong>{item.title}</strong><small>{itemIndex + 1}. {item.kind === "resource" ? "자료" : "활동"}</small></span>
              {done && <span className="classroom-item-done" aria-label="확인 완료"><IconCheckSquare size={16} checked /></span>}
            </button>
            {editMode && <button type="button" className="classroom-outline-edit-item" aria-label={`${item.title} 편집`} disabled={reorderDisabled} draggable={false} onClick={() => onEditItem({ ...item, stepId: section.id })}>편집</button>}
          </div>;
        })}
      </div>}
    </section>)}
  </nav>;
}
