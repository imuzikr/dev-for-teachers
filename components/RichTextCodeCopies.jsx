"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { backdropClose } from "@/lib/modal";
import { IconCopy } from "./BookProjectPreview";
import "./RichTextCode.css";

function codeText(pre) {
  const clone = pre.cloneNode(true);
  clone.querySelectorAll("br").forEach((br) => br.replaceWith(document.createTextNode("\n")));
  clone.querySelectorAll("div, p").forEach((block) => block.append(document.createTextNode("\n")));
  return clone.textContent.replace(/\u00a0/g, " ");
}

function CodeContentModal({ text, onClose }) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector("button")?.focus();
    function keydown(event) {
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation(); closeRef.current();
      } else if (event.key === "Tab") {
        event.stopPropagation();
        const controls = [...dialogRef.current.querySelectorAll('button, [tabindex="0"]')];
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener("keydown", keydown, true);
    return () => {
      document.removeEventListener("keydown", keydown, true);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(<div className="modal-backdrop rich-code-view-backdrop" {...backdropClose(onClose)}>
    <section ref={dialogRef} className="modal rich-code-view-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={event => event.stopPropagation()}>
      <header><h3 id={titleId}>코드 내용</h3><button type="button" className="btn-close" aria-label="코드 내용 닫기" onClick={onClose}>×</button></header>
      <pre tabIndex={0} aria-label="전체 코드 내용"><code>{text}</code></pre>
    </section>
  </div>, document.body);
}

function CopyCode({ pre, compact, index, count }) {
  const [status, setStatus] = useState("");
  const [expanded, setExpanded] = useState(false);
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
            <button type="button" className="rich-code-action" aria-haspopup="dialog" aria-label={`${count > 1 ? `코드 ${index + 1}` : "코드"} 펼치기`} onClick={event => { event.stopPropagation(); setExpanded(true); }}>펼치기</button>
          </div>
        </div>
        {<code className="rich-code-preview" aria-label="코드 미리보기">{preview.map((line, lineIndex) => <span key={lineIndex}>{line}</span>)}</code>}
      </div>
      {status && <span className="rich-code-copy-status" role="status">{status}</span>}
      {expanded && <CodeContentModal text={codeText(pre)} onClose={() => setExpanded(false)} />}
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
