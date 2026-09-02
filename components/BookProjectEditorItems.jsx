"use client";

import { useState } from "react";
import { orderedStepItems } from "./BookProjectPreview";
import { IconTrash } from "./StatusIcons";

function itemKey(kind, id) {
  return `${kind}:${id}`;
}

export default function BookProjectEditorItems({ step, onChange, onRemove, onMove }) {
  const [draggingKey, setDraggingKey] = useState(null);
  const items = orderedStepItems(step);

  if (items.length === 0) {
    return <p className="book-step-empty">등록된 활동과 자료가 없습니다.</p>;
  }

  return (
    <section className="book-step-items book-step-items--mixed">
      <div className="book-step-items-head">
        <strong>활동과 자료</strong>
        <small>드래그해서 순서 변경</small>
      </div>
      {items.map((entry, index) => {
        const resource = entry.kind === "resource";
        const key = itemKey(entry.kind, entry.id);
        const label = resource ? "자료" : "활동";
        const source = entry.source;
        return (
          <article
            className={`book-step-item-edit book-step-item-edit--${entry.kind}${draggingKey === key ? " is-dragging" : ""}`}
            key={key}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const fromKey = event.dataTransfer.getData("text/plain");
              if (fromKey) onMove(fromKey, key);
            }}
          >
            <header>
              <span className="book-step-drag-handle-wrap">
                <span
                  className="book-step-drag-handle"
                  role="button"
                  tabIndex={0}
                  aria-label={`${label} ${index + 1} 순서 이동`}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/plain", key);
                    event.dataTransfer.effectAllowed = "move";
                    setDraggingKey(key);
                  }}
                  onDragEnd={() => setDraggingKey(null)}
                />
                {label} {index + 1}
              </span>
              <input
                value={source.title}
                onChange={(event) => {
                  const title = event.target.value;
                  onChange(entry.kind, source.id, { title });
                }}
                placeholder={resource ? "자료 제목" : "활동 제목"}
                aria-label={`${label} ${index + 1} 제목`}
              />
              <button type="button" className="btn-ghost role-danger-btn" title={`${label} 삭제`} aria-label={`${label} ${index + 1} 삭제`} onClick={() => onRemove(entry.kind, source.id)}><IconTrash size={13} /></button>
            </header>
            <div className="book-step-item-fields">
              <textarea
                value={source.content || ""}
                onChange={(event) => onChange(entry.kind, source.id, { content: event.target.value })}
                placeholder={resource ? "자료 내용" : "활동 안내사항"}
                aria-label={`${label} ${index + 1} ${resource ? "내용" : "안내사항"}`}
                rows={4}
              />
              <input
                value={resource ? source.url || "" : source.bookUrl || source.url || ""}
                onChange={(event) => {
                  const url = event.target.value;
                  onChange(entry.kind, source.id, resource ? { url } : { url, bookUrl: url });
                }}
                placeholder={resource ? "자료 링크 URL (선택)" : "활동 링크 URL (선택)"}
                aria-label={`${label} ${index + 1} 링크 URL`}
                type="url"
              />
            </div>
          </article>
        );
      })}
    </section>
  );
}
