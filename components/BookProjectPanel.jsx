"use client";

import { useState } from "react";
import { IconAddFeature, IconBook, IconTrash } from "./StatusIcons";

function newStep(index) {
  return { id: crypto.randomUUID(), title: `Step ${index + 1}`, activities: [], resources: [] };
}

function newItem() {
  return { id: crypto.randomUUID(), title: "", topic: "", content: "", url: "" };
}

function initialDraft(project, appendStep) {
  const existingSteps = (project?.steps ?? []).map((step) => ({
    ...step,
    activities: (step.activities ?? []).map((activity) => ({ ...activity })),
    resources: (step.resources ?? []).map((resource) => ({ ...resource })),
  }));
  const steps = appendStep ? [...existingSteps, newStep(existingSteps.length)] : existingSteps;
  return {
    title: project?.title ?? "",
    steps,
    openIds: new Set(appendStep && steps.length > 0 ? [steps.at(-1).id] : steps.slice(0, 1).map((step) => step.id)),
  };
}

export default function BookProjectPanel({ project, editing, appendStep, saving, onSave, onEdit, onOpen, onDelete }) {
  const [draft] = useState(() => initialDraft(project, appendStep));
  const [title, setTitle] = useState(draft.title);
  const [steps, setSteps] = useState(draft.steps);
  const [openIds, setOpenIds] = useState(draft.openIds);

  function updateStep(stepId, patch) {
    setSteps((current) => current.map((step) => step.id === stepId ? { ...step, ...patch } : step));
  }

  function addStep() {
    const step = newStep(steps.length);
    setSteps((current) => [...current, step]);
    setOpenIds((current) => new Set(current).add(step.id));
  }

  function removeStep(stepId) {
    setSteps((current) => current.filter((step) => step.id !== stepId));
    setOpenIds((current) => {
      const next = new Set(current);
      next.delete(stepId);
      return next;
    });
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
                <header className="book-step-edit-head">
                  <span>Step {index + 1}</span>
                  <input
                    value={step.title}
                    onChange={(event) => updateStep(step.id, { title: event.target.value })}
                    aria-label={`Step ${index + 1} 제목`}
                  />
                  <small>{step.activities.length}개 활동 · {step.resources.length}개 자료</small>
                  <button type="button" className="book-step-remove" onClick={() => removeStep(step.id)} aria-label={`Step ${index + 1} 삭제`} title="Step 삭제">
                    <IconTrash size={15} />
                  </button>
                  <button type="button" className="book-step-collapse" onClick={() => toggleStep(step.id)} aria-expanded={open} aria-label={`Step ${index + 1} ${open ? "접기" : "펼치기"}`}>
                    <span aria-hidden="true">{open ? "−" : "+"}</span>
                  </button>
                </header>
                {open && (
                  <div className="book-step-body">
                    {step.activities.length > 0 && <ProjectItems label="활동" items={step.activities} onChange={(id, patch) => updateItem(step.id, "activities", id, patch)} onRemove={(id) => removeItem(step.id, "activities", id)} />}
                    {step.resources.length > 0 && <ProjectItems label="자료" items={step.resources} resource onChange={(id, patch) => updateItem(step.id, "resources", id, patch)} onRemove={(id) => removeItem(step.id, "resources", id)} />}
                    <div className="book-step-add-actions">
                      <button type="button" className="btn-ghost" onClick={() => addItem(step.id, "activities")}>+ 활동 추가</button>
                      <button type="button" className="btn-ghost" onClick={() => addItem(step.id, "resources")}>+ 자료 추가</button>
                    </div>
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
      <header>
        <span><strong>{project.title}</strong><small>{project.steps?.length ?? 0} Steps</small></span>
        {onEdit && <button type="button" className="btn-ghost book-project-edit" onClick={() => onEdit(false)}>프로젝트 편집</button>}
      </header>
      {(project.steps ?? []).map((step, index) => (
        <details className="book-step-card" key={step.id} open={index === 0}>
          <summary><span>Step {index + 1}</span><strong>{step.title}</strong><small>{step.activities.length}개 활동 · {step.resources.length}개 자료</small></summary>
          <div className="book-step-content">
            <ProjectSection title="활동" empty="등록된 활동이 없습니다.">
              {step.activities.map((activity) => (
                <div className="book-project-item" key={activity.id}>
                  <button type="button" onClick={() => onOpen(activity)}><IconBook size={17} /><span>{activity.title}</span></button>
                  {onDelete && <button type="button" className="btn-ghost role-danger-btn" title="활동 삭제" onClick={() => onDelete(activity)}><IconTrash size={14} /></button>}
                </div>
              ))}
            </ProjectSection>
            <ProjectSection title="자료" empty="등록된 자료가 없습니다.">
              {step.resources.map((resource) => resource.url ? (
                <a className="book-project-resource" key={resource.id} href={resource.url} target="_blank" rel="noreferrer"><span className="book-project-resource-copy"><strong>{resource.title}</strong>{resource.content && <small>{resource.content}</small>}</span><em>링크 열기</em></a>
              ) : (
                <div className="book-project-resource is-text" key={resource.id}><span className="book-project-resource-copy"><strong>{resource.title}</strong>{resource.content && <small>{resource.content}</small>}</span><em>텍스트</em></div>
              ))}
            </ProjectSection>
          </div>
        </details>
      ))}
      {onEdit && (
        <button type="button" className="btn-outline book-step-add" onClick={() => onEdit(true)}>
          <IconAddFeature size={17} /> Step 추가
        </button>
      )}
    </div>
  );
}

function ProjectSection({ title, empty, children }) {
  const items = Array.isArray(children) ? children : children ? [children] : [];
  return (
    <section className="book-project-section">
      <h3>{title}</h3>
      {items.length > 0 ? children : <p>{empty}</p>}
    </section>
  );
}

function ProjectItems({ label, items, resource = false, onChange, onRemove }) {
  return (
    <section className="book-step-items">
      <div className="book-step-items-head"><strong>{label}</strong></div>
      {items.map((item, index) => (
        <article className="book-step-item-edit" key={item.id}>
          <header>
            <span>{label} {index + 1}</span>
            <input value={item.title} onChange={(event) => onChange(item.id, { title: event.target.value })} placeholder={`${label} 제목`} aria-label={`${label} ${index + 1} 제목`} />
            <button type="button" className="btn-ghost role-danger-btn" title={`${label} 삭제`} onClick={() => onRemove(item.id)}><IconTrash size={14} /></button>
          </header>
          <div className="book-step-item-fields">
            {resource ? (
              <>
                <input value={item.content || ""} onChange={(event) => onChange(item.id, { content: event.target.value })} placeholder="자료 내용" aria-label={`자료 ${index + 1} 내용`} />
                <input value={item.url} onChange={(event) => onChange(item.id, { url: event.target.value })} placeholder="링크 URL (선택)" aria-label={`자료 ${index + 1} 링크 URL`} type="url" />
              </>
            ) : (
              <input value={item.topic} onChange={(event) => onChange(item.id, { topic: event.target.value })} placeholder="활동 내용" aria-label={`활동 ${index + 1} 내용`} />
            )}
          </div>
        </article>
      ))}
    </section>
  );
}
