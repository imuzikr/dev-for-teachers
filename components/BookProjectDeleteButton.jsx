"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { archiveBookProject } from "@/lib/store";

import ConfirmModal from "./ConfirmModal";
import { IconTrash } from "./StatusIcons";

export default function BookProjectDeleteButton({ user, project, disabled, onDeleted, onPendingChange, removeProject = archiveBookProject }) {
  const [target, setTarget] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const modalRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!target) return;
    const previous = triggerRef.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function keydown(event) {
      if (event.key === "Escape" && !busy.current) { event.preventDefault(); close(); }
      if (event.key !== "Tab") return;
      const buttons = [...(modalRef.current?.querySelectorAll("button:not(:disabled)") ?? [])];
      if (!buttons.length) { event.preventDefault(); return; }
      const first = buttons[0];
      const last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", keydown);
      if (previous?.isConnected) previous.focus();
    };
  }, [target]);

  function close() {
    if (!busy.current) { setTarget(null); setError(""); }
  }

  async function confirm() {
    if (busy.current || !target) return;
    busy.current = true;
    setPending(true);
    onPendingChange?.(true);
    setError("");
    try {
      await removeProject(user, { classId: target.classId || target.id, version: target.version });
      setTarget(null);
      onDeleted?.();
    } catch (failure) {
      console.error("[책방] 프로젝트 삭제 실패:", failure);
      setError(failure?.code === "book-project/stale" ? failure.message : "휴지통으로 옮기지 못했어요. 다시 시도해 주세요.");
    } finally {
      busy.current = false;
      setPending(false);
      onPendingChange?.(false);
    }
  }

  return <>
    <button ref={triggerRef} type="button" className="btn-ghost book-project-delete" disabled={disabled || pending} onClick={() => { setTarget(project); setError(""); }}>
      <IconTrash size={16} /> 프로젝트 삭제
    </button>
    {target && createPortal(<div ref={modalRef}><ConfirmModal
      title="프로젝트 삭제" preview={target.title} danger
      description={<>이 프로젝트의 모든 Step, 활동, 자료를 휴지통으로 옮깁니다. 학생 작성·확인 기록은 보관되며 휴지통에서 복원할 수 있어요. 반과 참여자 명단은 유지됩니다.
        {error && <><br /><span className="form-error" role="alert">{error}</span></>}
      </>}
      confirmLabel={pending ? "삭제 중..." : error ? "다시 시도" : "삭제"}
      confirmDisabled={pending} cancelDisabled={pending} onConfirm={confirm} onClose={close}
    /></div>, document.body)}
  </>;
}
