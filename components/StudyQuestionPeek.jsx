"use client";

// =============================================================
// 공부방 카드 편집 중 — 관련 질문을 "읽기 전용"으로 들여다보는 미리보기.
// -------------------------------------------------------------
// 카드 편집 모달 위에 겹쳐 떠서, 작성 중이던 초안은 그대로 보존됩니다.
// 답변 작성·궁금해요 등 상호작용은 의도적으로 막아 작성에 집중하게 하는
// "참고 전용" 화면입니다. 닫으면 곧장 카드 작성으로 돌아갑니다.
// =============================================================
import { useEffect, useState } from "react";
import { subscribeAnswers, formatTime } from "@/lib/store";
import { sanitizeHtml } from "@/lib/html";
import { IconAsk, IconSolved } from "./StatusIcons";

export default function StudyQuestionPeek({ question, onClose, onBackToList }) {
  const [answers, setAnswers] = useState([]);

  useEffect(() => {
    const unsub = subscribeAnswers(question.id, setAnswers);
    return unsub;
  }, [question.id]);

  return (
    <div
      className="modal-backdrop study-peek-backdrop"
      onClick={(e) => {
        // 카드 편집 모달(아래 레이어)까지 닫히지 않도록 전파 차단
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="modal modal-peek" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>
            <span className={`mini-status ${question.resolved ? "done" : "open"}`}>
              {question.resolved ? <IconSolved size={20} /> : <IconAsk size={20} />}
            </span>{" "}
            {question.title}
          </h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <div className="study-peek-meta">
          {question.keyword && (
            <span className="keyword-chip"># {question.keyword}</span>
          )}
          <span className="study-peek-readonly">👀 읽기 전용</span>
        </div>

        <div className="study-peek-body">
          <div
            className="study-card-body"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(question.content) }}
          />

          <div className="study-peek-answers">
            <h4>
              답변 {answers.length > 0 && <span>{answers.length}</span>}
            </h4>
            {answers.length === 0 ? (
              <p className="study-related-empty">아직 답변이 없어요.</p>
            ) : (
              answers.map((a) => {
                const understood = a.id === question.understoodAnswerId;
                return (
                  <div
                    key={a.id}
                    className={`study-peek-answer ${understood ? "understood" : ""}`}
                  >
                    <div className="study-peek-answer-head">
                      <span className="avatar avatar-sm" aria-hidden="true">
                        {a.authorEmoji ?? "🙂"}
                      </span>
                      <strong>{a.authorName}</strong>
                      {understood && (
                        <span className="study-peek-understood">💡 이해됐어요</span>
                      )}
                      <time>{formatTime(a.createdAt)}</time>
                    </div>
                    <div
                      className="study-card-body"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(a.content) }}
                    />
                    {[...(a.imageUrl ? [a.imageUrl] : []), ...(a.images ?? [])].map((src, i) => (
                      <img
                        key={i}
                        src={src}
                        alt="첨부 이미지"
                        className="study-card-image"
                      />
                    ))}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="study-peek-foot">
          {onBackToList && (
            <button className="btn-primary" onClick={onBackToList}>
              ← 다른 질문 보기
            </button>
          )}
          <button className="btn-primary" onClick={onClose}>
            작성으로 돌아가기
          </button>
        </div>
      </div>
    </div>
  );
}
