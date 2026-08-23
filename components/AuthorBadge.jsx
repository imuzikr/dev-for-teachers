"use client";

// =============================================================
// 게시물 작성자 프로필 (동그라미 아바타 + 익명 닉네임)
// -------------------------------------------------------------
// - 카드, 상세 모달, 채팅 말풍선 등 글이 있는 곳마다 사용합니다.
// - 일반 학생에게는 익명 닉네임만 보입니다.
// - 관리자(교사)가 클릭하면 실제 사용자 이름이 칩으로 표시되고,
//   다시 클릭하면 숨겨집니다.
// =============================================================
import { useState } from "react";
import { getCurrentUser, isTeacher } from "@/lib/user";
import { getDirectoryRealName } from "@/lib/store";
import { IconTeacher } from "@/components/StatusIcons";

export default function AuthorBadge({ name, emoji, realName, uid }) {
  const [revealed, setRevealed] = useState(false);
  // 작성자가 교사면(예약어 "선생님") 실명을 드러내지 않습니다 — 항상 "선생님".
  const isTeacherAuthor = name === "선생님";
  const admin = isTeacher(getCurrentUser()) && !isTeacherAuthor;
  // 실명은 게시물에 저장하지 않으므로, 교사용 사용자 디렉터리에서 조회합니다.
  // (구버전 문서엔 realName prop이 남아 있을 수 있어 fallback으로 둡니다.)
  const resolvedRealName = getDirectoryRealName(uid) || realName;

  function handleClick(e) {
    if (!admin) return; // 학생은 클릭해도 아무 일도 없음 (카드 클릭은 그대로 동작)
    e.stopPropagation(); // 카드 클릭(모달 열기)으로 번지지 않도록
    setRevealed((v) => !v);
  }

  return (
    <span
      className={`author ${admin ? "author-clickable" : ""}`}
      onClick={handleClick}
      title={admin ? "클릭하면 실제 사용자를 확인할 수 있어요 (관리자 전용)" : undefined}
    >
      <span className="avatar avatar-sm" aria-hidden="true">
        {isTeacherAuthor ? <IconTeacher size={18} /> : emoji ?? "🙂"}
      </span>
      <strong className="author-name">{name}</strong>
      {admin && revealed && (
        <span className="author-real">
          🔓 {resolvedRealName || "정보 없음"}
          {uid ? ` (${uid})` : ""}
        </span>
      )}
    </span>
  );
}
