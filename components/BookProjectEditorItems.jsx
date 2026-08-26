"use client";

import { IconTrash } from "./StatusIcons";

export default function BookProjectEditorItems({ label, items, resource = false, onChange, onRemove }) {
  return (
    <section className="book-step-items">
      <div className="book-step-items-head"><strong>{label}</strong></div>
      {items.map((item, index) => (
        <article className="book-step-item-edit" key={item.id}>
          <header>
            <span>{label} {index + 1}</span>
            <input value={item.title} onChange={(event) => onChange(item.id, { title: event.target.value })} placeholder={`${label} 제목`} aria-label={`${label} ${index + 1} 제목`} />
            <button type="button" className="btn-ghost role-danger-btn" title={`${label} 삭제`} aria-label={`${label} ${index + 1} 삭제`} onClick={() => onRemove(item.id)}><IconTrash size={14} /></button>
          </header>
          <div className="book-step-item-fields">
            {resource ? (
              <>
                <textarea value={item.content || ""} onChange={(event) => onChange(item.id, { content: event.target.value })} placeholder="자료 내용" aria-label={`자료 ${index + 1} 내용`} rows={4} />
                <input value={item.url} onChange={(event) => onChange(item.id, { url: event.target.value })} placeholder="링크 URL (선택)" aria-label={`자료 ${index + 1} 링크 URL`} type="url" />
              </>
            ) : (
              <textarea value={item.topic} onChange={(event) => onChange(item.id, { topic: event.target.value })} placeholder="활동 내용" aria-label={`활동 ${index + 1} 내용`} rows={4} />
            )}
          </div>
        </article>
      ))}
    </section>
  );
}
