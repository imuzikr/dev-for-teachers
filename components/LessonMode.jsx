"use client";

// =============================================================
// 수업하기 — 교사용 수업 페이지
// -------------------------------------------------------------
// 위아래로 스크롤되는 '페이지'입니다. 지금은 슬라이드 카드와 해설 카드
// 두 장이 2열로 놓여 있고, 앞으로 수업 관련 기능을 이 아래에 섹션으로
// 계속 덧붙일 수 있게 만들었습니다.
//
// 같은 화면을 두 가지 모드로 씁니다.
//  · mode="edit"  — 수업 전, 장마다 해설을 적어 두는 화면(자동 저장)
//  · mode="teach" — 수업 중. 넘길 때마다 그 반 학생 화면이 같은 장으로
//                   강제 전환됩니다(학생에겐 슬라이드만, 해설은 교사 전용).
//
// [스크롤과 학생 화면은 무관합니다]
// 방송은 '지금 몇 번째 장인지'가 바뀔 때만 씁니다(아래 useEffect의 의존성).
// 교사가 페이지를 아무리 위아래로 굴려도 그 값은 변하지 않으므로, 학생
// 화면은 교사가 슬라이드를 넘기기 전까지 계속 같은 장에 머뭅니다.
//
// 이전 / 다음 / 종료 — 종료하면 방송이 꺼져 학생 화면도 원래대로 돌아갑니다.
// =============================================================
import { useEffect, useRef, useState } from "react";
import {
  startBroadcast,
  stopBroadcast,
  addStudyBoard,
  updateStudyBoard,
  updateStudyCard,
  subscribeStudyCards,
  subscribePresence,
  subscribeStudySeatLayout,
  saveStudySeatLayout,
  subscribeStudyGroupAssignment,
  saveStudyGroupAssignment,
  dailySeatLayoutId,
  todayDateKey,
  PRESENCE_STALE_MS,
  toDate,
} from "@/lib/store";
import { stripHtml } from "@/lib/html";
import { buildActivityTemplate, nextActivityLocks, isActivityLocked } from "@/lib/activities";
import { getCurrentUser } from "@/lib/user";
import AttendanceBoard from "./AttendanceBoard";
import StudyProgressBoard, { cardProgress } from "./StudyProgressBoard";
import SeatGroupSetupModal from "./SeatGroupSetupModal";

export default function LessonMode({
  lesson,
  mode = "teach",
  classId = null,
  className = "",
  boards = [],          // 수업 준비: 이 반의 공부방 보드 목록(연결 대상)
  roster = [],          // 수업 중: 이 반 학생 명단(참여 전광판 자리 배치용)
  attendanceRecords = [],
  onSaveNote,
  onSaveActivities,
  onSaveBoardId,        // 수업 준비: 연결한 보드 id를 수업 자료에 저장
  onClose,
}) {
  const slides = lesson.slides ?? [];
  const total = slides.length;
  const [idx, setIdx] = useState(0);
  const [note, setNote] = useState(slides[0]?.note ?? "");
  const [saved, setSaved] = useState(false);
  // 프레젠테이션 중일 때만 학생 화면이 전환됩니다(수업하기로 들어온 것만으론 안 바뀜)
  const [presenting, setPresenting] = useState(false);
  const [acts, setActs] = useState((lesson.activities ?? []).join("\n"));
  const editing = mode === "edit";

  // ── 공부방 보드 연동 (수업 준비에서만) ──
  const boardId = lesson.boardId ?? null;
  const board = boards.find((b) => b.id === boardId) ?? null;
  const [boardCards, setBoardCards] = useState([]);
  const [newAct, setNewAct] = useState("");
  const actInputRef = useRef(null); // 한글 조합 중 글자까지 읽기 위한 입력칸 참조
  const [actBusy, setActBusy] = useState(false);
  const [actError, setActError] = useState("");
  const [makingBoard, setMakingBoard] = useState(false);
  const boardActs = board?.activities ?? [];

  // ── 공부중 전광판 (수업 중) ──
  // 발표 중에는 학생 화면이 슬라이드로 덮여 활동을 쓸 수 없으므로, 이 도구는
  // 발표 여부와 상관없이 보드만 연결돼 있으면 쓸 수 있어야 합니다.
  const [progressOpen, setProgressOpen] = useState(false);
  const [lockBusy, setLockBusy] = useState(false);
  const [seatSetupOpen, setSeatSetupOpen] = useState(false);
  const [seatSetupTab, setSeatSetupTab] = useState("seats");
  const [seatLayout, setSeatLayout] = useState(null);
  const [dailySeatLayout, setDailySeatLayout] = useState(null);
  const [groupAssignment, setGroupAssignment] = useState(null);
  const todayLayoutId = dailySeatLayoutId(todayDateKey());

  useEffect(() => {
    if (!classId) { setSeatLayout(null); return; }
    return subscribeStudySeatLayout(classId, "default", setSeatLayout);
  }, [classId]);

  useEffect(() => {
    if (!classId || editing) { setDailySeatLayout(null); return; }
    return subscribeStudySeatLayout(classId, todayLayoutId, setDailySeatLayout);
  }, [classId, editing, todayLayoutId]);

  useEffect(() => {
    if (!classId) { setGroupAssignment(null); return; }
    return subscribeStudyGroupAssignment(classId, setGroupAssignment);
  }, [classId]);

  // 활동 하나의 잠금을 켜고 끕니다(전광판의 자물쇠 버튼).
  async function toggleActLock(i, locked) {
    if (!board || lockBusy) return;
    setLockBusy(true);
    setActError("");
    try {
      const next = boardActs.map((_, j) =>
        j === i ? locked : board.activityLocks?.[j] === true
      );
      await updateStudyBoard(board.id, { activityLocks: next });
    } catch (e) {
      setActError(`활동 잠금을 바꾸지 못했어요: ${e?.message ?? "알 수 없는 오류"}`);
    } finally {
      setLockBusy(false);
    }
  }

  // ── 참여 전광판 (수업 중, 발표하는 동안만) ──
  const [attendOpen, setAttendOpen] = useState(false);
  const [presence, setPresence] = useState([]);
  const [presenceNow, setPresenceNow] = useState(() => Date.now());
  useEffect(() => {
    if (editing || !presenting || !classId) { setPresence([]); return; }
    return subscribePresence(classId, setPresence);
  }, [editing, presenting, classId]);
  // 학생 신호가 끊기면 스냅샷이 더 오지 않으므로, 시간만 흘러도 숫자가
  // 갱신되도록 주기적으로 다시 셉니다.
  useEffect(() => {
    if (editing || !presenting) return;
    const t = setInterval(() => setPresenceNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, [editing, presenting]);

  // 헤더 버튼에 보여 줄 '보는 중' 인원
  const watchingCount = roster.reduce((n, s) => {
    const p = presence.find((x) => x.uid === s.uid);
    if (!p || !p.visible) return n;
    const t = p.updatedAt ? toDate(p.updatedAt).getTime() : 0;
    if (t && presenceNow - t > PRESENCE_STALE_MS) return n;
    return n + 1;
  }, 0);

  // 헤더 버튼에 보여 줄 '활동을 하나라도 쓴' 인원
  const studyingCount = roster.reduce((n, s) => {
    const card = boardCards.find((c) => c.authorId === s.uid);
    return cardProgress(card, boardActs.length).some(Boolean) ? n + 1 : n;
  }, 0);

  const cur = slides[Math.min(idx, total - 1)];

  // 연결한 보드의 학생 카드 —
  //  · 수업 준비: 이미 학생이 쓴 내용이 있으면 활동을 바꾸지 않도록 확인
  //  · 수업 중  : '공부중' 전광판에 활동별 작성 현황을 그리는 데 사용
  useEffect(() => {
    if (!boardId) { setBoardCards([]); return; }
    return subscribeStudyCards(boardId, setBoardCards);
  }, [boardId]);

  // 활동 목록을 보드에 저장하고, 학생 카드의 작성 틀도 함께 맞춥니다.
  async function saveBoardActs(next) {
    if (!board) return;
    setActError("");
    const studentCards = boardCards.filter((c) => !c.authorId?.startsWith("teacher_"));
    // 학생이 이미 쓴 내용을 활동 틀로 덮어쓰면 안 됩니다.
    if (studentCards.some((c) => stripHtml(c.content ?? "").trim().length > 0)) {
      setActError("학생이 이미 작성한 내용이 있어 활동을 바꿀 수 없어요. 공부방에서 카드 내용을 비운 뒤 다시 시도해 주세요.");
      return;
    }
    setActBusy(true);
    try {
      // 새로 추가한 활동은 잠긴 채로 시작합니다 — 수업 중 '공부중' 전광판에서
      // 하나씩 열어 주는 흐름이라, 미리 만들어 둔 활동이 곧바로 열리면 안 됩니다.
      await updateStudyBoard(board.id, {
        activities: next,
        activityLocks: nextActivityLocks(boardActs, board.activityLocks ?? [], next),
      });
      if (next.length > 0) {
        const html = buildActivityTemplate(next);
        await Promise.all(
          studentCards.map((c) =>
            updateStudyCard(board.id, c.id, {
              title: c.title ?? "",
              content: html,
              imageUrl: c.imageUrl ?? null,
              attachments: c.attachments ?? [],
            })
          )
        );
      }
    } catch (e) {
      setActError(`활동을 저장하지 못했어요: ${e?.message ?? "알 수 없는 오류"}`);
    } finally {
      setActBusy(false);
    }
  }

  async function handleAddAct(e) {
    e.preventDefault();
    // 한글은 마지막 글자가 아직 '조합 중'일 수 있습니다. 조합 중 글자는
    // React state(newAct)에 늦게 반영돼, 버튼을 누른 시점에는 끝 글자가
    // 빠진 값이 들어가곤 했습니다("마무리하기" → "마무").
    // 입력칸의 실제 값에는 조합 중 글자까지 들어 있으므로 그쪽을 씁니다.
    const name = (actInputRef.current?.value ?? newAct).trim();
    if (!name || !board || actBusy) return;
    await saveBoardActs([...boardActs, name]);
    setNewAct("");
  }

  // 수업 자료 이름으로 새 보드를 만들고 바로 연결합니다.
  async function handleAddBoard() {
    if (!classId || makingBoard) return;
    setMakingBoard(true);
    setActError("");
    try {
      const id = await addStudyBoard(getCurrentUser(), {
        title: lesson.title || "수업 보드",
        type: "student",
        description: "",
        classId,
      });
      if (id) await onSaveBoardId?.(id);
    } catch (e) {
      setActError(`보드를 만들지 못했어요: ${e?.message ?? "알 수 없는 오류"}`);
    } finally {
      setMakingBoard(false);
    }
  }

  // 장을 넘기면 그 장의 해설을 불러옵니다.
  useEffect(() => {
    setNote(slides[idx]?.note ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, lesson.id]);

  // 활동 안내 자동 저장 — 한 줄에 항목 하나
  useEffect(() => {
    if (!editing) return;
    const next = acts.split("\n").map((s) => s.trim()).filter(Boolean);
    if (next.join("\n") === (lesson.activities ?? []).join("\n")) return;
    const t = setTimeout(() => onSaveActivities?.(next), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acts, editing]);

  // 메모 자동 저장 — 입력이 0.8초 멈추면 저장(편집 모드에서만)
  useEffect(() => {
    if (!editing) return;
    if (note === (slides[idx]?.note ?? "")) return;
    const t = setTimeout(async () => {
      await onSaveNote?.(idx, note);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note, idx, editing]);

  // 프레젠테이션 중일 때만 현재 장을 방송해 학생 화면을 같은 장으로 맞춥니다.
  // (수업하기로 들어오기만 해서는 학생 화면이 바뀌지 않습니다 — 교사가 미리
  //  자료를 훑어보며 준비할 수 있게)
  useEffect(() => {
    if (editing || !presenting || !classId || !cur) return;
    startBroadcast(getCurrentUser(), classId, {
      mode: "lesson",
      lessonTitle: lesson.title ?? "",
      imageUrl: cur.imageUrl,
      slideIndex: idx,
      slideCount: total,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, presenting, classId, cur?.imageUrl, idx, total]);

  // 프레젠테이션을 끄거나 수업 화면을 벗어나면 방송도 반드시 종료
  useEffect(() => {
    if (editing || !presenting || !classId) return;
    return () => { stopBroadcast(classId); };
  }, [editing, presenting, classId]);

  // 키보드 ← → 로 넘기기 (메모를 쓰는 중에는 방해하지 않음)
  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
      if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1));
      else if (e.key === "ArrowRight") setIdx((i) => Math.min(total - 1, i + 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total]);

  return (
    <div className="lesson-mode">
      <div className="lesson-head">
        <strong className="lesson-title">{lesson.title}</strong>
        {/* 상태 배지 — 좁은 화면에서는 긴 설명 대신 짧은 말로 바뀝니다.
            (자리를 아껴서 반 이름이 잘리지 않게. 어느 반에 발표 중인지가
             '프레젠테이션 중'이라는 말보다 더 알아야 할 정보입니다) */}
        {editing ? (
          <span className="lesson-badge lesson-badge--edit">수업 준비</span>
        ) : presenting ? (
          <span className="lesson-badge">
            <span className="broadcast-live-dot" aria-hidden="true" />
            <span className="lesson-badge-long">프레젠테이션 중</span>
            <span className="lesson-badge-short">발표 중</span>
            {className && <span className="lesson-badge-class">{className}</span>}
          </span>
        ) : (
          <span className="lesson-badge lesson-badge--edit">
            <span className="lesson-badge-long">학생 화면 그대로</span>
            <span className="lesson-badge-short">대기 중</span>
            {className && <span className="lesson-badge-class">{className}</span>}
          </span>
        )}
        {/* 수업 도구 — 두 버튼 모두 항상 자리를 지킵니다(있다 없다 하면
            어디를 눌러야 할지 매번 찾게 되므로). 지금 쓸 수 없는 도구는
            비활성으로 두고, 왜 잠겼는지 툴팁으로 알려 줍니다.
            · 발표중: 학생 화면이 실제로 보이는지 확인 — 발표 중에만 의미가
              있습니다(발표를 꺼 두면 알려 줄 상태 자체가 없음).
            · 공부중: 교사 화면은 발표에 가려지지 않으므로 언제든 열어
              활동을 관리할 수 있습니다. 보드가 연결돼 있어야 합니다. */}
        {!editing && (
          <div className="lesson-tools">
            <button
              type="button"
              className="lesson-tool-btn"
              onClick={() => setAttendOpen(true)}
              disabled={!presenting}
              title={
                presenting
                  ? "학생들이 화면을 보고 있는지 확인합니다"
                  : "발표를 시작하면 학생들이 화면을 보고 있는지 확인할 수 있어요"
              }
            >
              👀 발표중 {watchingCount}/{roster.length}
            </button>
            <button
              type="button"
              className="lesson-tool-btn"
              onClick={() => setProgressOpen(true)}
              disabled={!board}
              title={
                board
                  ? "학생들이 활동을 채워 가는 상황을 확인하고, 활동을 하나씩 열어 줍니다"
                  : "‘수업준비 → 공부방 연동’에서 보드를 연결하면 활동 현황을 볼 수 있어요"
              }
            >
              ✍️ 공부중 {studyingCount}/{roster.length}
            </button>
          </div>
        )}
        <span className="lesson-count">{total === 0 ? 0 : idx + 1} / {total}</span>
        <button type="button" className="lesson-exit" onClick={onClose}>
          {editing ? "닫기" : "수업 종료"}
        </button>
      </div>

      {attendOpen && (
        <AttendanceBoard
          roster={roster}
          presence={presence}
          attendanceRecords={attendanceRecords}
          seatLayout={seatLayout}
          dailySeatLayout={dailySeatLayout}
          groupAssignment={groupAssignment}
          onSaveDailySeats={(seats, user) =>
            saveStudySeatLayout(classId, todayLayoutId, seats, user, { date: todayDateKey() })
          }
          onClose={() => setAttendOpen(false)}
        />
      )}

      {seatSetupOpen && editing && (
        <SeatGroupSetupModal
          roster={roster}
          seatLayout={seatLayout}
          groupAssignment={groupAssignment}
          initialTab={seatSetupTab}
          onSaveSeats={(seats) => saveStudySeatLayout(classId, "default", seats, getCurrentUser())}
          onSaveGroups={(groups) => saveStudyGroupAssignment(classId, groups, getCurrentUser())}
          onClose={() => setSeatSetupOpen(false)}
        />
      )}

      {progressOpen && board && (
        <StudyProgressBoard
          board={board}
          roster={roster}
          cards={boardCards}
          onClose={() => setProgressOpen(false)}
        />
      )}

      {/* 수업 페이지 본문 — 위아래로 스크롤됩니다. 스크롤은 이 화면 안의
          일일 뿐이라 학생 화면과는 아무 상관이 없습니다(아래 주석 참고). */}
      <div className="lesson-page">
        {/* 주제 — 수업준비에서 미리 입력해 둔 이름 */}
        <h1 className="lesson-page-title">{lesson.title}</h1>

        <div className="lesson-deck">
          {/* ── 슬라이드 카드 ── */}
          <section className="lesson-card lesson-card--slide">
            <div className="lesson-card-head">
              <h2>슬라이드</h2>
            </div>

            <div className="lesson-stage">
              {cur ? (
                <img className="lesson-slide-img" src={cur.imageUrl} alt={`슬라이드 ${idx + 1}`} />
              ) : (
                <p className="lesson-empty">슬라이드가 없어요.</p>
              )}
            </div>

            {/* 넘기기 버튼은 슬라이드와 한 카드에 둡니다 — 아래에 다른 수업
                기능이 붙어도 슬라이드와 조작이 떨어지지 않게. */}
            <div className="lesson-card-foot">
              <button
                type="button"
                className="lesson-ctrl-btn"
                onClick={() => setIdx((i) => Math.max(0, i - 1))}
                disabled={idx === 0}
              >
                ‹ 이전
              </button>
              {total > 0 && total <= 24 && (
                <span className="lesson-dots" aria-hidden="true">
                  {slides.map((_, i) => (
                    <i key={i} className={i === idx ? "on" : ""} />
                  ))}
                </span>
              )}
              <button
                type="button"
                className="lesson-ctrl-btn"
                onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}
                disabled={idx >= total - 1}
              >
                다음 ›
              </button>

              {/* 이걸 눌러야 학생 화면이 이 슬라이드로 바뀝니다 */}
              {!editing && (
                <button
                  type="button"
                  className={`lesson-ctrl-btn${presenting ? " on" : ""}`}
                  onClick={() => setPresenting((v) => !v)}
                  disabled={total === 0}
                  title={
                    presenting
                      ? "학생 화면을 원래대로 되돌립니다"
                      : "지금 이 슬라이드를 학생 화면에 띄웁니다"
                  }
                >
                  {presenting ? "종료" : "시작"}
                </button>
              )}
            </div>
          </section>

          {/* ── 해설 카드 ── */}
          <section className="lesson-card lesson-card--note">
            {/* 해설은 전자칠판에 비친 이 화면으로 학생들과 함께 봅니다
                (학생 기기에는 슬라이드만 전송되므로 방송 내용은 그대로).
                제목 라벨 없이 내용부터 바로 — 슬라이드 카드와 윗줄 높이를
                맞추기 위해 빈 헤더 자리는 남겨 둡니다. */}
            <div className="lesson-card-head">
              {editing && saved && <em className="lesson-saved">✓ 저장됨</em>}
              {editing && <small>자동 저장</small>}
            </div>

            <div className="lesson-note-body">
              {editing ? (
                <textarea
                  className="lesson-note-input"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="이 장에서 할 이야기, 발문, 활동 안내를 적어 두세요."
                />
              ) : note.trim() ? (
                <div className="lesson-note-text">{note}</div>
              ) : (
                <p className="lesson-note-empty">이 장에는 해설이 없어요.</p>
              )}
            </div>
          </section>
        </div>

        {/* ── 활동 열기 ── 수업 중, 연결된 보드의 활동을 하나씩 열어 줍니다.
            누르는 즉시 학생 카드의 그 활동 입력칸이 열리고/닫힙니다
            (보드 문서의 activityLocks 하나만 보고 판정하므로 화면끼리
             따로 놀 일이 없습니다). 전광판은 결과만 보는 자리입니다. */}
        {!editing && board && boardActs.length > 0 && (
          <section className="lesson-card lesson-locks">
            <div className="lesson-card-head">
              <h2>활동 열기</h2>
              <small>누르면 학생이 그 활동을 쓸 수 있어요</small>
            </div>
            <div className="lesson-lock-row">
              {boardActs.map((a, i) => {
                const locked = isActivityLocked(board, i);
                return (
                  <button
                    key={`${a}-${i}`}
                    type="button"
                    className={`lesson-lock-btn${locked ? " locked" : ""}`}
                    onClick={() => toggleActLock(i, !locked)}
                    disabled={lockBusy}
                    title={`${a} — ${locked ? "눌러서 열기" : "눌러서 잠그기"}`}
                    aria-pressed={!locked}
                  >
                    <span className="lesson-lock-icon" aria-hidden="true">
                      {locked ? "🔒" : "🔓"}
                    </span>
                    활동 {i + 1}
                  </button>
                );
              })}
            </div>
            {actError && <p className="form-error" role="alert">{actError}</p>}
          </section>
        )}

        {/* ── 오늘의 수업 목표 ── 교사가 수업 중 참고하는 메모입니다.
            (학생 카드에 들어가는 '활동'은 아래 공부방 연동 섹션에서 관리) */}
        <section className="lesson-card lesson-activity">
          <div className="lesson-card-head">
            <h2>오늘의 수업 목표!</h2>
            {editing && <small>한 줄에 하나씩 · 자동 저장</small>}
          </div>
          <div className="lesson-activity-body">
            {editing ? (
              <textarea
                className="lesson-activity-input"
                value={acts}
                onChange={(e) => setActs(e.target.value)}
                placeholder={"한 줄에 목표 하나씩 적어 주세요.\n예) 이온 결합과 공유 결합의 차이를 설명할 수 있다"}
              />
            ) : (lesson.activities ?? []).length > 0 ? (
              <ul className="lesson-activity-list">
                {(lesson.activities ?? []).map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            ) : (
              <p className="lesson-note-empty">아직 등록한 목표가 없어요.</p>
            )}
          </div>
        </section>

        {/* ── 공부방 연동 ── 수업 준비에서만 보입니다.
            수업 중에는 이미 준비가 끝난 상태이고, 활동을 바꾸면 학생이
            쓰던 카드가 흔들리므로 아예 노출하지 않습니다. */}
        {editing && (
          <section className="lesson-card lesson-board">
            <div className="lesson-card-head">
              <h2>공부방 연동</h2>
              <small>여기서 만든 활동이 학생 카드의 작성 항목이 됩니다</small>
            </div>

            <div className="lesson-board-body">
              {/* 보드 선택 + 새 보드 만들기 */}
              <div className="lesson-board-pick">
                <label htmlFor="lesson-board-select">수업 보드</label>
                <select
                  id="lesson-board-select"
                  className="lesson-board-select"
                  value={boardId ?? ""}
                  onChange={(e) => onSaveBoardId?.(e.target.value || null)}
                  disabled={!classId}
                >
                  <option value="">연결 안 함</option>
                  {boards.map((b) => (
                    <option key={b.id} value={b.id}>{b.title}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="lesson-board-add"
                  onClick={handleAddBoard}
                  disabled={!classId || makingBoard}
                >
                  {makingBoard ? "만드는 중…" : "+ 수업 보드 추가"}
                </button>
              </div>

              {!classId && (
                <p className="lesson-note-empty">
                  공부방에서 반을 먼저 선택하면 보드를 연결할 수 있어요.
                </p>
              )}

              {/* 활동 목록 — 연결한 보드의 활동을 그대로 편집합니다 */}
              {board && (
                <>
                  {boardActs.length > 0 ? (
                    <ol className="lesson-board-acts">
                      {boardActs.map((a, i) => (
                        <li key={`${a}-${i}`}>
                          {/* 학생 카드에 붙는 번호와 같은 순서를 여기서도 보여 줍니다 */}
                          <span className="lesson-board-act-no">활동 {i + 1}</span>
                          <span className="lesson-board-act-name">{a}</span>
                          <button
                            type="button"
                            className="lesson-board-act-del"
                            onClick={() => saveBoardActs(boardActs.filter((_, j) => j !== i))}
                            disabled={actBusy}
                            aria-label={`${a} 활동 삭제`}
                          >
                            ✕
                          </button>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="lesson-note-empty">
                      아직 활동이 없어요. 아래에서 추가하면 '{board.title}' 보드에 바로 반영됩니다.
                    </p>
                  )}

                  <form className="lesson-board-actadd" onSubmit={handleAddAct}>
                    <input
                      ref={actInputRef}
                      type="text"
                      value={newAct}
                      onChange={(e) => setNewAct(e.target.value)}
                      placeholder="예) 실험 결과 정리하기"
                      maxLength={40}
                      aria-label="추가할 활동 이름"
                    />
                    {/* 조합 중인 한글은 state에 늦게 들어오므로 입력값으로
                        버튼을 잠그지 않습니다(빈 값은 handleAddAct가 거릅니다) */}
                    <button type="submit" disabled={actBusy}>
                      {actBusy ? "저장 중…" : "+ 활동 추가"}
                    </button>
                  </form>
                </>
              )}

              {actError && <p className="form-error" role="alert">{actError}</p>}
            </div>
          </section>
        )}

        {editing && (
          <section className="lesson-card lesson-seating">
            <div className="lesson-card-head">
              <h2>참여 전광판 설정</h2>
              <small>실제 좌석과 장기 모둠을 미리 정합니다</small>
            </div>
            <div className="lesson-seating-body">
              <button
                type="button"
                className="lesson-board-add"
                onClick={() => { setSeatSetupTab("seats"); setSeatSetupOpen(true); }}
                disabled={!classId || roster.length === 0}
              >
                자리 배정하기
              </button>
              <button
                type="button"
                className="lesson-board-add"
                onClick={() => { setSeatSetupTab("groups"); setSeatSetupOpen(true); }}
                disabled={!classId || roster.length === 0}
              >
                모둠 설정하기
              </button>
              <span className="lesson-seating-summary">
                자리표 {seatLayout?.seats?.filter(Boolean).length ?? 0}명 · 모둠 {(groupAssignment?.groups ?? []).length}개
              </span>
              {roster.length === 0 && (
                <p className="lesson-note-empty">반 학생 명단을 불러온 뒤 자리와 모둠을 설정할 수 있어요.</p>
              )}
            </div>
          </section>
        )}

        {/* 앞으로 수업 관련 기능(출석·퀴즈 등)은 이 아래에 섹션으로 덧붙이면
            됩니다. 슬라이드 카드와 독립적이라 방송에는 영향 없습니다. */}
      </div>
    </div>
  );
}
