"use client";

import "./BookImagePresentation.css";

export function safeBookImageUrl(value) {
  return typeof value === "string" && /^(https?:\/\/|data:image\/(?:jpeg|png|webp|gif);base64,)/i.test(value) ? value : "";
}

export default function BookItemImages({ images, onPresent }) {
  const entries = Array.isArray(images) ? images.map(safeBookImageUrl).filter(Boolean) : [];
  if (!entries.length) return null;
  return (
    <section className="book-item-image-gallery" aria-label="첨부 이미지">
      {onPresent && <small>이미지를 누르면 학생 화면에 발표합니다.</small>}
      {entries.map((src, index) => onPresent ? (
        <button type="button" key={`${index}:${src.slice(-32)}`} onClick={() => onPresent(index)} aria-label={`이미지 ${index + 1} 발표`}>
          <img src={src} alt={`첨부 이미지 ${index + 1}`} />
        </button>
      ) : <img key={`${index}:${src.slice(-32)}`} src={src} alt={`첨부 이미지 ${index + 1}`} />)}
    </section>
  );
}

export function BookItemImageIndicator({ images }) {
  const count = Array.isArray(images) ? images.filter(safeBookImageUrl).length : 0;
  if (!count) return null;
  const label = `첨부 이미지 ${count}장`;
  return (
    <span className="book-item-image-indicator" role="img" aria-label={label} title={label}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="m21 15-5-5L5 21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
