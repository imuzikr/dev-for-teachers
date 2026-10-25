"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { backdropClose } from "@/lib/modal";

export default function BookStepAddModal({ classes = [], currentClassId, loadProject, onCreate, onImport, onClose }) {
  const [mode, setMode] = useState("choice");
  const [classId, setClassId] = useState("");
  const [stepId, setStepId] = useState("");
  const [source, setSource] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const dialog = useRef(null);
  const titleId = useId();
  const candidates = classes.filter(item => item.id !== currentClassId && !item.archived);
  const selectedClassId = candidates.some(item => item.id === classId) ? classId : "";

  useEffect(() => {
    let active = true;
    setSource(null); setStepId(""); setError("");
    if (!selectedClassId || mode !== "import" || !loadProject) { setLoading(false); return; }
    setLoading(true);
    Promise.resolve().then(() => loadProject(selectedClassId)).then(project => {
      if (!active) return;
      setSource(project);
      if (!project?.steps?.length) setError("이 강좌에는 가져올 STEP이 없습니다.");
    }).catch(() => {
      if (active) setError("강좌를 불러오지 못했습니다. 다시 시도해 주세요.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedClassId, mode, loadProject, retry]);

  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector("button:not(:disabled)")?.focus();
    function keydown(event) {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); onClose(); }
      if (event.key !== "Tab") return;
      const controls = [...dialog.current.querySelectorAll('button:not(:disabled), select:not(:disabled)')];
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener("keydown", keydown, true);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", keydown, true);
      if (previous?.isConnected) previous.focus();
    };
  }, [mode, onClose]);

  const selectedStep = source?.steps?.find(step => step.id === stepId);
  return createPortal(<div className="modal-backdrop book-step-add-backdrop" {...backdropClose(onClose)}>
    <section ref={dialog} className="modal book-step-add-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="modal-head"><h3 id={titleId}>{mode === "choice" ? "STEP 추가" : "다른 강좌에서 가지고 오기"}</h3><button type="button" className="btn-close" aria-label="STEP 추가 닫기" onClick={onClose}>×</button></header>
      {mode === "choice" ? <div className="book-step-add-options">
        <button type="button" className="btn-outline" onClick={onCreate}><strong>새로 만들기</strong><span>빈 STEP을 추가하고 내용을 작성합니다.</span></button>
        <button type="button" className="btn-outline" onClick={() => setMode("import")}><strong>다른 강좌에서 가지고 오기</strong><span>강좌와 STEP을 선택해 활동·자료를 함께 복사합니다.</span></button>
      </div> : <div className="book-step-import-fields">
        <label><strong>1. 강좌 선택</strong><select value={selectedClassId} disabled={!loadProject || !candidates.length} onChange={event => { setClassId(event.target.value); setSource(null); setStepId(""); }}><option value="">강좌를 선택해 주세요</option>{candidates.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        {(!loadProject || !candidates.length) && <p>가져올 수 있는 다른 강좌가 없습니다.</p>}
        {loading && <p role="status">강좌의 STEP을 불러오는 중...</p>}
        {error && <div><p className="form-error" role="alert">{error}</p>{!source && <button type="button" className="btn-outline" onClick={() => setRetry(value => value + 1)}>다시 시도</button>}</div>}
        <label><strong>2. STEP 선택</strong><select value={stepId} disabled={loading || !source?.steps?.length} onChange={event => setStepId(event.target.value)}><option value="">STEP을 선택해 주세요</option>{source?.steps?.map((step, index) => <option key={step.id} value={step.id}>STEP {index + 1}. {step.title}</option>)}</select></label>
        {selectedStep && <p className="book-step-import-summary">{selectedStep.title} · {selectedStep.activities?.length ?? 0} 활동 · {selectedStep.resources?.length ?? 0} 자료</p>}
        <p>선택한 STEP을 현재 프로젝트의 마지막에 복사합니다. 프로젝트를 저장하면 반영됩니다.</p>
        <footer className="book-step-add-footer"><button type="button" className="btn-outline" onClick={() => setMode("choice")}>이전</button><button type="button" className="btn-primary" disabled={loading || !selectedStep || !selectedClassId} onClick={() => {
          try { onImport(selectedStep); } catch (failure) { setError(failure.message || "STEP을 가져오지 못했습니다."); }
        }}>STEP 가져오기</button></footer>
      </div>}
    </section>
  </div>, document.body);
}
