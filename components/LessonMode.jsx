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
import { useEffect, useState } from "react";
import {
  startBroadcast,
  stopBroadcast,
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
import { getCurrentUser } from "@/lib/user";
import AttendanceBoard from "./AttendanceBoard";
import SeatGroupSetupModal from "./SeatGroupSetupModal";

export default function LessonMode({
  lesson,
  mode = "teach",
  classId = null,
  className = "",
  roster = [],          // 수업 중: 이 반 학생 명단(참여 전광판 자리 배치용)
  attendanceRecords = [],
  onSaveNote,
  onSaveActivities,
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

  const cur = slides[Math.min(idx, total - 1)];

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
