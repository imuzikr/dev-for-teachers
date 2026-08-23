"use client";

// =============================================================
// 질문 상세 모달 — 2열 구조
//   [왼쪽] 질문 내용(서식 지원) + 첨부 이미지 미리보기 + 상태 토글
//   [오른쪽] 채팅형 대화방: 서식 입력 + 이미지 첨부 + 그리기
// =============================================================
import { backdropClose } from "@/lib/modal";
import { useEffect, useRef, useState } from "react";
import {
  subscribeAnswers,
  addAnswer,
  formatTime,
  setQuestionResolved,
  setUnderstoodAnswer,
  deleteQuestion,
} from "@/lib/store";
import { getCurrentUser, isTeacher } from "@/lib/user";
import { isFirebaseConfigured } from "@/lib/firebase";
import { sanitizeHtml, stripHtml } from "@/lib/html";
import { uploadImage, uploadDataUrl } from "@/lib/storageUpload";
import dynamic from "next/dynamic";
import RichTextEditor, { IconImage, IconPen } from "./RichTextEditor";
import UploadProgress from "./UploadProgress";
import { IconAsk, IconSolved, IconAnswer, IconTrash, IconInsight } from "./StatusIcons";
import MeTooButton from "./MeTooButton";
import NewQuestionForm from "./NewQuestionForm";
import ReflectionModal from "./ReflectionModal";
import AuthorBadge from "./AuthorBadge";
import ConfirmModal from "./ConfirmModal";
import ZoomableImage from "./ZoomableImage";

// 그리기 캔버스는 무거워 열 때만 로딩
const DrawingCanvas = dynamic(() => import("./DrawingCanvas"), { ssr: false });

export default function QuestionModal({
  question,
  keywords = [],
  studyKeywords = [], // 공부방 보드와 연계된 키워드 목록
  onBackToStudy, // "수업으로 돌아가기" 클릭 핸들러
  onBackToInsight, // "인사이트로 돌아가기" — 내 인사이트 목록에서 열었을 때
  onClose,
}) {
  const user = getCurrentUser();
  const mine = question.authorId === user.uid;
  const admin = isTeacher(user);
  const [answers, setAnswers] = useState([]);
  const [content, setContent] = useState(""); // 입력 중인 HTML
  const [answerImages, setAnswerImages] = useState([]); // 첨부 이미지(다중)
  const [uploadPct, setUploadPct] = useState(null); // 첨부 업로드 진행률(null=대기)
  const ANSWER_MAX_IMAGES = 4;
  const [drawing, setDrawing] = useState(false); // 그리기 캔버스 열림
  const [editing, setEditing] = useState(false); // 질문 수정 모달 열림
  const [reflecting, setReflecting] = useState(false); // 한 줄 정리 모달 열림
  const [pendingAnswerId, setPendingAnswerId] = useState(null); // 이해됐어요 클릭 시 대기 중인 답변 id
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [resetKey, setResetKey] = useState(0); // 전송 후 에디터 비우기
  const [qExpanded, setQExpanded] = useState(false); // 모바일: 질문 접기/펼치기
  const scrollRef = useRef(null);    // 모바일: qa-grid 단일 스크롤 컨테이너
  const chatScrollRef = useRef(null); // 데스크톱: chat-scroll 컨테이너
  const understoodAnswerId = question.understoodAnswerId ?? null;

  useEffect(() => {
    const unsubscribe = subscribeAnswers(question.id, setAnswers);
    return unsubscribe;
  }, [question.id]);

  // 새 메시지가 오면 대화방을 맨 아래로 스크롤
  // 모바일(qa-grid)·데스크톱(chat-scroll) 양쪽 처리
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [answers]);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("이미지 파일만 첨부할 수 있습니다.");
      e.target.value = "";
      return;
    }
    if (answerImages.length >= ANSWER_MAX_IMAGES) {
      alert(`이미지는 최대 ${ANSWER_MAX_IMAGES}장까지 첨부할 수 있습니다.`);
      e.target.value = "";
      return;
    }
    setUploadPct(0);
    try {
      const url = await uploadImage(file, { onProgress: setUploadPct });
      setAnswerImages((prev) => [...prev, url]);
    } catch {
      alert("이미지 업로드에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setUploadPct(null);
    }
    e.target.value = ""; // 같은 파일 재선택 가능하도록
  }

  function removeAnswerImage(i) {
    setAnswerImages((prev) => prev.filter((_, idx) => idx !== i));
  }

  // 상태 토글: "해결됐어요"로 바꿀 때는 한 줄 정리 모달을 먼저 띄우고,
  // 해결을 취소(다시 궁금해요)할 때는 바로 전환합니다.
  // 답변이 없는 상태에서는 해결로 전환할 수 없습니다.
  function handleResolveToggle() {
    if (question.resolved) {
      setQuestionResolved(question.id, false);
    } else if (answers.length > 0) {
      setReflecting(true);
    }
  }

  async function handleDelete() {
    await deleteQuestion(question.id);
    onClose();
  }

  async function handleSend() {
    const html = sanitizeHtml(content);
    const hasText = stripHtml(html).length > 0;
    // 글이 없어도 이미지만으로 전송 가능
    if ((!hasText && answerImages.length === 0) || saving) return;
    setSaving(true);
    try {
      // 내 질문에 다는 답변(채팅)은 "질문을 올릴 때 부여받은 닉네임"으로 표시.
      // 지금 세션의 닉네임이 달라도, 내 스레드 안에서는 질문자와 같은 이름으로
      // 이어지도록 질문의 authorName/authorEmoji를 그대로 사용합니다.
      // 남의 질문에 다는 답변은 현재 세션의 내 익명 닉네임을 씁니다.
      const answerUser = mine
        ? { ...user, displayName: question.authorName, emoji: question.authorEmoji }
        : user;
      await addAnswer(answerUser, question.id, hasText ? html : "", null, answerImages);
      setContent("");
      setAnswerImages([]);
      setResetKey((k) => k + 1); // 에디터 비우기
    } finally {
      setSaving(false);
    }
  }

  // "이해됐어요" 클릭: 토글 OFF는 직접 해제, 토글 ON은 인사이트 모달을 먼저 엽니다.
  function handleUnderstood(answerId) {
    if (understoodAnswerId === answerId) {
      setUnderstoodAnswer(question.id, null);
    } else {
      setPendingAnswerId(answerId);
      setReflecting(true);
    }
  }

  const canManageUnderstood =
    question.authorId === user.uid || isTeacher(user) || !isFirebaseConfigured;

  // 해결됐지만 아직 인사이트가 없는 질문 — 인사이트 입구를 노출할지 판단
  const needsReflection = question.resolved && !question.reflection;

  // 이 질문의 키워드가 공부방 보드와 연계돼 있으면 "수업으로 돌아가기" 활성화
  const linkedToStudy =
    !!onBackToStudy && studyKeywords.includes(question.keyword);

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <button
          className="btn-close modal-close-float"
          onClick={onClose}
          aria-label="닫기"
        >
          ×
        </button>

        <div className="qa-grid" ref={scrollRef}>
          {/* 모바일 전용: 스크롤해도 항상 상단에 고정되는 제목 탭 */}
          <button
            type="button"
            className="qa-mobile-header"
            onClick={() => setQExpanded((v) => !v)}
            aria-expanded={qExpanded}
          >
            <span className="qa-expand-chevron">{qExpanded ? "▴" : "▾"}</span>
            <span className="qa-mobile-title">{question.title}</span>
          </button>

          {/* ── 왼쪽: 질문 본문 + 첨부 이미지 ── */}
          <section className={`qa-left${qExpanded ? " qa-left--expanded" : ""}`}>
            {/* 본문은 스크롤되고, 아래 qa-foot은 항상 보입니다 */}
            <div className="qa-left-scroll">
              <div className="card-meta">
                <span className="keyword-chip"># {question.keyword}</span>
                {/* 작성자 프로필 — 관리자는 클릭해서 실명 확인 가능 */}
                <AuthorBadge
                  name={question.authorName}
                  emoji={question.authorEmoji}
                  realName={question.authorRealName}
                  uid={question.authorId}
                />
                <span>·</span>
                <time>{formatTime(question.createdAt)}</time>
                {/* 상세 화면에서도 해결 상태를 바로 전환할 수 있습니다 */}
                <button
                  type="button"
                  className={`status-toggle qa-status ${
                    question.resolved ? "resolved" : "open"
                  }${!question.resolved && answers.length === 0 ? " disabled" : ""}`}
                  onClick={handleResolveToggle}
                  disabled={!question.resolved && answers.length === 0}
                  title={
                    !question.resolved && answers.length === 0
                      ? "답변이 있어야 해결로 바꿀 수 있어요"
                      : "클릭해서 상태 바꾸기"
                  }
                >
                  {question.resolved
                    ? <><IconSolved size={22} /> 해결됐어요</>
                    : <><IconAsk size={22} /> 궁금해요</>}
                </button>
              </div>
              <h3 className="qa-title">{question.title}</h3>

              {/* 돌아가기 버튼들 — 한 줄에 중앙 정렬로 묶어 높이/정렬 일치 */}
              {((onBackToInsight && mine) || linkedToStudy) && (
                <div className="back-actions">
                  {/* 인사이트 목록에서 열었으면 목록으로 돌아가기 (작성자 본인만) */}
                  {onBackToInsight && mine && (
                    <button
                      type="button"
                      className="back-to-study back-to-insight"
                      onClick={onBackToInsight}
                    >
                      <IconInsight size={16} /> 인사이트로 돌아가기
                    </button>
                  )}

                  {/* 수업 연계 — 공부방 보드와 같은 키워드면 수업으로 돌아갈 수 있습니다 */}
                  {linkedToStudy && (
                    <button
                      type="button"
                      className="back-to-study"
                      onClick={onBackToStudy}
                    >
                      📚 수업으로 돌아가기
                    </button>
                  )}
                </div>
              )}

              {/* 인사이트 입구 — 해결됐지만 인사이트가 없는 질문에 항상 노출됩니다.
                  작성자 본인에게는 작성 버튼, 교사에게는 현황을 보여줍니다. */}
              {needsReflection && mine && (
                <div className="reflect-reminder mine">
                  <span>
                    {question.reflectionPending
                      ? "📝 나중에 쓰겠다고 했던 인사이트가 아직 남아 있어요."
                      : "📝 이 질문, 어떻게 이해했는지 한 줄로 남겨볼까요?"}
                  </span>
                  <button
                    type="button"
                    className="btn-ghost reflect-reminder-btn"
                    onClick={() => setReflecting(true)}
                  >
                    {question.reflectionPending ? "지금 남기기" : "인사이트 쓰기"}
                  </button>
                </div>
              )}
              {needsReflection && !mine && admin && (
                <div className="reflect-reminder teacher">
                  📋 이 학생이 아직 인사이트를 남기지 않았어요
                </div>
              )}

              <div
                className="qa-content"
                dangerouslySetInnerHTML={{
                  __html: sanitizeHtml(question.content),
                }}
              />

              {(question.images?.length || question.imageUrl) && (
                <figure className="qa-figure">
                  <figcaption>📎 첨부 이미지</figcaption>
                  <div className="qa-image-grid">
                    {[
                      ...(question.imageUrl ? [question.imageUrl] : []),
                      ...(question.images ?? []),
                    ].map((src, i) => (
                      <ZoomableImage
                        key={i}
                        src={src}
                        alt="질문 첨부 이미지"
                        className="qa-image"
                      />
                    ))}
                  </div>
                </figure>
              )}

              {/* 해결하며 남긴 한 줄 정리 — 모두가 보며 서로의 이해를 배웁니다 */}
              {question.reflection &&
                (question.reflection.learned || question.reflection.next) && (
                  <div className="qa-reflection">
                    <h4>💡 이렇게 이해했어요</h4>
                    {question.reflection.learned && (
                      <p>{question.reflection.learned}</p>
                    )}
                    {question.reflection.next && (
                      <p className="qa-reflection-next">
                        🔎 더 알고 싶은 점 — {question.reflection.next}
                      </p>
                    )}
                  </div>
                )}
            </div>

            {/* 왼쪽 하단 고정 — 나도 궁금해요 + (내 글이면) 수정 버튼 */}
            <div className="qa-foot">
              <MeTooButton question={question} />
              {mine && (
                <button
                  type="button"
                  className="btn-ghost qa-edit"
                  onClick={() => setEditing(true)}
                  title="질문 내용 고치기"
                >
                  <IconPen size={15} /> 수정
                </button>
              )}
              {(mine || admin) && (
                <button
                  type="button"
                  className="btn-ghost qa-delete"
                  onClick={() => setConfirmingDelete(true)}
                  title="질문 삭제"
                >
                  <IconTrash size={16} /> 삭제
                </button>
              )}
            </div>
          </section>

          {/* ── 오른쪽: 채팅형 대화방 ── */}
          <section className="qa-right">
            <div className="chat-head"><IconAnswer size={20} /> 대화 {answers.length + 1}개</div>

            <div className="chat-scroll" ref={chatScrollRef}>
              {/* 첫 메시지: 질문 */}
              <ChatMessage
                mine={question.authorId === user.uid}
                author={question.authorName}
                emoji={question.authorEmoji}
                realName={question.authorRealName}
                uid={question.authorId}
                time={question.createdAt}
                badge="질문"
                html={question.content}
              />

              {answers.map((a) => (
                <ChatMessage
                  key={a.id}
                  mine={a.authorId === user.uid}
                  author={a.authorName}
                  emoji={a.authorEmoji}
                  realName={a.authorRealName}
                  uid={a.authorId}
                  time={a.createdAt}
                  html={a.content}
                  imageUrl={a.imageUrl}
                  images={a.images}
                  understood={understoodAnswerId === a.id}
                  showUnderstoodIcon
                  canMarkUnderstood={canManageUnderstood && a.authorId !== user.uid}
                  onToggleUnderstood={() => handleUnderstood(a.id)}
                />
              ))}

              {answers.length === 0 && (
                <p className="chat-empty">
                  아직 답변이 없어요.
                  <br />첫 번째 답변을 남겨 보세요!
                </p>
              )}
            </div>

            {/* 입력 영역: 첨부 미리보기 + 도구 + 서식 에디터 + 전송 */}
            <div className="chat-compose">
              {answerImages.length > 0 && (
                <div className="chat-attach-preview attach-multi">
                  {answerImages.map((src, i) => (
                    <div key={i} className="attach-thumb">
                      <img src={src} alt="첨부 미리보기" />
                      <button
                        type="button"
                        className="attach-image-del"
                        onClick={() => removeAnswerImage(i)}
                        aria-label="첨부 취소"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <UploadProgress pct={uploadPct} />
              {/* 입력창 — 하단 툴바에 첨부·그리기·서식 도구와 전송 버튼 */}
              <RichTextEditor
                key={resetKey}
                variant="chat"
                onChange={setContent}
                placeholder="의견을 공유해 볼까요?"
                onSend={handleSend}
                sendDisabled={
                  saving ||
                  (stripHtml(content).length === 0 && answerImages.length === 0)
                }
              >
                <label className="rte-tool" title="이미지 첨부">
                  <IconImage />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFile}
                    hidden
                  />
                </label>
                <button
                  type="button"
                  className="rte-tool"
                  title="그리기"
                  onClick={() => setDrawing(true)}
                >
                  <IconPen />
                </button>
              </RichTextEditor>
            </div>
          </section>
        </div>

        {/* 그리기 캔버스 — 완료하면 그림이 답변 첨부 이미지로 들어갑니다 */}
        {drawing && (
          <DrawingCanvas
            onSave={async (dataUrl) => {
              if (answerImages.length >= ANSWER_MAX_IMAGES) {
                alert(`이미지는 최대 ${ANSWER_MAX_IMAGES}장까지 첨부할 수 있습니다.`);
                return;
              }
              setUploadPct(0);
              try {
                const url = await uploadDataUrl(dataUrl, "drawing.png", { onProgress: setUploadPct });
                setAnswerImages((prev) => [...prev, url]);
              } catch {
                alert("그림 업로드에 실패했어요. 잠시 후 다시 시도해 주세요.");
              } finally {
                setUploadPct(null);
              }
            }}
            onClose={() => setDrawing(false)}
          />
        )}

        {/* 질문 수정 — 작성 폼을 수정 모드로 재사용합니다 */}
        {editing && (
          <NewQuestionForm
            question={question}
            keywords={keywords}
            onClose={() => setEditing(false)}
          />
        )}

        {/* 한 줄 정리 — "해결됐어요" 또는 "이해됐어요" 클릭 시 떠서 이해의 전환점을 남깁니다 */}
        {reflecting && (
          <ReflectionModal
            question={question}
            user={user}
            isPending={!!question.reflectionPending}
            pendingAnswerId={pendingAnswerId}
            onClose={() => { setReflecting(false); setPendingAnswerId(null); }}
          />
        )}
      </div>

      {/* 삭제 확인 모달 */}
      {confirmingDelete && (
        <ConfirmModal
          icon={<IconTrash size={40} />}
          title="질문 삭제"
          preview={question.title}
          description={"이 질문과 모든 답변이 영구 삭제됩니다.\n삭제 후 복구할 수 없습니다."}
          confirmLabel="삭제하기"
          danger
          onConfirm={handleDelete}
          onClose={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}

function IconTipsAndUpdates() {
  return (
    <svg
      className="understood-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 10H2V8h2v2Zm18 0h-2V8h2v2ZM5.65 5.05 4.25 3.65l1.4-1.4 1.4 1.4-1.4 1.4Zm12.7 0-1.4-1.4 1.4-1.4 1.4 1.4-1.4 1.4ZM11 22c-.55 0-1.02-.2-1.41-.59C9.2 21.02 9 20.55 9 20h6c0 .55-.2 1.02-.59 1.41-.39.39-.86.59-1.41.59h-2Zm-3-3v-2h8v2H8Zm.25-3c-1.32-.78-2.36-1.78-3.11-3A7.1 7.1 0 0 1 4 9.25c0-2.2.78-4.08 2.34-5.64C7.9 2.05 9.78 1.27 12 1.27s4.1.78 5.66 2.34C19.22 5.17 20 7.05 20 9.25c0 1.4-.38 2.65-1.14 3.75-.75 1.22-1.79 2.22-3.11 3H8.25Zm.65-2h6.2c.9-.58 1.61-1.28 2.13-2.11.51-.84.77-1.72.77-2.64 0-1.65-.59-3.06-1.76-4.24C15.06 3.84 13.65 3.25 12 3.25s-3.06.59-4.24 1.76C6.59 6.19 6 7.6 6 9.25c0 .92.26 1.8.77 2.64.52.83 1.23 1.53 2.13 2.11Z" />
    </svg>
  );
}

// 채팅 말풍선 한 개 — 내 글은 오른쪽, 다른 사람 글은 왼쪽에 표시
function ChatMessage({
  mine,
  author,
  emoji,
  realName,
  uid,
  time,
  html,
  imageUrl,
  images,
  badge,
  understood = false,
  showUnderstoodIcon = false,
  canMarkUnderstood = false,
  onToggleUnderstood,
}) {
  const hasText = stripHtml(html ?? "").length > 0;
  return (
    <div className={`chat-msg ${mine ? "mine" : ""} ${understood ? "understood" : ""}`}>
      <div className="chat-meta">
        {badge && <span className="chat-badge">{badge}</span>}
        {showUnderstoodIcon && (
          canMarkUnderstood ? (
            <button
              type="button"
              className={`understood-bulb ${understood ? "on" : ""}`}
              onClick={onToggleUnderstood}
              aria-label={
                understood
                  ? "이해됐어요 표시 해제"
                  : "이 답변으로 이해됐어요 표시"
              }
              title={
                understood
                  ? "이해됐어요 표시 해제"
                  : "이 답변으로 이해됐어요"
              }
            >
              <IconTipsAndUpdates />
            </button>
          ) : (
            <span
              className={`understood-bulb readonly ${understood ? "on" : ""}`}
              title={understood ? "질문자가 이해됐어요로 표시한 답변" : "답변"}
            >
              <IconTipsAndUpdates />
            </span>
          )
        )}
        {/* 작성자 프로필 — 관리자는 클릭해서 실명 확인 가능 */}
        <AuthorBadge name={author} emoji={emoji} realName={realName} uid={uid} />
        {" · "}
        <time>{formatTime(time)}</time>
      </div>
      <div className="chat-bubble">
        {hasText && (
          <div
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
          />
        )}
        {[...(imageUrl ? [imageUrl] : []), ...(images ?? [])].map((src, i) => (
          <ZoomableImage key={i} src={src} alt="첨부 이미지" className="chat-image" />
        ))}
      </div>
    </div>
  );
}
