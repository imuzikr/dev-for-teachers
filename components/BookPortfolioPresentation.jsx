"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { loadBookPortfolioBroadcast } from "@/lib/store";
import { applyPortfolioScroll } from "./bookPortfolioScroll";
import "./BookPortfolio.css";

export default function BookPortfolioPresentation({ broadcast }) {
  const [attempt, setAttempt] = useState(0);
  const [html, setHtml] = useState("");
  const [status, setStatus] = useState("loading");
  const frame = useRef(null);
  const panel = useRef(null);
  const latestPosition = useRef(broadcast.scrollPosition);
  latestPosition.current = broadcast.scrollPosition;
  const { classId, scrollSessionId, portfolioChunkCount } = broadcast;

  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    function keydown(event) {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); }
      if (event.key !== "Tab") return;
      const nodes = [...(panel.current?.querySelectorAll('button:not(:disabled), iframe') ?? [])];
      if (!nodes.length) { event.preventDefault(); panel.current?.focus(); }
      else if (event.shiftKey && (document.activeElement === nodes[0] || document.activeElement === panel.current)) { event.preventDefault(); nodes.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0]?.focus(); }
    }
    document.addEventListener("keydown", keydown, true);
    return () => {
      document.removeEventListener("keydown", keydown, true);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    setHtml(""); setStatus("loading");
    const timer = setTimeout(() => {
      controller.abort();
      if (live) setStatus("failed");
    }, 25000);
    loadBookPortfolioBroadcast(broadcast, { signal: controller.signal }).then((value) => {
      if (live && !controller.signal.aborted) { setHtml(value); setStatus("ready"); }
    }).catch(() => { if (live && !controller.signal.aborted) setStatus("failed"); }).finally(() => clearTimeout(timer));
    return () => { live = false; controller.abort(); clearTimeout(timer); };
  }, [classId, scrollSessionId, portfolioChunkCount, attempt]);

  useEffect(() => { applyPortfolioScroll(frame.current?.contentDocument, broadcast.scrollPosition); }, [broadcast.scrollPosition]);

  async function loaded() {
    const target = frame.current;
    const document = target?.contentDocument;
    if (!document) return;
    await Promise.all([...document.images].map((image) => image.decode().catch(() => {})));
    if (frame.current !== target) return;
    applyPortfolioScroll(document, latestPosition.current);
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      const links = [...document.querySelectorAll("a[href]")];
      if (!links.length) { event.preventDefault(); panel.current?.focus(); }
      else if (!event.shiftKey && document.activeElement === links.at(-1)) { event.preventDefault(); links[0]?.focus(); }
      else if (event.shiftKey && document.activeElement === links[0]) { event.preventDefault(); links.at(-1)?.focus(); }
    });
  }

  if (typeof document === "undefined") return null;
  return createPortal(<div className="modal-backdrop book-portfolio-backdrop book-portfolio-audience">
    <section ref={panel} tabIndex={-1} className="modal book-portfolio-modal" role="dialog" aria-modal="true" aria-label="선생님이 보여주는 포트폴리오">
      <header className="book-portfolio-head">
        <div><small>선생님이 포트폴리오를 보여주고 있어요</small><h2>{broadcast.studentName || "학생"} · {broadcast.className || "차시 보고서"}</h2></div>
        <span className="book-portfolio-live" role="status">발표 중</span>
      </header>
      <div className="book-portfolio-preview" aria-busy={status === "loading"}>
        {status === "loading" && <p className="book-portfolio-state" role="status">공개된 포트폴리오를 불러오는 중...</p>}
        {status === "failed" && <div className="book-portfolio-state" role="alert"><p>포트폴리오를 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.</p><button type="button" className="btn-outline" onClick={() => setAttempt((value) => value + 1)}>다시 시도</button></div>}
        {status === "ready" && <iframe ref={frame} title="공개된 학생 포트폴리오" srcDoc={html} onLoad={loaded} sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" />}
      </div>
    </section>
  </div>, document.body);
}
