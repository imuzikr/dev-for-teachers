"use client";

import { useEffect, useState } from "react";
import {
  addBookHelpNote,
  deleteBookHelpNote,
  subscribeBookHelpNotes,
  updateBookHelpNote,
} from "@/lib/bookHelpNotes";
import { resourceHref, resourceLinkLabel } from "./BookProjectPreview";

const EMPTY_DRAFT = { title: "", content: "", url: "" };

function helpDraftFromNote(note) {
  return {
    title: note?.title ?? "",
    content: note?.content ?? "",
    url: note?.url ?? "",
  };
}

function HelpNoteFields({ draft, onChange, disabled }) {
  return (
    <div className="book-help-fields">
      <label>
        <span>제목</span>
        <input
          value={draft.title}
          disabled={disabled}
          onChange={(event) => onChange({ ...draft, title: event.target.value })}
          placeholder="도움 글 제목"
        />
      </label>
      <label>
        <span>내용</span>
        <textarea
          value={draft.content}
          disabled={disabled}
          onChange={(event) => onChange({ ...draft, content: event.target.value })}
          placeholder="학생들에게 보여줄 도움 내용을 입력하세요."
          rows={5}
        />
      </label>
      <label>
        <span>URL</span>
        <input
          value={draft.url}
          disabled={disabled}
          onChange={(event) => onChange({ ...draft, url: event.target.value })}
          placeholder="https://"
        />
      </label>
    </div>
  );
}

export default function BookHelpDrawer({ classId, user, isTeacher, collapsed, onToggleCollapsed, onToast }) {
  const [notes, setNotes] = useState([]);
  const [expandedId, setExpandedId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  useEffect(() => subscribeBookHelpNotes(classId, setNotes), [classId]);

  function startNewNote() {
    setExpandedId("new");
    setEditingId("new");
    setDraft(EMPTY_DRAFT);
  }

  function toggleNote(note) {
    const nextId = expandedId === note.id ? "" : note.id;
    setExpandedId(nextId);
    setEditingId("");
    setDraft(helpDraftFromNote(note));
  }

  function startEditing(note) {
    setExpandedId(note.id);
    setEditingId(note.id);
    setDraft(helpDraftFromNote(note));
  }

  async function saveNewNote() {
    if (!user?.uid || !classId || saving) return;
    if (!draft.title.trim()) {
      onToast?.("도움 글 제목을 입력해 주세요.");
      return;
    }

    setSaving(true);
    try {
      const noteId = await addBookHelpNote(user, classId, draft);
      setExpandedId(noteId);
      setEditingId("");
      setDraft(EMPTY_DRAFT);
      onToast?.("도움 글을 추가했어요.");
    } catch (error) {
      console.error("[책방] 도움 글 추가 실패:", error);
      onToast?.("도움 글을 추가하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  async function saveExistingNote(noteId) {
    if (!noteId || saving) return;
    if (!draft.title.trim()) {
      onToast?.("도움 글 제목을 입력해 주세요.");
      return;
    }

    setSaving(true);
    try {
      await updateBookHelpNote(noteId, draft);
      setEditingId("");
      onToast?.("도움 글을 저장했어요.");
    } catch (error) {
      console.error("[책방] 도움 글 저장 실패:", error);
      onToast?.("도움 글을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  async function removeNote(noteId) {
    if (!noteId || saving) return;

    setSaving(true);
    try {
      await deleteBookHelpNote(noteId);
      onToast?.("도움 글을 삭제했어요.");
    } catch (error) {
      console.error("[책방] 도움 글 삭제 실패:", error);
      onToast?.("도움 글을 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside className={`book-help-drawer${collapsed ? " is-collapsed" : ""}`} aria-label="도움 글">
      <button
        type="button"
        className="book-help-toggle"
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "도움 글 패널 펼치기" : "도움 글 패널 접기"}
        title={collapsed ? "도움 글 패널 펼치기" : "도움 글 패널 접기"}
      >
        <span aria-hidden="true">{collapsed ? "«" : "»"}</span>
      </button>

      <div className="book-help-content" aria-hidden={collapsed ? "true" : undefined}>
        <header className="book-help-head">
          <div>
            <span>도움 글</span>
            <h2>수업 보조 자료</h2>
          </div>
          {isTeacher && (
            <button type="button" className="btn-primary book-help-add" onClick={startNewNote}>
              추가
            </button>
          )}
        </header>

        {editingId === "new" && (
          <section className="book-help-editor" aria-label="새 도움 글">
            <HelpNoteFields draft={draft} onChange={setDraft} disabled={saving} />
            <div className="book-help-actions">
              <button type="button" className="btn-ghost" onClick={() => setEditingId("")} disabled={saving}>취소</button>
              <button type="button" className="btn-primary" onClick={saveNewNote} disabled={saving}>저장</button>
            </div>
          </section>
        )}

        <div className="book-help-list">
          {notes.length === 0 && (
            <p className="book-help-empty">{isTeacher ? "아직 도움 글이 없습니다." : "선생님이 준비한 도움 글이 아직 없습니다."}</p>
          )}
          {notes.map((note, index) => {
            const open = expandedId === note.id;
            const editing = editingId === note.id;
            const href = resourceHref(note.url);
            return (
              <section className="book-help-item" key={note.id}>
                <button
                  type="button"
                  className="book-help-item-button"
                  onClick={() => toggleNote(note)}
                  aria-expanded={open}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{note.title || "제목 없는 도움 글"}</strong>
                </button>

                {open && (
                  <div className="book-help-detail">
                    {editing ? (
                      <>
                        <HelpNoteFields draft={draft} onChange={setDraft} disabled={saving} />
                        <div className="book-help-actions">
                          <button type="button" className="btn-ghost" onClick={() => setEditingId("")} disabled={saving}>취소</button>
                          <button type="button" className="btn-primary" onClick={() => saveExistingNote(note.id)} disabled={saving}>저장</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="book-help-url">{resourceLinkLabel(href) || "URL 없음"}</div>
                        <p>{note.content || "등록된 내용이 없습니다."}</p>
                        {href && (
                          <a className="book-help-link" href={href} target="_blank" rel="noopener noreferrer">
                            링크 열기
                          </a>
                        )}
                        {isTeacher && (
                          <div className="book-help-actions">
                            <button type="button" className="btn-ghost" onClick={() => startEditing(note)}>편집</button>
                            <button type="button" className="btn-ghost book-help-delete" onClick={() => removeNote(note.id)} disabled={saving}>삭제</button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>

      {collapsed && <span className="book-help-rail-label">도움 글</span>}
    </aside>
  );
}
