"use client";

import { useEffect, useMemo, useState } from "react";
import { safeDisplayHtml, stripHtml } from "@/lib/html";

export default function RichTextDisplay({
  html = "",
  fallback = "",
  className = "",
  as: Tag = "div",
}) {
  const rawHtml = useMemo(() => {
    const source = String(html || "");
    return source.trim() ? source : fallback;
  }, [fallback, html]);
  const [safeHtml, setSafeHtml] = useState(() => stripHtml(rawHtml));

  useEffect(() => {
    setSafeHtml(safeDisplayHtml(rawHtml));
  }, [rawHtml]);

  return (
    <Tag
      className={`book-rich-text${className ? ` ${className}` : ""}`}
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
}
