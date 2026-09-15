"use client";

import { useEffect, useRef, useState } from "react";
import { backdropClose } from "@/lib/modal";
import { downloadLessonSelection } from "@/lib/lessonDownloads";

export default function LessonDownloadsModal({ files, className, onClose }) {
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const running = useRef(false);
  const controller = useRef(null);
  const modal = useRef(null);
  const chosen = files.filter(file => selected.has(file.id));
  useEffect(() => {
    const previous = document.activeElement;
    modal.current?.querySelector("button")?.focus();
    return () => { controller.current?.abort(); previous?.focus?.(); };
  }, []);
  function toggle(id, checked) {
    setSelected(current => { const next = new Set(current); if (checked) next.add(id); else next.delete(id); return next; });
  }
  function close() { if (!running.current) onClose(); }
  async function download(items) {
    if (!items.length || running.current) return;
    running.current = true; setBusy(true); setError("");
    controller.current = new AbortController();
    try { await downloadLessonSelection(items, { className, signal: controller.current.signal, onProgress: setStatus }); }
    catch (reason) { if (reason.name !== "AbortError") setError(reason.message || "파일을 내려받지 못했습니다. 다시 시도해 주세요."); }
    finally { running.current = false; setBusy(false); setStatus(""); }
  }
  function keyboard(event) {
    if (event.key === "Escape") { event.stopPropagation(); close(); }
    if (event.key !== "Tab") return;
    const controls = [...modal.current.querySelectorAll("button:not(:disabled), input:not(:disabled)")];
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  return <div className="modal-backdrop" {...backdropClose(close)} onKeyDown={keyboard}>
    <section ref={modal} className="modal modal-lesson lesson-file-manager" role="dialog" aria-modal="true" aria-labelledby="lesson-downloads-title">
      <div className="modal-head"><h3 id="lesson-downloads-title">자료 내려받기</h3><button type="button" className="btn-close" aria-label="닫기" disabled={busy} onClick={close}>×</button></div>
      <div className="lesson-distribution-toolbar"><strong>{className}</strong><button type="button" className="btn-primary" disabled={busy || !chosen.length} onClick={() => download(chosen)}>선택 내려받기 ({chosen.length})</button></div>
      {files.length > 0 && <label className="lesson-download-select-all"><input type="checkbox" checked={chosen.length === files.length} disabled={busy} onChange={event => setSelected(event.target.checked ? new Set(files.map(file => file.id)) : new Set())} /> 전체 선택</label>}
      {status && <p role="status" className="lesson-file-notice">{status}</p>}
      {error && <p role="alert" className="lesson-error">{error}</p>}
      <div className="lesson-list">{files.length === 0 ? <p className="empty-note">현재 배포된 자료가 없습니다.</p> : files.map(file => <div key={file.id} className="lesson-row lesson-file-row">
        <label className="lesson-file-identity"><input type="checkbox" checked={selected.has(file.id)} disabled={busy} onChange={event => toggle(file.id, event.target.checked)} aria-label={file.name + " 선택"} />
          <span className="lesson-row-main"><strong>{file.name}</strong><span>{file.extension.toUpperCase()} · {Math.max(1, Math.ceil(file.size / 1024))} KB</span></span>
        </label>
        <div className="lesson-row-actions"><button type="button" className="btn-outline" disabled={busy} onClick={() => download([file])}>다운로드</button></div>
      </div>)}</div>
    </section>
  </div>;
}
