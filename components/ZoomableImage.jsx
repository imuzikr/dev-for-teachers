"use client";

// =============================================================
// 클릭하면 전체 화면으로 확대되는 이미지
// -------------------------------------------------------------
// 첨부 이미지를 작은 미리보기로 보여주다가, 클릭하면 어두운 오버레이
// 위에 원본 크기로 띄웁니다. 배경/✕/Esc로 닫습니다.
// (오버레이는 portal로 body에 붙여 모달 안에서도 잘리지 않게 합니다.)
// =============================================================
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export default function ZoomableImage({ src, alt = "", className = "", ...rest }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!src) return null;

  return (
    <>
      <img
        src={src}
        alt={alt}
        className={`${className} zoomable-img`.trim()}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title="클릭하면 크게 보기"
        {...rest}
      />
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="lightbox-backdrop" onClick={() => setOpen(false)}>
            <button className="lightbox-close" onClick={() => setOpen(false)} aria-label="닫기">
              ×
            </button>
            <img
              className="lightbox-img"
              src={src}
              alt={alt}
              onClick={(e) => e.stopPropagation()}
            />
          </div>,
          document.body
        )}
    </>
  );
}
