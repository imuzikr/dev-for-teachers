"use client";

import { useState } from "react";
import BookProjectEditorItems from "./BookProjectEditorItems";
import { ProjectDisplayItem, ProjectSection, StepContentModal, stepPreviewItems } from "./BookProjectPreview";
import { IconAddFeature, IconTrash } from "./StatusIcons";

function newStep(index) {
  return { id: crypto.randomUUID(), title: `Step ${index + 1}`, activities: [], resources: [] };
}

function newItem() {
  return { id: crypto.randomUUID(), title: "", topic: "", content: "", url: "" };
}

function initialDraft(project, appendStep, initialOpenStepId) {
  const existingSteps = (project?.steps ?? []).map((step) => ({
    ...step,
    activities: (step.activities ?? []).map((activity) => ({ ...activity })),
    resources: (step.resources ?? []).map((resource) => ({ ...resource })),
  }));
  const steps = appendStep ? [...existingSteps, newStep(existingSteps.length)] : existingSteps;
  const selectedStepId = appendStep
    ? steps.at(-1)?.id
    : steps.some((step) => step.id === initialOpenStepId)
      ? initialOpenStepId
      : steps[0]?.id;
  return {
    title: project?.title ?? "",
    steps,
    openIds: new Set(selectedStepId ? [selectedStepId] : []),
  };
}

export default function BookProjectPanel({ project, editing, appendStep, initialOpenStepId, saving, onSave, onEdit, onOpen, onDelete }) {
  const [draft] = useState(() => initialDraft(project, appendStep, initialOpenStepId));
  const [title, setTitle] = useState(draft.title);
  const [steps, setSteps] = useState(draft.steps);
  const [openIds, setOpenIds] = useState(draft.openIds);
  const [preview, setPreview] = useState(null);

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

  function openPreview(step, kind, itemId) {
    const items = stepPreviewItems(step);
    const index = items.findIndex((item) => item.kind === kind && item.id === itemId);
    if (index >= 0) setPreview({ stepId: step.id, index });
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
                    {step.activities.length > 0 && <BookProjectEditorItems label="활동" items={step.activities} onChange={(id, patch) => updateItem(step.id, "activities", id, patch)} onRemove={(id) => removeItem(step.id, "activities", id)} />}
                    {step.resources.length > 0 && <BookProjectEditorItems label="자료" items={step.resources} resource onChange={(id, patch) => updateItem(step.id, "resources", id, patch)} onRemove={(id) => removeItem(step.id, "resources", id)} />}
                    <div className="book-step-add-actions">
                      <button type="button" className="btn-ghost" onClick={() => addItem(step.id, "activities")}>+ 활동 추가</button>
                      <button type="button" className="btn-ghost" onClick={() => addItem(step.id, "resources")}>+ 자료 추가</button>
                    </div>
                    <button
                      type="button"
                      className="btn-primary book-step-save"
                      disabled={saving || !title.trim()}
                      onClick={() => onSave({ title: title.trim(), steps })}
                    >
                      {saving ? "저장 중..." : `Step ${index + 1} 저장`}
                    </button>
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

  const previewStep = (project.steps ?? []).find((step) => step.id === preview?.stepId);
  const previewItems = previewStep ? stepPreviewItems(previewStep) : [];
  const previewItem = previewItems[preview?.index] ?? null;

  return (
    <>
    <div className="book-project-view">
      <header>
        <span><strong>{project.title}</strong><small>{project.steps?.length ?? 0} Steps</small></span>
        {onEdit && <button type="button" className="btn-ghost book-project-edit" onClick={() => onEdit(false)}>프로젝트 편집</button>}
      </header>
      {(project.steps ?? []).map((step, index) => (
        <article className="book-step-view-shell" key={step.id}>
          <details className="book-step-card book-step-view-card" open={index === 0}>
            <summary><span>Step {index + 1}</span><strong>{step.title}</strong><small>{step.activities.length}개 활동 · {step.resources.length}개 자료</small></summary>
            <div className="book-step-content">
              <ProjectSection title="활동" empty="등록된 활동이 없습니다.">
                {step.activities.map((activity) => (
                  <ProjectDisplayItem
                    key={activity.id}
                    item={activity}
                    kind="activity"
                    onOpen={() => onOpen(activity)}
                    onPreview={() => openPreview(step, "activity", activity.id)}
                    onEdit={onEdit ? () => onEdit(false, step.id) : null}
                    onDelete={onDelete ? () => onDelete({ kind: "activity", item: activity, stepId: step.id }) : null}
                  />
                ))}
              </ProjectSection>
              <ProjectSection title="자료" empty="등록된 자료가 없습니다.">
                {step.resources.map((resource) => (
                  <ProjectDisplayItem
                    key={resource.id}
                    item={resource}
                    kind="resource"
                    onPreview={() => openPreview(step, "resource", resource.id)}
                    onEdit={onEdit ? () => onEdit(false, step.id) : null}
                    onDelete={onDelete ? () => onDelete({ kind: "resource", item: resource, stepId: step.id }) : null}
                  />
                ))}
              </ProjectSection>
            </div>
          </details>
          {onEdit && (
            <button type="button" className="btn-ghost book-step-view-edit" onClick={() => onEdit(false, step.id)}>
              Step 편집
            </button>
          )}
        </article>
      ))}
      {onEdit && (
        <button type="button" className="btn-outline book-step-add" onClick={() => onEdit(true)}>
          <IconAddFeature size={17} /> Step 추가
        </button>
      )}
    </div>
    {previewItem && (
      <StepContentModal
        step={previewStep}
        item={previewItem}
        index={preview.index}
        total={previewItems.length}
        onMove={(offset) => setPreview((current) => ({
          ...current,
          index: (current.index + offset + previewItems.length) % previewItems.length,
        }))}
        onOpenActivity={previewItem.kind === "activity" ? () => {
          setPreview(null);
          onOpen(previewItem.source);
        } : null}
        onClose={() => setPreview(null)}
      />
    )}
    </>
  );
}
