"use client";

import { useId, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { IconCopy } from "./BookProjectPreview";
import "./RichTextCode.css";

function codeText(pre) {
  const clone = pre.cloneNode(true);
  clone.querySelectorAll("br").forEach((br) => br.replaceWith(document.createTextNode("\n")));
  clone.querySelectorAll("div, p").forEach((block) => block.append(document.createTextNode("\n")));
  return clone.textContent.replace(/\u00a0/g, " ");
}

function CopyCode({ pre, compact, index, count }) {
  const [status, setStatus] = useState("");
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  useLayoutEffect(() => {
    const originalId = pre.id;
    if (!pre.id) pre.id = contentId;
    pre.classList.toggle("is-code-expanded", compact && expanded);
    return () => {
      pre.classList.remove("is-code-expanded");
      pre.id = originalId;
    };
  }, [pre, compact, expanded, contentId]);
  const [pending, setPending] = useState(false);
  async function copy(event) {
    event.preventDefault();
    event.stopPropagation();
    setPending(true);
    try {
      await navigator.clipboard.writeText(codeText(pre));
      setStatus("복사됨");
    } catch {
      setStatus("복사 실패. 다시 시도해 주세요.");
    } finally {
      setPending(false);
    }
  }
  if (compact) {
    const label = count > 1 ? `코드 ${index + 1} 복사` : "코드 복사";
    const preview = codeText(pre).split(/\r?\n/).filter((line) => line.trim()).slice(0, 2);
    return <div className="rich-code-compact-control">
      <div className="rich-code-copy-row">
        <div className="rich-code-compact-head">
          <code aria-hidden="true">&lt;/&gt;</code><strong>{count > 1 ? `코드 ${index + 1}` : "코드 내용"}</strong>
          <div className="rich-code-compact-buttons">
            <button type="button" className="rich-code-action" title={label} aria-label={label} disabled={pending} onClick={copy}><IconCopy />{pending ? "복사 중..." : "복사"}</button>
            <button type="button" className="rich-code-action" aria-expanded={expanded} aria-controls={pre.id || contentId} aria-label={`${count > 1 ? `코드 ${index + 1}` : "코드"} ${expanded ? "접기" : "펼치기"}`} onClick={event => { event.stopPropagation(); setExpanded(!expanded); }}>{expanded ? "접기" : "펼치기"}</button>
          </div>
        </div>
        {!expanded && <code className="rich-code-preview" aria-label="코드 미리보기">{preview.map((line, lineIndex) => <span key={lineIndex}>{line}</span>)}</code>}
      </div>
      {status && <span className="rich-code-copy-status" role="status">{status}</span>}
    </div>;
  }
  return <><span role="status">{status}</span><button type="button" title="코드 복사" aria-label="코드 복사" disabled={pending} onClick={copy}><IconCopy /></button></>;
}

export default function RichTextCodeCopies({ rootRef, html, compact = false }) {
  const [blocks, setBlocks] = useState([]);
  useLayoutEffect(() => {
    // Copy controls are display-only and never enter the stored HTML or code text.
    const next = [...(rootRef.current?.querySelectorAll("pre") || [])].map((pre) => {
      const wrapper = document.createElement("div");
      const host = document.createElement("div");
      wrapper.className = "rich-code-block";
      host.className = "rich-code-actions";
      pre.before(wrapper);
      wrapper.append(host, pre);
      return { pre, host, wrapper };
    });
    setBlocks(next);
    return () => next.forEach(({ pre, wrapper }) => wrapper.replaceWith(pre));
  }, [html, rootRef]);
  return blocks.map(({ pre, host }, index) => createPortal(<CopyCode pre={pre} compact={compact} index={index} count={blocks.length} />, host, `${html}:${index}`));
}
