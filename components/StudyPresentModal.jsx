"use client";

// =============================================================
// 발표 모드 — 학생이 적은 글을 슬라이드처럼 크게 띄우고 순서대로 넘겨보는
// 모달 (교사 전용). 첨부파일·이미지는 보여주지 않고 텍스트만 다룹니다.
// -------------------------------------------------------------
// · 좌우 화살표(‹ ›) + 키보드 ← → 이동, Esc 닫기
// · 상단에 진행 위치(n / 총원)와 학생 실명 표시
// · 하단에 🍎 과일 주기 버튼 — 발표를 보며 바로 '멋진 순간' 부여
// =============================================================
import { useEffect, useState } from "react";
import {
  subscribeClassRewards,
  setStudentReward,
  getDirectoryRealName,
  startBroadcast,
  stopBroadcast,
  REWARD_MAX,
} from "@/lib/store";
import { getCurrentUser, isTeacher } from "@/lib/user";
import { sanitizeHtml, stripImgTags } from "@/lib/html";
import RewardFruits, { rewardStars } from "./RewardFruits";

export default function StudyPresentModal({ board, cards = [], onClose }) {
  const [idx, setIdx] = useState(0);
  const [rewardMap, setRewardMap] = useState({}); // uid -> count
  const total = cards.length;
  const card = cards[Math.min(idx, total - 1)];

  // 이번 반의 과일 보상 구독 (실시간)
  useEffect(() => {
    if (!board.classId) return;
    return subscribeClassRewards(board.classId, (list) => {
      const m = {};
      list.forEach((r) => { m[r.uid] = r.count ?? 0; });
      setRewardMap(m);
    });
  }, [board.classId]);

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

  // 모둠 카드: 작성자(교사) 대신 모둠 이름·구성원을 표시하고,
  // 과일 주기는 개인 단위 보상이라 숨깁니다(작성자=교사 uid라 오지급 방지).
  const isGroupCard = !!card.groupId;
  const displayName = isGroupCard
    ? card.title || card.groupName || "모둠"
    : getDirectoryRealName(card.authorId) || card.authorName || "익명";
  const count = rewardMap[card.authorId] ?? 0;

  // 발표 화면은 텍스트만 — 이미지·첨부파일은 보여주지 않습니다.
  const safeContent = sanitizeHtml(card.content || "");
  const textHtml = stripImgTags(safeContent);
  const hasText = textHtml.replace(/<[^>]*>/g, "").trim().length > 0;

  function awardFruit() {
    if (count >= REWARD_MAX) return;
    // 실명을 함께 저장 — 공부방은 실명 참여 공간(학생 화면 이름표용).
    // rewards는 규칙상 그 반 소속 학생만 읽을 수 있음.
    setStudentReward(board.classId, card.authorId, count + 1, {
      name: displayName,
      emoji: card.authorEmoji || "🙂",
    });
  }

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

        {/* 하단 — 과일 주기 (모둠 카드는 개인 보상이라 표시하지 않음) */}
        <div className="present-foot">
          {isGroupCard ? (
            <span className="present-group-note">
              모둠 카드 — 과일은 공부방 '멋진 순간' 패널에서 학생별로 주세요.
            </span>
          ) : (
          <div className="present-fruits">
            {rewardStars(count) > 0 && (
              <span className="present-star" title={`⭐ = 과일 20개`}>
                {"⭐".repeat(rewardStars(count))}
              </span>
            )}
            <RewardFruits count={count} className="reward-fruits present-fruit-strip" />
            <span className="present-fruit-count">{count}개</span>
          </div>
          )}
          {!isGroupCard && (
            <button
              className="btn-primary present-award"
              onClick={awardFruit}
              disabled={count >= REWARD_MAX}
            >
              🍎 과일 주기{count >= REWARD_MAX ? " (최대)" : ""}
            </button>
          )}
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
