"use client";

// =============================================================
// 역할 관리 (최고 관리자 전용)
// -------------------------------------------------------------
// 권한 구조: 최고 관리자(1명) → 중간 관리자(선생님) → 학생
//  · 선생님 승인/강등/탈퇴·역할 부여는 최고 관리자만 가능 (이 모달 자체가
//    role==='admin'에게만 열립니다. 서버의 setUserRole도 관리자만 허용)
// 실제 권한 변경은 Cloud Functions(setUserRole)가 커스텀 클레임으로 부여합니다.
// (대상 계정은 재로그인해야 반영)
// =============================================================
import { backdropClose } from "@/lib/modal";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  assignUserRole,
  approveTeacherRequest,
  dismissTeacherRequest,
  dismissWithdrawalRequest,
  deleteStudent,
} from "@/lib/store";
import ConfirmModal from "./ConfirmModal";

const ROLE_LABELS = { student: "학생", teacher: "선생님", admin: "관리자" };

function errorText(err) {
  const code = err?.code ?? "";
  if (code === "functions/permission-denied")
    return "권한이 없습니다. (최고 관리자 계정으로 로그인했는지 확인해 주세요)";
  if (code === "functions/not-found")
    return "setUserRole 함수를 찾을 수 없어요. Cloud Functions가 배포되지 않은 것 같습니다.";
  if (code === "functions/unauthenticated")
    return "로그인 상태가 아닙니다. 다시 로그인한 뒤 시도해 주세요.";
  return `처리에 실패했어요. (${code || err?.message || "알 수 없는 오류"})`;
}

function userLabel(u) {
  return u.realName || u.displayName || u.email || u.uid;
}

export default function RoleManagerModal({ directory, onClose }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null); // 선택된 사용자 객체
  const [listOpen, setListOpen] = useState(false);
  const [role, setRole] = useState("teacher");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null); // { type, text }
  const [confirmDelete, setConfirmDelete] = useState(null); // 탈퇴 확인 대상(teacher)
  const comboRef = useRef(null);

  // 콤보박스 바깥 클릭 시 목록 닫기 (닫히면 아래 버튼이 다시 보입니다)
  useEffect(() => {
    if (!listOpen) return;
    function onDown(e) {
      if (!comboRef.current?.contains(e.target)) setListOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [listOpen]);

  // 선생님 승인 대기
  const pending = useMemo(
    () =>
      directory.filter(
        (u) => u.requestedRole === "teacher" && u.role !== "teacher" && u.role !== "admin"
      ),
    [directory]
  );

  // 현재 선생님(중간 관리자) — 최고 관리자(admin)는 제외(자기 자신 관리 불가)
  const teachers = useMemo(
    () => directory.filter((u) => u.role === "teacher"),
    [directory]
  );

  // 선생님 탈퇴 신청 대기 — 본인이 프로필 메뉴에서 신청한 선생님
  const withdrawPending = useMemo(
    () => directory.filter((u) => u.role === "teacher" && u.withdrawRequested),
    [directory]
  );

  // 검색 필터 — 실명/닉네임/이메일/UID 부분일치
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = [...directory].sort((a, b) =>
      userLabel(a).localeCompare(userLabel(b), "ko")
    );
    const filtered = q
      ? base.filter((u) =>
          [u.realName, u.displayName, u.email, u.uid]
            .filter(Boolean)
            .some((v) => v.toLowerCase().includes(q))
        )
      : base;
    return filtered.slice(0, 8);
  }, [query, directory]);

  function pickUser(u) {
    setSelected(u);
    setQuery(userLabel(u));
    setListOpen(false);
    setMessage(null);
  }

  async function run(fn, successText) {
    if (submitting) return;
    setSubmitting(true);
    setMessage(null);
    try {
      await fn();
      setMessage({ type: "success", text: successText });
    } catch (err) {
      setMessage({ type: "error", text: errorText(err) });
    } finally {
      setSubmitting(false);
    }
  }

  const handleAssign = () =>
    selected &&
    run(
      () => assignUserRole(selected.uid, role),
      `${userLabel(selected)} 님을 '${ROLE_LABELS[role]}'(으)로 지정했어요. (본인이 재로그인해야 반영됩니다)`
    );

  const handleApprove = (u) =>
    run(
      () => approveTeacherRequest(u.uid),
      `${userLabel(u)} 님을 선생님으로 승인했어요. (본인이 재로그인해야 반영됩니다)`
    );

  const handleReject = (u) =>
    run(() => dismissTeacherRequest(u.uid), `${userLabel(u)} 님의 선생님 신청을 거절했어요.`);

  const handleDemote = (u) =>
    run(
      () => assignUserRole(u.uid, "student"),
      `${userLabel(u)} 님을 학생으로 강등했어요. (본인이 재로그인해야 반영됩니다)`
    );

  function handleWithdraw(u) {
    setConfirmDelete(u);
  }

  const handleRejectWithdraw = (u) =>
    run(
      () => dismissWithdrawalRequest(u.uid),
      `${userLabel(u)} 님의 탈퇴 신청을 거절했어요.`
    );

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div className="modal role-manager-modal" onClick={(e) => e.stopPropagation()}>
        <button className="btn-close modal-close-float" onClick={onClose} aria-label="닫기">
          ×
        </button>

        <h2 className="student-edit-title">역할 관리</h2>

        {/* 선생님 승인 대기 */}
        {pending.length > 0 && (
          <div className="role-pending">
            <p className="role-pending-title">🧑‍🏫 선생님 승인 대기 ({pending.length})</p>
            <ul className="role-pending-list">
              {pending.map((u) => (
                <li key={u.uid} className="role-pending-item">
                  <span className="role-pending-user">
                    {u.emoji ?? "🙂"} <strong>{userLabel(u)}</strong>
                    {u.email && <small>{u.email}</small>}
                  </span>
                  <span className="role-pending-actions">
                    <button type="button" className="btn-ghost" onClick={() => handleReject(u)} disabled={submitting}>
                      거절
                    </button>
                    <button type="button" className="btn-primary" onClick={() => handleApprove(u)} disabled={submitting}>
                      승인
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 선생님 탈퇴 신청 대기 */}
        {withdrawPending.length > 0 && (
          <div className="role-pending">
            <p className="role-pending-title">🚪 선생님 탈퇴 신청 대기 ({withdrawPending.length})</p>
            <ul className="role-pending-list">
              {withdrawPending.map((u) => (
                <li key={u.uid} className="role-pending-item">
                  <span className="role-pending-user">
                    🧑‍🏫 <strong>{userLabel(u)}</strong>
                    {u.email && <small>{u.email}</small>}
                  </span>
                  <span className="role-pending-actions">
                    <button type="button" className="btn-ghost" onClick={() => handleRejectWithdraw(u)} disabled={submitting}>
                      거절
                    </button>
                    <button type="button" className="btn-ghost role-danger-btn" onClick={() => handleWithdraw(u)} disabled={submitting}>
                      탈퇴 처리
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 현재 선생님(중간 관리자) 관리 — 강등/탈퇴 */}
        {teachers.length > 0 && (
          <div className="role-teachers">
            <p className="role-teachers-title">현재 선생님 ({teachers.length})</p>
            <ul className="role-pending-list">
              {teachers.map((u) => (
                <li key={u.uid} className="role-pending-item">
                  <span className="role-pending-user">
                    🧑‍🏫 <strong>{userLabel(u)}</strong>
                    {u.email && <small>{u.email}</small>}
                  </span>
                  <span className="role-pending-actions">
                    <button type="button" className="btn-ghost" onClick={() => handleDemote(u)} disabled={submitting}>
                      학생으로
                    </button>
                    <button type="button" className="btn-ghost role-danger-btn" onClick={() => handleWithdraw(u)} disabled={submitting}>
                      탈퇴
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="role-manager-hint">
          사용자를 검색해 선택한 뒤 역할을 부여합니다. 대상은 먼저 앱에
          로그인(회원가입)해 있어야 합니다.
        </p>

        {/* 사용자 검색·선택 (클릭하면 목록 표시) */}
        <div className="student-edit-field role-manager-field">
          <span>사용자 선택</span>
          <div className="role-combo" ref={comboRef}>
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(null);
                setListOpen(true);
                setMessage(null);
              }}
              onClick={() => setListOpen(true)}
              placeholder="클릭 후 실명·닉네임·이메일로 검색"
            />
            {listOpen && matches.length > 0 && (
              <ul className="role-combo-list">
                {matches.map((u) => (
                  <li key={u.uid}>
                    <button type="button" onClick={() => pickUser(u)}>
                      <span className="role-combo-name">
                        {u.emoji ?? "🙂"} {userLabel(u)}
                      </span>
                      <span className="role-combo-meta">
                        {u.email ? `${u.email} · ` : ""}
                        {ROLE_LABELS[u.role] ?? u.role}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {selected && (
          <div className="role-manager-match found">
            {selected.emoji ?? "🙂"} <strong>{userLabel(selected)}</strong>
            <span className="role-manager-current"> · 현재 {ROLE_LABELS[selected.role] ?? selected.role}</span>
          </div>
        )}

        {/* 부여할 역할 — 최고 관리자는 1명 고정이므로 학생/교사만 부여 */}
        <div className="student-edit-field role-manager-field">
          <span>부여할 역할</span>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="student">학생</option>
            <option value="teacher">선생님</option>
          </select>
        </div>

        {message && (
          <p className={`role-manager-message ${message.type}`}>{message.text}</p>
        )}

        <div className="student-edit-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            닫기
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleAssign}
            disabled={!selected || submitting}
          >
            {submitting ? "적용 중…" : "역할 부여"}
          </button>
        </div>
      </div>

      {confirmDelete && (
        <ConfirmModal
          title="선생님 탈퇴 처리"
          preview={`🧑‍🏫 ${userLabel(confirmDelete)}`}
          description={"이 선생님 계정의 모든 게시물·활동·프로필이\n영구 삭제됩니다. 복구할 수 없습니다."}
          confirmLabel="탈퇴 처리"
          danger
          onConfirm={async () => {
            const u = confirmDelete;
            setConfirmDelete(null);
            await run(() => deleteStudent(u.uid), `${userLabel(u)} 님을 탈퇴 처리했어요.`);
          }}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
