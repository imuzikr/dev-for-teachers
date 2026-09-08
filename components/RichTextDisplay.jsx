"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { safeDisplayHtml, stripHtml } from "@/lib/html";
import "./ActivityChecklist.css";
import { safeBookImageUrl } from "./BookItemImages";

export default function RichTextDisplay({
  html = "",
  fallback = "",
  className = "",
  as: Tag = "div",
  checklistValues,
  onChecklistChange,
  onImageClick,
}) {
  const rootRef = useRef(null);
  const [localChecks, setLocalChecks] = useState({});
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
      if (onImageClick) {
        img.setAttribute("role", "button");
        img.tabIndex = 0;
        img.setAttribute("aria-label", `이미지 ${index + 1} 발표`);
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
    if (onImageClick && element?.tagName === "IMG" && safeBookImageUrl(element.getAttribute("src"))) {
      event.preventDefault();
      onImageClick([...rootRef.current.querySelectorAll("img")].filter((img) => safeBookImageUrl(img.getAttribute("src"))).indexOf(element));
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
    <Tag
      ref={rootRef}
      onClick={changeCheck}
      onKeyDown={onImageClick ? (event) => {
        if ((event.key === "Enter" || event.key === " ") && event.target.tagName === "IMG") changeCheck(event);
      } : undefined}
      className={`book-rich-text${className ? ` ${className}` : ""}`}
      dangerouslySetInnerHTML={innerHtml}
    />
  );
}
