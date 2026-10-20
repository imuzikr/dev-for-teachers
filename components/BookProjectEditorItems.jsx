"use client";

import { useRef, useState } from "react";
import { orderedStepItems } from "./BookProjectPreview";
import BasicFormatEditor from "./BasicFormatEditor";
import { safeDisplayHtml } from "@/lib/html";
import ActivityTemplateSetting from "./ActivityTemplateSetting";
import BookItemImageEditor from "./BookItemImageEditor";
import { IconChevronDown, IconChevronUp, IconTrash } from "./StatusIcons";

function itemKey(kind, id) {
  return `${kind}:${id}`;
}

export default function BookProjectEditorItems({ step, onChange, onRemove, onMove, onAdd, onImageBusyChange, disabled = false }) {
  const detailRef = useRef(null);
  const [draggingKey, setDraggingKey] = useState(null);
  const [selectedKey, setSelectedKey] = useState(null);
  const [dropKey, setDropKey] = useState(null);
  const items = orderedStepItems(step);
  const activeKey = items.some(item => itemKey(item.kind, item.id) === selectedKey) ? selectedKey : items[0] ? itemKey(items[0].kind, items[0].id) : null;

  if (items.length === 0) {
    return <p className="book-step-empty">등록된 활동과 자료가 없습니다.</p>;
  }

  return (
    <section className="book-step-items book-step-items--mixed">
      <div className="book-step-items-head">
        <strong>2. 활동·자료 선택</strong>
        <small>카드를 눌러 상세 편집 · 드래그 또는 Alt + 방향키로 순서 변경</small>
        {onAdd && <div className="book-editor-add-items"><button type="button" className="btn-outline" disabled={disabled} onClick={() => onAdd("activity")}>+ 활동 추가</button><button type="button" className="btn-outline" disabled={disabled} onClick={() => onAdd("resource")}>+ 자료 추가</button></div>}
      </div>
      <div className="book-editor-item-track" aria-label="활동과 자료 순서">
        {items.map((entry, index) => {
          const key = itemKey(entry.kind, entry.id);
          return <button type="button" key={key} disabled={disabled} draggable={!disabled} aria-pressed={activeKey === key}
            className={`book-editor-item-tab is-${entry.kind}${activeKey === key ? " is-selected" : ""}${dropKey === key ? " is-drop-target" : ""}${draggingKey === key ? " is-dragging" : ""}`}
            onClick={() => {
              setSelectedKey(key);
              requestAnimationFrame(() => detailRef.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }));
            }}
            onDragStart={event => { event.dataTransfer.setData("text/plain", key); event.dataTransfer.effectAllowed = "move"; setDraggingKey(key); }}
            onDragEnd={() => { setDraggingKey(null); setDropKey(null); }}
            onDragOver={event => { if (!disabled && draggingKey && draggingKey !== key) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropKey(key); } }}
            onDrop={event => { event.preventDefault(); if (!disabled && draggingKey) onMove(draggingKey, key); setDraggingKey(null); setDropKey(null); }}
            onKeyDown={event => { if (!event.altKey || !["ArrowLeft", "ArrowRight"].includes(event.key)) return; event.preventDefault(); const target = items[index + (event.key === "ArrowLeft" ? -1 : 1)]; if (!disabled && target) onMove(key, itemKey(target.kind, target.id)); }}>
            <small>{String(index + 1).padStart(2, "0")} · {entry.kind === "resource" ? "자료" : "활동"}</small><strong>{entry.title || "제목을 입력해 주세요"}</strong><span>{entry.kind === "resource" ? "읽고 활용할 자료" : "함께 진행할 활동"}</span>
          </button>;
        })}
      </div>
      <div ref={detailRef} className="book-editor-section-heading"><strong>3. 선택 항목 상세 편집</strong><span>변경 내용은 프로젝트 저장을 누르면 반영됩니다.</span></div>
      {items.map((entry, index) => {
        const resource = entry.kind === "resource";
        const key = itemKey(entry.kind, entry.id);
        if (key !== activeKey) return null;
        const label = resource ? "자료" : "활동";
        const source = entry.source;
        const previousKey = index > 0 ? itemKey(items[index - 1].kind, items[index - 1].id) : "";
        const nextKey = index < items.length - 1 ? itemKey(items[index + 1].kind, items[index + 1].id) : "";
        return (
          <article
            className={`book-step-item-edit book-step-item-edit--${entry.kind}${draggingKey === key ? " is-dragging" : ""}`}
            key={key}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const fromKey = event.dataTransfer.getData("text/plain");
              if (!disabled && draggingKey === fromKey) onMove(fromKey, key);
            }}
          >
            <header>
              <span className="book-step-drag-handle-wrap">
                <span
                  className="book-step-drag-handle"
                  role="button"
                  tabIndex={0}
                  aria-label={`${label} ${index + 1} 순서 이동`}
                  draggable={!disabled}
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/plain", key);
                    event.dataTransfer.effectAllowed = "move";
                    setDraggingKey(key);
                  }}
                  onDragEnd={() => setDraggingKey(null)}
                />
                {label} {index + 1}
                {!resource && source.templateEnabled !== true && (
                  <label className="book-step-answer-check" title="학생 답변 받기">
                    <input
                      type="checkbox"
                      checked={source.requiresAnswer !== false}
                      onChange={(event) => onChange(entry.kind, source.id, { requiresAnswer: event.target.checked })}
                      aria-label={`${label} ${index + 1} 학생 답변 받기`}
                    />
                    <span>답변</span>
                  </label>
                )}
              </span>
              <input
                disabled={disabled}
                value={source.title}
                onChange={(event) => {
                  const title = event.target.value;
                  onChange(entry.kind, source.id, { title });
                }}
                placeholder={resource ? "자료 제목" : "활동 제목"}
                aria-label={`${label} ${index + 1} 제목`}
              />
              <div className="book-step-order-actions" aria-label={`${label} ${index + 1} 순서 변경`}>
                <button
                  type="button"
                  className="book-step-order-btn"
                  title="위로 이동"
                  aria-label={`${label} ${index + 1} 위로 이동`}
                  disabled={disabled || !previousKey}
                  onClick={() => previousKey && onMove(key, previousKey)}
                >
                  <IconChevronUp size={14} />
                </button>
                <button
                  type="button"
                  className="book-step-order-btn"
                  title="아래로 이동"
                  aria-label={`${label} ${index + 1} 아래로 이동`}
                  disabled={disabled || !nextKey}
                  onClick={() => nextKey && onMove(key, nextKey)}
                >
                  <IconChevronDown size={14} />
                </button>
              </div>
              <button type="button" className="btn-ghost role-danger-btn" title={`${label} 삭제`} aria-label={`${label} ${index + 1} 삭제`} disabled={disabled} onClick={() => { if (window.confirm(`“${source.title || label}”을 삭제할까요? 프로젝트 저장 후 휴지통에서 복원할 수 있습니다.`)) onRemove(entry.kind, source.id); }}><IconTrash size={13} /></button>
            </header>
            <div className="book-step-item-fields">
              <div className="book-item-kind-settings">
                <ActivityTemplateSetting enabled={source.templateEnabled === true} content={source.content} onChange={(templateEnabled) => onChange(entry.kind, source.id, { templateEnabled })} />
                <button type="button" className="btn-outline" disabled={disabled} onClick={() => { const nextKind = resource ? "activity" : "resource"; onChange(entry.kind, source.id, {}, nextKind); setSelectedKey(itemKey(nextKind, source.id)); }}>
                  {resource ? "활동으로 변환" : "자료로 변환"}
                </button>
              </div>
              {resource && <div className="book-resource-description-field">
                <span>교사 설명 <small>(선택)</small></span>
                <BasicFormatEditor ariaLabel={`자료 ${index + 1} 교사 설명`} value={safeDisplayHtml(source.teacherDescription || "")} onChange={teacherDescription => onChange(entry.kind, source.id, { teacherDescription })} disabled={disabled} placeholder="자료 사용 방법을 안내해 주세요. 복사할 내용에는 포함되지 않습니다." />
              </div>}
              {resource && <strong className="book-resource-editor-label">복사할 내용</strong>}
              <BasicFormatEditor
                disabled={disabled}
                templateEnabled={source.templateEnabled === true}
                value={source.content || ""}
                onChange={(content) => onChange(entry.kind, source.id, { content })}
                placeholder={resource ? "" : "활동 안내사항"}
                ariaLabel={`${label} ${index + 1} ${resource ? "내용" : "안내사항"}`}
              />
              <BookItemImageEditor disabled={disabled} onBusyChange={(busy) => onImageBusyChange?.(key, busy)} images={source.images || []} imageSizes={source.imageSizes} onChange={(images, imageSizes) => onChange(entry.kind, source.id, { images, imageSizes })} />
              <div className="book-step-item-url-row">
                <input
                  disabled={disabled}
                  value={resource ? source.url || "" : source.bookUrl || source.url || ""}
                  onChange={(event) => {
                    const url = event.target.value;
                    onChange(entry.kind, source.id, resource ? { url } : { url, bookUrl: url });
                  }}
                  placeholder={resource ? "자료 링크 URL" : "활동 링크 URL"}
                  aria-label={`${label} ${index + 1} 링크 URL`}
                  type="url"
                />
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
