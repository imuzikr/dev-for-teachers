"use client";

import { useMemo, useState } from "react";
import { backdropClose } from "@/lib/modal";
import { toDate } from "@/lib/store";

function formatDateLabel(dateKey) {
  if (!dateKey) return "";
  const [year, month, day] = String(dateKey).split("-");
  return `${year}.${month}.${day}`;
}

function formatDateTime(value) {
  const date = toDate(value);
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function StudyAttendanceModal({
  isTeacher = false,
  records = [],
  roster = [],
  onClose,
}) {
  const dates = useMemo(
    () => [...new Set(records.map((r) => r.date).filter(Boolean))].sort((a, b) => b.localeCompare(a)),
    [records]
  );
  const [selectedDate, setSelectedDate] = useState("");
  const activeDate = selectedDate || dates[0] || "";

  const byStudent = useMemo(() => {
    const map = new Map();
    records
      .filter((r) => r.date === activeDate)
      .forEach((r) => map.set(r.uid, r));
    return map;
  }, [records, activeDate]);

  const studentRows = useMemo(
    () =>
      roster.map((student) => ({
        ...student,
        record: byStudent.get(student.uid) ?? null,
      })),
    [roster, byStudent]
  );

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div
        className="modal study-attendance-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="study-attendance-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3 id="study-attendance-title">{isTeacher ? "출석부 보기" : "내 출석부"}</h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        {records.length === 0 ? (
          <p className="lesson-note-empty">
            {isTeacher ? "아직 출석 기록이 없어요." : "아직 출석한 기록이 없어요."}
          </p>
        ) : isTeacher ? (
          <>
            <div className="study-attendance-toolbar">
              <label>
                날짜
                <select value={activeDate} onChange={(e) => setSelectedDate(e.target.value)}>
                  {dates.map((date) => (
                    <option key={date} value={date}>
                      {formatDateLabel(date)}
                    </option>
                  ))}
                </select>
              </label>
              <span>
                출석 {studentRows.filter((s) => s.record).length} / {studentRows.length}
              </span>
            </div>
            <div className="study-attendance-table-wrap">
              <table className="study-attendance-table">
                <thead>
                  <tr>
                    <th>학생</th>
                    <th>출석 상황</th>
                    <th>출석 기록</th>
                  </tr>
                </thead>
                <tbody>
                  {studentRows.map((student) => (
                    <tr key={student.uid}>
                      <td>
                        <span className="study-attendance-student">
                          <span aria-hidden="true">{student.emoji || "🙂"}</span>
                          <span>
                            <strong>{student.name || "이름 미설정"}</strong>
                            {student.studentId && <small>{student.studentId}</small>}
                          </span>
                        </span>
                      </td>
                      <td>
                        <span className={`study-attendance-status${student.record ? " on" : ""}`}>
                          {student.record ? "출석" : "기록 없음"}
                        </span>
                      </td>
                      <td>
                        {student.record
                          ? formatDateTime(student.record.attendedAt || student.record.createdAt)
                          : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <ul className="study-attendance-list">
            {records.map((record) => (
              <li key={record.id}>
                <strong>{formatDateLabel(record.date)}</strong>
                <span>출석</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
