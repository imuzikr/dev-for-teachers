"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { safeDisplayHtml, stripHtml } from "@/lib/html";
import "./ActivityChecklist.css";
import { safeBookImageUrl } from "./BookItemImages";
import BookImageLightbox from "./BookImageLightbox";
import RichTextCodeCopies from "./RichTextCodeCopies";

export default function RichTextDisplay({
  html = "",
  fallback = "",
  className = "",
  as: Tag = "div",
  checklistValues,
  onChecklistChange,
  onImageClick,
  previewImages = false,
  compactCode = false,
}) {
  const rootRef = useRef(null);
  const [localChecks, setLocalChecks] = useState({});
  const [preview, setPreview] = useState(null);
  const rawHtml = useMemo(() => {
    const source = String(html || "");
    return source.trim() ? source : fallback;
  }, [fallback, html]);
  const [safeHtml, setSafeHtml] = useState(() => stripHtml(rawHtml));
  const innerHtml = useMemo(() => ({ __html: safeHtml }), [safeHtml]);

  useEffect(() => {
    setSafeHtml(safeDisplayHtml(rawHtml));
    setLocalChecks({});
  }, [rawHtml]);

  useLayoutEffect(() => {
    [...(rootRef.current?.querySelectorAll("img") ?? [])].filter((img) => safeBookImageUrl(img.getAttribute("src"))).forEach((img, index) => {
      if (onImageClick || previewImages) {
        img.setAttribute("role", "button");
        img.tabIndex = 0;
        img.setAttribute("aria-label", `이미지 ${index + 1} ${onImageClick ? "발표" : "크게 보기"}`);
      } else {
        img.removeAttribute("role");
        img.removeAttribute("tabindex");
        img.removeAttribute("aria-label");
      }
    });
    const values = checklistValues ?? localChecks;
    rootRef.current?.querySelectorAll('input[type="checkbox"]').forEach((input, index) => {
      input.checked = Object.hasOwn(values, index) ? values[index] : input.hasAttribute("checked");
    });
  });

  function changeCheck(event) {
    const target = event.target;
    const element = target instanceof Element ? target : target?.parentElement;
    if ((onImageClick || previewImages) && element?.tagName === "IMG" && safeBookImageUrl(element.getAttribute("src"))) {
      event.preventDefault();
      if (onImageClick) onImageClick([...rootRef.current.querySelectorAll("img")].filter((img) => safeBookImageUrl(img.getAttribute("src"))).indexOf(element));
      else setPreview({ src: element.getAttribute("src"), alt: element.getAttribute("alt") });
      return;
    }
    if (!(target instanceof HTMLInputElement && target.type === "checkbox")) {
      if (element?.closest(".rte-checklist label")) event.preventDefault();
      return;
    }
    const inputs = [...rootRef.current.querySelectorAll('input[type="checkbox"]')];
    const index = inputs.indexOf(event.target);
    const next = { ...(checklistValues ?? localChecks), [index]: event.target.checked };
    if (onChecklistChange) onChecklistChange(next);
    else setLocalChecks(next);
  }

  return (
    <><Tag
      ref={rootRef}
      onClick={changeCheck}
      onKeyDown={onImageClick || previewImages ? (event) => {
        if ((event.key === "Enter" || event.key === " ") && event.target.tagName === "IMG") changeCheck(event);
      } : undefined}
      className={`book-rich-text${compactCode ? " book-rich-text--compact-code" : ""}${className ? ` ${className}` : ""}`}
      dangerouslySetInnerHTML={innerHtml}
    />
    <RichTextCodeCopies rootRef={rootRef} html={safeHtml} compact={compactCode} />
    {preview && <BookImageLightbox image={preview} onClose={() => setPreview(null)} />}</>
  );
}
