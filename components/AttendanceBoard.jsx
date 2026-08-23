"use client";

// =============================================================
// 참여 전광판 — 발표 중 학생 참여 상태 + 좌석/모둠 보기
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { backdropClose } from "@/lib/modal";
import { PRESENCE_STALE_MS, STUDY_SEAT_COUNT, toDate, todayDateKey } from "@/lib/store";
import { getCurrentUser } from "@/lib/user";

const DEFAULT_GROUP_COLORS = ["#2563eb", "#16a34a", "#f97316", "#9333ea", "#dc2626", "#0891b2"];

// 학생 한 명의 상태를 'on' | 'away' | 'off'로 판정
export function deskState(presence, nowMs) {
  if (!presence) return "off";
  const t = presence.updatedAt ? toDate(presence.updatedAt).getTime() : 0;
  if (t && nowMs - t > PRESENCE_STALE_MS) return "off";
  return presence.visible ? "on" : "away";
}

function normalizeSeats(seats = [], roster = []) {
  const seen = new Set();
  const base = Array.from({ length: STUDY_SEAT_COUNT }, (_, i) => {
    const uid = typeof seats[i] === "string" && seats[i] ? seats[i] : null;
    if (!uid || seen.has(uid)) return null;
    seen.add(uid);
    return uid;
  });
  let cursor = 0;
  roster.forEach((s) => {
    if (seen.has(s.uid)) return;
    while (cursor < base.length && base[cursor]) cursor += 1;
    if (cursor < base.length) {
      base[cursor] = s.uid;
      seen.add(s.uid);
    }
  });
  return base;
}

function groupMapOf(groupAssignment) {
  const map = new Map();
  (groupAssignment?.groups ?? []).forEach((g, i) => {
    (g.memberUids ?? g.members?.map((m) => m.uid) ?? []).forEach((uid) => {
      map.set(uid, {
        name: g.name || `${g.index ?? i + 1}모둠`,
        color: g.color || DEFAULT_GROUP_COLORS[i % DEFAULT_GROUP_COLORS.length],
        index: g.index ?? i + 1,
      });
    });
  });
  return map;
}

const LABEL = { on: "보는 중", away: "화면 가려짐", off: "미접속", absent: "결석" };

export default function AttendanceBoard({
  roster = [],
  presence = [],
  attendanceRecords = [],
  seatLayout = null,
  dailySeatLayout = null,
  groupAssignment = null,
  onSaveDailySeats,
  onClose,
}) {
  const [now, setNow] = useState(() => Date.now());
  const [viewMode, setViewMode] = useState("seat");
  const [dragIndex, setDragIndex] = useState(null);
  const [seats, setSeats] = useState(() =>
    normalizeSeats(dailySeatLayout?.seats ?? seatLayout?.seats ?? [], roster)
  );

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setSeats(normalizeSeats(dailySeatLayout?.seats ?? seatLayout?.seats ?? [], roster));
  }, [dailySeatLayout?.id, dailySeatLayout?.updatedAt, seatLayout?.id, seatLayout?.updatedAt, roster]);

  const byUid = useMemo(() => new Map(roster.map((s) => [s.uid, s])), [roster]);
  const presenceByUid = useMemo(() => new Map(presence.map((p) => [p.uid, p])), [presence]);
  const groupsByUid = useMemo(() => groupMapOf(groupAssignment), [groupAssignment]);
  const today = todayDateKey();
  const attendedToday = useMemo(
    () => new Set(attendanceRecords.filter((r) => r.date === today).map((r) => r.uid)),
    [attendanceRecords, today]
  );

  function stateOf(uid) {
    if (!attendedToday.has(uid)) return "absent";
    return deskState(presenceByUid.get(uid), now);
  }

  const desks = seats.map((uid, i) => {
    const s = byUid.get(uid);
    if (!s) return { key: `empty-${i}`, empty: true, index: i, state: "off" };
    const group = groupsByUid.get(s.uid) ?? null;
    return {
      key: s.uid,
      index: i,
      uid: s.uid,
      name: s.name,
      studentId: s.studentId ?? null,
      state: stateOf(s.uid),
      group,
    };
  });

  const counts = desks.reduce(
    (acc, d) => {
      if (!d.empty) acc[d.state] += 1;
      return acc;
    },
    { on: 0, away: 0, off: 0, absent: 0 }
  );

  async function moveSeat(from, to) {
    if (from == null || to == null || from === to) return;
    const next = [...seats];
    [next[from], next[to]] = [next[to], next[from]];
    setSeats(next);
    await onSaveDailySeats?.(next, getCurrentUser());
  }

  const groupSections = useMemo(() => {
    const groups = (groupAssignment?.groups ?? []).map((g, i) => ({
      ...g,
      color: g.color || DEFAULT_GROUP_COLORS[i % DEFAULT_GROUP_COLORS.length],
      members: (g.memberUids ?? []).map((uid) => byUid.get(uid)).filter(Boolean),
    }));
    const assigned = new Set(groups.flatMap((g) => g.members.map((m) => m.uid)));
    const unassigned = roster.filter((s) => !assigned.has(s.uid));
    return unassigned.length
      ? [...groups, { id: "ungrouped", name: "미배정", color: "#9ca3af", members: unassigned }]
      : groups;
  }, [groupAssignment, byUid, roster]);

  function StudentCard({ d, draggable = false }) {
    const groupName = d.group?.name ?? "미배정";
    return (
      <div
        className={`attend-desk attend-desk--${d.state}`}
        style={d.group ? { "--group-color": d.group.color } : undefined}
        title={`${d.name} · ${LABEL[d.state]} · ${groupName}`}
        draggable={draggable}
        onDragStart={(e) => {
          if (!draggable) return;
          setDragIndex(d.index);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => setDragIndex(null)}
        onDragOver={(e) => draggable && e.preventDefault()}
        onDrop={(e) => {
          if (!draggable) return;
          e.preventDefault();
          moveSeat(dragIndex, d.index);
        }}
      >
        <span className="attend-desk-no">{d.studentId || "-"}</span>
        <span className="attend-desk-name">
          {d.name}
          {d.state === "absent" && <em> (결석)</em>}
        </span>
        <span className="attend-desk-group">{groupName}</span>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div
        className="modal attend-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="attend-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3 id="attend-title">참여 전광판</h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <div className="attend-toolbar">
          <div className="attend-mode-tabs" role="tablist" aria-label="전광판 보기 방식">
            <button type="button" className={viewMode === "seat" ? "active" : ""} onClick={() => setViewMode("seat")}>
              자리표 보기
            </button>
            <button
              type="button"
              className={viewMode === "group" ? "active" : ""}
              onClick={() => setViewMode("group")}
              disabled={(groupAssignment?.groups ?? []).length === 0}
            >
              모둠별 보기
            </button>
          </div>
          {viewMode === "seat" && (
            <span className="attend-help">드래그하면 오늘 수업 동안만 위치가 유지됩니다.</span>
          )}
        </div>

        <div className="attend-legend">
          <span className="attend-legend-item"><i className="attend-chip attend-chip--on" /> 보는 중 {counts.on}</span>
          <span className="attend-legend-item"><i className="attend-chip attend-chip--away" /> 화면 가려짐 {counts.away}</span>
          <span className="attend-legend-item"><i className="attend-chip attend-chip--off" /> 미접속 {counts.off}</span>
          <span className="attend-legend-item"><i className="attend-chip attend-chip--absent" /> 결석 {counts.absent}</span>
        </div>

        {roster.length === 0 ? (
          <p className="lesson-note-empty">이 반에 입장한 학생이 없어요. 입장 코드를 알려 주세요.</p>
        ) : viewMode === "group" ? (
          <div className="attend-group-view">
            {groupSections.map((g, i) => (
              <section key={g.id ?? g.index ?? i} className="attend-group-section" style={{ "--group-color": g.color }}>
                <h4>{g.name || `${g.index}모둠`}</h4>
                <div className="attend-group-members">
                  {g.members.length === 0 ? (
                    <span className="seat-empty-note">배정된 학생이 없어요</span>
                  ) : (
                    g.members.map((s) => (
                      <StudentCard
                        key={s.uid}
                        d={{
                          uid: s.uid,
                          name: s.name,
                          studentId: s.studentId ?? null,
                          state: stateOf(s.uid),
                          group: groupsByUid.get(s.uid) ?? { name: g.name, color: g.color },
                        }}
                      />
                    ))
                  )}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="attend-grid">
            {desks.map((d) =>
              d.empty ? (
                <div
                  key={d.key}
                  className="attend-desk attend-desk--empty"
                  title="빈 자리"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    moveSeat(dragIndex, d.index);
                  }}
                />
              ) : (
                <StudentCard key={d.key} d={d} draggable />
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
