"use client";

// =============================================================
// 1단: 키워드(주제) 사이드바 — 클릭하면 가운데 게시판이 필터링됩니다.
// -------------------------------------------------------------
// 교사(isAdmin)에게는:
//  · 각 키워드 오른쪽 끝 ⋯(더보기) 메뉴 → 이름 변경 / 삭제
//  · 드래그 앤 드롭으로 순서 변경 (reorderKeywords로 저장)
//  · 하단 "＋ 키워드 추가" 인라인 입력
// (별도 설정 모달 없이 목록에서 바로 관리)
// =============================================================
import { useEffect, useRef, useState } from "react";
import { addKeyword, renameKeyword, deleteKeyword, reorderKeywords } from "@/lib/store";
import { IconTrash } from "./StatusIcons";

export default function KeywordSidebar({
  keywordDocs = [],
  selected,
  onSelect,
  counts,
  isAdmin = false,
}) {
  const [menuId, setMenuId] = useState(null);      // ⋯ 메뉴 열린 키워드 id
  const [editingId, setEditingId] = useState(null); // 이름 변경 중 id
  const [editName, setEditName] = useState("");
  const [confirmId, setConfirmId] = useState(null); // 삭제 확인 중 id
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const rootRef = useRef(null);
  const addInputRef = useRef(null); // 한글 조합 중 글자까지 읽기 위한 입력칸 참조

  // 바깥 클릭 시 ⋯ 메뉴 닫기
  useEffect(() => {
    if (menuId == null) return;
    function onDown(e) {
      if (!e.target.closest?.(".kw-menu, .kw-more-btn")) setMenuId(null);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [menuId]);

  function startEdit(kw) {
    setEditingId(kw.id);
    setEditName(kw.name);
    setMenuId(null);
    setConfirmId(null);
  }
  async function saveEdit(id) {
    const name = editName.trim();
    if (name) await renameKeyword(id, name);
    setEditingId(null);
    setEditName("");
  }
  async function handleAdd(e) {
    e.preventDefault();
    // 한글 마지막 글자는 아직 '조합 중'이라 state에 늦게 들어올 수 있습니다.
    // 입력칸의 실제 값에는 조합 중 글자까지 있으므로 그쪽을 먼저 읽습니다.
    const raw = addInputRef.current?.value ?? newName;
    const name = raw.trim().replace(/^#\s*/, "");
    if (!name) return;
    await addKeyword(name);
    setNewName("");
    setAdding(false);
  }

  // ── 드래그 앤 드롭 정렬 ──
  function handleDrop(targetId) {
    setDragOverId(null);
    const from = dragId;
    setDragId(null);
    if (!from || from === targetId) return;
    const ids = keywordDocs.map((k) => k.id);
    const fi = ids.indexOf(from);
    const ti = ids.indexOf(targetId);
    if (fi === -1 || ti === -1) return;
    ids.splice(fi, 1);
    ids.splice(ti, 0, from);
    reorderKeywords(ids);
  }

  return (
    <aside className="keyword-col" ref={rootRef}>
      <div className="keyword-col-head">
        <h2>키워드</h2>
      </div>

      {/* 전체 — 관리 대상 아님 */}
      <button
        className={`keyword-item ${selected === "전체" ? "active" : ""}`}
        onClick={() => onSelect("전체")}
      >
        <span># 전체</span>
        <span className="keyword-count">{counts["전체"] ?? 0}</span>
      </button>

      {keywordDocs.map((kw) => {
        if (editingId === kw.id) {
          return (
            <div key={kw.id} className="keyword-item keyword-item--edit">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveEdit(kw.id);
                  if (e.key === "Escape") { setEditingId(null); setEditName(""); }
                }}
                autoFocus
                className="kw-edit-input"
              />
              <button className="kw-edit-save" onClick={() => saveEdit(kw.id)} disabled={!editName.trim()}>저장</button>
            </div>
          );
        }
        if (confirmId === kw.id) {
          return (
            <div key={kw.id} className="keyword-item keyword-item--confirm">
              <span className="kw-confirm-text"># {kw.name} 삭제?</span>
              <button className="kw-confirm-yes" onClick={() => { deleteKeyword(kw.id); setConfirmId(null); }}>삭제</button>
              <button className="kw-confirm-no" onClick={() => setConfirmId(null)}>취소</button>
            </div>
          );
        }
        return (
          <div
            key={kw.id}
            className={`keyword-item-wrap${dragOverId === kw.id ? " drag-over" : ""}${dragId === kw.id ? " dragging" : ""}`}
            draggable={isAdmin}
            onDragStart={isAdmin ? () => setDragId(kw.id) : undefined}
            onDragEnd={isAdmin ? () => { setDragId(null); setDragOverId(null); } : undefined}
            onDragOver={isAdmin ? (e) => { e.preventDefault(); setDragOverId(kw.id); } : undefined}
            onDragLeave={isAdmin ? () => setDragOverId((v) => (v === kw.id ? null : v)) : undefined}
            onDrop={isAdmin ? (e) => { e.preventDefault(); handleDrop(kw.id); } : undefined}
          >
            <button
              className={`keyword-item ${selected === kw.name ? "active" : ""}${isAdmin ? " has-more" : ""}`}
              onClick={() => onSelect(kw.name)}
            >
              <span># {kw.name}</span>
              <span className="keyword-count">{counts[kw.name] ?? 0}</span>
            </button>
            {isAdmin && (
              <button
                className="kw-more-btn"
                onClick={(e) => { e.stopPropagation(); setMenuId((v) => (v === kw.id ? null : kw.id)); }}
                title="더보기"
                aria-label={`${kw.name} 더보기`}
              >
                ⋯
              </button>
            )}
            {menuId === kw.id && (
              <div className="kw-menu" role="menu">
                <button className="kw-menu-item" role="menuitem" onClick={() => startEdit(kw)}>
                  ✏️ 이름 변경
                </button>
                <button
                  className="kw-menu-item kw-menu-item--danger"
                  role="menuitem"
                  onClick={() => { setConfirmId(kw.id); setMenuId(null); }}
                >
                  <IconTrash size={15} /> 삭제
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* 키워드 추가 (교사) */}
      {isAdmin &&
        (adding ? (
          <form className="keyword-item keyword-item--add" onSubmit={handleAdd}>
            <input
              ref={addInputRef}
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") { setAdding(false); setNewName(""); } }}
              placeholder="새 키워드"
              autoFocus
              className="kw-edit-input"
            />
            {/* 조합 중인 한글은 state에 늦게 들어오므로 입력값으로 버튼을
                잠그지 않습니다(빈 값은 handleAdd가 거릅니다) */}
            <button type="submit" className="kw-edit-save">추가</button>
          </form>
        ) : (
          <button className="keyword-add-btn" onClick={() => setAdding(true)}>
            ＋ 키워드 추가
          </button>
        ))}
    </aside>
  );
}
