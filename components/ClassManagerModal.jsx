"use client";

// =============================================================
// 반·차시 관리하기 — 만들기 · 이름 수정 · 보관 · 복원 · 삭제
// -------------------------------------------------------------
// =============================================================
import { useState } from "react";
import { backdropClose } from "@/lib/modal";
import { isAdmin } from "@/lib/user";
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
import {
  CLASS_PURPOSE_INTERNAL,
  getClassPurpose,
  getClassPurposeLabel,
  normalizeClassPurpose,
} from "@/lib/classPurpose";
import ConfirmModal from "./ConfirmModal";
import { ActiveClassRow, ArchivedClassRow } from "./ClassManagerClassRows";

export default function ClassManagerModal({
  classes,
  allClasses = classes,
  classPurpose = "training",
  user,
  onClose,
  onCreated,
  onViewClass,
  onToast,
  deleteClassAction = deleteClass,
}) {
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null); // { id, name } | null
  const [error, setError] = useState("");
  const canManageJoinAccess = isAdmin(user);

  const active = classes.filter((c) => !c.archived);
  const archived = classes.filter((c) => c.archived);
  const allActive = allClasses.filter((c) => !c.archived);
  const normalizedPurpose = normalizeClassPurpose(classPurpose);
  const purposeLabel = getClassPurposeLabel(normalizedPurpose);
  const unitLabel = normalizedPurpose === CLASS_PURPOSE_INTERNAL ? "차시" : "반";

  async function handleCreate(e) {
    e.preventDefault();
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    setError("");
    try {
      const copyFromClassIds = normalizedPurpose === CLASS_PURPOSE_INTERNAL
        ? allActive
          .filter((classItem) => (
            classItem.createdBy === user?.uid
            && getClassPurpose(classItem) === CLASS_PURPOSE_INTERNAL
          ))
          .map((classItem) => classItem.id)
        : [];
      const created = await addClass(user, name, { purpose: normalizedPurpose, copyFromClassIds });
      setNewName("");
      onCreated?.(created.id);
    } catch {
      setError(`${unitLabel}을 만들지 못했어요. 잠시 후 다시 시도해 주세요.`);
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
      onToast?.(`'${c.name}' ${unitLabel}을 보관했어요. 학생은 더 이상 접근할 수 없어요.`);
    } catch {
      setError(`${unitLabel}을 보관하지 못했어요.`);
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
      onToast?.(`'${c.name}' ${unitLabel}을 복원했어요.`);
    } catch {
      setError(`${unitLabel}을 복원하지 못했어요.`);
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleJoinAccess(c) {
    if (!canManageJoinAccess || busyId) return;
    const nextEnabled = c.joinEnabled !== true;
    const nextCode = isValidClassJoinCode(c.joinCode) ? c.joinCode : createUniqueClassJoinCode(c.id);
    setBusyId(c.id);
    setError("");
    try {
      await updateClassJoinAccess(c.id, {
        joinEnabled: nextEnabled,
        joinCode: nextEnabled ? nextCode : c.joinCode,
      });
      onToast?.(`'${c.name}' ${unitLabel} 가입을 ${nextEnabled ? "허용" : "차단"}했어요.`);
    } catch {
      setError("가입 상태를 바꾸지 못했어요.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRefreshJoinCode(c) {
    if (!canManageJoinAccess || busyId) return;
    setBusyId(c.id);
    setError("");
    try {
      await updateClassJoinAccess(c.id, {
        joinEnabled: true,
        joinCode: createUniqueClassJoinCode(c.id),
      });
      onToast?.(`'${c.name}' ${unitLabel} 참여 코드를 새로 만들었어요.`);
    } catch {
      setError("참여 코드를 새로 만들지 못했어요.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleSaveJoinCode(c, value) {
    if (!canManageJoinAccess || busyId) return;
    const joinCode = normalizeClassJoinCode(value);
    if (!isValidClassJoinCode(joinCode)) {
      setError("참여 코드는 숫자 6자리로 입력해 주세요.");
      return;
    }
    if (allActive.some((item) => item.id !== c.id && normalizeClassJoinCode(item.joinCode) === joinCode)) {
      setError("이미 다른 반/차시에서 사용 중인 참여 코드입니다.");
      return;
    }
    setBusyId(c.id);
    setError("");
    try {
      await updateClassJoinAccess(c.id, { joinEnabled: true, joinCode });
      onToast?.(`'${c.name}' ${unitLabel} 참여 코드를 ${joinCode}로 저장했어요.`);
    } catch {
      setError("참여 코드를 저장하지 못했어요.");
    } finally {
      setBusyId(null);
    }
  }

  function createUniqueClassJoinCode(exceptId) {
    for (let count = 0; count < 12; count += 1) {
      const joinCode = createClassJoinCode();
      if (!allActive.some((item) => item.id !== exceptId && normalizeClassJoinCode(item.joinCode) === joinCode)) {
        return joinCode;
      }
    }
    return createClassJoinCode();
  }

  async function handleDelete() {
    if (!confirmDelete || busyId) return;
    const { id, name } = confirmDelete;
    setBusyId(id);
    setError("");
    try {
      const result = await deleteClassAction(id);
      setConfirmDelete(null);
      const retained = Number(result?.retainedFiles ?? 0);
      const retainedNote = retained > 0 ? ` 공유 중이거나 확인이 필요한 파일 ${retained}개는 보존했어요.` : "";
      onToast?.(`${unitLabel} '${name}' 삭제를 완료했어요.${retainedNote}`);
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : `${unitLabel} 삭제에 실패했어요. 다시 시도해 주세요.`;
      setError(message);
      setConfirmDelete(null);
    } finally {
      setBusyId(null);
    }
  }

  if (!canManageJoinAccess) return null;
  const deleting = confirmDelete && busyId === confirmDelete.id;
  const closeManager = () => {
    if (!busyId) onClose();
  };

  return (
    <div className="modal-backdrop" {...backdropClose(closeManager)}>
      <div className="modal modal-class-manager" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{unitLabel} 관리하기 <span className="class-mgr-purpose-badge">{purposeLabel}</span></h3>
          <button className="btn-close" onClick={closeManager} aria-label="닫기" disabled={Boolean(busyId)}>
            ×
          </button>
        </div>

        <form className="class-mgr-create" onSubmit={handleCreate}>
          <input
            type="text"
            placeholder={normalizedPurpose === CLASS_PURPOSE_INTERNAL
              ? "새 차시 이름 (예: 2차시 자료 조사)"
              : "새 반 이름 (예: 3학년 3반, 수요일 코딩반)"}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button type="submit" className="btn-primary" disabled={creating}>
            {creating ? "만드는 중..." : `${purposeLabel} ${unitLabel} 만들기`}
          </button>
        </form>
        {normalizedPurpose === CLASS_PURPOSE_INTERNAL && (
          <p className="class-mgr-mode-note">
            교내용 차시는 같은 선생님이 만든 기존 교내용 차시의 참여자를 새 차시에도 자동으로 이어 붙입니다.
          </p>
        )}

        {error && <p className="form-error" role="alert" style={{ wordBreak: "keep-all" }}>{error}</p>}

        <div className="class-mgr-section">
          <div className="class-mgr-section-title">운영 중인 {unitLabel} ({active.length})</div>
          {active.length === 0 ? (
            <p className="empty-note">아직 만든 {unitLabel}이 없어요.</p>
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
                  onDelete={setConfirmDelete}
                />
              ))}
            </ul>
          )}
        </div>

        <div className="class-mgr-section">
          <div className="class-mgr-section-title">보관된 {unitLabel} ({archived.length})</div>
          {archived.length === 0 ? (
            <p className="empty-note">보관된 {unitLabel}이 없어요.</p>
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
          title={`${unitLabel} 삭제`}
          preview={confirmDelete.name}
          description={<span style={{ wordBreak: "keep-all" }}>
            {deleting
              ? "삭제 작업을 진행하고 있어요. 창을 닫지 말고 완료될 때까지 기다려 주세요."
              : `보관된 ${unitLabel} 기록과 사용하지 않는 이미지가 삭제됩니다. 되돌릴 수 없어요. 공유 중인 파일은 보존됩니다. 완료될 때까지 이 창을 열어 두고, 다른 탭에서 같은 ${unitLabel}을 수정하지 마세요.`}
          </span>}
          confirmLabel={deleting ? "삭제 중..." : "삭제"}
          confirmDisabled={Boolean(deleting)}
          cancelDisabled={Boolean(deleting)}
          danger
          onConfirm={handleDelete}
          onClose={() => {
            if (!deleting) setConfirmDelete(null);
          }}
        />
      )}
    </div>
  );
}
