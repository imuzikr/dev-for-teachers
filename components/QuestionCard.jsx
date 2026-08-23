"use client";

// 2단: 질문 카드 — 내용 일부만 미리 보여주고, 클릭하면 상세 모달이 열립니다.
// 상태(🙋 궁금해요 / ✅ 해결됐어요)는 표시 전용 배지입니다.
// 해결 처리는 반드시 상세 모달의 인사이트 흐름을 거치도록 했기 때문에,
// 카드에서 모달 없이 해결로 바꾸는 동작은 두지 않습니다.
import { formatTime } from "@/lib/store";
import { stripHtml } from "@/lib/html";
import { isTeacher } from "@/lib/user";
import { isPinnedQuestion } from "@/lib/questionRanking";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { IconAsk, IconSolved, IconAnswer } from "./StatusIcons";
import MeTooButton from "./MeTooButton";
import AuthorBadge from "./AuthorBadge";

export default function QuestionCard({ question, onClick }) {
  const user = useCurrentUser();
  const resolved = !!question.resolved;
  const mine = user ? question.authorId === user.uid : false;
  const pinned = isPinnedQuestion(question);
  const showPending = question.reflectionPending && (mine || isTeacher(user));
  // 삽입한 이미지·그림 전체(순서대로). 구버전 단일 imageUrl도 흡수.
  const images = question.images?.length
    ? question.images
    : question.imageUrl
    ? [question.imageUrl]
    : [];

  return (
    <article
      className={`question-card ${resolved ? "is-resolved" : ""} ${
        pinned ? "is-pinned" : ""
      }`}
      onClick={onClick}
    >
      <div className="card-meta">
        <span className="keyword-chip"># {question.keyword}</span>
        {pinned && (
          <span className="pin-chip" title="상단 고정 — 나도 궁금해요 5회 이상">
            📌
          </span>
        )}
        {/* 작성자 프로필 — 관리자는 클릭해서 실명 확인 가능 */}
        <AuthorBadge
          name={question.authorName}
          emoji={question.authorEmoji}
          realName={question.authorRealName}
          uid={question.authorId}
        />
        <span>·</span>
        <time>{formatTime(question.createdAt)}</time>
        <span className={`status-badge ${resolved ? "resolved" : "open"}`}>
          {resolved ? <IconSolved size={24} /> : <IconAsk size={24} />}
          {resolved ? "해결된 질문" : "미해결 질문"}
        </span>
      </div>
      {/* 본문(왼쪽) + 첨부/그리기 이미지 섬네일(오른쪽) */}
      <div className="card-body">
        <div className="card-main">
          <h3>{question.title}</h3>
          {/* 서식 태그를 제거한 순수 텍스트로 미리보기 */}
          <p className="card-preview">{stripHtml(question.content)}</p>
        </div>
        {images.length > 0 && (
          <div className="card-thumbs" aria-label={`이미지 ${images.length}장`}>
            {images.map((src, i) => (
              <img
                key={i}
                src={src}
                alt={`첨부 이미지 ${i + 1}`}
                className="card-thumb"
              />
            ))}
          </div>
        )}
      </div>
      <div className="card-foot">
        <span>
          <IconAnswer size={24} /> 답변 {question.answerCount ?? 0}개
          {images.length > 0 && (
            <span style={{ marginLeft: 8 }}>📎 이미지 {images.length}</span>
          )}
          {/* 인사이트 대기 배지 — 작성자 본인과 교사에게만 표시됩니다 */}
          {showPending && (
            <span
              className={`reflect-pending-badge ${mine ? "mine" : "teacher"}`}
              title={mine ? "인사이트를 아직 남기지 않았어요" : "이 학생이 아직 인사이트를 남기지 않았어요"}
            >
              📝 {mine ? "인사이트 남기기" : "인사이트 대기"}
            </span>
          )}
        </span>
        {/* 카드 오른쪽 아래 — 모달을 열지 않고도 누를 수 있습니다 */}
        <MeTooButton question={question} />
      </div>
    </article>
  );
}
