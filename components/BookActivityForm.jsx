"use client";

import { useState } from "react";
import { backdropClose } from "@/lib/modal";
import { safeBookUrl } from "@/lib/bookUrl";

export default function BookActivityForm({ onSave, onClose }) {
  const [title, setTitle] = useState("마인드맵");
  const [topic, setTopic] = useState("");
  const [bookUrl, setBookUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const urlBad = bookUrl.trim().length > 0 && !safeBookUrl(bookUrl);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!topic.trim() || saving || urlBad) return;

    setSaving(true);
    try {
      await onSave({
        type: "mindmap",
        title,
        topic,
        bookUrl: bookUrl.trim(),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <form className="modal book-form" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="modal-head">
          <h3>마인드맵 활동 만들기</h3>
          <button type="button" className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <div className="book-field-row">
          <label className="book-field">
            <span>활동 이름</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={40}
            />
          </label>
          <label className="book-field">
            <span>주제어 · 도서명</span>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="예: 어린 왕자"
              maxLength={30}
              autoFocus
            />
          </label>
        </div>

        <label className="book-field">
          <span>
            도서 정보 사이트 <em className="book-optional">선택</em>
          </span>
          <input
            type="text"
            inputMode="url"
            value={bookUrl}
            onChange={(e) => setBookUrl(e.target.value)}
            placeholder="예: www.yes24.com/product/goods/..."
          />
          <em className="book-help">
            {urlBad
              ? "열 수 없는 주소예요. http:// 또는 https:// 로 시작하는 주소를 넣어 주세요."
              : "넣어 두면 학생 화면에 ‘도서 정보’ 버튼이 생겨 새 탭으로 열립니다."}
          </em>
        </label>

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>취소</button>
          <button
            type="submit"
            className="btn-primary"
            disabled={!topic.trim() || saving || urlBad}
          >
            {saving ? "만드는 중…" : "마인드맵 만들기"}
          </button>
        </div>
      </form>
    </div>
  );
}
