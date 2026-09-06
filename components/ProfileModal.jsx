"use client";

// =============================================================
// 내 프로필 모달 — 상단바 프로필 메뉴에서 열림
// -------------------------------------------------------------
// =============================================================
import { backdropClose } from "@/lib/modal";
import { useState } from "react";
import { updateMyProfile, requestWithdrawal, dismissWithdrawalRequest } from "@/lib/store";
import { isAdmin, isTeacher } from "@/lib/user";
import { isFirebaseConfigured } from "@/lib/firebase";
import ConfirmModal from "./ConfirmModal";

export default function ProfileModal({ user, onClose }) {
  const teacherRole = isTeacher(user);
  const adminRole = isAdmin(user);
  const [schoolName, setSchoolName] = useState(user.schoolName || "");
  const [realName, setRealName] = useState(user.realName || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [withdrawRequested, setWithdrawRequested] = useState(!!user.withdrawRequested);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const approverWord = teacherRole ? "최고 관리자" : "선생님";

  const dirty =
    schoolName.trim() !== (user.schoolName || "")
    || realName.trim() !== (user.realName || "");
  const canSave = dirty && schoolName.trim() && realName.trim() && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      await updateMyProfile(user.uid, {
        schoolName: schoolName.trim(),
        realName: realName.trim(),
      });
      setSaved(true);
      setTimeout(onClose, 700);
    } finally {
      setSaving(false);
    }
  }

  async function handleRequestWithdraw() {
    setWithdrawBusy(true);
    try {
      await requestWithdrawal(user.uid);
      setWithdrawRequested(true);
    } finally {
      setWithdrawBusy(false);
      setConfirmWithdraw(false);
    }
  }

  async function handleCancelWithdraw() {
    if (withdrawBusy) return;
    setWithdrawBusy(true);
    try {
      await dismissWithdrawalRequest(user.uid);
      setWithdrawRequested(false);
    } finally {
      setWithdrawBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div className="modal student-edit-modal" onClick={(e) => e.stopPropagation()}>
        <button
          className="btn-close modal-close-float"
          onClick={onClose}
          aria-label="닫기"
        >
          ×
        </button>

        <h2 className="student-edit-title">내 프로필</h2>

        <div className="student-edit-fields">
          <div className="student-edit-field">
            <span>학교 이름</span>
            <input
              type="text"
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              placeholder="학교 이름"
              maxLength={40}
              autoFocus
            />
          </div>
          <div className="student-edit-field">
            <span>성명</span>
            <input
              type="text"
              value={realName}
              onChange={(e) => setRealName(e.target.value)}
              placeholder="성명"
              maxLength={30}
            />
          </div>
        </div>

        <div className="student-edit-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            닫기
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSave}
            disabled={!canSave}
          >
            {saved ? "저장했어요 ✓" : saving ? "저장 중…" : "저장"}
          </button>
        </div>

        {isFirebaseConfigured && !adminRole && (
          <div className="student-edit-danger">
            {withdrawRequested ? (
              <>
                <p className="profile-modal-hint">
                  탈퇴 신청이 접수됐어요. {approverWord}이(가) 확인 후 처리합니다.
                </p>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={handleCancelWithdraw}
                  disabled={withdrawBusy}
                >
                  탈퇴 신청 취소
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn-ghost qa-delete"
                onClick={() => setConfirmWithdraw(true)}
              >
                회원 탈퇴 신청
              </button>
            )}
          </div>
        )}
      </div>

      {confirmWithdraw && (
        <ConfirmModal
          title="회원 탈퇴 신청"
          description={`신청 후 ${approverWord} 확인을 거쳐 탈퇴 처리되며, 그 순간 작성한 모든 게시물·활동 데이터와 프로필이 영구 삭제됩니다.\n복구할 수 없으니 신중히 결정해 주세요.`}
          confirmLabel={withdrawBusy ? "신청 중…" : "탈퇴 신청"}
          danger
          onConfirm={handleRequestWithdraw}
          onClose={() => setConfirmWithdraw(false)}
        />
      )}
    </div>
  );
}
