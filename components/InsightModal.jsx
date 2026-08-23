"use client";

// =============================================================
// 내 인사이트 모음 모달 — 게시판 피드 상단 "인사이트 보기" 버튼으로 열림.
// reflections: 내 인사이트 배열 (question 객체, reflection 필드 포함)
// onOpen(id): 항목 클릭 시 해당 질문 상세 모달 열기
// =============================================================
import { backdropClose } from "@/lib/modal";
import { formatTime } from "@/lib/store";
import { IconInsight } from "./StatusIcons";

export default function InsightModal({ reflections = [], onClose, onOpen }) {
  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div className="modal modal-insight" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>
            <IconInsight size={22} /> 내 인사이트
            <span className="insight-modal-count">{reflections.length}</span>
          </h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        {reflections.length === 0 ? (
          <p className="insight-modal-empty">
            아직 인사이트가 없어요. 질문이 해결되면 “막혔던 점이 어떻게
            이해됐는지” 한 줄로 남겨 보세요. 여기에 모여 나만의 학습 기록이
            됩니다.
          </p>
        ) : (
          <ul className="insight-modal-list">
            {reflections.map((item) => (
              <li key={item.id}>
                <button
                  className="insight-modal-item"
                  onClick={() => onOpen?.(item.id)}
                >
                  <div className="insight-modal-item-top">
                    {item.keyword && (
                      <span className="keyword-chip"># {item.keyword}</span>
                    )}
                    <time>{formatTime(item.reflection.createdAt)}</time>
                  </div>
                  <p className="insight-modal-item-title">{item.title}</p>
                  {item.reflection.learned && (
                    <p className="insight-modal-item-learned">
                      💡 {item.reflection.learned}
                    </p>
                  )}
                  {item.reflection.next && (
                    <p className="insight-modal-item-next">
                      🔎 {item.reflection.next}
                    </p>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
