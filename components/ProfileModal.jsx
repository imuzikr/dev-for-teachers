"use client";

// =============================================================
// 내 프로필 모달 — 상단바 프로필 메뉴에서 열림
// -------------------------------------------------------------
// · 학생: 기본 아바타(이모지)만 직접 수정. 실명·학번·닉네임은 읽기 전용
//   (실명·학번은 선생님만 수정 — 서버 규칙에서도 강제).
// · 교사: 실명만 수정(화면 표시는 항상 '선생님'·🧑‍🏫 고정).
// =============================================================
import { backdropClose } from "@/lib/modal";
import { useState } from "react";
import { updateMyProfile, requestWithdrawal, dismissWithdrawalRequest } from "@/lib/store";
import { isTeacher, isAdmin } from "@/lib/user";
import { isFirebaseConfigured } from "@/lib/firebase";
import { ANIMALS } from "./StudentEditModal";
import ConfirmModal from "./ConfirmModal";

export default function ProfileModal({ user, onClose }) {
  const teacherRole = isTeacher(user);
  const adminRole = isAdmin(user);
  const [emoji, setEmoji] = useState(user.emoji || "🙂");
  const [realName, setRealName] = useState(user.realName || "");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [withdrawRequested, setWithdrawRequested] = useState(!!user.withdrawRequested);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  // 신청 승인권자 — 학생은 선생님이, 선생님은 최고 관리자가 확인합니다.
  const approverWord = teacherRole ? "최고 관리자" : "선생님";

  const dirty = teacherRole
    ? realName.trim() !== (user.realName || "")
    : emoji !== (user.emoji || "🙂");

  async function handleSave() {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await updateMyProfile(
        user.uid,
        teacherRole ? { realName: realName.trim() } : { emoji }
      );
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

        <div className="student-edit-emoji-row">
          <div className="student-edit-emoji-wrap">
            {teacherRole ? (
              <div className="student-edit-emoji-btn readonly">🧑‍🏫</div>
            ) : (
              <button
                type="button"
                className="student-edit-emoji-btn"
                onClick={() => setPickerOpen((v) => !v)}
                title="기본 아바타 변경"
              >
                {emoji}
              </button>
            )}
            {pickerOpen && !teacherRole && (
              <div className="emoji-picker" role="listbox" aria-label="아바타 선택">
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
          {!teacherRole && <p className="student-edit-emoji-hint">클릭해서 변경</p>}
        </div>

        <div className="student-edit-fields">
          <div className="student-edit-field">
            <span>실명</span>
            {teacherRole ? (
              <input
                type="text"
                value={realName}
                onChange={(e) => setRealName(e.target.value)}
                placeholder="실명"
                maxLength={30}
              />
            ) : (
              <div className="student-edit-value">{user.realName || "—"}</div>
            )}
          </div>
          {!teacherRole && (
            <>
              <div className="student-edit-field">
                <span>학번</span>
                <div className="student-edit-value">{user.studentId || "—"}</div>
              </div>
              <div className="student-edit-field">
                <span>닉네임</span>
                <div className="student-edit-value">
                  {user.displayName || "—"}
                </div>
              </div>
            </>
          )}
          <div className="student-edit-field">
            <span>이메일</span>
            <div className="student-edit-value">{user.email || "—"}</div>
          </div>
        </div>

        {!teacherRole && (
          <p className="profile-modal-hint">
            실명·학번은 선생님만 수정할 수 있어요. 게시물과 채팅에는 실명 대신
            익명 닉네임만 표시됩니다.
          </p>
        )}

        <div className="student-edit-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            닫기
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSave}
            disabled={!dirty || saving}
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
