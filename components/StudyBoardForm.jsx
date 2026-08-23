"use client";

// =============================================================
// 공부방 보드 추가 모달 (교사 전용)
// -------------------------------------------------------------
// · 제목 행 오른쪽에 토글로 "질문 게시판 연계하기" 설정
// · 연계 ON 시 키워드 칩을 복수로 선택 가능 (제목 바로 아래)
// · 설명 입력 (선택)
// =============================================================
import { backdropClose } from "@/lib/modal";
import { useState } from "react";
import { addStudyBoard, addKeyword } from "@/lib/store";
import { getCurrentUser } from "@/lib/user";

export default function StudyBoardForm({ keywords = [], classId = null, onClose }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [activityType, setActivityType] = useState("individual"); // 개별 | 모둠
  const [linkKeyword, setLinkKeyword] = useState(false);
  const [selectedKeywords, setSelectedKeywords] = useState([]);
  const [saving, setSaving] = useState(false);
  const [addingKw, setAddingKw] = useState(false); // 새 키워드 입력 중
  const [newKw, setNewKw] = useState("");

  function toggleKeyword(kw) {
    setSelectedKeywords((prev) =>
      prev.includes(kw) ? prev.filter((k) => k !== kw) : [...prev, kw]
    );
  }

  // 새 키워드 추가 — 전역 키워드 목록에 만들고(중복이면 생략) 이 보드에 바로 선택.
  async function handleAddKeyword() {
    const name = newKw.trim().replace(/^#\s*/, "");
    if (!name) return;
    if (!keywords.includes(name)) await addKeyword(name);
    setSelectedKeywords((prev) => (prev.includes(name) ? prev : [...prev, name]));
    setNewKw("");
    setAddingKw(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await addStudyBoard(getCurrentUser(), {
        title: title.trim(),
        type: "student",
        description: description.trim(),
        keywords: linkKeyword ? selectedKeywords : [],
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

          {/* 제목 + 연계 토글 */}
          <div className="study-board-form-title-row">
            <input
              type="text"
              placeholder="보드 제목 (예: 이온 결합 모형 탐구)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
            <label
              className="toggle-switch"
              title="질문 게시판 주제와 연계하기"
            >
              <input
                type="checkbox"
                checked={linkKeyword}
                onChange={(e) => setLinkKeyword(e.target.checked)}
              />
              <span className="toggle-track" />
              <span className="toggle-label">연계하기</span>
            </label>
          </div>

          {/* 키워드 칩 (연계 ON일 때) — 맨 끝 '+'로 새 키워드 추가 */}
          {linkKeyword && (
            <div className="study-keyword-chips">
              {keywords.map((kw) => (
                <button
                  key={kw}
                  type="button"
                  className={`study-keyword-chip${selectedKeywords.includes(kw) ? " selected" : ""}`}
                  onClick={() => toggleKeyword(kw)}
                >
                  # {kw}
                </button>
              ))}
              {addingKw ? (
                <span className="study-keyword-add-inline">
                  <input
                    type="text"
                    value={newKw}
                    onChange={(e) => setNewKw(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); handleAddKeyword(); }
                      if (e.key === "Escape") { setAddingKw(false); setNewKw(""); }
                    }}
                    placeholder="새 키워드"
                    autoFocus
                  />
                  <button type="button" onClick={handleAddKeyword}>추가</button>
                </span>
              ) : (
                <button
                  type="button"
                  className="study-keyword-chip study-keyword-add"
                  onClick={() => setAddingKw(true)}
                  title="키워드 추가"
                >
                  +
                </button>
              )}
            </div>
          )}

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
