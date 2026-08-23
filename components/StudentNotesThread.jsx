"use client";

// =============================================================
// 누가기록 스레드 — 학생 한 명의 관찰 기록 목록 + 작성 (교사 전용)
// -------------------------------------------------------------
// 보상 패널의 말풍선 버튼(모달)과 관리자 대시보드에서 함께 사용합니다.
// 댓글처럼 최신 기록이 위에 쌓이고, Ctrl/⌘+Enter로 빠르게 추가합니다.
// =============================================================
import { useEffect, useState } from "react";
import {
  subscribeStudentNotes,
  addStudentNote,
  deleteStudentNote,
  formatTime,
} from "@/lib/store";
import { getCurrentUser } from "@/lib/user";

export default function StudentNotesThread({ studentUid, classId = null, readOnly = false }) {
  const [notes, setNotes] = useState([]);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const me = getCurrentUser();

  useEffect(() => {
    if (!studentUid) return;
    return subscribeStudentNotes(studentUid, setNotes);
  }, [studentUid]);

  async function handleAdd(e) {
    e?.preventDefault?.();
    const t = text.trim();
    if (!t || saving) return;
    setSaving(true);
    try {
      await addStudentNote(me, studentUid, { text: t, classId });
      setText("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="notes-thread">
      {/* 읽기 전용(대시보드)에서는 입력창을 숨기고 기록만 보여 줍니다 */}
      {!readOnly && (
        <form className="notes-compose" onSubmit={handleAdd}>
          <textarea
            className="notes-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="이 학생의 순간을 기록해 보세요. (예: 친구의 질문에 먼저 답해 줬어요) — Ctrl+Enter로 저장"
            rows={2}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleAdd(e);
            }}
          />
          <button
            type="submit"
            className="btn-primary notes-add-btn"
            disabled={saving || !text.trim()}
          >
            {saving ? "기록 중…" : "기록 추가"}
          </button>
        </form>
      )}

      {notes.length === 0 ? (
        <p className="notes-empty">아직 남긴 기록이 없어요.</p>
      ) : (
        <ul className="notes-list">
          {notes.map((n) => (
            <li key={n.id} className="notes-item">
              <p className="notes-text">{n.text}</p>
              <div className="notes-meta">
                <time>{formatTime(n.createdAt)}</time>
                {!readOnly && (
                  <button
                    type="button"
                    className="notes-del"
                    onClick={() => deleteStudentNote(n.id, studentUid)}
                  >
                    삭제
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
