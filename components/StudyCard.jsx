"use client";

import { formatTime, getDirectoryUser } from "@/lib/store";
import { stripHtml } from "@/lib/html";
import { IconTeacher } from "./StatusIcons";

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp"]);

export default function StudyCard({ card, onClick, isTeacher = false }) {
  // 모둠 카드 — 모둠명 + 구성원(대표 👑)을 헤더에 표시
  const isGroupCard = !!card.groupId;
  // 교사 카드: 데모는 "teacher_" 접두, 실서비스는 작성자명이 "선생님"(예약어)
  const isTeacherCard =
    card.authorId?.startsWith?.("teacher_") || card.authorName === "선생님";
  // 학생에게는 익명 닉네임만, 교사에게는 디렉터리의 실명·학번을 보여줍니다.
  // (교사 본인 카드는 실명 대신 항상 "선생님")
  const dirUser = isTeacher && !isTeacherCard ? getDirectoryUser(card.authorId) : null;
  const displayName = dirUser?.realName || card.authorName;
  const studentId = dirUser?.studentId ?? card.authorStudentId ?? null;
  const preview = stripHtml(card.content ?? "").slice(0, 120);
  const attachCount = card.attachments?.length ?? 0;
  const thumbAtt = card.attachments?.find((a) => IMAGE_EXTS.has(a.ext));
  // 이미지가 첨부돼 있을 때만 썸네일 표시 — 본문 이미지(imageUrl) 또는 이미지 첨부
  const thumbSrc = card.imageUrl || thumbAtt?.dataUrl || null;

  return (
    <article
      className="study-card"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick?.()}
    >
      <div className="study-card-head">
        <span className="avatar avatar-sm" aria-hidden="true">
          {isGroupCard ? "👥" : isTeacherCard ? <IconTeacher size={22} /> : (card.authorEmoji ?? "🙂")}
        </span>
        <div className="study-card-author">
          {isGroupCard ? (
            <strong>
              {card.title || card.groupName}
              {card.retired && <span className="study-card-retired"> · 보관됨</span>}
            </strong>
          ) : isTeacher && !isTeacherCard && studentId ? (
            <>
              <span className="study-card-studentid">{studentId}</span>
              <strong>{displayName}</strong>
            </>
          ) : (
            <strong>{displayName}</strong>
          )}
        </div>
        {attachCount > 0 && (
          <span className="study-card-attach-count" aria-label={`첨부 파일 ${attachCount}개`}>
            📎{attachCount}
          </span>
        )}
        <time className="study-card-time">{formatTime(card.createdAt)}</time>
      </div>

      {/* 모둠 구성원 — 대표는 👑 */}
      {isGroupCard && card.members?.length > 0 && (
        <p className="study-card-members">
          {card.members
            .map((m) => (m.uid === card.leaderUid ? `👑 ${m.name}` : m.name))
            .join(" · ")}
        </p>
      )}

      {card.title && <p className="study-card-title">{card.title}</p>}

      {/* 이미지가 첨부됐을 때만 썸네일, 없으면 invisible 텍스트로 높이 유지 */}
      {thumbSrc ? (
        <div className="study-card-thumb-wrap">
          <img className="study-card-thumb" src={thumbSrc} alt="" aria-hidden="true" />
        </div>
      ) : (
        <p className="study-card-preview" aria-hidden="true">{preview}</p>
      )}
    </article>
  );
}
