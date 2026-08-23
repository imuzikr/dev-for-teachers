"use client";

// =============================================================
// 공부방 오른쪽 "멋진 순간" 패널 — 교사 전용
// -------------------------------------------------------------
// 반 학생 명단(실명) + ＋/− 과일 주기 + 💬 누가기록 작성.
// (학생 본인의 과일 총합은 상단바 프로필 옆 뱃지로 확인합니다)
// 헤더의 « 버튼으로 접기 — 접으면 세로 슬림 바(개인 설정, localStorage).
// =============================================================
import { useEffect, useState } from "react";
import { REWARD_MAX } from "@/lib/store";
import StudentNotesModal from "./StudentNotesModal";
import RewardFruits, { rewardStars } from "./RewardFruits";

const COLLAPSE_KEY = "reward_panel_collapsed";

export default function StudyRewardPanel({
  roster = [],
  onAward,
  classId = null,
}) {
  const [notesFor, setNotesFor] = useState(null); // 누가기록 모달 대상 학생(교사만)
  const [collapsed, setCollapsed] = useState(false);

  // 접힘 상태 복원 — 개인 화면 설정이라 localStorage에 저장
  useEffect(() => {
    try { setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1"); } catch { /* 무시 */ }
  }, []);
  function toggleCollapsed() {
    setCollapsed((v) => {
      try { localStorage.setItem(COLLAPSE_KEY, v ? "0" : "1"); } catch { /* 무시 */ }
      return !v;
    });
  }

  // 접힌 상태 — 세로 슬림 바. 클릭하면 다시 펼침.
  if (collapsed) {
    return (
      <aside
        className="reward-panel reward-panel--collapsed"
        role="button"
        tabIndex={0}
        onClick={toggleCollapsed}
        onKeyDown={(e) => e.key === "Enter" && toggleCollapsed()}
        title="'멋진 순간' 펼치기"
        aria-label="멋진 순간 펼치기"
      >
        <span className="reward-collapsed-expand" aria-hidden="true">«</span>
        <span className="reward-collapsed-icon" aria-hidden="true">🍎</span>
        <span className="reward-collapsed-title">멋진 순간</span>
      </aside>
    );
  }

  return (
    <aside className="reward-panel" aria-label="멋진 순간">
      <div className="reward-head">
        <div className="reward-head-row">
          <span className="reward-title">🍎 멋진 순간</span>
          <button
            type="button"
            className="reward-collapse-btn"
            onClick={toggleCollapsed}
            title="패널 접기"
            aria-label="멋진 순간 패널 접기"
          >
            »
          </button>
        </div>
        <span className="reward-sub">＋로 과일을 주세요 · 20개마다 ⭐</span>
      </div>

      {roster.length === 0 ? (
        <p className="reward-empty">
          아직 이 반에 입장한 학생이 없어요. 입장 코드를 알려 주세요.
        </p>
      ) : (
        <ul className="reward-list">
          {roster.map((s) => (
            <li key={s.uid} className="reward-row">
              {rewardStars(s.count) > 0 && (
                <div
                  className="reward-stars-line"
                  title={`⭐ ${rewardStars(s.count)}개 = 과일 ${rewardStars(s.count) * 20}개`}
                  aria-label={`별 ${rewardStars(s.count)}개`}
                >
                  {"⭐".repeat(rewardStars(s.count))}
                </div>
              )}
              <div className="reward-row-top">
                <span className="reward-avatar" aria-hidden="true">{s.emoji}</span>
                <span className="reward-name" title={s.name}>{s.name}</span>
                <button
                  type="button"
                  className="reward-note-btn"
                  onClick={() => setNotesFor(s)}
                  title={`${s.name} 누가기록`}
                  aria-label={`${s.name} 누가기록`}
                >
                  💬
                </button>
                <span className="reward-count">{s.count}</span>
                <span className="reward-actions">
                  {s.count > 0 && (
                    <button
                      type="button"
                      className="reward-btn reward-minus"
                      onClick={() => onAward(s.uid, s.count - 1)}
                      aria-label={`${s.name} 과일 빼기`}
                    >
                      −
                    </button>
                  )}
                  <button
                    type="button"
                    className="reward-btn reward-plus"
                    onClick={() => onAward(s.uid, Math.min(REWARD_MAX, s.count + 1))}
                    disabled={s.count >= REWARD_MAX}
                    aria-label={`${s.name} 과일 주기`}
                  >
                    ＋
                  </button>
                </span>
              </div>

              <RewardFruits count={s.count} />
            </li>
          ))}
        </ul>
      )}

      {notesFor && (
        <StudentNotesModal
          student={notesFor}
          classId={classId}
          onClose={() => setNotesFor(null)}
        />
      )}
    </aside>
  );
}
