"use client";

import { useMemo, useState } from "react";
import { backdropClose } from "@/lib/modal";
import { STUDY_SEAT_COUNT } from "@/lib/store";

const GROUP_COLORS = ["#2563eb", "#16a34a", "#f97316", "#9333ea", "#dc2626", "#0891b2"];

function normalizedSeats(seats = []) {
  const seen = new Set();
  return Array.from({ length: STUDY_SEAT_COUNT }, (_, i) => {
    const uid = typeof seats[i] === "string" && seats[i] ? seats[i] : null;
    if (!uid || seen.has(uid)) return null;
    seen.add(uid);
    return uid;
  });
}

function defaultGroups(groups = []) {
  if (groups.length > 0) {
    return groups.map((g, i) => ({
      index: g.index ?? i + 1,
      name: g.name || `${g.index ?? i + 1}모둠`,
      color: g.color || GROUP_COLORS[i % GROUP_COLORS.length],
      members: g.members ?? [],
    }));
  }
  return Array.from({ length: 4 }, (_, i) => ({
    index: i + 1,
    name: `${i + 1}모둠`,
    color: GROUP_COLORS[i],
    members: [],
  }));
}

export default function SeatGroupSetupModal({
  roster = [],
  seatLayout = null,
  groupAssignment = null,
  initialTab = "seats",
  onSaveSeats,
  onSaveGroups,
  onClose,
}) {
  const [tab, setTab] = useState(initialTab);
  const [seats, setSeats] = useState(() => normalizedSeats(seatLayout?.seats ?? roster.map((s) => s.uid)));
  const [groups, setGroups] = useState(() => defaultGroups(groupAssignment?.groups ?? []));
  const [pickedUid, setPickedUid] = useState(null);
  const [drag, setDrag] = useState(null);
  const [saving, setSaving] = useState(false);
  const byUid = useMemo(() => new Map(roster.map((s) => [s.uid, s])), [roster]);
  const assignedSeatUids = new Set(seats.filter(Boolean));
  const unseated = roster.filter((s) => !assignedSeatUids.has(s.uid));
  const groupedUids = new Set(groups.flatMap((g) => (g.members ?? []).map((m) => m.uid)));
  const ungrouped = roster.filter((s) => !groupedUids.has(s.uid));

  function studentOf(uid) {
    return uid ? byUid.get(uid) ?? null : null;
  }

  function placeSeat(uid, targetIndex) {
    if (!uid) return;
    setSeats((prev) => {
      const next = normalizedSeats(prev);
      const from = next.indexOf(uid);
      const replaced = next[targetIndex];
      if (from >= 0) next[from] = replaced || null;
      next[targetIndex] = uid;
      return next;
    });
    setPickedUid(null);
  }

  function clearSeat(index) {
    setSeats((prev) => prev.map((uid, i) => (i === index ? null : uid)));
  }

  function setGroupCount(count) {
    setGroups((prev) => {
      const next = [];
      for (let i = 1; i <= count; i++) {
        next.push(prev[i - 1] ?? { index: i, name: `${i}모둠`, color: GROUP_COLORS[(i - 1) % GROUP_COLORS.length], members: [] });
      }
      return next;
    });
  }

  function moveToGroup(uid, targetIndex) {
    const student = byUid.get(uid);
    if (!student) return;
    setGroups((prev) =>
      prev.map((g) => {
        const cleaned = { ...g, members: (g.members ?? []).filter((m) => m.uid !== uid) };
        if (targetIndex == null || g.index !== targetIndex) return cleaned;
        return {
          ...cleaned,
          members: [...cleaned.members, {
            uid: student.uid,
            name: student.name,
            studentId: student.studentId ?? null,
            emoji: student.emoji ?? "🙂",
          }],
        };
      })
    );
  }

  async function saveSeats() {
    setSaving(true);
    try {
      await onSaveSeats?.(seats);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function saveGroups() {
    setSaving(true);
    try {
      await onSaveGroups?.(
        groups.map((g, i) => ({
          ...g,
          index: i + 1,
          id: `group_${i + 1}`,
          name: g.name.trim() || `${i + 1}모둠`,
        }))
      );
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const chipProps = (uid, source) => ({
    draggable: true,
    onDragStart: (e) => {
      setDrag({ uid, source });
      e.dataTransfer.effectAllowed = "move";
    },
    onDragEnd: () => setDrag(null),
  });

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div className="modal seat-setup-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>자리 배정 · 모둠 설정</h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <div className="seat-setup-tabs">
          <button type="button" className={tab === "seats" ? "active" : ""} onClick={() => setTab("seats")}>
            자리 배정하기
          </button>
          <button type="button" className={tab === "groups" ? "active" : ""} onClick={() => setTab("groups")}>
            모둠 설정하기
          </button>
        </div>

        {tab === "seats" ? (
          <>
            <div className="seat-setup-body">
              <div className="seat-setup-grid">
                {seats.map((uid, i) => {
                  const s = studentOf(uid);
                  return (
                    <button
                      key={i}
                      type="button"
                      className={`seat-slot${s ? " filled" : ""}`}
                      onClick={() => (pickedUid ? placeSeat(pickedUid, i) : s && clearSeat(i))}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (drag?.uid) placeSeat(drag.uid, i);
                      }}
                    >
                      <span className="seat-slot-no">{i + 1}</span>
                      {s ? (
                        <span className="seat-slot-name" {...chipProps(s.uid, "seat")}>
                          {s.studentId && <em>{s.studentId}</em>}
                          {s.name}
                        </span>
                      ) : (
                        <span className="seat-slot-empty">빈 자리</span>
                      )}
                    </button>
                  );
                })}
              </div>
              <aside className="seat-pool">
                <strong>미배치 학생 {unseated.length}명</strong>
                <div className="seat-pool-list">
                  {unseated.length === 0 ? (
                    <span className="seat-empty-note">모두 배치됐어요</span>
                  ) : (
                    unseated.map((s) => (
                      <button
                        key={s.uid}
                        type="button"
                        className={`seat-student-chip${pickedUid === s.uid ? " active" : ""}`}
                        onClick={() => setPickedUid((v) => (v === s.uid ? null : s.uid))}
                        {...chipProps(s.uid, "pool")}
                      >
                        {s.studentId && <em>{s.studentId}</em>}
                        {s.name}
                      </button>
                    ))
                  )}
                </div>
              </aside>
            </div>
            <div className="seat-setup-foot">
              <button type="button" className="btn-ghost" onClick={onClose}>취소</button>
              <button type="button" className="btn-primary" onClick={saveSeats} disabled={saving}>
                {saving ? "저장 중..." : "자리표 저장"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="group-setup-toolbar">
              <span>모둠 수</span>
              {[2, 3, 4, 5, 6].map((n) => (
                <button key={n} type="button" className={groups.length === n ? "active" : ""} onClick={() => setGroupCount(n)}>
                  {n}개
                </button>
              ))}
            </div>
            <div
              className="group-unassigned"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (drag?.uid) moveToGroup(drag.uid, null);
              }}
            >
              <strong>미배정 {ungrouped.length}명</strong>
              {ungrouped.map((s) => (
                <button key={s.uid} type="button" className="seat-student-chip" {...chipProps(s.uid, "group-pool")}>
                  {s.studentId && <em>{s.studentId}</em>}
                  {s.name}
                </button>
              ))}
            </div>
            <div className="group-setup-grid">
              {groups.map((g, i) => (
                <section
                  key={g.index}
                  className="group-setup-card"
                  style={{ "--group-color": g.color || GROUP_COLORS[i % GROUP_COLORS.length] }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (drag?.uid) moveToGroup(drag.uid, g.index);
                  }}
                >
                  <div className="group-setup-head">
                    <input
                      value={g.name}
                      onChange={(e) => setGroups((prev) => prev.map((x) => (x.index === g.index ? { ...x, name: e.target.value } : x)))}
                      maxLength={16}
                    />
                    <input
                      type="color"
                      value={g.color || GROUP_COLORS[i % GROUP_COLORS.length]}
                      onChange={(e) => setGroups((prev) => prev.map((x) => (x.index === g.index ? { ...x, color: e.target.value } : x)))}
                      aria-label={`${g.name} 색`}
                    />
                  </div>
                  <div className="group-setup-members">
                    {(g.members ?? []).length === 0 ? (
                      <span className="seat-empty-note">학생을 끌어오세요</span>
                    ) : (
                      g.members.map((m) => (
                        <button
                          key={m.uid}
                          type="button"
                          className="seat-student-chip"
                          onClick={() => moveToGroup(m.uid, null)}
                          {...chipProps(m.uid, "group")}
                        >
                          {m.studentId && <em>{m.studentId}</em>}
                          {m.name}
                        </button>
                      ))
                    )}
                  </div>
                </section>
              ))}
            </div>
            <div className="seat-setup-foot">
              <button type="button" className="btn-ghost" onClick={onClose}>취소</button>
              <button type="button" className="btn-primary" onClick={saveGroups} disabled={saving}>
                {saving ? "저장 중..." : "모둠 저장"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
