"use client";

import { useEffect, useRef } from "react";
import { sanitizeHtml } from "@/lib/html";

const SIZE_CLASSES = {
  small: "rte-size-small",
  normal: "rte-size-normal",
  large: "rte-size-large",
};

function IconListBulleted() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="5" cy="6" r="1.7" fill="currentColor" />
      <circle cx="5" cy="12" r="1.7" fill="currentColor" />
      <circle cx="5" cy="18" r="1.7" fill="currentColor" />
      <path d="M10 6h9M10 12h9M10 18h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconListNumbered() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 5h2v5M4 10h4M4 14h4M4 19h4M11 6h8M11 12h8M11 18h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <text x="3.5" y="17" fill="currentColor" fontSize="7" fontWeight="800">
        2
      </text>
    </svg>
  );
}

function normalizeEditorHtml(root) {
  if (!root) return;
  root.querySelectorAll("font[size]").forEach((font) => {
    const size = font.getAttribute("size");
    const span = document.createElement("span");
    span.className = size === "2" ? SIZE_CLASSES.small : size === "5" ? SIZE_CLASSES.large : SIZE_CLASSES.normal;
    span.innerHTML = font.innerHTML;
    font.replaceWith(span);
  });
}

function removeEmptySizeClasses(root) {
  root?.querySelectorAll("span").forEach((span) => {
    const sizeClass = Object.values(SIZE_CLASSES).find((className) => span.classList.contains(className));
    Object.values(SIZE_CLASSES).forEach((className) => span.classList.remove(className));
    if (sizeClass) span.classList.add(sizeClass);
    if (span.classList.length === 0) span.replaceWith(...span.childNodes);
  });
}

export default function BasicFormatEditor({
  value = "",
  onChange,
  placeholder = "",
  disabled = false,
  ariaLabel = "서식 입력",
}) {
  const areaRef = useRef(null);
  const lastHtmlRef = useRef("");

  useEffect(() => {
    const nextHtml = sanitizeHtml(value || "");
    const area = areaRef.current;
    if (!area || nextHtml === lastHtmlRef.current || area.innerHTML === nextHtml) return;
    area.innerHTML = nextHtml;
    lastHtmlRef.current = nextHtml;
  }, [value]);

  function emitChange() {
    const area = areaRef.current;
    if (!area) return;
    normalizeEditorHtml(area);
    removeEmptySizeClasses(area);
    const nextHtml = sanitizeHtml(area.innerHTML);
    if (area.innerHTML !== nextHtml) area.innerHTML = nextHtml;
    lastHtmlRef.current = nextHtml;
    onChange?.(nextHtml);
  }

  function runCommand(command) {
    if (disabled) return;
    areaRef.current?.focus();
    document.execCommand(command, false, null);
    emitChange();
  }

  function applySize(size) {
    if (disabled) return;
    areaRef.current?.focus();
    const commandSize = size === "small" ? "2" : size === "large" ? "5" : "3";
    document.execCommand("fontSize", false, commandSize);
    emitChange();
  }

  function handlePaste(event) {
    const text = event.clipboardData?.getData("text/plain");
    if (text === undefined) return;
    event.preventDefault();
    areaRef.current?.focus();
    document.execCommand("insertText", false, text);
    emitChange();
  }

  function handleDrop(event) {
    const text = event.dataTransfer?.getData("text/plain");
    if (text === undefined) return;
    event.preventDefault();
    areaRef.current?.focus();
    document.execCommand("insertText", false, text);
    emitChange();
  }

  return (
    <div className={`basic-format-editor${disabled ? " is-disabled" : ""}`}>
      <div className="basic-format-toolbar" aria-label="기본 서식 도구">
        <button type="button" title="굵게" aria-label="굵게" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("bold")} disabled={disabled}>
          <b>B</b>
        </button>
        <button type="button" title="글머리 기호" aria-label="글머리 기호" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("insertUnorderedList")} disabled={disabled}>
          <IconListBulleted />
        </button>
        <button type="button" title="숫자 글머리 기호" aria-label="숫자 글머리 기호" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("insertOrderedList")} disabled={disabled}>
          <IconListNumbered />
        </button>
        <span className="basic-format-divider" aria-hidden="true" />
        <button type="button" title="작은 글자" aria-label="작은 글자" className="basic-format-size basic-format-size--small" onMouseDown={(event) => event.preventDefault()} onClick={() => applySize("small")} disabled={disabled}>
          작게
        </button>
        <button type="button" title="보통 글자" aria-label="보통 글자" className="basic-format-size" onMouseDown={(event) => event.preventDefault()} onClick={() => applySize("normal")} disabled={disabled}>
          보통
        </button>
        <button type="button" title="큰 글자" aria-label="큰 글자" className="basic-format-size basic-format-size--large" onMouseDown={(event) => event.preventDefault()} onClick={() => applySize("large")} disabled={disabled}>
          크게
        </button>
      </div>
      <div
        ref={areaRef}
        className="basic-format-area"
        contentEditable={!disabled}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        role="textbox"
        aria-label={ariaLabel}
        aria-multiline="true"
        onInput={emitChange}
        onBlur={emitChange}
        onPaste={handlePaste}
        onDrop={handleDrop}
      />
    </div>
  );
}
