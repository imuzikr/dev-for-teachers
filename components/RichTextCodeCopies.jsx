"use client";

import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { IconCopy } from "./BookProjectPreview";
import "./RichTextCode.css";

function CopyCode({ pre }) {
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  async function copy(event) {
    event.preventDefault();
    event.stopPropagation();
    setPending(true);
    try {
      const clone = pre.cloneNode(true);
      clone.querySelectorAll("br").forEach((br) => br.replaceWith(document.createTextNode("\n")));
      clone.querySelectorAll("div, p").forEach((block) => block.append(document.createTextNode("\n")));
      await navigator.clipboard.writeText(clone.textContent.replace(/\u00a0/g, " "));
      setStatus("복사됨");
    } catch {
      setStatus("복사 실패. 다시 시도해 주세요.");
    } finally {
      setPending(false);
    }
  }
  return <><span role="status">{status}</span><button type="button" title="코드 복사" aria-label="코드 복사" disabled={pending} onClick={copy}><IconCopy /></button></>;
}

export default function RichTextCodeCopies({ rootRef, html }) {
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
  return blocks.map(({ pre, host }, index) => createPortal(<CopyCode pre={pre} />, host, `${html}:${index}`));
}
