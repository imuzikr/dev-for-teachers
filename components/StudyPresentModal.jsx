"use client";

// =============================================================
// 발표 모드 — 학생이 적은 글을 슬라이드처럼 크게 띄우고 순서대로 넘겨보는
// 모달 (교사 전용). 첨부파일·이미지는 보여주지 않고 텍스트만 다룹니다.
// -------------------------------------------------------------
// · 좌우 화살표(‹ ›) + 키보드 ← → 이동, Esc 닫기
// · 상단에 진행 위치(n / 총원)와 학생 실명 표시
// =============================================================
import { useEffect, useState } from "react";
import {
  getDirectoryRealName,
  startBroadcast,
  stopBroadcast,
} from "@/lib/store";
import { getCurrentUser, isTeacher } from "@/lib/user";
import { sanitizeHtml, stripImgTags } from "@/lib/html";

export default function StudyPresentModal({ board, cards = [], onClose }) {
  const [idx, setIdx] = useState(0);
  const total = cards.length;
  const card = cards[Math.min(idx, total - 1)];

  // 키보드: ← → 이동, Esc 닫기
  useEffect(() => {
    function onKey(e) {
      if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1));
      else if (e.key === "ArrowRight") setIdx((i) => Math.min(total - 1, i + 1));
      else if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total, onClose]);

  // 방송 종료 — 발표 모드를 닫으면 학생 화면도 즉시 원래대로 돌아갑니다.
  useEffect(() => {
    if (!board.classId || !isTeacher(getCurrentUser())) return;
    return () => { stopBroadcast(board.classId); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.classId]);

  // 방송 내용 갱신 — 카드를 넘길 때마다 학생 화면도 같은 카드로 함께 넘어갑니다.
  useEffect(() => {
    if (!board.classId || !card) return;
    const me = getCurrentUser();
    if (!isTeacher(me)) return;
    const isGroup = !!card.groupId;
    const name = isGroup
      ? card.title || card.groupName || "모둠"
      : getDirectoryRealName(card.authorId) || card.authorName || "익명";
    startBroadcast(me, board.classId, {
      mode: "carousel",
      boardId: board.id,
      boardTitle: board.title,
      cardId: card.id,
      title: card.title || "",
      content: stripImgTags(sanitizeHtml(card.content || "")),
      displayName: name,
      isGroupCard: isGroup,
      members: card.members ?? null,
      idx,
      total,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.classId, board.id, board.title, card?.id, idx, total]);

  if (!card) return null;

  const isGroupCard = !!card.groupId;
  const displayName = isGroupCard
    ? card.title || card.groupName || "모둠"
    : getDirectoryRealName(card.authorId) || card.authorName || "익명";

  // 발표 화면은 텍스트만 — 이미지·첨부파일은 보여주지 않습니다.
  const safeContent = sanitizeHtml(card.content || "");
  const textHtml = stripImgTags(safeContent);
  const hasText = textHtml.replace(/<[^>]*>/g, "").trim().length > 0;

  return (
    <div className="modal-backdrop present-backdrop" onClick={onClose}>
      <div className="present-modal" onClick={(e) => e.stopPropagation()}>
        {/* 헤더 — 학생 실명 + 진행 위치 */}
        <div className="present-head">
          <div className="present-who">
            <span className="present-avatar" aria-hidden="true">
              {isGroupCard ? "👥" : card.authorEmoji || "🙂"}
            </span>
            <strong className="present-name">{displayName}</strong>
            {isGroupCard && card.members?.length > 0 && (
              <span className="present-group-members">
                {card.members
                  .map((m) => (m.uid === card.leaderUid ? `👑 ${m.name}` : m.name))
                  .join(" · ")}
              </span>
            )}
            <span className="present-progress">{idx + 1} / {total}</span>
            <span className="present-board"># {board.title}</span>
          </div>
          <button className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        {/* 본문 — 슬라이드 한 장처럼 보이도록 가운데 카드에 텍스트만 크게 */}
        <div className="present-body" key={card.id}>
          <div className="present-slide">
            {card.title && <h2 className="present-slide-title">{card.title}</h2>}
            {hasText ? (
              <div
                className="present-slide-content study-card-body"
                dangerouslySetInnerHTML={{ __html: textHtml }}
              />
            ) : (
              <p className="present-empty">아직 작성한 내용이 없어요.</p>
            )}
          </div>
        </div>

        <div className="present-foot">
          {isGroupCard ? (
            <span className="present-group-note">
              모둠 카드
            </span>
          ) : null}
        </div>

        {/* 좌우 이동 화살표 */}
        <button
          className="present-nav present-prev"
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
          disabled={idx === 0}
          aria-label="이전 학생"
        >
          ‹
        </button>
        <button
          className="present-nav present-next"
          onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}
          disabled={idx >= total - 1}
          aria-label="다음 학생"
        >
          ›
        </button>
      </div>
    </div>
  );
}
