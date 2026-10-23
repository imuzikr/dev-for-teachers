"use client";

import { useEffect, useRef } from "react";

function LessonItemWheel({ section, onSelect, itemKey, completed }) {
  const viewportRef = useRef(null);
  const frameRef = useRef(null);
  const identity = section.items.map(item => `${item.kind}:${item.id}`).join("|");

  function centerCard(row, smooth = true) {
    const viewport = viewportRef.current;
    if (!viewport || !row) return;
    viewport.scrollTo({
      top: row.offsetTop + row.offsetHeight / 2 - viewport.clientHeight / 2,
      behavior: smooth && !window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "instant",
    });
  }

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    function paint() {
      frameRef.current = null;
      const middle = viewport.scrollTop + viewport.clientHeight / 2;
      viewport.querySelectorAll(".classroom-wheel-slot").forEach(row => {
        const distance = Math.max(-2, Math.min(2, (row.offsetTop + row.offsetHeight / 2 - middle) / 128));
        row.style.setProperty("--wheel-tilt", `${-distance * 26}deg`);
        row.style.setProperty("--wheel-scale", String(1 - Math.abs(distance) * 0.1));
        row.style.setProperty("--wheel-opacity", String(1 - Math.abs(distance) * 0.2));
      });
    }
    function schedulePaint() {
      if (frameRef.current === null) frameRef.current = requestAnimationFrame(paint);
    }
    viewport.addEventListener("scroll", schedulePaint, { passive: true });
    const observer = new ResizeObserver(schedulePaint);
    observer.observe(viewport);
    paint();
    return () => {
      viewport.removeEventListener("scroll", schedulePaint);
      observer.disconnect();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [section.id, identity]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const rows = [...viewport.querySelectorAll(".classroom-wheel-slot")];
    centerCard(rows.find(row => row.dataset.itemKey === itemKey) ?? rows[0], false);
  }, [section.id, identity, itemKey]);

  return <div className="classroom-item-wheel" ref={viewportRef} role="region" aria-label="휠로 탐색하는 활동과 자료 목록">
    {section.items.map((item, itemIndex) => {
      const key = `${item.kind}:${item.id}`;
      return <div className="classroom-wheel-slot" data-item-key={key} key={key}>
        <button type="button" className={`classroom-overview-row${itemKey === key ? " is-selected" : ""}`} aria-current={itemKey === key ? "page" : undefined}
          onFocus={event => centerCard(event.currentTarget.parentElement)}
          onKeyDown={event => {
            const rows = [...viewportRef.current.querySelectorAll(".classroom-wheel-slot")];
            const next = { ArrowUp: itemIndex - 1, ArrowDown: itemIndex + 1, Home: 0, End: rows.length - 1 }[event.key];
            if (next === undefined) return;
            event.preventDefault(); rows[next]?.querySelector("button")?.focus({ preventScroll: true });
          }}
          onClick={() => onSelect(section.id, key)}>
          <span>{String(itemIndex + 1).padStart(2, "0")}</span><strong>{item.title}</strong>
          <small>{item.kind === "resource" ? "자료" : "활동"}{completed.has(key) && <span className="classroom-overview-done">확인 완료</span>}</small>
          <span aria-hidden="true">→</span>
        </button>
      </div>;
    })}
  </div>;
}

export default function ClassroomLessonOverview({ section, index, onSelect, renderAddItem, itemKey, completed = new Set() }) {
  if (!section) return <div className="classroom-empty">선생님이 수업을 준비하고 있습니다.</div>;
  return <article className="classroom-lesson-overview">
    <header className="classroom-lesson-banner"><small>STEP {index + 1}</small><h2>{section.title}</h2><p>이 차시의 목표와 진행 순서</p></header>
    <section className="classroom-step-description" aria-label="STEP 안내"><h3>학습 안내</h3>{section.description ? <p>{section.description}</p> : <p className="classroom-muted">아래 활동과 자료를 순서대로 살펴보세요.</p>}</section>
    <section className="classroom-overview-items"><h3>진행 순서</h3>
      {section.items.length === 0 && <p className="classroom-muted">등록된 활동이나 자료가 없습니다.</p>}
      {section.items.length > 0 && <>
        <p className="classroom-wheel-hint">휠로 위아래 탐색 · 카드를 클릭하면 내용 보기</p>
        <LessonItemWheel section={section} onSelect={onSelect} itemKey={itemKey} completed={completed} />
      </>}
      {renderAddItem?.(section.id)}
    </section>
  </article>;
}
