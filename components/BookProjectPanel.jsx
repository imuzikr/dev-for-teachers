"use client";

import { useState } from "react";
import { IconAddFeature, IconBook, IconTrash } from "./StatusIcons";

function newStep(index) {
  return { id: crypto.randomUUID(), title: `Step ${index + 1}`, activities: [], resources: [] };
}

function newItem() {
  return { id: crypto.randomUUID(), title: "", topic: "", url: "" };
}

export default function BookProjectPanel({ project, editing, saving, onSave, onOpen, onDelete }) {
  const [title, setTitle] = useState("");
  const [steps, setSteps] = useState([]);
  const [openIds, setOpenIds] = useState(new Set());

  function updateStep(stepId, patch) {
    setSteps((current) => current.map((step) => step.id === stepId ? { ...step, ...patch } : step));
  }

  function addStep() {
    const step = newStep(steps.length);
    setSteps((current) => [...current, step]);
    setOpenIds((current) => new Set(current).add(step.id));
  }

  function addItem(stepId, key) {
    const step = steps.find((item) => item.id === stepId);
    if (!step) return;
    updateStep(stepId, { [key]: [...step[key], newItem()] });
  }

  function updateItem(stepId, key, itemId, patch) {
    const step = steps.find((item) => item.id === stepId);
    if (!step) return;
    updateStep(stepId, {
      [key]: step[key].map((item) => item.id === itemId ? { ...item, ...patch } : item),
    });
  }

  function removeItem(stepId, key, itemId) {
    const step = steps.find((item) => item.id === stepId);
    if (!step) return;
    updateStep(stepId, { [key]: step[key].filter((item) => item.id !== itemId) });
  }

  function toggleStep(stepId) {
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  }

  if (editing) {
    return (
      <div className="book-project-editor">
        <button
          type="button"
          className="btn-primary book-project-save"
          disabled={saving || !title.trim() || steps.length === 0}
          onClick={() => onSave({ title: title.trim(), steps })}
        >
          {saving ? "저장 중..." : "프로젝트 저장"}
        </button>
        <label className="book-project-title-field">
          <span>프로젝트 이름</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="예: 우리 동네 생태 탐구" />
        </label>
        <div className="book-project-steps">
          {steps.map((step, index) => {
            const open = openIds.has(step.id);
            return (
              <article className="book-step-card" key={step.id}>
                <button type="button" className="book-step-toggle" onClick={() => toggleStep(step.id)} aria-expanded={open}>
                  <span>Step {index + 1}</span>
                  <strong>{step.title}</strong>
                  <small>{step.activities.length}개 활동 · {step.resources.length}개 자료</small>
                  <i aria-hidden="true">{open ? "−" : "+"}</i>
                </button>
                {open && (
                  <div className="book-step-body">
                    <input value={step.title} onChange={(event) => updateStep(step.id, { title: event.target.value })} aria-label={`Step ${index + 1} 이름`} />
                    <ProjectItems label="활동" items={step.activities} onAdd={() => addItem(step.id, "activities")} onChange={(id, patch) => updateItem(step.id, "activities", id, patch)} onRemove={(id) => removeItem(step.id, "activities", id)} />
                    <ProjectItems label="자료" items={step.resources} resource onAdd={() => addItem(step.id, "resources")} onChange={(id, patch) => updateItem(step.id, "resources", id, patch)} onRemove={(id) => removeItem(step.id, "resources", id)} />
                  </div>
                )}
              </article>
            );
          })}
        </div>
        <button type="button" className="btn-outline book-step-add" onClick={addStep}>
          <IconAddFeature size={17} /> Step 추가
        </button>
      </div>
    );
  }

  if (!project) return <div className="book-library-empty">오른쪽 위의 프로젝트 만들기 버튼으로 수업 흐름을 준비하세요.</div>;

  return (
    <div className="book-project-view">
      <header><strong>{project.title}</strong><small>{project.steps?.length ?? 0} Steps</small></header>
      {(project.steps ?? []).map((step, index) => (
        <details className="book-step-card" key={step.id} open={index === 0}>
          <summary><span>Step {index + 1}</span><strong>{step.title}</strong><small>{step.activities.length}개 활동 · {step.resources.length}개 자료</small></summary>
          <div className="book-step-content">
            {step.activities.map((activity) => (
              <div className="book-project-item" key={activity.id}>
                <button type="button" onClick={() => onOpen(activity)}><IconBook size={17} /><span>{activity.title}</span></button>
                {onDelete && <button type="button" className="btn-ghost role-danger-btn" title="활동 삭제" onClick={() => onDelete(activity)}><IconTrash size={14} /></button>}
              </div>
            ))}
            {step.resources.map((resource) => (
              <a className="book-project-resource" key={resource.id} href={resource.url} target="_blank" rel="noreferrer"><span>자료</span><strong>{resource.title}</strong></a>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

function ProjectItems({ label, items, resource = false, onAdd, onChange, onRemove }) {
  return (
    <section className="book-step-items">
      <div className="book-step-items-head"><strong>{label}</strong><button type="button" className="btn-ghost" onClick={onAdd}>+ {label} 추가</button></div>
      {items.map((item, index) => (
        <div className="book-step-item-edit" key={item.id}>
          <input value={item.title} onChange={(event) => onChange(item.id, { title: event.target.value })} placeholder={`${label} ${index + 1} 이름`} />
          {resource ? <input value={item.url} onChange={(event) => onChange(item.id, { url: event.target.value })} placeholder="https:// 자료 주소" type="url" /> : <input value={item.topic} onChange={(event) => onChange(item.id, { topic: event.target.value })} placeholder="활동 주제" />}
          <button type="button" className="btn-ghost role-danger-btn" title={`${label} 삭제`} onClick={() => onRemove(item.id)}><IconTrash size={14} /></button>
        </div>
      ))}
    </section>
  );
}
