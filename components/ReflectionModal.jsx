"use client";

// =============================================================
// 한 줄 정리(인사이트) 모달
// -------------------------------------------------------------
// [모드 1] isPending=false (처음 "해결됐어요" 클릭 시)
//   · "정리하고 해결 완료" — 인사이트를 쓰고 해결
//   · "나중에 쓸게요"       — 지금은 미루고 해결 (reflectionPending=true 표시)
//
// [모드 2] isPending=true (인사이트 대기 상태에서 "지금 남기기" 클릭 시)
//   · "인사이트 저장"           — 뒤늦게 인사이트를 작성해 대기 표시 해제
//   · "다음에 쓸게요"       — 모달만 닫고 대기 상태 유지
//
// [설계 의도]
//   "이해한 내용 요약"이 아닌 "이해의 전환점"을 묻습니다.
//   무엇이 막혔다가 어떻게 풀렸는지는 답변에서 베껴 쓸 수 없는,
//   학생 본인만 쓸 수 있는 문장입니다 → 진짜 생성적(generative) 인사이트.
//   learned 한 줄이라도 써야 저장 버튼이 활성화되어, 빈 칸 제출을 막습니다.
// =============================================================
import { backdropClose } from "@/lib/modal";
import { useState } from "react";
import {
  addReflection,
  setQuestionResolved,
  setQuestionResolvedLater,
} from "@/lib/store";

export default function ReflectionModal({
  question,
  user,
  isPending = false,     // true: 대기 상태에서 다시 열린 경우
  pendingAnswerId = null, // "이해됐어요" 경로에서 넘어온 답변 id
  onClose,
}) {
  const [learned, setLearned] = useState("");
  const [next, setNext] = useState("");
  const [saving, setSaving] = useState(false);

  const canSave = learned.trim().length > 0;

  // 인사이트 저장: 이해됐어요 경로면 understoodAnswerId도 함께 확정합니다.
  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await addReflection(
        user,
        question.id,
        { learned: learned.trim(), next: next.trim() },
        pendingAnswerId  // null이면 무시됨
      );
      // addReflection이 understoodAnswerId + resolved를 처리하지 않는 경우(일반 해결 경로)
      if (!pendingAnswerId) {
        await setQuestionResolved(question.id, true);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  // "나중에 쓸게요": 이해됐어요 경로면 understoodAnswerId도 같이 보존합니다.
  async function handleLater() {
    if (saving) return;
    if (!isPending) {
      setSaving(true);
      try {
        await setQuestionResolvedLater(question.id, pendingAnswerId);
      } finally {
        setSaving(false);
      }
    }
    onClose();
  }

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div
        className="modal modal-reflect"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>
            {isPending
              ? "📝 나중에 쓰려고 했던 인사이트, 지금 남겨볼까요?"
              : "🎉 해결됐어요! 잠깐, 내 걸로 만들어 볼까요?"}
          </h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <p className="reflect-lead">
          정답을 옮겨 적지 않아도 괜찮아요. 친구에게 설명하듯, 어디서
          막혔다가 어떻게 이해됐는지 내 말로 적어 보세요.
        </p>

        <div className="reflect-field">
          <label htmlFor="reflect-learned">
            막혔던 점이 어떻게 이해됐나요?{" "}
            <span className="hint">한 줄이면 충분해요</span>
          </label>
          <textarea
            id="reflect-learned"
            value={learned}
            onChange={(e) => setLearned(e.target.value)}
            placeholder="예: 계수가 음수라 헷갈렸는데, 완전제곱식으로 바꾸면 꼭짓점이 바로 보인다는 걸 알게 됐어요."
            autoFocus
          />
        </div>

        <div className="reflect-field reflect-field-optional">
          <label htmlFor="reflect-next">
            아직 더 알고 싶은 점이 있나요?{" "}
            <span className="hint">선택 — 다음 학습의 실마리가 돼요</span>
          </label>
          <textarea
            id="reflect-next"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="예: 최솟값일 때도 같은 방법으로 구할 수 있는지 궁금해요."
          />
        </div>

        <div className="reflect-actions">
          <button
            type="button"
            className="btn-later"
            onClick={handleLater}
            disabled={saving}
          >
            {isPending ? "다음에 쓸게요" : "나중에 쓸게요"}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSave}
            disabled={!canSave || saving}
            title={canSave ? "" : "막혔던 점을 한 줄이라도 적어 주세요"}
          >
            {saving
              ? "저장 중..."
              : isPending
              ? "인사이트 저장"
              : "정리하고 해결 완료"}
          </button>
        </div>
      </div>
    </div>
  );
}
