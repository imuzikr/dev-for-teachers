"use client";

import { useEffect, useId, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { backdropClose } from "@/lib/modal";
import { progressItems, STUDENT_PROGRESS_COLORS } from "./bookProgressItems";

export default function BookClassProgressModal({ className, participants, sections, progressByUser, onClose }) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const items = useMemo(() => progressItems(sections), [sections]);
  const rows = useMemo(() => sections.map((section, index) => ({
    ...section,
    cells: items.filter((item) => item.sectionIndex === index),
  })), [items, sections]);
  const students = useMemo(() => participants.map((participant, index) => {
    const completed = progressByUser.get(participant.uid) ?? new Set();
    const checkedItems = items.filter((item) => completed.has(item.key));
    return {
      ...participant,
      color: STUDENT_PROGRESS_COLORS[index % STUDENT_PROGRESS_COLORS.length],
      label: participant.realName || participant.displayName || participant.name || "이름 미설정",
      completed,
      count: checkedItems.length,
      lastKey: checkedItems.at(-1)?.key,
    };
  }), [participants, progressByUser, items]);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector("button")?.focus();
    function handleKey(event) {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const controls = dialogRef.current?.querySelectorAll('button, [tabindex="0"]');
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="modal-backdrop book-class-progress-backdrop" {...backdropClose(onClose)}>
      <section ref={dialogRef} className="modal book-class-progress-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(event) => event.stopPropagation()}>
        <header className="book-class-progress-head">
          <div><h2 id={titleId}>전체 진행률</h2><p>{className}{className ? " · " : ""}{students.length}명 · {sections.length} Steps</p></div>
          <button type="button" className="btn-close" aria-label="닫기" onClick={onClose}>×</button>
        </header>
        <div className="book-class-progress-legend" aria-label="확인 상태 범례">
          <span><i className="book-score-cell is-filled" />확인함</span>
          <span><i className="book-score-cell" />미확인</span>
          <span><i className="book-score-cell is-locked" />잠김</span>
        </div>
        {students.length === 0 || rows.length === 0 ? (
          <p className="book-class-progress-empty">{students.length === 0 ? "참여한 학생이 없습니다." : "등록된 Step이 없습니다."}</p>
        ) : (
          <div className="book-class-progress-scroll" tabIndex={0} role="region" aria-label="Step별 학생 진행률">
            <table className="book-class-progress-table">
              <caption className="sr-only">학생별 활동과 자료 확인 상태</caption>
              <thead><tr>
                <th scope="col">활동 · 자료</th>
                {students.map((student, index) => <th scope="col" key={student.uid} style={{ "--student-progress-color": student.color }} title={`${student.label} · ${student.count}/${items.length}`} aria-label={`${student.label} · ${student.count}/${items.length}`}>
                  {index + 1}
                </th>)}
              </tr></thead>
              {rows.map((row, rowIndex) => <tbody key={row.id}>
                {row.cells.length === 0 ? <tr><th scope="row"><small>STEP {rowIndex + 1}</small><strong>{row.title}</strong></th><td colSpan={students.length}>등록된 항목 없음</td></tr> : row.cells.map((item, itemIndex) => {
                  const locked = item.source?.locked === true;
                  const count = students.filter((student) => student.completed.has(item.key)).length;
                  return <tr key={item.key} className={itemIndex === 0 ? "is-step-start" : undefined}>
                    <th scope="row" title={`${row.title} · ${item.title}`}>
                      {itemIndex === 0 && <small>STEP {rowIndex + 1} · {row.title}</small>}
                      <div className="book-score-row-meta"><span>{item.kind === "activity" ? "활동" : "자료"} {item.itemIndex + 1}</span><span>{count}/{students.length}</span></div>
                      <strong>{item.title}</strong>
                    </th>
                    {students.map((student) => {
                      const checked = student.completed.has(item.key);
                      const latest = item.key === student.lastKey;
                      const label = `${student.label} · ${item.title} · ${checked ? "확인함" : "미확인"}${locked ? " · 잠김" : ""}${latest ? " · 마지막 완료" : ""}`;
                      return <td key={student.uid} style={{ "--student-progress-color": student.color }}><span role="img" className={`book-score-cell${checked ? " is-filled" : ""}${locked ? " is-locked" : ""}`} title={label} aria-label={label}>{latest && <span className="book-score-latest" aria-hidden="true" />}</span></td>;
                    })}
                  </tr>;
                })}
              </tbody>)}
            </table>
          </div>
        )}
      </section>
    </div>, document.body,
  );
}
