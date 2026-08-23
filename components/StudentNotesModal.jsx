"use client";

// =============================================================
// 누가기록 모달 — 보상 패널의 말풍선 버튼으로 열립니다 (교사 전용)
// =============================================================
import { backdropClose } from "@/lib/modal";
import StudentNotesThread from "./StudentNotesThread";

export default function StudentNotesModal({ student, classId = null, onClose }) {
  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div className="modal modal-notes" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>
            📝 누가기록
            <span className="notes-student">
              {student.emoji} {student.name}
            </span>
          </h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>
        <StudentNotesThread studentUid={student.uid} classId={classId} />
      </div>
    </div>
  );
}
