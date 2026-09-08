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
