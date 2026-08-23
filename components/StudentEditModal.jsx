"use client";

import { backdropClose } from "@/lib/modal";
import { useState } from "react";
import { updateStudentProfile, deleteStudent } from "@/lib/store";
import ConfirmModal from "./ConfirmModal";
import { IconTrash } from "./StatusIcons";

export const ANIMALS = [
  { name: "달팽이", emoji: "🐌" },
  { name: "돌고래", emoji: "🐬" },
  { name: "판다", emoji: "🐼" },
  { name: "나무늘보", emoji: "🦥" },
  { name: "고슴도치", emoji: "🦔" },
  { name: "수달", emoji: "🦦" },
  { name: "펭귄", emoji: "🐧" },
  { name: "부엉이", emoji: "🦉" },
  { name: "다람쥐", emoji: "🐿️" },
  { name: "고래", emoji: "🐋" },
  { name: "여우", emoji: "🦊" },
  { name: "거북이", emoji: "🐢" },
  { name: "문어", emoji: "🐙" },
  { name: "코알라", emoji: "🐨" },
  { name: "토끼", emoji: "🐰" },
  { name: "햄스터", emoji: "🐹" },
];

export default function StudentEditModal({ student, onClose }) {
  const isTeacherTarget = student.role === "teacher" || student.role === "admin";
  const roleWord = isTeacherTarget ? "선생님" : "학생";
  const [editing, setEditing] = useState(false);
  const [emoji, setEmoji] = useState(student.emoji);
  const [name, setName] = useState(student.name);
  const [realName, setRealName] = useState(student.realName ?? "");
  const [studentId, setStudentId] = useState(student.studentId ?? "");
  const [email, setEmail] = useState(student.email ?? "");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  function handleStartEdit() {
    setEditing(true);
  }

  function handleCancelEdit() {
    setEmoji(student.emoji);
    setName(student.name);
    setRealName(student.realName ?? "");
    setStudentId(student.studentId ?? "");
    setEmail(student.email ?? "");
    setPickerOpen(false);
    setEditing(false);
  }

  async function handleSave() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await updateStudentProfile(student.id, {
        name: name.trim(),
        emoji,
        realName: realName.trim(),
        studentId: studentId.trim(),
        email: email.trim(),
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
        e?.code === "functions/permission-denied"
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

          <div className="student-edit-emoji-row">
            <div className="student-edit-emoji-wrap">
              {editing ? (
                <button
                  type="button"
                  className="student-edit-emoji-btn"
                  onClick={() => setPickerOpen((v) => !v)}
                  title="이모지 변경"
                >
                  {emoji}
                </button>
              ) : (
                <div className="student-edit-emoji-btn readonly">{emoji}</div>
              )}
              {pickerOpen && editing && (
                <div className="emoji-picker" role="listbox" aria-label="이모지 선택">
                  {ANIMALS.map((a) => (
                    <button
                      key={a.emoji}
                      type="button"
                      role="option"
                      aria-selected={emoji === a.emoji}
                      className={`emoji-pick-btn${emoji === a.emoji ? " active" : ""}`}
                      title={a.name}
                      onClick={() => {
                        setEmoji(a.emoji);
                        setPickerOpen(false);
                      }}
                    >
                      {a.emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {editing && <p className="student-edit-emoji-hint">클릭해서 변경</p>}
          </div>

          <div className="student-edit-fields">
            <div className="student-edit-field">
              <span>닉네임</span>
              {editing ? (
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="익명 닉네임"
                  maxLength={30}
                  autoFocus
                />
              ) : (
                <div className="student-edit-value">{name || "—"}</div>
              )}
            </div>
            <div className="student-edit-field">
              <span>실명</span>
              {editing ? (
                <input
                  type="text"
                  value={realName}
                  onChange={(e) => setRealName(e.target.value)}
                  placeholder="실명 (선택)"
                  maxLength={30}
                />
              ) : (
                <div className="student-edit-value">{realName || "—"}</div>
              )}
            </div>
            {!isTeacherTarget && (
              <div className="student-edit-field">
                <span>학번</span>
                {editing ? (
                  <input
                    type="text"
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    placeholder="학번 (예: 30105)"
                    maxLength={20}
                  />
                ) : (
                  <div className="student-edit-value">{studentId || "—"}</div>
                )}
              </div>
            )}
            <div className="student-edit-field">
              <span>이메일</span>
              {editing ? (
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="구글 계정 이메일 (선택)"
                  maxLength={100}
                />
              ) : (
                <div className="student-edit-value">{email || "—"}</div>
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
                disabled={!name.trim() || saving}
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
          preview={`${emoji} ${isTeacherTarget ? realName || "선생님" : name}`}
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
