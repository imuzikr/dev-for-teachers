"use client";

// =============================================================
// 반 관리하기 — 새 반 만들기 · 이름 수정 · 보관 · (보관된 반) 복원·삭제
// -------------------------------------------------------------
// 보관한 반은 반 선택 목록(상단 드롭다운)에서 사라지고, 이 모달의
// '보관된 반' 목록에서만 확인·복원·삭제할 수 있습니다. 보관 중엔
// 학생 접근이 완전히 막히고(입장 코드 폐기), 교사도 데이터를 보기만
// 할 수 있습니다(편집하려면 먼저 복원). 삭제는 되돌릴 수 없어
// 보관을 거친 반만 가능합니다.
// =============================================================
import { useState } from "react";
import { backdropClose } from "@/lib/modal";
import { addClass, renameClass, archiveClass, unarchiveClass, deleteClass } from "@/lib/store";
import ConfirmModal from "./ConfirmModal";
import { IconPen, IconTrash } from "./StatusIcons";

export default function ClassManagerModal({ classes, user, onClose, onCreated, onViewClass, onToast }) {
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null); // { id, name } | null
  const [error, setError] = useState("");

  const active = classes.filter((c) => !c.archived);
  const archived = classes.filter((c) => c.archived);

  async function handleCreate(e) {
    e.preventDefault();
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    setError("");
    try {
      const created = await addClass(user, name);
      setNewName("");
      onCreated?.(created.id);
    } catch {
      setError("반을 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setCreating(false);
    }
  }

  function startRename(c) {
    setRenamingId(c.id);
    setRenameDraft(c.name);
  }
  async function commitRename(c) {
    const name = renameDraft.trim();
    setRenamingId(null);
    if (!name || name === c.name) return;
    try {
      await renameClass(c.id, name);
    } catch {
      setError("이름을 바꾸지 못했어요.");
    }
  }

  async function handleArchive(c) {
    if (busyId) return;
    setBusyId(c.id);
    setError("");
    try {
      await archiveClass(c.id);
      onToast?.(`'${c.name}' 반을 보관했어요. 학생은 더 이상 접근할 수 없어요.`);
    } catch {
      setError("반을 보관하지 못했어요.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleUnarchive(c) {
    if (busyId) return;
    setBusyId(c.id);
    setError("");
    try {
      await unarchiveClass(c.id, user);
      onToast?.(`'${c.name}' 반을 복원했어요. 새 입장 코드가 발급됐어요.`);
    } catch {
      setError("반을 복원하지 못했어요.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    const { id, name } = confirmDelete;
    setConfirmDelete(null);
    setBusyId(id);
    setError("");
    try {
      await deleteClass(id);
      onToast?.(`'${name}' 반을 완전히 삭제했어요.`);
    } catch {
      setError("반을 삭제하지 못했어요.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div className="modal modal-class-manager" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>🗂 반 관리하기</h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <form className="class-mgr-create" onSubmit={handleCreate}>
          <input
            type="text"
            placeholder="새 반 이름 (예: 3학년 3반, 수요일 코딩반)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button type="submit" className="btn-primary" disabled={creating}>
            {creating ? "만드는 중…" : "➕ 반 만들기"}
          </button>
        </form>

        {error && <p className="form-error">{error}</p>}

        <div className="class-mgr-section">
          <div className="class-mgr-section-title">운영 중인 반 ({active.length})</div>
          {active.length === 0 ? (
            <p className="empty-note">아직 만든 반이 없어요.</p>
          ) : (
            <ul className="class-mgr-list">
              {active.map((c) => (
                <li key={c.id} className="class-mgr-row">
                  {renamingId === c.id ? (
                    <input
                      type="text"
                      className="class-mgr-rename-input"
                      value={renameDraft}
                      autoFocus
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onBlur={() => commitRename(c)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); commitRename(c); }
                        else if (e.key === "Escape") { e.preventDefault(); setRenamingId(null); }
                      }}
                    />
                  ) : (
                    <span className="class-mgr-name">{c.name}</span>
                  )}
                  <div className="class-mgr-actions">
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => startRename(c)}
                      title="이름 수정"
                    >
                      <IconPen size={15} />
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => handleArchive(c)}
                      disabled={busyId === c.id}
                      title="보관하면 학생 접근이 막히고 목록에서 숨겨져요"
                    >
                      📦 보관
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="class-mgr-section">
          <div className="class-mgr-section-title">보관된 반 ({archived.length})</div>
          {archived.length === 0 ? (
            <p className="empty-note">보관된 반이 없어요.</p>
          ) : (
            <ul className="class-mgr-list">
              {archived.map((c) => (
                <li key={c.id} className="class-mgr-row class-mgr-row--archived">
                  <span className="class-mgr-name">{c.name}</span>
                  <div className="class-mgr-actions">
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => onViewClass?.(c.id)}
                      title="데이터를 보기 전용으로 확인합니다"
                    >
                      👁 보기
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => handleUnarchive(c)}
                      disabled={busyId === c.id}
                      title="다시 운영 중인 반으로 되돌립니다(새 입장 코드 발급)"
                    >
                      ♻️ 복원
                    </button>
                    <button
                      type="button"
                      className="btn-ghost class-mgr-delete"
                      onClick={() => setConfirmDelete({ id: c.id, name: c.name })}
                      disabled={busyId === c.id}
                      title="완전히 삭제(되돌릴 수 없음)"
                    >
                      <IconTrash size={15} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {confirmDelete && (
        <ConfirmModal
          title={`'${confirmDelete.name}' 반을 완전히 삭제할까요?`}
          description="보드·카드·과일 등 이 반의 모든 데이터가 영구히 사라지고 되돌릴 수 없어요."
          confirmLabel="삭제"
          danger
          onConfirm={handleDelete}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
