"use client";

import { useEffect, useRef, useState } from "react";
import { sanitizeHtml } from "@/lib/html";
import "./ActivityChecklist.css";

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

function IconChecklist() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3.5 5.2c0-.7.5-1.2 1.2-1.2h2.6c.7 0 1.2.5 1.2 1.2v2.6c0 .7-.5 1.2-1.2 1.2H4.7c-.7 0-1.2-.5-1.2-1.2V5.2ZM3.5 16.2c0-.7.5-1.2 1.2-1.2h2.6c.7 0 1.2.5 1.2 1.2v2.6c0 .7-.5 1.2-1.2 1.2H4.7c-.7 0-1.2-.5-1.2-1.2v-2.6Z" stroke="currentColor" strokeWidth="2" />
      <path d="M5 6.4l1.1 1.1L9 4.6M12 6.5h8M12 17.5h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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

function closestElement(node, selector, boundary) {
  let current = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  while (current && current !== boundary) {
    if (current.matches(selector)) return current;
    current = current.parentElement;
  }
  return null;
}

function moveCaretToEnd(node) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function checklistItemHtml(text = "확인할 일") {
  const safeText = text.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[char]));
  return `<ul class="rte-checklist"><li><label><input type="checkbox"> <span class="rte-checklist-text">${safeText}</span></label></li></ul>`;
}

function checklistLabel(checked = false, nodes = [document.createTextNode(" ")]) {
  const input = document.createElement("input");
  const label = document.createElement("label");
  const text = document.createElement("span");
  input.type = "checkbox";
  input.checked = checked;
  text.className = "rte-checklist-text";
  text.replaceChildren(...nodes);
  label.replaceChildren(input, document.createTextNode(" "), text);
  return label;
}

function setChecklistItem(item) {
  const existingInput = item.querySelector('input[type="checkbox"]');
  const existingText = item.querySelector(".rte-checklist-text");
  const nodes = [...item.childNodes].flatMap((node) => {
    if (node === existingInput) return [];
    if (node === existingText) return [...existingText.childNodes];
    if (node.nodeType === Node.ELEMENT_NODE && node.tagName === "LABEL") {
      const text = node.querySelector(".rte-checklist-text");
      return text ? [...text.childNodes] : [...node.childNodes].filter((child) => child !== existingInput);
    }
    return [node];
  });
  item.replaceChildren(checklistLabel(Boolean(existingInput?.checked || existingInput?.hasAttribute("checked")), nodes));
}

function unsetChecklistItem(item) {
  item.querySelectorAll('input[type="checkbox"]').forEach((input) => input.remove());
  item.querySelectorAll("label").forEach((label) => label.replaceWith(...label.childNodes));
}

function removeSizeClasses(root) {
  if (!root) return;
  root.querySelectorAll("*").forEach((el) => {
    Object.values(SIZE_CLASSES).forEach((className) => el.classList.remove(className));
  });
}

function detectWholeTextSize(html = "") {
  const found = Object.entries(SIZE_CLASSES).find(([, className]) => html.includes(className));
  return found?.[0] ?? "normal";
}

function syncChecklistCheckboxAttrs(root) {
  root.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    if (input.checked) {
      input.setAttribute("checked", "");
    } else {
      input.removeAttribute("checked");
    }
  });
}

function checklistItemText(item) {
  const clone = item.cloneNode(true);
  clone.querySelectorAll('input[type="checkbox"]').forEach((input) => input.remove());
  return clone.textContent.replace(/\u00a0/g, " ").trim();
}

function moveCaretInsideText(node) {
  const selection = window.getSelection();
  if (!selection) return;
  const text = node.firstChild || node.appendChild(document.createTextNode(""));
  const range = document.createRange();
  range.setStart(text, text.textContent.length);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

export default function BasicFormatEditor({
  value = "",
  onChange,
  placeholder = "",
  disabled = false,
  templateEnabled = false,
  ariaLabel = "서식 입력",
}) {
  const areaRef = useRef(null);
  const lastHtmlRef = useRef("");
  const [activeSize, setActiveSize] = useState(() => detectWholeTextSize(value));

  useEffect(() => {
    const nextHtml = sanitizeHtml(value || "");
    const area = areaRef.current;
    if (!area || nextHtml === lastHtmlRef.current || area.innerHTML === nextHtml) return;
    area.innerHTML = nextHtml;
    lastHtmlRef.current = nextHtml;
    setActiveSize(detectWholeTextSize(nextHtml));
  }, [value]);

  function emitChange() {
    const area = areaRef.current;
    if (!area) return;
    normalizeEditorHtml(area);
    removeEmptySizeClasses(area);
    syncChecklistCheckboxAttrs(area);
    const nextHtml = sanitizeHtml(area.innerHTML);
    if (area.innerHTML !== nextHtml) area.innerHTML = nextHtml;
    lastHtmlRef.current = nextHtml;
    setActiveSize(detectWholeTextSize(nextHtml));
    onChange?.(nextHtml);
  }

  function runCommand(command) {
    if (disabled) return;
    areaRef.current?.focus();
    document.execCommand(command, false, null);
    emitChange();
  }

  function toggleChecklist() {
    const area = areaRef.current;
    const selection = window.getSelection();
    if (!area || !selection || disabled) return;
    area.focus();

    const range = selection.rangeCount ? selection.getRangeAt(0) : null;
    const selectedInEditor = range && area.contains(range.commonAncestorContainer);
    if (!selectedInEditor) {
      const nextRange = document.createRange();
      nextRange.selectNodeContents(area);
      nextRange.collapse(false);
      selection.removeAllRanges();
      selection.addRange(nextRange);
    }

    const anchor = selection.anchorNode;
    const list = closestElement(anchor, "ul, ol", area);
    if (list?.classList.contains("rte-checklist")) {
      list.classList.remove("rte-checklist");
      list.querySelectorAll("li").forEach(unsetChecklistItem);
      emitChange();
      return;
    }

    const item = closestElement(anchor, "li", area);
    if (item && list) {
      if (list.tagName === "OL") {
        const replacement = document.createElement("ul");
        replacement.innerHTML = list.innerHTML;
        list.replaceWith(replacement);
        replacement.className = "rte-checklist";
        replacement.querySelectorAll("li").forEach(setChecklistItem);
      } else {
        list.classList.add("rte-checklist");
        list.querySelectorAll("li").forEach(setChecklistItem);
      }
      emitChange();
      return;
    }

    const selectedText = selection.toString().trim();
    document.execCommand("insertHTML", false, checklistItemHtml(selectedText || "확인할 일"));
    const insertedList = closestElement(selection.anchorNode, "ul.rte-checklist", area);
    if (insertedList) moveCaretInsideText(insertedList.querySelector(".rte-checklist-text"));
    emitChange();
  }

  function handleAreaClick(event) {
    if (disabled) {
      event.preventDefault();
      return;
    }
    if (event.target instanceof HTMLInputElement && event.target.type === "checkbox") {
      emitChange();
      return;
    }
    if (event.target instanceof Element && event.target.closest(".rte-checklist label")) {
      event.preventDefault();
    }
  }

  function handleKeyDown(event) {
    if (event.nativeEvent.isComposing || disabled || event.key !== "Enter") return;
    const area = areaRef.current;
    const selection = window.getSelection();
    const item = area && selection ? closestElement(selection.anchorNode, "li", area) : null;
    const list = item?.parentElement;
    if (!item || !list?.classList.contains("rte-checklist")) return;

    event.preventDefault();
    if (!checklistItemText(item)) {
      const exit = document.createElement("div");
      exit.innerHTML = "<br>";
      list.after(exit);
      item.remove();
      if (!list.querySelector("li")) list.remove();
      moveCaretToEnd(exit);
      emitChange();
      return;
    }

    const nextItem = document.createElement("li");
    const label = checklistLabel();
    nextItem.append(label);
    item.after(nextItem);
    moveCaretInsideText(label.querySelector(".rte-checklist-text"));
    emitChange();
  }

  function applySize(size) {
    if (disabled) return;
    const area = areaRef.current;
    if (!area) return;
    area.focus();
    normalizeEditorHtml(area);
    removeSizeClasses(area);
    const className = SIZE_CLASSES[size] ?? SIZE_CLASSES.normal;
    const html = area.innerHTML.trim() ? area.innerHTML : "<br>";
    area.innerHTML = `<div class="${className}">${html}</div>`;
    setActiveSize(size);
    emitChange();
  }

  function insertTemplateVariable() {
    const area = areaRef.current;
    const selection = window.getSelection();
    if (!area || !selection || disabled) return;
    const selected = selection.rangeCount && area.contains(selection.getRangeAt(0).commonAncestorContainer);
    const label = selected ? selection.toString().replace(/^\{\{|\}\}$/g, "").trim() : "";
    if (!selected) {
      const range = document.createRange();
      range.selectNodeContents(area);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    area.focus();
    const name = label && !/[{}\r\n]/.test(label) && label.length <= 80 ? label : "입력값";
    document.execCommand("insertText", false, `{{${name}}}`);
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
        {templateEnabled && <button type="button" title="선택한 문구를 템플릿 변수로 지정" aria-label="템플릿 변수 삽입" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={insertTemplateVariable}>{"{}"}</button>}
        <button type="button" title="굵게" aria-label="굵게" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("bold")} disabled={disabled}>
          <b>B</b>
        </button>
        <button type="button" title="글머리 기호" aria-label="글머리 기호" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("insertUnorderedList")} disabled={disabled}>
          <IconListBulleted />
        </button>
        <button type="button" title="숫자 글머리 기호" aria-label="숫자 글머리 기호" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("insertOrderedList")} disabled={disabled}>
          <IconListNumbered />
        </button>
        <button type="button" title="체크리스트" aria-label="체크리스트" className="basic-format-checklist" onMouseDown={(event) => event.preventDefault()} onClick={toggleChecklist} disabled={disabled}>
          <IconChecklist />
        </button>
        <span className="basic-format-divider" aria-hidden="true" />
        <button type="button" title="작은 글자" aria-label="작은 글자" className={`basic-format-size basic-format-size--small${activeSize === "small" ? " is-active" : ""}`} onMouseDown={(event) => event.preventDefault()} onClick={() => applySize("small")} disabled={disabled}>
          작게
        </button>
        <button type="button" title="보통 글자" aria-label="보통 글자" className={`basic-format-size${activeSize === "normal" ? " is-active" : ""}`} onMouseDown={(event) => event.preventDefault()} onClick={() => applySize("normal")} disabled={disabled}>
          보통
        </button>
        <button type="button" title="큰 글자" aria-label="큰 글자" className={`basic-format-size basic-format-size--large${activeSize === "large" ? " is-active" : ""}`} onMouseDown={(event) => event.preventDefault()} onClick={() => applySize("large")} disabled={disabled}>
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
        onKeyDown={handleKeyDown}
        onBlur={emitChange}
        onClick={handleAreaClick}
        onPaste={handlePaste}
        onDrop={handleDrop}
      />
    </div>
  );
}
