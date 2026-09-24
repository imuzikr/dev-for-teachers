"use client";

import { useEffect, useId, useRef } from "react";
import { bookItemUrlHref } from "@/lib/bookItemUrls";
import { IconTrash } from "./StatusIcons";

export default function BookItemUrlEditor({ urls, onChange, disabled = false, label = "활동 URL" }) {
  const id = useId();
  const inputs = useRef([]);
  const pendingFocus = useRef(null);
  const rows = Array.isArray(urls) && urls.length ? urls : [""];

  useEffect(() => {
    if (pendingFocus.current === null) return;
    inputs.current[pendingFocus.current]?.focus();
    pendingFocus.current = null;
  }, [urls]);

  function addRow() {
    pendingFocus.current = rows.length;
    onChange([...rows, ""]);
  }

  function removeRow(index) {
    const next = rows.filter((_, rowIndex) => rowIndex !== index);
    pendingFocus.current = Math.max(0, Math.min(index, next.length - 1));
    onChange(next.length ? next : [""]);
  }

  return (
    <fieldset className="book-item-url-editor" disabled={disabled} aria-label={label}>
      <legend>{label} <span>(선택)</span></legend>
      <div className="book-item-url-rows">
        {rows.map((url, index) => {
          const value = typeof url === "string" ? url : "";
          const invalid = typeof url !== "string" || Boolean(value.trim() && !bookItemUrlHref(value));
          return (
            <div className="book-item-url-row" key={index}>
              <input
                ref={(element) => { inputs.current[index] = element; }}
                type="url"
                inputMode="url"
                autoCapitalize="none"
                spellCheck={false}
                value={value}
                aria-label={`${label} ${index + 1}`}
                aria-invalid={invalid || undefined}
                aria-describedby={invalid ? `${id}-error-${index}` : undefined}
                placeholder="https://example.com"
                onChange={(event) => onChange(rows.map((value, rowIndex) => rowIndex === index ? event.target.value : value))}
              />
              {(rows.length > 1 || url !== "") && (
                <button type="button" className="btn-outline book-item-url-action" onClick={() => removeRow(index)} aria-label={`${label} ${index + 1} 삭제`} title="URL 삭제">
                  <IconTrash size={16} />
                </button>
              )}
              {index === rows.length - 1 && (
                <button type="button" className="btn-outline book-item-url-action" onClick={addRow} aria-label={`${label} 입력 칸 추가`} title="URL 입력 칸 추가">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                </button>
              )}
              {invalid && <p className="form-error book-item-url-error" id={`${id}-error-${index}`}>올바른 웹 주소를 입력해 주세요.</p>}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
