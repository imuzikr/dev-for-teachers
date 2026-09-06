"use client";

// =============================================================
// 반 관리하기 — 새 반 만들기 · 이름 수정 · 보관 · (보관된 반) 복원·삭제
// -------------------------------------------------------------
// =============================================================
import { useState } from "react";
import { backdropClose } from "@/lib/modal";
import {
  addClass,
  archiveClass,
  createClassJoinCode,
  deleteClass,
  isValidClassJoinCode,
  normalizeClassJoinCode,
  renameClass,
  unarchiveClass,
  updateClassJoinAccess,
} from "@/lib/store";
import ConfirmModal from "./ConfirmModal";
import { ActiveClassRow, ArchivedClassRow } from "./ClassManagerClassRows";

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
      await unarchiveClass(c.id);
      onToast?.(`'${c.name}' 반을 복원했어요.`);
    } catch {
      setError("반을 복원하지 못했어요.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleJoinAccess(c) {
    if (busyId) return;
    const nextEnabled = c.joinEnabled !== true;
    const nextCode = isValidClassJoinCode(c.joinCode) ? c.joinCode : createUniqueClassJoinCode(c.id);
    setBusyId(c.id);
    setError("");
    try {
      await updateClassJoinAccess(c.id, {
        joinEnabled: nextEnabled,
        joinCode: nextEnabled ? nextCode : c.joinCode,
      });
      onToast?.(`'${c.name}' 반 가입을 ${nextEnabled ? "허용" : "차단"}했어요.`);
    } catch {
      setError("가입 상태를 바꾸지 못했어요.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRefreshJoinCode(c) {
    if (busyId) return;
    setBusyId(c.id);
    setError("");
    try {
      await updateClassJoinAccess(c.id, {
        joinEnabled: true,
        joinCode: createUniqueClassJoinCode(c.id),
      });
      onToast?.(`'${c.name}' 반 참여 코드를 새로 만들었어요.`);
    } catch {
      setError("참여 코드를 새로 만들지 못했어요.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleSaveJoinCode(c, value) {
    if (busyId) return;
    const joinCode = normalizeClassJoinCode(value);
    if (!isValidClassJoinCode(joinCode)) {
      setError("참여 코드는 숫자 6자리로 입력해 주세요.");
      return;
    }
    if (active.some((item) => item.id !== c.id && normalizeClassJoinCode(item.joinCode) === joinCode)) {
      setError("이미 다른 반에서 사용 중인 참여 코드입니다.");
      return;
    }
    setBusyId(c.id);
    setError("");
    try {
      await updateClassJoinAccess(c.id, { joinEnabled: true, joinCode });
      onToast?.(`'${c.name}' 반 참여 코드를 ${joinCode}로 저장했어요.`);
    } catch {
      setError("참여 코드를 저장하지 못했어요.");
    } finally {
      setBusyId(null);
    }
  }

  function createUniqueClassJoinCode(exceptId) {
    for (let count = 0; count < 12; count += 1) {
      const joinCode = createClassJoinCode();
      if (!active.some((item) => item.id !== exceptId && normalizeClassJoinCode(item.joinCode) === joinCode)) {
        return joinCode;
      }
    }
    return createClassJoinCode();
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
                <ActiveClassRow
                  key={c.id}
                  classItem={c}
                  busy={busyId === c.id}
                  renaming={renamingId === c.id}
                  renameDraft={renameDraft}
                  onRenameDraft={setRenameDraft}
                  onStartRename={startRename}
                  onCommitRename={commitRename}
                  onCancelRename={() => setRenamingId(null)}
                  onToggleJoinAccess={handleToggleJoinAccess}
                  onRefreshJoinCode={handleRefreshJoinCode}
                  onSaveJoinCode={handleSaveJoinCode}
                  onToast={onToast}
                  onArchive={handleArchive}
                />
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
                <ArchivedClassRow
                  key={c.id}
                  classItem={c}
                  busy={busyId === c.id}
                  onViewClass={onViewClass}
                  onUnarchive={handleUnarchive}
                  onDelete={setConfirmDelete}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      {confirmDelete && (
        <ConfirmModal
          title={`'${confirmDelete.name}' 반을 완전히 삭제할까요?`}
          description="보드·카드 등 이 반의 모든 데이터가 영구히 사라지고 되돌릴 수 없어요."
          confirmLabel="삭제"
          danger
          onConfirm={handleDelete}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
