"use client";

// =============================================================
// 공부방 카드 작성/수정 모달
// -------------------------------------------------------------
// 질문 작성 폼과 같은 리치 텍스트 + 이미지 첨부 + 그리기를 지원합니다.
// card prop이 있으면 수정 모드로 동작합니다.
// =============================================================
import { backdropClose } from "@/lib/modal";
import { useState } from "react";
import { addStudyCard, updateStudyCard } from "@/lib/store";
import { getCurrentUser } from "@/lib/user";
import { sanitizeHtml, stripHtml } from "@/lib/html";
import { readImageAsDataUrl } from "@/lib/image";
import RichTextEditor, { IconImage, IconPen } from "./RichTextEditor";
import DrawingCanvas from "./DrawingCanvas";

function buildActivityTemplate(activities) {
  if (!activities?.length) return "";
  return activities
    .map((act) => `<div class="activity-section"><h4 class="activity-title">${act}</h4><p><br></p></div>`)
    .join("");
}

export default function StudyCardForm({ board, card = null, onClose }) {
  const editing = !!card;
  const initialHtml = editing
    ? card.content
    : buildActivityTemplate(board.activities ?? []);
  const [content, setContent] = useState(initialHtml);
  const [imageUrl, setImageUrl] = useState(editing ? card.imageUrl ?? null : null);
  const [drawing, setDrawing] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("이미지 파일만 첨부할 수 있습니다.");
      return;
    }
    setImageUrl(await readImageAsDataUrl(file));
    e.target.value = "";
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const html = sanitizeHtml(content);
    if (stripHtml(html).length === 0 && !imageUrl) return;
    setSaving(true);
    try {
      if (editing) {
        await updateStudyCard(board.id, card.id, { content: html, imageUrl });
      } else {
        await addStudyCard(getCurrentUser(), board.id, { content: html, imageUrl });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div className="modal modal-form" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>
            {editing ? "✏️ 내 카드 수정하기" : "✏️ 내 카드 작성하기"}
            <span className="study-form-board"># {board.title}</span>
          </h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <form className="form-grid" onSubmit={handleSubmit}>
          <RichTextEditor
            variant="full"
            initialHtml={initialHtml}
            onChange={setContent}
            placeholder="활동 결과물을 자유롭게 작성해 보세요. 글, 코드, 이미지 모두 담을 수 있어요."
          >
            <label className="rte-tool" title="이미지 첨부">
              <IconImage />
              <input type="file" accept="image/*" onChange={handleFile} hidden />
            </label>
            <button
              type="button"
              className="rte-tool"
              title="그리기"
              onClick={() => setDrawing(true)}
            >
              <IconPen />
            </button>
          </RichTextEditor>

          {imageUrl && (
            <div className="attach-row">
              <img src={imageUrl} alt="첨부 미리보기" className="attach-preview" />
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setImageUrl(null)}
              >
                ✕ 첨부 취소
              </button>
            </div>
          )}

          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "저장 중..." : editing ? "수정 저장" : "카드 등록"}
          </button>
        </form>

        {drawing && (
          <DrawingCanvas
            onSave={(dataUrl) => setImageUrl(dataUrl)}
            onClose={() => setDrawing(false)}
          />
        )}
      </div>
    </div>
  );
}
