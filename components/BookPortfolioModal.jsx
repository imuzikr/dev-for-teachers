"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { backdropClose } from "@/lib/modal";
import { loadBookPortfolioEntries } from "@/lib/bookPortfolioEntries";
import { buildBookPortfolio, renderBookPortfolioHtml, portfolioFilename } from "@/lib/bookPortfolio.mjs";
import { prepareBookPortfolio } from "@/lib/bookPortfolioAssets";
import usePortfolioPresentation from "./usePortfolioPresentation";
import { portfolioScrollPosition } from "./bookPortfolioScroll";
import "./BookPortfolio.css";

export default function BookPortfolioModal({ project, participant, classId, className, user, entriesByActivity, onClose }) {
  const presentation = usePortfolioPresentation({ user, classId, projectId: project.id, participantUid: participant.uid,
    studentName: participant.name || participant.realName || participant.displayName, className });
  const presentationRef = useRef(presentation);
  presentationRef.current = presentation;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [frameReady, setFrameReady] = useState(false);
  const modal = useRef(null);
  const frame = useRef(null);
  const latest = useRef({ project, participant, classId, className, user, entriesByActivity });
  latest.current = { project, participant, classId, className, user, entriesByActivity };
  const close = useRef(onClose);
  close.current = async () => { if (await presentationRef.current.stop()) onClose(); };
  const titleId = useId();

  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    modal.current?.focus();
    function keydown(event) {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close.current(); }
      if (event.key !== "Tab") return;
      const nodes = [...modal.current.querySelectorAll('button:not(:disabled), iframe')];
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === modal.current)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    }
    document.addEventListener("keydown", keydown, true);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", keydown, true);
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    setStatus("loading"); setError(""); setResult(null); setFrameReady(false);
    const timer = setTimeout(() => {
      controller.abort();
      if (live) { setStatus("failed"); setError("기록을 불러오는 데 시간이 오래 걸려요. 연결을 확인한 뒤 다시 시도해 주세요."); }
    }, 25000);
    async function generate() {
      try {
        const source = latest.current;
        const entries = await loadBookPortfolioEntries({ ...source, participantUid: source.participant.uid, signal: controller.signal });
        const model = buildBookPortfolio({ project: source.project, participant: source.participant, className: source.className, entries, generatedAt: new Date() });
        const prepared = await prepareBookPortfolio(model, { signal: controller.signal });
        if (!live || controller.signal.aborted) return;
        setResult({ ...prepared, html: renderBookPortfolioHtml(prepared.model) });
        setStatus("ready");
      } catch (failure) {
        if (!live || controller.signal.aborted) return;
        setStatus("failed");
        setError(failure?.code === "permission-denied"
          ? "이 학생 기록을 볼 권한이 없어요. 차시와 로그인 상태를 확인해 주세요."
          : "저장된 활동 내용을 불러오지 못했어요. 다시 시도해 주세요.");
      } finally { clearTimeout(timer); }
    }
    void generate();
    return () => { live = false; controller.abort(); clearTimeout(timer); };
  }, [attempt]);

  function downloadHtml() {
    if (!result || status !== "ready") return;
    let url;
    try {
      url = URL.createObjectURL(new Blob([result.html], { type: "text/html;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = portfolioFilename(result.model);
      document.body.append(anchor); anchor.click(); anchor.remove();
      setError("");
    } catch { setError("HTML 파일을 만들지 못했어요. 다시 시도해 주세요."); }
    finally { if (url) setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }

  function printPdf() {
    if (!frameReady || !result) return;
    try { frame.current.contentWindow.focus(); frame.current.contentWindow.print(); setError(""); }
    catch { setError("PDF 저장 창을 열지 못했어요. HTML을 내려받아 브라우저에서 인쇄해 주세요."); }
  }

  async function loadedFrame() {
    const target = frame.current;
    const document = target?.contentDocument;
    if (!document) return;
    await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
    if (frame.current !== target) return;
    // Keyboard events in the static frame do not bubble to the surrounding dialog.
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); close.current(); }
      if (event.key === "Tab") {
        const links = [...document.querySelectorAll("a[href]")];
        if ((!event.shiftKey && document.activeElement === links.at(-1)) || !links.length) {
          event.preventDefault(); modal.current?.querySelector("button:not(:disabled)")?.focus();
        } else if (event.shiftKey && document.activeElement === links[0]) {
          event.preventDefault(); modal.current?.querySelector("[data-print]")?.focus();
        }
      }
    });
    document.addEventListener("scroll", () => presentationRef.current.scroll(portfolioScrollPosition(document)), { passive: true });
    setFrameReady(true);
  }

  async function reload() {
    if (await presentation.stop()) setAttempt(value => value + 1);
  }

  async function present() {
    if (await presentation.start(result.html)) presentationRef.current.scroll(portfolioScrollPosition(frame.current?.contentDocument));
  }

  const ready = status === "ready" && Boolean(result);
  return createPortal(<div className="modal-backdrop book-portfolio-backdrop" {...backdropClose(() => close.current())}>
    <section ref={modal} tabIndex={-1} className="modal book-portfolio-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="book-portfolio-head">
        <div><small>{participant.name || participant.realName || participant.displayName} · {className}</small><h2 id={titleId}>학생별 차시 보고서</h2></div>
        <button type="button" className="btn-close" aria-label="차시 보고서 닫기" disabled={presentation.busy} onClick={() => close.current()}>×</button>
      </header>
      <div className="book-portfolio-toolbar">
        <button type="button" className="btn-outline" disabled={status === "loading" || presentation.busy} onClick={reload}>다시 불러오기</button>
        <button type="button" className="btn-primary" disabled={!ready} onClick={downloadHtml}>HTML 내려받기</button>
        <button type="button" className="btn-outline" data-print disabled={!ready || !frameReady} onClick={printPdf}>PDF로 저장</button>
        {presentation.allowed && <button type="button" className={presentation.active ? "btn-outline book-portfolio-stop" : "btn-primary"}
          disabled={!ready || !frameReady || presentation.busy} aria-busy={presentation.busy} onClick={presentation.active ? presentation.stop : present}>
          {presentation.busy ? "처리 중..." : presentation.active ? "발표 종료" : "발표 모드"}
        </button>}
      </div>
      <div className="book-portfolio-notes">
        {presentation.allowed && <p className="book-portfolio-announcement" role="status">{presentation.active ? `현재 ${className}의 학생들에게 이 포트폴리오를 공개하고 있어요. 스크롤도 함께 이동합니다.` : "발표 모드를 누르면 같은 차시의 학생 모두에게 이 포트폴리오를 보여줍니다."}</p>}
        {presentation.error && <p className="form-error" role="alert">{presentation.error} <button type="button" className="btn-outline" disabled={presentation.busy} onClick={presentation.retry}>다시 시도</button></p>}
        <p>선택한 차시의 모든 STEP에서 이 학생이 저장한 답변·URL·캡처를 모읍니다. 다른 차시의 기록과 저장하지 않은 내용은 포함하지 않습니다.</p>
        <p>PDF는 인쇄 창에서 ‘PDF로 저장’을 선택하세요. 파일에는 이름과 작성 내용이 포함됩니다.</p>
        {result?.missingImages?.length > 0 && <p role="status">캡처 {result.missingImages.length}장을 불러오지 못해 문서에 누락 표시를 남겼어요. 연결을 확인하고 다시 불러올 수 있어요.</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <div className="book-portfolio-preview" aria-busy={status === "loading"}>
        {status === "loading" && <p className="book-portfolio-state" role="status">이 차시의 저장된 기록으로 보고서를 만드는 중...</p>}
        {status === "failed" && <div className="book-portfolio-state"><p>기록을 불러오지 못했어요.</p><button type="button" className="btn-primary" onClick={() => setAttempt(value => value + 1)}>다시 시도</button></div>}
        {ready && <iframe key={attempt} ref={frame} title="학생별 차시 보고서 미리보기" srcDoc={result.html}
          sandbox="allow-same-origin allow-modals allow-popups allow-popups-to-escape-sandbox" onLoad={loadedFrame} />}
      </div>
    </section>
  </div>, document.body);
}
