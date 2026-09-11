"use client";

import { useEffect, useRef, useState } from "react";
import {
  addBookHelpNote,
  deleteBookHelpNote,
  reorderBookHelpNotes,
  subscribeBookHelpNotes,
  updateBookHelpNote,
  saveBookHelpSection,
  deleteBookHelpSection,
} from "@/lib/bookHelpNotes";
import { resourceHref } from "./BookProjectPreview";
import BookHelpNoteModal from "./BookHelpNoteModal";
import BookHelpSections from "./BookHelpSections";

const EMPTY_DRAFT = { title: "", url: "" };

function helpDraftFromNote(note) {
  return {
    title: note?.title ?? "",
    url: note?.url ?? "",
  };
}

function hasHelpBody(note) {
  return (note?.sections?.length ?? 0) > 0;
}

function orderedNotesWithRequest(notes, request) {
  if (!request) return notes;
  const orderRank = new Map(request.orderedIds.map((id, index) => [id, index]));
  const scopedNotes = notes.filter((note) => note.classId === request.classId);
  const otherNotes = notes.filter((note) => note.classId !== request.classId);
  const orderedScopedNotes = [...scopedNotes].sort((a, b) => {
    const left = orderRank.has(a.id) ? orderRank.get(a.id) : Number.MAX_SAFE_INTEGER;
    const right = orderRank.has(b.id) ? orderRank.get(b.id) : Number.MAX_SAFE_INTEGER;
    return left - right;
  });
  return [...otherNotes, ...orderedScopedNotes.map((note, index) => ({ ...note, order: index }))];
}

function HelpNoteFields({ draft, onChange, disabled }) {
  return (
    <div className="book-help-fields">
      <label>
        <span>제목</span>
        <input
          maxLength={120}
          value={draft.title}
          disabled={disabled}
          onChange={(event) => onChange({ ...draft, title: event.target.value })}
          placeholder="도움 글 제목"
        />
      </label>
      <label>
        <span>URL</span>
        <input
          maxLength={1000}
          value={draft.url}
          disabled={disabled}
          onChange={(event) => onChange({ ...draft, url: event.target.value })}
          placeholder="https://"
        />
      </label>
    </div>
  );
}

export default function BookHelpDrawer({
  classId,
  user,
  isTeacher,
  collapsed,
  onToggleCollapsed,
  onToast,
}) {
  const [notes, setNotes] = useState([]);
  const [expandedId, setExpandedId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [modalId, setModalId] = useState("");
  const [newSections, setNewSections] = useState([]);
  const [sectionDirty, setSectionDirty] = useState(false);
  const [reordering, setReordering] = useState(false);
  const classIdRef = useRef(classId);
  const dragNoteIdRef = useRef("");
  const reorderRequestRef = useRef(null);

  useEffect(() => {
    classIdRef.current = classId;
  }, [classId]);

  useEffect(() => {
    reorderRequestRef.current = null;
    dragNoteIdRef.current = "";
    setNotes([]);
    setModalId("");
    setNewSections([]);
    setSectionDirty(false);
    setReordering(false);
    setExpandedId("");
    setEditingId("");
    setDraft(EMPTY_DRAFT);
    return subscribeBookHelpNotes(classId, (nextNotes) => {
      setNotes(orderedNotesWithRequest(nextNotes, reorderRequestRef.current));
    });
  }, [classId]);

  const currentNotes = notes.filter((note) => note.classId === classId);

  function startNewNote() {
    setNewSections([]);
    setSectionDirty(false);
    setExpandedId("new");
    setEditingId("new");
    setDraft(EMPTY_DRAFT);
  }

  function toggleNote(note) {
    if (saving || sectionDirty) return;
    const href = resourceHref(note.url);
    const hasBody = hasHelpBody(note);
    if (!isTeacher && !hasBody && href) {
      window.open(href, "_blank", "noopener,noreferrer");
      return;
    }

    const nextId = expandedId === note.id ? "" : note.id;
    setExpandedId(nextId);
    if (isTeacher) setEditingId("");
    setDraft(helpDraftFromNote(note));
  }

  function startEditing(note) {
    if (saving || sectionDirty) return;
    setExpandedId(note.id);
    setEditingId(note.id);
    setDraft(helpDraftFromNote(note));
  }

  async function saveNewNote() {
    if (!user?.uid || !classId || saving || sectionDirty) return;
    if (!draft.title.trim()) {
      onToast?.("도움 글 제목을 입력해 주세요.");
      return;
    }

    setSaving(true);
    try {
      const noteId = await addBookHelpNote(user, classId, { ...draft, sections: newSections });
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
    if (!noteId || saving || sectionDirty) return;
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
    if (!noteId || saving || sectionDirty) return;

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

  function orderedCurrentNotes(nextCurrentNotes) {
    return [...notes.filter((note) => note.classId !== classId), ...nextCurrentNotes];
  }

  async function persistNoteOrder(nextCurrentNotes) {
    if (!isTeacher || reordering || nextCurrentNotes.length < 2) return;
    const requestClassId = classId;
    const nextOrderedNotes = nextCurrentNotes.map((note, index) => ({ ...note, order: index }));
    const previousNotes = notes;
    const request = { classId: requestClassId, orderedIds: nextOrderedNotes.map((note) => note.id) };

    reorderRequestRef.current = request;
    setNotes(orderedCurrentNotes(nextOrderedNotes));
    setReordering(true);
    try {
      await reorderBookHelpNotes(requestClassId, nextOrderedNotes);
      if (classIdRef.current === requestClassId && reorderRequestRef.current === request) {
        reorderRequestRef.current = null;
        onToast?.("도움 글 순서를 저장했어요.");
      }
    } catch (error) {
      console.error("[책방] 도움 글 순서 저장 실패:", error);
      if (classIdRef.current === requestClassId) {
        if (reorderRequestRef.current === request) reorderRequestRef.current = null;
        setNotes(previousNotes);
        onToast?.("도움 글 순서를 저장하지 못했어요. 이전 순서로 되돌렸어요.");
      }
    } finally {
      if (classIdRef.current === requestClassId) setReordering(false);
    }
  }

  function moveNote(noteId, direction) {
    const fromIndex = currentNotes.findIndex((note) => note.id === noteId);
    const toIndex = fromIndex + direction;
    if (fromIndex < 0 || toIndex < 0 || toIndex >= currentNotes.length) return;
    const nextCurrentNotes = [...currentNotes];
    const [movedNote] = nextCurrentNotes.splice(fromIndex, 1);
    nextCurrentNotes.splice(toIndex, 0, movedNote);
    persistNoteOrder(nextCurrentNotes);
  }

  function handleDragStart(event, note) {
    if (!isTeacher || saving || reordering) return;
    dragNoteIdRef.current = note.id;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", note.id);
  }

  function handleDragOver(event, note) {
    const sourceId = dragNoteIdRef.current;
    if (!sourceId || sourceId === note.id || saving || reordering) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function handleDrop(event, note) {
    event.preventDefault();
    const sourceId = dragNoteIdRef.current || event.dataTransfer.getData("text/plain");
    dragNoteIdRef.current = "";
    if (!sourceId || sourceId === note.id || saving || reordering) return;
    const fromIndex = currentNotes.findIndex((item) => item.id === sourceId);
    const toIndex = currentNotes.findIndex((item) => item.id === note.id);
    if (fromIndex < 0 || toIndex < 0) return;
    const nextCurrentNotes = [...currentNotes];
    const [movedNote] = nextCurrentNotes.splice(fromIndex, 1);
    nextCurrentNotes.splice(toIndex, 0, movedNote);
    persistNoteOrder(nextCurrentNotes);
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
            <button type="button" className="btn-primary book-help-add" onClick={startNewNote} disabled={saving || sectionDirty || editingId === "new"}>
              추가
            </button>
          )}
        </header>

        {editingId === "new" && (
          <section className="book-help-editor" aria-label="새 도움 글">
            <HelpNoteFields draft={draft} onChange={setDraft} disabled={saving} />
            <BookHelpSections sections={newSections} editable={!saving} onDirtyChange={setSectionDirty}
              onSave={async (section, { create }) => setNewSections((items) => create ? [...items, section] : items.map((item) => item.id === section.id ? section : item))}
              onDelete={async (id) => setNewSections((items) => items.filter((item) => item.id !== id))} />
            <div className="book-help-actions">
              <button type="button" className="btn-ghost" onClick={() => { setEditingId(""); setSectionDirty(false); }} disabled={saving || sectionDirty}>취소</button>
              <button type="button" className="btn-primary" onClick={saveNewNote} disabled={saving || sectionDirty}>저장</button>
            </div>
          </section>
        )}

        <div className="book-help-list">
          {currentNotes.length === 0 && (
            <p className="book-help-empty">{isTeacher ? "아직 도움 글이 없습니다." : "선생님이 준비한 도움 글이 아직 없습니다."}</p>
          )}
          {currentNotes.map((note, index) => {
            const hasBody = hasHelpBody(note);
            const open = (hasBody || isTeacher) && expandedId === note.id;
            const editing = editingId === note.id;
            const href = resourceHref(note.url);
            return (
              <section
                className="book-help-item"
                key={note.id}
                onDragOver={(event) => handleDragOver(event, note)}
                onDrop={(event) => handleDrop(event, note)}
              >
                <div className="book-help-item-row">
                  {isTeacher && currentNotes.length > 1 && (
                    <button
                      type="button"
                      className="book-help-drag-handle"
                      draggable={!saving && !reordering}
                      onDragStart={(event) => handleDragStart(event, note)}
                      onDragEnd={() => { dragNoteIdRef.current = ""; }}
                      aria-label={`${note.title || "제목 없는 도움 글"} 순서 끌어서 변경`}
                      title="순서 끌어서 변경"
                      disabled={saving || reordering}
                    >
                      <span aria-hidden="true"></span>
                      <span aria-hidden="true"></span>
                      <span aria-hidden="true"></span>
                    </button>
                  )}

                  <button
                    type="button"
                    className={`book-help-item-button${!hasBody && href ? " is-link-only" : ""}`}
                    onClick={() => toggleNote(note)}
                    disabled={saving || sectionDirty}
                    aria-expanded={hasBody ? open : undefined}
                  >
                    <span className="book-help-item-index">{String(index + 1).padStart(2, "0")}</span>
                    <strong>{note.title || "제목 없는 도움 글"}</strong>
                    {hasBody && (
                      <span className="book-help-content-indicator" aria-hidden="true">
                        <span></span>
                        <span></span>
                        <span></span>
                      </span>
                    )}
                  </button>

                  {hasBody && <button type="button" className="book-help-expand" onClick={() => setModalId(note.id)} aria-label={`${note.title} 확대`} title="확대">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 4H4v4M16 4h4v4M20 16v4h-4M4 16v4h4M9 9 4.8 4.8M15 9l4.2-4.2M15 15l4.2 4.2M9 15l-4.2 4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>}

                  {isTeacher && (
                    <div className="book-help-row-actions" aria-label="도움 글 관리">
                      {currentNotes.length > 1 && (
                        <>
                          <button type="button" className="book-help-order-btn" onClick={() => moveNote(note.id, -1)} disabled={saving || reordering || index === 0} aria-label="위로 이동">↑</button>
                          <button type="button" className="book-help-order-btn" onClick={() => moveNote(note.id, 1)} disabled={saving || reordering || index === currentNotes.length - 1} aria-label="아래로 이동">↓</button>
                        </>
                      )}
                      {!open && !editing && (
                        <>
                          <button type="button" className="book-help-row-btn" onClick={() => startEditing(note)} disabled={saving || reordering}>편집</button>
                          <button type="button" className="book-help-row-btn book-help-delete" onClick={() => removeNote(note.id)} disabled={saving || reordering}>삭제</button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {(open || editing) && (
                  <div className="book-help-detail">
                    {editing ? (
                      <>
                        <HelpNoteFields draft={draft} onChange={setDraft} disabled={saving} />
                        <div className="book-help-actions">
                          <button type="button" className="btn-ghost" onClick={() => setEditingId("")} disabled={saving}>취소</button>
                          <button type="button" className="btn-primary" onClick={() => saveExistingNote(note.id)} disabled={saving || sectionDirty}>저장</button>
                        </div>
                      </>
                    ) : (
                      <>
                        {href && (
                          <a className="book-help-link" href={href} target="_blank" rel="noopener noreferrer">
                            링크 열기
                          </a>
                        )}
                        {isTeacher && (
                          <div className="book-help-actions">
                            <button type="button" className="btn-ghost" onClick={() => startEditing(note)} disabled={saving || sectionDirty}>편집</button>
                            <button type="button" className="btn-ghost book-help-delete" onClick={() => removeNote(note.id)} disabled={saving || sectionDirty}>삭제</button>
                          </div>
                        )}
                      </>
                    )}
                    <BookHelpSections key={note.id} sections={note.sections} editable={isTeacher && !saving} onDirtyChange={setSectionDirty}
                      onSave={(section, options) => saveBookHelpSection(note.id, section, options)}
                      onDelete={(sectionId) => deleteBookHelpSection(note.id, sectionId)} />
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>

      {collapsed && <span className="book-help-rail-label">도움 글</span>}
      {currentNotes.find((note) => note.id === modalId) && <BookHelpNoteModal note={currentNotes.find((note) => note.id === modalId)} onClose={() => setModalId("")} />}
    </aside>
  );
}
