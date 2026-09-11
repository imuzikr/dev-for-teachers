"use client";

import { useState } from "react";
import { sanitizeHelpSection } from "@/lib/bookHelpNotes";
import BasicFormatEditor from "./BasicFormatEditor";
import RichTextDisplay from "./RichTextDisplay";
import { resourceHref } from "./BookProjectPreview";

export function HelpSectionBody({ section, expanded = false }) {
  const href = resourceHref(section.url);
  return <>
    {section.content && <RichTextDisplay className={expanded ? "book-personal-expand-content" : "book-help-text"} html={section.content} />}
    {href && <a className="book-help-link" href={href} target="_blank" rel="noopener noreferrer">링크 열기</a>}
  </>;
}

export default function BookHelpSections({ sections = [], editable = false, expanded = false, onSave, onDelete, onDirtyChange }) {
  const [draft, setDraft] = useState(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState("");

  function edit(section, create = false) {
    setDeletingId("");
    setDraft({ ...section });
    setCreating(create);
    setError("");
    onDirtyChange?.(true);
  }

  function cancel() {
    setDraft(null);
    setError("");
    onDirtyChange?.(false);
  }

  async function save() {
    if (busy) return;
    if (!draft.title.trim()) { setError("항목 제목을 입력해 주세요."); return; }
    setBusy(true);
    setError("");
    try {
      await onSave(sanitizeHelpSection(draft), { create: creating });
      cancel();
    } catch (failure) {
      setError(failure.message || "항목을 저장하지 못했어요. 다시 시도해 주세요.");
    } finally { setBusy(false); }
  }

  async function remove(id) {
    if (busy) return;
    setBusy(true);
    onDirtyChange?.(true);
    setError("");
    try {
      await onDelete(id);
      setDeletingId("");
    } catch (failure) {
      setError(failure.message || "항목을 삭제하지 못했어요. 다시 시도해 주세요.");
    } finally { setBusy(false); onDirtyChange?.(false); }
  }

  function editor() {
    return <div className="book-help-section-editor">
      <div className="book-help-fields">
        <label><span>항목 제목</span><input autoFocus maxLength={120} value={draft.title} disabled={busy} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <div><span className="book-help-field-label">내용</span><BasicFormatEditor ariaLabel="항목 내용" value={draft.content} disabled={busy} onChange={(content) => setDraft({ ...draft, content })} /></div>
        <label><span>URL</span><input maxLength={1000} value={draft.url} disabled={busy} onChange={(event) => setDraft({ ...draft, url: event.target.value })} /></label>
      </div>
      <div className="book-help-actions">
        <button type="button" className="btn-ghost" disabled={busy} onClick={cancel}>취소</button>
        <button type="button" className="btn-primary" disabled={busy} onClick={save}>{busy ? "저장 중…" : "항목 저장"}</button>
      </div>
    </div>;
  }

  return <div className="book-help-sections">
    {sections.map((section) => <section className="book-help-section" key={section.id} aria-label={section.title}>
      {draft?.id === section.id ? editor() : <>
        <header className="book-help-section-head"><h4>{section.title}</h4>
          {editable && <div className="book-help-section-actions">
            <button type="button" className="book-help-row-btn" disabled={busy || !!draft} onClick={() => edit(section)}>편집</button>
            <button type="button" className="book-help-row-btn book-help-delete" disabled={busy || !!draft} onClick={() => setDeletingId(section.id)}>삭제</button>
          </div>}
        </header>
        <HelpSectionBody section={section} expanded={expanded} />
        {deletingId === section.id && <div className="book-help-section-delete" role="group" aria-label="항목 삭제 확인">
          <p>이 항목을 삭제할까요?</p>
          <div className="book-help-actions"><button type="button" className="btn-ghost" disabled={busy} onClick={() => setDeletingId("")}>취소</button><button type="button" className="btn-ghost book-help-delete" disabled={busy} onClick={() => remove(section.id)}>삭제 확인</button></div>
        </div>}
      </>}
    </section>)}
    {draft && creating && editor()}
    {error && <p role="alert" className="book-help-error">{error}</p>}
    {editable && !draft && <button type="button" className="btn-ghost book-help-section-add" disabled={busy || sections.length >= 20} onClick={() => edit({ id: crypto.randomUUID(), title: "", content: "", url: "" }, true)}>+ 항목 추가</button>}
  </div>;
}
