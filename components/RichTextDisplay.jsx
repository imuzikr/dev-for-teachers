"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { safeDisplayHtml, stripHtml } from "@/lib/html";
import "./ActivityChecklist.css";

export default function RichTextDisplay({
  html = "",
  fallback = "",
  className = "",
  as: Tag = "div",
  checklistValues,
  onChecklistChange,
}) {
  const rootRef = useRef(null);
  const [localChecks, setLocalChecks] = useState({});
  const rawHtml = useMemo(() => {
    const source = String(html || "");
    return source.trim() ? source : fallback;
  }, [fallback, html]);
  const [safeHtml, setSafeHtml] = useState(() => stripHtml(rawHtml));

  useEffect(() => {
    setSafeHtml(safeDisplayHtml(rawHtml));
    setLocalChecks({});
  }, [rawHtml]);

  useEffect(() => {
    const values = checklistValues ?? localChecks;
    rootRef.current?.querySelectorAll('input[type="checkbox"]').forEach((input, index) => {
      input.checked = Object.hasOwn(values, index) ? values[index] : input.hasAttribute("checked");
    });
  }, [safeHtml, checklistValues, localChecks]);

  function changeCheck(event) {
    if (!event.target.matches('input[type="checkbox"]')) return;
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
      className={`book-rich-text${className ? ` ${className}` : ""}`}
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
}
