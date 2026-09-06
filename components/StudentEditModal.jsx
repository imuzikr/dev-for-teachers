"use client";

import { backdropClose } from "@/lib/modal";
import { useState } from "react";
import { updateStudentProfile, deleteStudent } from "@/lib/store";
import ConfirmModal from "./ConfirmModal";
import { IconTrash } from "./StatusIcons";

export default function StudentEditModal({ student, onClose }) {
  const isTeacherTarget = student.role === "teacher" || student.role === "admin";
  const roleWord = isTeacherTarget ? "선생님" : "학생";
  const [editing, setEditing] = useState(false);
  const [schoolName, setSchoolName] = useState(student.schoolName ?? "");
  const [realName, setRealName] = useState(student.realName ?? "");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const canSave = schoolName.trim() && realName.trim() && !saving;

  function handleStartEdit() {
    setEditing(true);
  }

  function handleCancelEdit() {
    setSchoolName(student.schoolName ?? "");
    setRealName(student.realName ?? "");
    setEditing(false);
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      await updateStudentProfile(student.id, {
        schoolName: schoolName.trim(),
        realName: realName.trim(),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      await deleteStudent(student.id);
      setConfirmDelete(false);
      onClose();
    } catch (e) {
      // 실패를 조용히 넘기면 확인 모달만 그대로 떠 있는 것처럼 보입니다 —
      // 확인 모달은 닫고, 프로필 모달에 원인을 남겨 교사가 읽고 직접
      // 닫게 합니다(바로 onClose하면 메시지도 같이 사라져 버립니다).
      setConfirmDelete(false);
      setDeleteError(
        e?.code === "permission-denied"
          ? "담당하는 반의 학생만 탈퇴 처리할 수 있어요. 관리자에게 요청해 주세요."
          : e?.partial
          ? e.message
          : `탈퇴 처리에 실패했어요: ${e?.message ?? "알 수 없는 오류"}`
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="modal-backdrop" {...backdropClose(onClose)}>
        <div
          className="modal student-edit-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="btn-close modal-close-float"
            onClick={onClose}
            aria-label="닫기"
          >
            ×
          </button>

          <h2 className="student-edit-title">
            {editing ? "프로필 편집" : "프로필"}
          </h2>

          <div className="student-edit-fields">
            <div className="student-edit-field">
              <span>학교 이름</span>
              {editing ? (
                <input
                  type="text"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="학교 이름"
                  maxLength={40}
                  autoFocus
                />
              ) : (
                <div className="student-edit-value">{schoolName || "—"}</div>
              )}
            </div>
            <div className="student-edit-field">
              <span>성명</span>
              {editing ? (
                <input
                  type="text"
                  value={realName}
                  onChange={(e) => setRealName(e.target.value)}
                  placeholder="성명"
                  maxLength={30}
                />
              ) : (
                <div className="student-edit-value">{realName || "—"}</div>
              )}
            </div>
          </div>

          <div className="student-edit-actions">
            <button
              type="button"
              className="btn-ghost"
              onClick={editing ? handleCancelEdit : onClose}
            >
              취소
            </button>
            {editing ? (
              <button
                type="button"
                className="btn-primary"
                onClick={handleSave}
                disabled={!canSave}
              >
                {saving ? "저장 중…" : "저장"}
              </button>
            ) : (
              <button
                type="button"
                className="btn-primary"
                onClick={handleStartEdit}
              >
                편집
              </button>
            )}
          </div>

          <div className="student-edit-danger">
            <button
              type="button"
              className="btn-ghost qa-delete"
              onClick={() => {
                setDeleteError("");
                setConfirmDelete(true);
              }}
              disabled={deleting}
            >
              <IconTrash size={15} /> 탈퇴 처리
            </button>
            {deleteError && (
              <p className="form-error" role="alert">
                {deleteError}
              </p>
            )}
          </div>
        </div>
      </div>

      {confirmDelete && (
        <ConfirmModal
          title={`${roleWord} 탈퇴 처리`}
          preview={realName || roleWord}
          description={`이 ${roleWord}의 모든 게시물·활동 데이터와 프로필이\n영구 삭제됩니다. 복구할 수 없습니다.`}
          confirmLabel={deleting ? "처리 중…" : "탈퇴 처리"}
          danger
          onConfirm={handleDelete}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}
