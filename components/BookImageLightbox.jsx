"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { backdropClose } from "@/lib/modal";

export default function BookImageLightbox({ image, onClose }) {
  const closeButton = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    function onKey(event) {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close.current(); }
      if (event.key === "Tab") { event.preventDefault(); closeButton.current?.focus(); }
    }
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  if (typeof document === "undefined") return null;
  return createPortal(<div className="lightbox-backdrop book-image-lightbox" role="dialog" aria-modal="true" aria-label="이미지 크게 보기" {...backdropClose(onClose)}>
    <button ref={closeButton} type="button" className="lightbox-close" onClick={onClose} aria-label="이미지 닫기">×</button>
    <img className="lightbox-img" src={image.src} alt={image.alt || "첨부 이미지"} onClick={(event) => event.stopPropagation()} />
  </div>, document.body);
}
