"use client";

// =============================================================
// 과일 아이콘 나열 — 고정 순서(10종)로 그립니다.
// 20개(REWARD_STAR)가 차면 별(⭐) 하나로 접어 아바타 옆 뱃지로 표시하고,
// 과일 뱃지는 나머지(count % 20)부터 새로 시작합니다.
// (멋진 순간 패널·발표 모드·대시보드 공통)
// =============================================================
import { REWARD_STAR } from "@/lib/store";

export const FRUITS = ["🍎", "🍊", "🍋", "🍇", "🍓", "🍑", "🍈", "🍉", "🍒", "🥝"];

// count → 별 개수 (과일 20개 = ⭐ 1개)
export function rewardStars(count = 0) {
  return Math.floor((count || 0) / REWARD_STAR);
}

export default function RewardFruits({ count = 0, className = "reward-fruits" }) {
  const rest = (count || 0) % REWARD_STAR; // 별로 접힌 뒤 남은 과일만 표시
  if (rest <= 0) return null;
  return (
    <div className={className} aria-label={`과일 ${count}개`}>
      {Array.from({ length: rest }).map((_, i) => (
        <span key={i} className="reward-fruit">
          {FRUITS[i % FRUITS.length]}
        </span>
      ))}
    </div>
  );
}
