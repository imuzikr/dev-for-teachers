"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { restoreBookTrash, subscribeBookTrash } from "@/lib/store";
import { isTeacher } from "@/lib/user";
import { backdropClose } from "@/lib/modal";
import { IconTrash } from "./StatusIcons";

const labels = { project: "프로젝트", step: "Step", activity: "활동", resource: "자료" };

function deletedDate(value) {
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("ko-KR") : "방금";
}

export default function BookProjectTrash({
  user, classId, disabled = false, onRestored,
  subscribe = subscribeBookTrash, restore = restoreBookTrash,
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState("");
  const busy = useRef(false);
  const alive = useRef(true);
  const modal = useRef(null);
  const trigger = useRef(null);
  const allowed = isTeacher(user) && Boolean(user?.uid && classId);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    if (!open || !allowed) return;
    let active = true;
    setItems([]);
    setLoading(true);
    setError("");
    setLoadError(false);
    const unsubscribe = subscribe(classId, next => {
      if (!active) return;
      setItems(next);
      setLoading(false);
      setLoadError(false);
    }, () => {
      if (!active) return;
      setLoading(false);
      setLoadError(true);
      setError("휴지통을 불러오지 못했어요. 다시 시도해 주세요.");
    });
    return () => { active = false; unsubscribe?.(); };
  }, [open, allowed, classId, subscribe, attempt]);

  useEffect(() => {
    if (!open || !allowed) return;
    const previous = trigger.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    modal.current?.focus();
    function keydown(event) {
      if (event.key === "Escape" && !busy.current) {
        event.preventDefault();
        setOpen(false);
      }
      if (event.key !== "Tab") return;
      const buttons = [...(modal.current?.querySelectorAll("button:not(:disabled)") ?? [])];
      const first = buttons[0], last = buttons.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === modal.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", keydown);
      if (previous?.isConnected) previous.focus();
    };
  }, [open, allowed]);

  async function restoreItem(item) {
    if (busy.current || disabled || !allowed) return;
    busy.current = true;
    setPending(item.id);
    setError("");
    try {
      await restore(user, { classId, trashId: item.id });
      if (alive.current) {
        modal.current?.focus();
        onRestored?.(`${labels[item.kind] || "항목"}을 복원했어요.`);
      }
    } catch (failure) {
      if (alive.current) setError(failure instanceof Error ? failure.message : "복원하지 못했어요. 다시 시도해 주세요.");
    } finally {
      busy.current = false;
      if (alive.current) setPending("");
    }
  }

  if (!allowed) return null;
  return <div className="book-project-trash-footer">
    <button ref={trigger} type="button" className="btn-outline book-project-trash-trigger" aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <IconTrash size={18} /> 휴지통
    </button>
    {open && typeof document !== "undefined" && createPortal(
      <div className="modal-backdrop" {...backdropClose(() => { if (!busy.current) setOpen(false); })}>
        <section ref={modal} tabIndex={-1} className="modal book-project-trash-modal" role="dialog" aria-modal="true" aria-labelledby="book-trash-title" onClick={event => event.stopPropagation()}>
          <header className="modal-head">
            <div><span>현재 반의 삭제한 항목</span><h3 id="book-trash-title">휴지통</h3></div>
            <button type="button" className="btn-close" aria-label="닫기" disabled={Boolean(pending)} onClick={() => setOpen(false)}>×</button>
          </header>
          <p className="book-project-trash-help">삭제한 프로젝트와 활동·자료를 복원할 수 있어요. 학생이 작성한 내용과 확인 기록도 함께 보관됩니다.</p>
          <div className="book-project-trash-body" aria-busy={loading}>
            {loading ? <p role="status">휴지통을 불러오는 중...</p> : loadError ? null : items.length === 0 ? <p className="book-project-trash-empty">휴지통이 비어 있어요.</p> :
              <ul className="book-project-trash-list">
                {items.map(item => <li key={item.id}>
                  <div>
                    <span className="book-project-trash-kind">{labels[item.kind] || "항목"}</span>
                    <strong>{item.title || "제목 없는 항목"}</strong>
                    <small>{item.projectTitle} · {deletedDate(item.deletedAt)}</small>
                  </div>
                  <button type="button" className="btn-outline" disabled={Boolean(pending) || disabled} aria-label={`${item.title || "항목"} 복원`} onClick={() => restoreItem(item)}>{pending === item.id ? "복원 중..." : "복원"}</button>
                </li>)}
              </ul>}
          </div>
          {error && <p className="book-item-images-error" role="alert">{error}</p>}
          {loadError && <button type="button" className="btn-outline" onClick={() => setAttempt(value => value + 1)}>다시 불러오기</button>}
          <footer className="book-project-trash-actions"><button type="button" className="btn-outline" disabled={Boolean(pending)} onClick={() => setOpen(false)}>닫기</button></footer>
        </section>
      </div>, document.body)}
  </div>;
}
