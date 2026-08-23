"use client";

// =============================================================
// 공부방 보드 추가 모달 (교사 전용)
// -------------------------------------------------------------
// · 활동 유형 선택
// · 제목과 설명 입력
// =============================================================
import { backdropClose } from "@/lib/modal";
import { useState } from "react";
import { addStudyBoard } from "@/lib/store";
import { getCurrentUser } from "@/lib/user";

export default function StudyBoardForm({ classId = null, onClose }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [activityType, setActivityType] = useState("individual"); // 개별 | 모둠
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await addStudyBoard(getCurrentUser(), {
        title: title.trim(),
        type: "student",
        description: description.trim(),
        keywords: [],
        classId,
        activityType,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div className="modal modal-study-board" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>➕ 새 수업 보드 만들기</h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <form className="form-grid" onSubmit={handleSubmit}>
          {/* 활동 유형 — 개별(학생 1인 1카드) / 모둠(모둠 구성 후 모둠당 1카드) */}
          <div className="board-acttype-row" role="radiogroup" aria-label="활동 유형">
            <button
              type="button"
              className={`board-acttype-btn${activityType === "individual" ? " active" : ""}`}
              onClick={() => setActivityType("individual")}
            >
              🧑‍🎓 개별 활동
              <small>학생마다 카드 1장</small>
            </button>
            <button
              type="button"
              className={`board-acttype-btn${activityType === "group" ? " active" : ""}`}
              onClick={() => setActivityType("group")}
            >
              👥 모둠 활동
              <small>모둠 구성 후 모둠당 카드 1장</small>
            </button>
          </div>

          <input
            type="text"
            placeholder="보드 제목 (예: 이온 결합 모형 탐구)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />

          <textarea
            className="study-board-desc-input"
            placeholder="활동 안내를 적어 주세요. (선택)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "만드는 중..." : "보드 만들기"}
          </button>
        </form>
      </div>
    </div>
  );
}
