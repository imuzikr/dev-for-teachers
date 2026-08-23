"use client";

// =============================================================
// 공부방 카드 통합 모달 — 읽기 + 수정 + 삭제 + 질문하기 + 관련 질문
// =============================================================
import { backdropClose } from "@/lib/modal";
import { useState, useEffect, useRef } from "react";
import {
  addStudyCard,
  updateStudyCard,
  deleteStudyCard,
  formatTime,
  getDirectoryRealName,
  startBroadcast,
  stopBroadcast,
} from "@/lib/store";
import { getCurrentUser, isTeacher } from "@/lib/user";
import { sanitizeHtml, stripHtml, stripImgTags } from "@/lib/html";
import { parseActivitySections, isActivityLocked } from "@/lib/activities";
import { formatFileSize } from "@/lib/image";
import { uploadImage, uploadFile, uploadDataUrl } from "@/lib/storageUpload";
import dynamic from "next/dynamic";
import RichTextEditor, { IconImage, IconPen } from "./RichTextEditor";

// 그리기 캔버스는 무거워 열 때만 로딩
const DrawingCanvas = dynamic(() => import("./DrawingCanvas"), { ssr: false });
import StudyQuestionPeek from "./StudyQuestionPeek";
import ZoomableImage from "./ZoomableImage";
import UploadProgress from "./UploadProgress";
import { IconAsk, IconSolved, IconTrash, IconTeacher } from "./StatusIcons";

export default function StudyCardModal({
  board,
  card = null,
  canEdit = false,
  mine = false,
  relatedQuestions = [],
  onClose,
  onAsk,
}) {
  const isNew = card === null;
  const boardKeywords = Array.isArray(board.keywords)
    ? board.keywords
    : board.keyword
    ? [board.keyword]
    : [];
  const linked = boardKeywords.length > 0;
  const isTeacherCard =
    card?.authorId?.startsWith?.("teacher_") || card?.authorName === "선생님";
  // 학생에겐 익명 닉네임만, 교사에겐 디렉터리의 실명을 표시 (교사 카드는 "선생님")
  const cardDisplayName = card
    ? (isTeacher(getCurrentUser()) && !isTeacherCard
        ? getDirectoryRealName(card.authorId)
        : null) || card.authorName
    : "";

  const activities = board.activities ?? [];
  // 이미 저장된 카드도 활동별 폼으로 엽니다 — 그래야 활동 하나만 잠그는 게
  // 의미가 있습니다(예전에는 새 카드일 때만 활동 폼이고, 저장 뒤에는 활동이
  // 뭉쳐진 HTML 하나를 통째로 고치는 형태라 활동별로 막을 수가 없었음).
  //   · 활동 틀로 만들어진 카드  → 내용을 활동별로 되읽어 폼에 채움
  //   · 활동이 생기기 전의 자유형 카드 → 파싱 결과가 없으므로 예전 단일
  //     편집기로 물러섬(그대로 열지 않으면 저장할 때 내용이 날아갑니다)
  const savedSections = useRef(null);
  if (savedSections.current === null) {
    savedSections.current = isNew ? [] : parseActivitySections(card?.content);
  }
  const isActivityCard =
    activities.length > 0 && (isNew || savedSections.current.length > 0);
  // 카드 삭제는 교사(관리자 포함)만 — 학생은 자기 카드도 수정만 가능하고
  // 삭제는 못 합니다(canEdit과 별도 권한).
  const canDelete = isTeacher(getCurrentUser());

  const [title, setTitle] = useState(isNew ? "" : (card.title ?? ""));
  const [content, setContent] = useState(isNew ? "" : (card.content ?? ""));
  const [imageUrl, setImageUrl] = useState(isNew ? null : (card.imageUrl ?? null));
  const [attachments, setAttachments] = useState(isNew ? [] : (card.attachments ?? []));
  // 저장된 카드를 열면 그 안에 들어 있던 활동별 제목·내용을 그대로 채웁니다.
  const [activityTitles, setActivityTitles] = useState(() =>
    activities.map((a, i) => savedSections.current[i]?.title || a)
  );
  const [activityContents, setActivityContents] = useState(() =>
    activities.map((_, i) => savedSections.current[i]?.content ?? "")
  );
  // 보드의 활동은 교사가 수업 준비에서 언제든 추가·수정할 수 있습니다.
  // 위 두 state는 처음 열 때 한 번만 만들어지므로, 그 뒤 활동이 늘면
  // 화면에는 칸이 생기는데 값이 없어 빈칸('활동 4')으로 보였습니다.
  // 활동 목록이 바뀌면 다시 맞춰 줍니다 — 학생이 이미 고쳐 쓴 칸은
  // 그대로 두고, 손대지 않은 칸만 새 활동 이름으로 채웁니다.
  const prevActsRef = useRef(activities);
  const activitiesKey = activities.join("\n");
  useEffect(() => {
    const prevActs = prevActsRef.current;
    prevActsRef.current = activities;
    if (prevActs.join("\n") === activitiesKey) return;
    setActivityTitles((prev) =>
      activities.map((act, i) =>
        // 값이 없거나 '예전 활동 이름 그대로'면 새 이름으로, 아니면 학생 입력 유지
        prev[i] === undefined || prev[i] === prevActs[i] ? act : prev[i]
      )
    );
    setActivityContents((prev) => activities.map((_, i) => prev[i] ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activitiesKey]);
  const [drawing, setDrawing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showRelated, setShowRelated] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [peekQuestion, setPeekQuestion] = useState(null);
  const [uploadPct, setUploadPct] = useState(null); // 첨부 업로드 진행률
  const [autoStatus, setAutoStatus] = useState("idle"); // idle | saving | saved | error
  const [expanded, setExpanded] = useState(false); // 발표 모드처럼 크게 보기

  const me = getCurrentUser();
  // 자동저장 상태 관리용 refs
  const cardIdRef = useRef(card?.id ?? null); // 저장된 카드 ID(신규는 첫 저장 후 채워짐)
  const savingRef = useRef(false); // 저장 진행 중(중복 저장 방지)
  const pendingRef = useRef(false); // 저장 중 들어온 변경 → 끝나고 재저장
  const dirtyRef = useRef(false);   // 저장 안 된 변경 존재 여부(닫을 때 flush)
  const flushRef = useRef(null);    // 최신 저장 함수 참조(언마운트 flush용)
  const idleTimerRef = useRef(null); // '자동 저장됨' 표시를 잠시 뒤 숨기는 타이머
  // 마지막으로 저장(또는 열기 시점)된 내용의 서명 — 이 값과 달라졌을 때만 저장.
  // (카드를 "열기만" 했을 때 자동저장되는 문제를 확실히 막음)
  const baselineSigRef = useRef(null);

  // 저장 대상(제목·본문·이미지·첨부)을 하나의 문자열로 요약
  function sigOf(titleToSave, htmlToSave) {
    return JSON.stringify({ titleToSave, htmlToSave, imageUrl, attachments });
  }

  // '✓ 자동 저장됨'을 잠깐 보여 준 뒤(1.6초) 다시 숨김 — 다음 입력 때 재표시
  function showSavedThenHide() {
    setAutoStatus("saved");
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => setAutoStatus("idle"), 1600);
  }

  // 이미지 첨부 — 예전엔 단일 imageUrl을 계속 교체했지만, 지금은 다른
  // 첨부와 동일하게 attachments 배열에 누적됩니다(업로드 순서대로 표시).
  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("이미지 파일만 첨부할 수 있습니다.");
      e.target.value = "";
      return;
    }
    if (attachments.length >= MAX_ATTACH_COUNT) {
      alert(`이미지는 최대 ${MAX_ATTACH_COUNT}개까지 첨부할 수 있습니다.`);
      e.target.value = "";
      return;
    }
    const rawExt = (file.name || "").split(".").pop()?.toLowerCase();
    const ext = IMAGE_EXTS.has(rawExt) ? rawExt : "jpg";
    setUploadPct(0);
    try {
      const url = await uploadImage(file, { onProgress: setUploadPct });
      setAttachments((prev) => [
        ...prev,
        { id: `f${Date.now()}`, name: file.name || "image.jpg", ext, size: file.size, dataUrl: url },
      ]);
    } catch {
      alert("이미지 업로드에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setUploadPct(null);
    }
    e.target.value = "";
  }

  // 허용 확장자 → 표시용 레이블
  const FILE_EXTS = {
    html: "HTML", htm: "HTML", txt: "TXT", csv: "CSV",
    xlsx: "XLSX", xls: "XLS", py: "PY",
    jpg: "JPG", jpeg: "JPG", png: "PNG", gif: "GIF", webp: "WEBP",
  };
  const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp"]);
  const MAX_FILE_BYTES = 200 * 1024;         // 200KB (텍스트/코드 계열)
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;   // 5MB (이미지는 압축 후 저장)
  const MAX_ATTACH_COUNT = 5;

  async function handleFileAttach(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!FILE_EXTS[ext]) {
      alert("HTML, TXT, CSV, Excel, Python, 이미지(JPG/PNG/GIF/WEBP) 파일만 첨부할 수 있습니다.");
      return;
    }
    const isImage = IMAGE_EXTS.has(ext);
    if (file.size > (isImage ? MAX_IMAGE_BYTES : MAX_FILE_BYTES)) {
      alert(isImage
        ? `이미지 파일은 5MB 이하여야 합니다. (현재: ${(file.size / 1024 / 1024).toFixed(1)}MB)`
        : `파일 크기는 200KB 이하여야 합니다. (현재: ${Math.round(file.size / 1024)}KB)`
      );
      return;
    }
    if (attachments.length >= MAX_ATTACH_COUNT) {
      alert(`파일은 최대 ${MAX_ATTACH_COUNT}개까지 첨부할 수 있습니다.`);
      return;
    }
    // 이미지는 압축 후 업로드, 그 외 파일은 원본 업로드 → 다운로드 URL 저장
    let dataUrl;
    setUploadPct(0);
    try {
      dataUrl = isImage
        ? await uploadImage(file, { onProgress: setUploadPct })
        : await uploadFile(file, { onProgress: setUploadPct });
    } catch {
      alert("파일 업로드에 실패했어요. 잠시 후 다시 시도해 주세요.");
      return;
    } finally {
      setUploadPct(null);
    }
    setAttachments((prev) => [
      ...prev,
      { id: `f${Date.now()}`, name: file.name, ext, size: file.size, dataUrl },
    ]);
  }

  // 그리기 결과는 첨부 이미지(attachments)로 추가 → 위 '이미지 첨부'와 함께 보존됩니다.
  async function handleDrawingSave(dataUrl) {
    if (attachments.length >= MAX_ATTACH_COUNT) {
      alert(`파일은 최대 ${MAX_ATTACH_COUNT}개까지 첨부할 수 있습니다.`);
      return;
    }
    setUploadPct(0);
    try {
      const url = await uploadDataUrl(dataUrl, "drawing.png", { onProgress: setUploadPct });
      setAttachments((prev) => [
        ...prev,
        { id: `f${Date.now()}`, name: "그림.png", ext: "png", size: 0, dataUrl: url },
      ]);
    } catch {
      alert("그림 업로드에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setUploadPct(null);
    }
  }

  function removeAttachment(id) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  // 첨부를 두 그룹으로 나눠 보여줍니다: 파일 목록(문서류) + 이미지 그리드(사진·그림).
  // 메인 이미지(imageUrl)와 이미지 첨부를 한 그리드에 합쳐 보여주되,
  // 실제 저장 필드는 그대로(imageUrl/attachments 분리) 유지합니다.
  const fileAttachments = attachments.filter((a) => !IMAGE_EXTS.has(a.ext));
  const imageItems = [
    ...(imageUrl ? [{ id: "__main__", src: imageUrl, isMain: true }] : []),
    ...attachments
      .filter((a) => IMAGE_EXTS.has(a.ext))
      .map((a) => ({ id: a.id, src: a.dataUrl, isMain: false })),
  ];
  const cardFileAttachments = (card?.attachments ?? []).filter((a) => !IMAGE_EXTS.has(a.ext));
  const cardImageItems = [
    ...(card?.imageUrl ? [{ id: "__main__", src: card.imageUrl }] : []),
    ...(card?.attachments ?? [])
      .filter((a) => IMAGE_EXTS.has(a.ext))
      .map((a) => ({ id: a.id, src: a.dataUrl })),
  ];

  function downloadAttachment(att) {
    const a = document.createElement("a");
    a.href = att.dataUrl;
    a.download = att.name;
    a.click();
  }

  // 현재 입력값 → 저장할 { titleToSave, htmlToSave, valid }
  function buildPayload() {
    if (isActivityCard) {
      // 활동 이름은 항상 보드의 활동 목록을 기준으로 씁니다 — 값이 아직
      // 채워지지 않은 칸이 'undefined'로 저장되지 않게.
      const htmlToSave = activities
        .map((act, i) => {
          const t = activityTitles[i] ?? act;
          const c = sanitizeHtml(activityContents[i] ?? "");
          return `<div class="activity-section"><h4 class="activity-title">${t}</h4>${c}</div>`;
        })
        .join("");
      const hasContent = activityContents.some(
        (c) => stripHtml(sanitizeHtml(c)).trim().length > 0
      );
      return { titleToSave: "", htmlToSave, valid: hasContent || !!imageUrl || attachments.length > 0 };
    }
    const htmlToSave = sanitizeHtml(content);
    // 제목을 입력하지 않으면 보드 제목을 기본값으로 사용
    const titleToSave = title.trim() || board.title;
    const valid = stripHtml(htmlToSave).length > 0 || !!imageUrl || attachments.length > 0;
    return { titleToSave, htmlToSave, valid };
  }

  // 실제 저장 — 아직 카드가 없으면 생성(생성 ID 기억), 있으면 갱신.
  async function persist(titleToSave, htmlToSave) {
    const payload = { title: titleToSave, content: htmlToSave, imageUrl, attachments };
    if (cardIdRef.current) {
      await updateStudyCard(board.id, cardIdRef.current, payload);
    } else {
      const newId = await addStudyCard(me, board.id, payload);
      cardIdRef.current = newId ?? me.uid;
    }
  }

  // 자동저장 1회 — 중복 방지(single-flight), 저장 중 변경은 끝나고 재저장.
  async function flushSave() {
    if (!canEdit) return;
    const { titleToSave, htmlToSave, valid } = buildPayload();
    if (!valid) return; // 빈 카드는 자동 생성하지 않음
    if (savingRef.current) { pendingRef.current = true; return; }
    savingRef.current = true;
    dirtyRef.current = false;
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current); // 숨김 예약 취소
    setAutoStatus("saving");
    try {
      await persist(titleToSave, htmlToSave);
      baselineSigRef.current = sigOf(titleToSave, htmlToSave); // 저장된 내용을 새 기준값으로
      showSavedThenHide();
    } catch {
      dirtyRef.current = true;
      setAutoStatus("error");
    } finally {
      savingRef.current = false;
      // 저장 중 들어온 변경이 있으면 최신 클로저로 재저장(스테일 방지)
      if (pendingRef.current) { pendingRef.current = false; flushRef.current?.(); }
    }
  }
  flushRef.current = flushSave; // 항상 최신 클로저를 참조

  // 입력이 멈추면(1초) 자동 저장. 단, 열었을 때의 기준값과 "실제로 달라졌을
  // 때만" 저장합니다 → 카드를 단순히 열기만 하면 저장되지 않습니다.
  useEffect(() => {
    const { titleToSave, htmlToSave, valid } = buildPayload();
    const sig = sigOf(titleToSave, htmlToSave);
    // 첫 실행: 열었을 때의 내용을 기준값으로 기록만 하고 저장하지 않음
    if (baselineSigRef.current === null) {
      baselineSigRef.current = sig;
      return;
    }
    if (sig === baselineSigRef.current) return; // 내용 변경 없음 → 저장 안 함
    if (!canEdit || !valid) return;
    dirtyRef.current = true;
    const t = setTimeout(() => flushRef.current?.(), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, imageUrl, attachments, activityTitles, activityContents, canEdit]);

  // 모달을 닫을 때(언마운트) 저장 대기분이 있으면 마지막으로 저장
  useEffect(() => {
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (dirtyRef.current) flushRef.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 방송 종료 — 교사가 '크게 보기'를 끄거나 모달을 닫으면 학생 화면도 원래대로.
  // (학생이 자기 카드를 크게 볼 때는 방송하지 않음 — 교사가 켰을 때만)
  useEffect(() => {
    if (!expanded || !card || !board.classId || !isTeacher(me)) return;
    return () => { stopBroadcast(board.classId); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, card?.id, board.classId]);

  // 방송 내용 갱신 — 편집 중인 텍스트가 잠시(0.4초) 멈추면 학생 화면도 함께 갱신
  useEffect(() => {
    if (!expanded || !card || !board.classId || !isTeacher(me)) return;
    const t = setTimeout(() => {
      const { titleToSave, htmlToSave } = canEdit
        ? buildPayload()
        : { titleToSave: card.title || "", htmlToSave: sanitizeHtml(card.content || "") };
      startBroadcast(me, board.classId, {
        mode: "single",
        boardId: board.id,
        boardTitle: board.title,
        cardId: card.id,
        title: titleToSave,
        content: stripImgTags(htmlToSave),
        displayName: cardDisplayName,
        isGroupCard: !!card.groupId,
        members: card.members ?? null,
      });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    expanded, card?.id, board.classId, board.id, board.title, canEdit,
    title, content, activityTitles, activityContents, cardDisplayName,
  ]);

  // "저장하고 닫기" — 진행 중 자동저장을 기다렸다가 최종 저장 후 닫기
  async function handleSave() {
    const { titleToSave, htmlToSave, valid } = buildPayload();
    if (!valid) { onClose(); return; } // 빈 카드는 저장 없이 닫기
    setSaving(true);
    try {
      while (savingRef.current) await new Promise((r) => setTimeout(r, 50));
      savingRef.current = true;
      dirtyRef.current = false;
      await persist(titleToSave, htmlToSave);
      savingRef.current = false;
      onClose();
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  }

  async function handleDelete() {
    await deleteStudyCard(board.id, card.id);
    onClose();
  }

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div
        className={`modal modal-study-card${expanded ? " modal-study-card--expanded" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="modal-head">
          <h3>
            {isNew || canEdit ? (
              <span className="study-form-title-pen">
                <IconPen size={18} /> {isNew ? "내 카드 작성하기" : "내 카드 수정하기"}
              </span>
            ) : (
              cardDisplayName || "카드 보기"
            )}
            <span className="study-form-board"># {board.title}</span>
            {canEdit && autoStatus !== "idle" && (
              <span className={`study-autosave-pill study-autosave-pill--${autoStatus}`}>
                {autoStatus === "saving" && "저장 중…"}
                {autoStatus === "saved" && "✓ 자동 저장됨"}
                {autoStatus === "error" && "저장 실패"}
              </span>
            )}
          </h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        {/* 작성자 정보 (기존 카드일 때) — 오른쪽 끝에 크게 보기 토글 */}
        {!isNew && (
          <div className="study-card-meta">
            <span className="avatar avatar-sm" aria-hidden="true">
              {card.groupId ? "👥" : isTeacherCard ? <IconTeacher size={22} /> : (card.authorEmoji ?? "🙂")}
            </span>
            {card.groupId ? (
              <span className="study-card-meta-group">
                <strong>{card.title || card.groupName}</strong>
                {card.members?.length > 0 && (
                  <span className="study-card-meta-members">
                    {card.members
                      .map((m) => (m.uid === card.leaderUid ? `👑 ${m.name}` : m.name))
                      .join(" · ")}
                  </span>
                )}
              </span>
            ) : (
              <strong>{cardDisplayName}</strong>
            )}
            <button
              type="button"
              className="study-card-expand-btn"
              onClick={() => setExpanded((v) => !v)}
              title={expanded ? "원래 크기로" : "크게 보기 (발표 크기)"}
              aria-label={expanded ? "원래 크기로" : "크게 보기"}
            >
              {expanded ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
            <time className="study-card-meta-time">{formatTime(card.createdAt)}</time>
          </div>
        )}

        {/* 본문 영역 — 크게 보기(발표 크기)에서는 첨부를 감추고 텍스트를 슬라이드처럼 */}
        <div
          className={`study-card-modal-body${isActivityCard ? " activity-mode" : ""}${
            expanded ? " study-slide-mode" : ""
          }`}
        >
          {canEdit ? (
            <>
              {isActivityCard ? (
                /* 활동별 멀티 섹션 폼 — 2개씩 표시, 3개 이상은 스크롤 */
                <div className="activity-form-list">
                  {activities.map((act, i) => {
                    // 잠긴 활동은 아직 열리지 않은 활동입니다 — 칸은 보여 주되
                    // 입력은 막습니다(교사가 전광판에서 자물쇠를 풀면 열림).
                    const actLocked = isActivityLocked(board, i);
                    return (
                    <div
                      key={i}
                      className={`activity-form-section${actLocked ? " activity-form-section--locked" : ""}`}
                    >
                      {/* 몇 번째 활동인지 — 활동이 여러 개면 학생이 순서를
                          바로 알 수 있게 제목 위에 번호를 붙입니다 */}
                      <span className="activity-form-no">
                        활동 {i + 1}
                        {actLocked && <span className="activity-form-lock">🔒 잠김</span>}
                      </span>
                      {actLocked ? (
                        <>
                          <p className="activity-form-locked-title">
                            {activityTitles[i] ?? act}
                          </p>
                          {stripHtml(activityContents[i] ?? "").trim() ? (
                            <div
                              className="study-card-content activity-form-locked-body"
                              dangerouslySetInnerHTML={{
                                __html: sanitizeHtml(activityContents[i] ?? ""),
                              }}
                            />
                          ) : (
                            <p className="activity-form-locked-note">
                              선생님이 이 활동을 열어 주면 입력할 수 있어요.
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          <input
                            type="text"
                            className="study-card-title-input"
                            /* 활동이 방금 늘어난 칸도 곧바로 이름이 보이도록
                               보드의 활동 이름을 기본값으로 씁니다 */
                            value={activityTitles[i] ?? act}
                            onChange={(e) => {
                              const next = [...activityTitles];
                              next[i] = e.target.value;
                              setActivityTitles(next);
                            }}
                            placeholder={`활동 ${i + 1}`}
                            maxLength={80}
                          />
                          <RichTextEditor
                            variant="full"
                            /* 이미 저장돼 있던 내용을 그대로 이어서 씁니다 */
                            initialHtml={savedSections.current[i]?.content ?? ""}
                            onChange={(html) => {
                              setActivityContents((prev) => {
                                const next = [...prev];
                                next[i] = html;
                                return next;
                              });
                            }}
                            placeholder="내용을 입력해 주세요."
                          />
                        </>
                      )}
                    </div>
                    );
                  })}
                </div>
              ) : (
                /* 기본 단일 편집 폼 */
                <>
                  <input
                    type="text"
                    className="study-card-title-input"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={card?.groupId ? "모둠 이름" : `제목 미입력 시 '${board.title}'`}
                    maxLength={60}
                  />
                  <RichTextEditor
                    variant="full"
                    initialHtml={isNew ? "" : card.content}
                    onChange={setContent}
                    placeholder="활동 결과물을 자유롭게 작성해 보세요. 글, 코드, 이미지 모두 담을 수 있어요."
                  >
                    <label className="rte-tool" title="이미지 첨부">
                      <IconImage />
                      <input type="file" accept="image/*" onChange={handleFile} hidden />
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
                </>
              )}

              {/* 크게 보기(발표 크기)에서는 첨부를 감춥니다 — 텍스트만 슬라이드처럼 */}
              {!expanded && (
                <>
                  <UploadProgress pct={uploadPct} />

                  {/* 파일 첨부 목록 (문서류만 — 이미지는 아래 그리드로) */}
                  <div className="attach-files-section">
                    <div className="attach-files-header">
                      <span className="attach-files-label">📎 파일 첨부</span>
                      {mine && (
                        <label className="btn-ghost attach-add-btn" title={`HTML, TXT, CSV, Excel, Python, 이미지 파일 (최대 200KB/5MB, ${MAX_ATTACH_COUNT}개)`}>
                          + 파일 추가
                          <input
                            type="file"
                            accept=".html,.htm,.txt,.csv,.xlsx,.xls,.py,.jpg,.jpeg,.png,.gif,.webp"
                            onChange={handleFileAttach}
                            hidden
                          />
                        </label>
                      )}
                    </div>
                    {fileAttachments.length > 0 && (
                      <ul className="attach-file-list">
                        {fileAttachments.map((att) => (
                          <li key={att.id} className="attach-file-item">
                            <span className={`attach-file-ext ext-${att.ext}`}>
                              {FILE_EXTS[att.ext] ?? att.ext.toUpperCase()}
                            </span>
                            <span className="attach-file-name">{att.name}</span>
                            <span className="attach-file-size">{formatFileSize(att.size)}</span>
                            {mine && (
                              <button
                                type="button"
                                className="attach-file-del"
                                onClick={() => removeAttachment(att.id)}
                                aria-label="삭제"
                              >
                                ✕
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* 이미지·그림 그리드 (2열) — 메인 이미지 + 이미지 첨부를 함께 표시 */}
                  {imageItems.length > 0 && (
                    <div className="attach-image-grid">
                      {imageItems.map((item) => (
                        <div key={item.id} className="attach-image-cell">
                          <ZoomableImage
                            src={item.src}
                            alt="첨부 이미지"
                            className="attach-image-grid-thumb"
                          />
                          {mine && (
                            <button
                              type="button"
                              className="attach-image-grid-del"
                              onClick={() =>
                                item.isMain ? setImageUrl(null) : removeAttachment(item.id)
                              }
                              aria-label="삭제"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          ) : card ? (
            <>
              {card.title && (
                <h4 className="study-card-read-title">{card.title}</h4>
              )}
              <div
                className="study-card-body"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(card.content) }}
              />

              {/* 크게 보기(발표 크기)에서는 첨부를 감춥니다 — 텍스트만 슬라이드처럼 */}
              {!expanded && (
                <>
                  {/* 파일 첨부 목록 (읽기 모드, 문서류만) */}
                  {cardFileAttachments.length > 0 && (
                    <div className="attach-files-section">
                      <p className="attach-files-label">📎 첨부 파일</p>
                      <ul className="attach-file-list">
                        {cardFileAttachments.map((att) => (
                          <li key={att.id} className="attach-file-item">
                            <span className={`attach-file-ext ext-${att.ext}`}>
                              {FILE_EXTS[att.ext] ?? att.ext.toUpperCase()}
                            </span>
                            <span className="attach-file-name">{att.name}</span>
                            <span className="attach-file-size">{formatFileSize(att.size)}</span>
                            <button
                              type="button"
                              className="btn-ghost attach-download-btn"
                              onClick={() => downloadAttachment(att)}
                            >
                              ⬇ 다운로드
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* 이미지·그림 그리드 (읽기 모드, 2열) */}
                  {cardImageItems.length > 0 && (
                    <div className="attach-image-grid">
                      {cardImageItems.map((item) => (
                        <div key={item.id} className="attach-image-cell">
                          <ZoomableImage
                            src={item.src}
                            alt="첨부 이미지"
                            className="attach-image-grid-thumb"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          ) : null}
        </div>

        {/* 하단 액션 영역 */}
        <div className="study-card-modal-foot">
          {mine && linked && (
            <div className="study-card-modal-links">
              <button
                className="study-chip"
                onClick={() => onAsk?.(boardKeywords[0] ?? null)}
              >
                ❓ 질문하기
              </button>
              <button
                className={`study-chip ${showRelated ? "open" : ""}`}
                onClick={() => setShowRelated((v) => !v)}
                aria-expanded={showRelated}
              >
                🔗 관련 질문{relatedQuestions.length > 0 && ` (${relatedQuestions.length})`}
              </button>
            </div>
          )}

          {mine && linked && showRelated && (
            <div className="study-related study-related-modal">
              {relatedQuestions.length === 0 ? (
                <p className="study-related-empty">
                  아직 #{board.keyword} 키워드의 질문이 없어요. "질문하기"로
                  막힌 점을 올려 보세요.
                </p>
              ) : (
                relatedQuestions.map((q) => (
                  <button
                    key={q.id}
                    className="study-related-item"
                    onClick={() => setPeekQuestion(q)}
                  >
                    <span className={`mini-status ${q.resolved ? "done" : "open"}`}>
                      {q.resolved ? <IconSolved size={20} /> : <IconAsk size={20} />}
                    </span>
                    <span className="study-related-title">{q.title}</span>
                    <span className="study-related-preview">
                      {q.content?.replace(/<[^>]*>/g, "").slice(0, 60)}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}

          {(canEdit || (canDelete && !isNew && !card?.groupId)) && (
            <div className="study-card-modal-save-row">
              {canEdit && autoStatus === "error" && (
                <span className="study-autosave study-autosave--error">
                  저장 실패 · 다시 시도됩니다
                </span>
              )}
              {/* 삭제는 교사만 — 보드가 잠겨 있어도(canEdit=false) 지울 수 있습니다.
                  모둠 카드는 삭제 불가(위험 방지) — 삭제 버튼 자체를 제거 */}
              {canDelete && !isNew && !card?.groupId && (
                confirmDelete ? (
                  <>
                    <span className="study-delete-warn">
                      ⚠️ 이 카드는 삭제 후 복구할 수 없습니다.
                    </span>
                    <button className="btn-primary study-foot-danger" onClick={handleDelete}>
                      정말 삭제
                    </button>
                    <button className="btn-primary study-foot-ghost" onClick={() => setConfirmDelete(false)}>
                      취소
                    </button>
                  </>
                ) : (
                  <button className="btn-primary" onClick={() => setConfirmDelete(true)}>
                    <IconTrash size={16} /> 삭제
                  </button>
                )
              )}
              {canEdit && (
                <button
                  className="btn-primary"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? "저장 중..." : "저장하고 닫기"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {drawing && (
        <DrawingCanvas
          onSave={handleDrawingSave}
          onClose={() => setDrawing(false)}
        />
      )}

      {peekQuestion && (
        <StudyQuestionPeek
          question={peekQuestion}
          onClose={() => { setPeekQuestion(null); setShowRelated(false); }}
          onBackToList={() => { setPeekQuestion(null); setShowRelated(true); }}
        />
      )}
    </div>
  );
}
