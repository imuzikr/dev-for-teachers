"use client";

// =============================================================
// 공부방 보드(컬럼) 하나 — Trello/Padlet 스타일 세로 컬럼
// -------------------------------------------------------------
// · 수업 안내(type='notice'): 교사만 카드 작성, 학생은 읽기
// · 학생 보드(type='student'): 학생은 카드 1개만 작성
//     viewMode='private'(기본) → 학생은 자기 카드만, 교사는 전부
//     viewMode='shared'        → 모두가 서로의 카드를 봄
//     editMode='locked'        → 작성/수정 잠금(보기 전용)
//
// [레이아웃]
// · 교사 정보 카드: 보드 제목·설명·정렬·설정 — 독립 카드로 고정
// · 학생 카드 영역: 학생이 제출한 카드 목록
// =============================================================
import { backdropClose } from "@/lib/modal";
import { useEffect, useState } from "react";
import {
  subscribeStudyCards,
  subscribeMyGroupCards,
  updateStudyBoard,
  updateStudyCard,
  deleteStudyBoard,
  duplicateStudyBoard,
  getDirectoryUser,
  toDate,
} from "@/lib/store";
import { stripHtml } from "@/lib/html";
import { buildActivityTemplate, nextActivityLocks, isActivityLocked } from "@/lib/activities";
import StudyCard from "./StudyCard";
import StudyCardModal from "./StudyCardModal";
import StudyPresentModal from "./StudyPresentModal";
import GroupComposer from "./GroupComposer";
import { IconTrash, IconSettings, IconLock, IconDuplicate, IconPen, IconPeople } from "./StatusIcons";

export default function StudyBoardColumn({
  board,
  user,
  isTeacher,
  isFirst = false, // 첫 번째 보드 — 고정(핀)·모두 펴기 기능은 첫 보드에만 제공
  collapsed = false, // 공유 접힘 상태(board.collapsed) — 세로 슬림 바로 접힘
  onToggleCollapse,
  onExpandAll, // 첫 보드: 접힌 보드 일괄 펴기
  hasCollapsed = false, // 접힌 보드가 하나라도 있는지 (모두 펴기 활성화용)
  onCollapseAll, // 첫 보드: 교사·최근 보드만 남기고 모두 접기
  canCollapseAll = false, // 접을 수 있는 중간 보드가 남아 있는지 (모두 접기 활성화용)
  classRoster = [], // 교사: 반 학생 명단(모둠 구성용) [{uid, name, emoji}]
  baseGroupAssignment = null,
  questions = [],
  classes = [],
  onAsk,
  onModalChange,
  onDuplicated,
  isDragging = false,
  onBoardDragStart,
  onBoardDragEnd,
  onBoardDrop,
}) {
  const [cards, setCards] = useState([]);
  const [selectedCard, setSelectedCard] = useState(null);
  const [creating, setCreating] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [duplicating, setDuplicating] = useState(false); // 다른 반으로 복제 모달
  const [dragOver, setDragOver] = useState(false);
  const [sortKey, setSortKey] = useState("time");
  const [studentIdDir, setStudentIdDir] = useState("asc");
  const [timeDir, setTimeDir] = useState("asc");
  const [activitiesOpen, setActivitiesOpen] = useState(false);
  const [activitiesDraft, setActivitiesDraft] = useState([]);
  const [savingActivities, setSavingActivities] = useState(false);
  const [presenting, setPresenting] = useState(false); // 발표 모드
  const [titleDraft, setTitleDraft] = useState(board.title); // 보드 제목 편집 초안
  const [editingTitle, setEditingTitle] = useState(false); // 제목 인라인 편집 중
  const [descDraft, setDescDraft] = useState(board.description ?? ""); // 상세 설명 편집 초안
  const [editingDesc, setEditingDesc] = useState(false); // 상세 설명 인라인 편집 중
  // 학생 미리보기(peek): 접힌 보드를 학생이 잠깐 펼쳐 보는 개인 상태.
  // 공유 상태(board.collapsed)는 그대로 두고, 이 학생의 화면에서만 펼쳐집니다.
  const [peeked, setPeeked] = useState(false);
  const [composing, setComposing] = useState(false); // 모둠 구성 모달

  const isGroup = board.activityType === "group"; // 모둠 활동 보드

  useEffect(() => {
    // 모둠 보드 + 학생 + '자기 모둠만'(private): 규칙상 내 모둠 카드만 구독 가능.
    // '함께 보기'(shared)면 다른 모둠 카드도 읽기 전용으로 내려받음.
    if (isGroup && !isTeacher && board.viewMode !== "shared") {
      if (!user) return;
      return subscribeMyGroupCards(board.id, user.uid, setCards);
    }
    return subscribeStudyCards(board.id, setCards);
  }, [board.id, isGroup, isTeacher, board.viewMode, user?.uid]);

  // 외부에서 보드 제목이 바뀌면 편집 초안도 동기화
  useEffect(() => {
    setTitleDraft(board.title);
  }, [board.title]);

  const isNotice = board.type === "notice";
  const locked = board.editMode === "locked";
  const myCard = user ? cards.find((c) => c.authorId === user.uid) : null;
  // 모둠 보드: 내가 속한 모둠 카드
  const myGroupCard =
    isGroup && user ? cards.find((c) => c.memberUids?.includes(user.uid)) : null;

  let visibleCards = cards;
  if (isGroup) {
    // 모둠 카드만(보관된 카드는 교사에게만), 순번 순 정렬
    visibleCards = cards
      .filter((c) => c.groupId && (isTeacher || !c.retired))
      .sort((a, b) => (a.groupIndex ?? 0) - (b.groupIndex ?? 0));
  } else if (!isTeacher && !isNotice && board.viewMode === "private") {
    visibleCards = myCard ? [myCard] : [];
  }

  const currentSortDir = sortKey === "studentId" ? studentIdDir : timeDir;

  if (isTeacher && !isNotice && !isGroup) {
    visibleCards = [...visibleCards].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "studentId") {
        // 학번은 게시물에 없으므로 교사용 디렉터리에서 조회 (구버전 카드는 fallback)
        const aId = getDirectoryUser(a.authorId)?.studentId ?? a.authorStudentId ?? "";
        const bId = getDirectoryUser(b.authorId)?.studentId ?? b.authorStudentId ?? "";
        cmp = String(aId).localeCompare(String(bId), "ko", { numeric: true });
      } else {
        cmp = toDate(a.createdAt) - toDate(b.createdAt);
      }
      return currentSortDir === "asc" ? cmp : -cmp;
    });
  }

  const canAddNotice = isNotice && isTeacher && !locked;
  // 교사는 보드당 여러 카드 가능(제한 없음), 학생은 카드 1개까지(myCard 없을 때만).
  // 모둠 보드의 카드는 '모둠 구성'으로만 생성 — 학생 직접 추가 불가(교사 자료 카드는 허용).
  const canAddStudent = !isNotice && !locked && (isTeacher || (!isGroup && !myCard));
  const canAdd = canAddNotice || canAddStudent;

  // 발표 모드 대상 — 모둠 보드는 모둠 카드, 개별 보드는 학생 카드만(교사 예시 제외)
  const presentCards = isGroup
    ? visibleCards.filter((c) => c.groupId && !c.retired)
    : visibleCards.filter(
        (c) => !(c.authorId?.startsWith?.("teacher_") || c.authorName === "선생님")
      );

  // 이전 단일 keyword 필드와 새 keywords 배열 모두 지원
  const boardKeywords = Array.isArray(board.keywords)
    ? board.keywords
    : board.keyword
    ? [board.keyword]
    : [];
  const relatedQuestions = boardKeywords.length > 0
    ? questions.filter((q) => boardKeywords.includes(q.keyword))
    : [];

  function canEditCard(card) {
    if (locked || !user) return false;
    if (isTeacher) return true;
    // 모둠 카드: 그 모둠 구성원이면 편집 가능
    if (card.groupId) return !!card.memberUids?.includes(user.uid);
    return card.authorId === user.uid;
  }

  async function handleDeleteBoard() {
    if (!confirm(`'${board.title}' 보드를 삭제할까요? 카드도 함께 삭제됩니다.`)) return;
    await deleteStudyBoard(board.id);
  }

  // 보드 제목 저장 — 제목을 따로 입력하지 않아 '보드 제목'을 기본값으로 쓰던
  // 카드들의 제목도 함께 바꿔 줍니다(직접 다른 제목을 단 카드는 그대로 유지).
  async function commitTitle() {
    const newTitle = titleDraft.trim();
    setEditingTitle(false);
    if (!newTitle || newTitle === board.title) {
      setTitleDraft(board.title); // 빈 값·무변경이면 원래 제목으로 되돌림
      return;
    }
    const oldTitle = board.title;
    await updateStudyBoard(board.id, { title: newTitle });
    cards.forEach((c) => {
      if ((c.title ?? "") === oldTitle) {
        updateStudyCard(board.id, c.id, { title: newTitle });
      }
    });
  }
  function startEditTitle() {
    setTitleDraft(board.title);
    setEditingTitle(true);
  }
  function cancelEditTitle() {
    setTitleDraft(board.title);
    setEditingTitle(false);
  }

  // 보드 상세 설명 저장 — 더블 클릭으로 그 자리에서 편집(제목과 같은 방식).
  async function commitDesc() {
    const newDesc = descDraft.trim();
    setEditingDesc(false);
    if (newDesc === (board.description ?? "")) return;
    await updateStudyBoard(board.id, { description: newDesc });
  }
  function startEditDesc() {
    setDescDraft(board.description ?? "");
    setEditingDesc(true);
  }
  function cancelEditDesc() {
    setDescDraft(board.description ?? "");
    setEditingDesc(false);
  }

  // 다른 반으로 복제 — 학생 카드는 복사하지 않고 활동·공개범위만 유지
  async function handleDuplicate(targetClass) {
    await duplicateStudyBoard(board, targetClass.id, user);
    setDuplicating(false);
    onDuplicated?.(targetClass.name);
  }

  // 복제 대상 후보 — 현재 보드가 속한 반은 제외
  const otherClasses = classes.filter((c) => c.id !== board.classId);

  // 활동 하나의 잠금을 켜고 끕니다 — 수업 화면의 '활동 열기' 줄과 같은
  // 보드 문서(activityLocks)를 쓰므로 두 화면이 항상 같은 상태를 봅니다.
  async function toggleActivityLock(i, lockedNext) {
    const next = (board.activities ?? []).map((_, j) =>
      j === i ? lockedNext : board.activityLocks?.[j] === true
    );
    await updateStudyBoard(board.id, { activityLocks: next });
  }

  function openActivitiesModal() {
    setActivitiesDraft(
      board.activities?.length ? [...board.activities] : [""]
    );
    setActivitiesOpen(true);
  }

  async function handleSaveActivities() {
    const newActivities = activitiesDraft.filter((a) => a.trim().length > 0);

    const studentCards = cards.filter(
      (c) => !c.authorId?.startsWith("teacher_")
    );
    const hasContent = studentCards.some(
      (c) => stripHtml(c.content ?? "").trim().length > 0
    );

    if (hasContent) {
      alert(
        "학생이 입력한 내용이 있어서 활동을 변경할 수 없어요.\n모든 학생 카드의 내용을 비운 후 다시 시도해 주세요."
      );
      return;
    }

    setSavingActivities(true);
    try {
      // 새로 만든 활동은 잠긴 채로 시작합니다 — 교사가 '공부중' 전광판에서
      // 자물쇠를 풀어 줘야 학생이 입력할 수 있습니다. 이름이 그대로인
      // 활동은 지금 잠금 상태를 그대로 이어받습니다.
      await updateStudyBoard(board.id, {
        activities: newActivities,
        activityLocks: nextActivityLocks(
          board.activities ?? [],
          board.activityLocks ?? [],
          newActivities
        ),
      });

      if (newActivities.length > 0) {
        const templateHtml = buildActivityTemplate(newActivities);
        await Promise.all(
          studentCards.map((c) =>
            updateStudyCard(board.id, c.id, {
              title: c.title ?? "",
              content: templateHtml,
              imageUrl: c.imageUrl ?? null,
              attachments: c.attachments ?? [],
            })
          )
        );
      }

      setActivitiesOpen(false);
    } finally {
      setSavingActivities(false);
    }
  }

  const modalOpen = selectedCard !== null || creating || presenting;

  useEffect(() => {
    onModalChange?.(modalOpen);
  }, [modalOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const pinned = isFirst && !!board.pinned; // 고정은 첫 보드에서만 유효

  // 공유 접힘이 해제되면(교사가 펼침) 학생의 개인 미리보기도 초기화 —
  // 이후 다시 접혔을 때 슬림 바가 정상적으로 나타나게 합니다.
  useEffect(() => {
    if (!collapsed) setPeeked(false);
  }, [collapsed]);

  // 학생이 미리보기 중이면 이 화면에서만 펼쳐 보여줍니다(공유 상태는 접힘 유지).
  const effectiveCollapsed = collapsed && !peeked;

  // 접힌 상태 — 폭 48px 세로 슬림 바 (제목 세로쓰기 + 카드 수 뱃지).
  // 교사가 클릭하면 공유 상태를 펼치고(모두에게 반영),
  // 학생이 클릭하면 자기 화면에서만 잠깐 펼쳐(peek) 봅니다.
  if (effectiveCollapsed) {
    const unfold = () => (isTeacher ? onToggleCollapse?.() : setPeeked(true));
    return (
      <section
        className="study-column study-column--collapsed"
        role="button"
        tabIndex={0}
        onClick={unfold}
        onKeyDown={(e) => e.key === "Enter" && unfold()}
        title={isTeacher ? `'${board.title}' 펼치기` : `'${board.title}' 잠깐 펼쳐 보기`}
      >
        <span className="study-collapsed-expand" aria-hidden="true">»</span>
        <span className="study-collapsed-count">{cards.length}</span>
        <span className="study-collapsed-title">{board.title}</span>
      </section>
    );
  }

  return (
    <section
      className={`study-column ${isNotice ? "is-notice" : ""}${isDragging ? " board-dragging" : ""}${dragOver ? " board-drag-over" : ""}${pinned ? " is-pinned" : ""}`}
      onDragOver={isTeacher ? (e) => { e.preventDefault(); setDragOver(true); } : undefined}
      onDragLeave={isTeacher ? () => setDragOver(false) : undefined}
      onDrop={isTeacher ? (e) => { e.preventDefault(); setDragOver(false); onBoardDrop?.(); } : undefined}
    >
      {/* ── 교사 관리 영역 (독립 카드) ── */}
      <div className="study-board-info">
        <div
          className={`study-board-info-head${isTeacher && !editingTitle ? " draggable" : ""}`}
          draggable={isTeacher && !editingTitle}
          onDragStart={isTeacher && !editingTitle ? () => onBoardDragStart?.() : undefined}
          onDragEnd={isTeacher && !editingTitle ? () => onBoardDragEnd?.() : undefined}
          title={isTeacher && !editingTitle ? "드래그해서 보드 순서 변경" : undefined}
        >
          {/* 제목 — 교사는 더블 클릭으로 그 자리에서 바로 편집 (선생님 보드도 이름 변경 가능) */}
          {isTeacher && editingTitle ? (
            <div
              className="study-title-edit-wrap"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <input
                className="study-title-inline"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); commitTitle(); }
                  else if (e.key === "Escape") { e.preventDefault(); cancelEditTitle(); }
                }}
                maxLength={40}
                placeholder="보드 제목"
                aria-label="보드 제목 수정"
                autoFocus
              />
              <button
                type="button"
                className="study-title-save"
                // mousedown에서 blur가 먼저 일어나 두 번 저장되지 않게 포커스 이동 방지
                onMouseDown={(e) => e.preventDefault()}
                onClick={commitTitle}
                title="제목 저장"
                aria-label="제목 저장"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          ) : (
            <h3
              className={isTeacher ? "study-title-h3--editable" : ""}
              onClick={
                // 제목 단일 클릭은 패널을 토글하지 않음(더블 클릭 편집과 충돌·깜빡임 방지).
                // 설정 패널은 헤더 오른쪽 ⌄ 버튼으로 엽니다.
                isTeacher ? (e) => e.stopPropagation() : undefined
              }
              onDoubleClick={
                isTeacher
                  ? (e) => { e.stopPropagation(); startEditTitle(); }
                  : undefined
              }
              title={isTeacher ? "더블 클릭해 제목 수정" : undefined}
            >
              {board.title}
            </h3>
          )}
          {isTeacher && isFirst && (
            <button
              className={`study-pin-btn${pinned ? " on" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                updateStudyBoard(board.id, { pinned: !board.pinned });
              }}
              title={pinned ? "고정 해제 — 스크롤 시 함께 이동" : "보드 고정 — 스크롤해도 왼쪽에 고정"}
              aria-label={pinned ? "보드 고정 해제" : "보드 고정"}
            >
              📌
            </button>
          )}
          {/* 첫 보드(교사 자료·공지용): 일괄 접기/펴기 버튼 */}
          {isTeacher && isFirst && (
            <button
              className="study-collapse-btn"
              onClick={(e) => {
                e.stopPropagation();
                onCollapseAll?.();
              }}
              disabled={!canCollapseAll}
              title={canCollapseAll ? "교사·최근 보드만 남기고 모두 접기" : "접을 보드가 없어요"}
              aria-label="교사·최근 보드만 남기고 모두 접기"
            >
              «
            </button>
          )}
          {isTeacher && isFirst && (
            <button
              className="study-collapse-btn"
              onClick={(e) => {
                e.stopPropagation();
                onExpandAll?.();
              }}
              disabled={!hasCollapsed}
              title={hasCollapsed ? "접힌 보드 모두 펴기" : "접힌 보드가 없어요"}
              aria-label="접힌 보드 모두 펴기"
            >
              »
            </button>
          )}
          {/* 나머지 보드: 세로 슬림 바로 접기 (발표 버튼 왼쪽) */}
          {isTeacher && !isFirst && (
            <button
              className="study-collapse-btn"
              onClick={(e) => {
                e.stopPropagation();
                onToggleCollapse?.();
              }}
              title="보드 접기 — 세로 막대로 축소"
              aria-label="보드 접기"
            >
              «
            </button>
          )}
          {/* 학생 미리보기 중: 자기 화면에서만 다시 접기 (공유 상태는 그대로) */}
          {!isTeacher && collapsed && peeked && (
            <button
              className="study-collapse-btn"
              onClick={(e) => {
                e.stopPropagation();
                setPeeked(false);
              }}
              title="다시 접기"
              aria-label="다시 접기"
            >
              «
            </button>
          )}
          {isTeacher && !isNotice && (
            <button
              className="study-present-btn"
              onClick={(e) => {
                e.stopPropagation();
                if (presentCards.length > 0) setPresenting(true);
              }}
              disabled={presentCards.length === 0}
              title={presentCards.length > 0 ? "발표 모드 — 학생 카드를 크게 넘겨보기" : "아직 제출한 카드가 없어요"}
              aria-label="발표 모드"
            >
              ▶
            </button>
          )}
          {isTeacher && (
            <button
              className={`study-panel-toggle${panelOpen ? " open" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                setPanelOpen((v) => !v);
              }}
              title={panelOpen ? "접기" : "정렬·설정 펼치기"}
              aria-label={panelOpen ? "패널 접기" : "패널 펼치기"}
            >
              <IconSettings size={20} />
            </button>
          )}
        </div>

        {board.description && (
          isTeacher && editingDesc ? (
            <div
              className="study-desc-edit-wrap"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <textarea
                className="study-desc-inline"
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                onBlur={commitDesc}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitDesc(); }
                  else if (e.key === "Escape") { e.preventDefault(); cancelEditDesc(); }
                }}
                maxLength={200}
                placeholder="보드 설명"
                aria-label="보드 설명 수정"
                autoFocus
              />
            </div>
          ) : (
            <p
              className={`study-column-desc${isTeacher ? " study-column-desc--editable" : ""}`}
              onClick={isTeacher ? (e) => e.stopPropagation() : undefined}
              onDoubleClick={
                isTeacher ? (e) => { e.stopPropagation(); startEditDesc(); } : undefined
              }
              title={isTeacher ? "더블 클릭해 설명 수정" : undefined}
            >
              {board.description}
            </p>
          )
        )}

        {/* 정렬·활동·설정 패널 — 제목 카드 클릭 시 한 번에 펼침 */}
        {isTeacher && (
          <div className={`study-board-panel${panelOpen ? " open" : ""}`}>
            {!isNotice && (
              <div className="study-sort">
                {isGroup ? (
                  /* 모둠 보드: 정렬 대신 모둠 구성 버튼 (카드는 모둠 순번 고정) */
                  <button
                    className="study-sort-btn study-sort-btn--group"
                    onClick={() => setComposing(true)}
                    title="활동 모둠 — 기본 모둠을 쓰거나 이 보드에서만 다르게 구성"
                  >
                    👥 활동 모둠
                  </button>
                ) : (
                  <>
                    <button
                      className={`study-sort-btn study-sort-btn--studentid${sortKey === "studentId" ? " active" : ""}`}
                      onClick={() => {
                        setSortKey("studentId");
                        setStudentIdDir((d) => (d === "asc" ? "desc" : "asc"));
                      }}
                      title="학번 정렬"
                    >
                      학번 {studentIdDir === "asc" ? "↑" : "↓"}
                    </button>
                    <button
                      className={`study-sort-btn study-sort-btn--time${sortKey === "time" ? " active" : ""}`}
                      onClick={() => {
                        setSortKey("time");
                        setTimeDir((d) => (d === "asc" ? "desc" : "asc"));
                      }}
                      title="제출 시간 정렬"
                    >
                      제출 {timeDir === "asc" ? "↑" : "↓"}
                    </button>
                  </>
                )}
              </div>
            )}
            <div className="study-settings">
              {!isNotice && (
                <label className="study-setting-row">
                  <span>공개 범위</span>
                  <button
                    className="study-chip"
                    onClick={() =>
                      updateStudyBoard(board.id, {
                        viewMode:
                          board.viewMode === "shared" ? "private" : "shared",
                      })
                    }
                    title={
                      isGroup
                        ? "자기 모둠만: 각 모둠은 자기 카드만 봄 · 함께 보기: 다른 모둠 카드도 읽기 전용으로 공개"
                        : undefined
                    }
                  >
                    {board.viewMode === "shared" ? (
                      <><IconPeople size={15} /> 함께 보기</>
                    ) : isGroup ? (
                      <><IconLock size={15} /> 자기 모둠만</>
                    ) : (
                      <><IconLock size={15} /> 나만 보기</>
                    )}
                  </button>
                </label>
              )}
              <label className="study-setting-row">
                <span>편집 상태</span>
                <button
                  className="study-chip"
                  onClick={() =>
                    updateStudyBoard(board.id, {
                      editMode: locked ? "open" : "locked",
                    })
                  }
                >
                  {locked ? (
                    <><IconLock size={15} /> 보기 전용</>
                  ) : (
                    <><IconPen size={15} /> 편집 가능</>
                  )}
                </button>
              </label>

              {/* 활동 상태 — 만들어 둔 활동을 하나씩 열고 잠급니다.
                  (수업 화면의 '활동 열기' 줄과 같은 값을 보고 씁니다) */}
              {!isNotice && (
                <div className="study-setting-row study-setting-row--acts">
                  <span>활동 상태</span>
                  <div className="study-act-chips">
                    {(board.activities ?? []).map((a, i) => {
                      const actLocked = isActivityLocked(board, i);
                      return (
                        <button
                          key={`${a}-${i}`}
                          type="button"
                          className={`study-act-chip${actLocked ? " locked" : ""}`}
                          onClick={() => toggleActivityLock(i, !actLocked)}
                          title={`${a} — ${actLocked ? "눌러서 열기" : "눌러서 잠그기"}`}
                          aria-pressed={!actLocked}
                        >
                          활동 {i + 1}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      className="study-act-chip study-act-chip--add"
                      onClick={openActivitiesModal}
                      title="학생 카드에 제시할 활동을 추가·수정합니다"
                      aria-label="활동 추가"
                    >
                      +
                    </button>
                  </div>
                </div>
              )}

              <button
                className="study-chip"
                onClick={() => setDuplicating(true)}
                title="이 보드를 다른 반으로 복제 (학생 기록은 초기화)"
              >
                <IconDuplicate size={15} /> 다른 반으로 복제
              </button>
              <button className="study-chip danger" onClick={handleDeleteBoard}>
                <IconTrash size={15} /> 보드 삭제
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── 학생 카드 목록 ── */}
      <div className="study-column-cards">
        {visibleCards.map((card) => (
          <StudyCard
            key={card.id}
            card={card}
            isTeacher={isTeacher}
            onClick={() => setSelectedCard(card)}
          />
        ))}

        {visibleCards.length === 0 && (
          <p className="study-column-empty">
            {locked
              ? "아직 등록된 카드가 없어요."
              : isNotice
              ? "안내 카드를 추가해 보세요."
              : "내 카드를 작성해 활동을 시작해 보세요."}
          </p>
        )}

        {canAdd && (
          <button className="study-add-card" onClick={() => setCreating(true)}>
            ＋ {isNotice || isTeacher ? "카드 추가" : "내 카드 작성"}
          </button>
        )}
        {!isNotice && myCard && !locked && !isTeacher && (
          <p className="study-one-card-note">
            한 보드에는 카드를 하나만 만들 수 있어요.
          </p>
        )}
      </div>

      {/* ── 활동 설정 모달 ── */}
      {activitiesOpen && (
        <div
          className="modal-backdrop"
          {...backdropClose(() => setActivitiesOpen(false))}
        >
          <div
            className="study-activity-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="study-activity-modal-head">
              <h3>활동 설정</h3>
              <button
                className="btn-close"
                onClick={() => setActivitiesOpen(false)}
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            <p className="study-activity-hint">
              학생 카드에 제시할 활동 내용을 입력하세요.
            </p>
            <div className="study-activity-list">
              {activitiesDraft.map((act, i) => (
                <div key={i} className="study-activity-item">
                  <span className="study-activity-label">활동 {i + 1}</span>
                  <input
                    className="study-activity-input"
                    value={act}
                    onChange={(e) => {
                      const next = [...activitiesDraft];
                      next[i] = e.target.value;
                      setActivitiesDraft(next);
                    }}
                    placeholder={`활동 ${i + 1} 내용을 입력하세요`}
                  />
                  <button
                    className="study-activity-del"
                    onClick={() =>
                      setActivitiesDraft(activitiesDraft.filter((_, j) => j !== i))
                    }
                    aria-label="삭제"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              className="study-activity-add"
              onClick={() => setActivitiesDraft([...activitiesDraft, ""])}
            >
              + 활동 추가
            </button>
            <div className="study-activity-actions">
              <button
                className="btn-ghost"
                onClick={() => setActivitiesOpen(false)}
              >
                취소
              </button>
              <button
                className="btn-primary"
                onClick={handleSaveActivities}
                disabled={savingActivities}
              >
                {savingActivities ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <StudyCardModal
          board={board}
          card={creating ? null : selectedCard}
          canEdit={
            creating
              // 작성 중에는 편집 폼을 계속 유지. (자동저장으로 카드가 생기면
              // myCard가 채워져 canAdd가 false로 바뀌는데, 그 때문에 열려 있던
              // 작성 폼이 사라지지 않도록 canAdd 대신 잠금 여부만 본다.)
              ? !locked
              : selectedCard
              ? canEditCard(selectedCard)
              : false
          }
          mine={
            creating
              ? true
              : selectedCard
              ? !!(user && (
                  selectedCard.authorId === user.uid ||
                  (isNotice && isTeacher) ||
                  // 모둠 카드: 내 모둠이면 내 카드처럼 취급(편집 폼 표시)
                  (selectedCard.groupId && selectedCard.memberUids?.includes(user.uid))
                ))
              : false
          }
          relatedQuestions={relatedQuestions}
          onClose={() => {
            setSelectedCard(null);
            setCreating(false);
          }}
          onAsk={onAsk}
        />
      )}

      {/* ── 모둠 구성 모달 (교사) ── */}
      {composing && (
        <GroupComposer
          board={board}
          roster={classRoster}
          cards={cards}
          baseGroups={baseGroupAssignment?.groups ?? []}
          groupSetName={`${board.title || "공부방 보드"} 활동 모둠`}
          onClose={() => setComposing(false)}
        />
      )}

      {/* ── 발표 모드 ── */}
      {presenting && presentCards.length > 0 && (
        <StudyPresentModal
          board={board}
          cards={presentCards}
          onClose={() => setPresenting(false)}
        />
      )}

      {/* ── 다른 반으로 복제 모달 ── */}
      {duplicating && (
        <div className="modal-backdrop" {...backdropClose(() => setDuplicating(false))}>
          <div className="modal modal-duplicate" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>📋 다른 반으로 복제</h3>
              <button className="btn-close" onClick={() => setDuplicating(false)} aria-label="닫기">
                ×
              </button>
            </div>
            <p className="study-link-hint">
              <strong>{board.title}</strong> 보드를 복제할 반을 선택하세요.
              학생이 작성한 카드는 복제되지 않고, 교사가 제시한 활동과 공개 범위만
              그대로 옮겨집니다.
            </p>
            {otherClasses.length === 0 ? (
              <p className="study-column-empty">복제할 다른 반이 없어요. 먼저 반을 만들어 주세요.</p>
            ) : (
              <div className="duplicate-class-list">
                {otherClasses.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="duplicate-class-row"
                    onClick={() => handleDuplicate(c)}
                  >
                    <span className="duplicate-class-icon">📚</span>
                    <strong>{c.name}</strong>
                    <span className="duplicate-class-go">복제 →</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
