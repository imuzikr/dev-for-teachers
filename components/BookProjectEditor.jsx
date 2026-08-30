"use client";

import { useState } from "react";
import BookProjectEditorItems from "./BookProjectEditorItems";
import BookProjectSidebarTools from "./BookProjectSidebarTools";
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
    selectedStepId,
    openIds: new Set(selectedStepId ? [selectedStepId] : []),
  };
}

export default function BookProjectEditor({
  project,
  appendStep,
  initialOpenStepId,
  saving,
  participantCount,
  onSave,
}) {
  const [draft] = useState(() => initialDraft(project, appendStep, initialOpenStepId));
  const [title, setTitle] = useState(draft.title);
  const [steps, setSteps] = useState(draft.steps);
  const [openIds, setOpenIds] = useState(draft.openIds);
  const [activeStepId, setActiveStepId] = useState(draft.selectedStepId ?? null);

  function updateStep(stepId, patch) {
    setSteps((current) => current.map((step) => step.id === stepId ? { ...step, ...patch } : step));
  }

  function addStep() {
    const step = newStep(steps.length);
    setSteps((current) => [...current, step]);
    setOpenIds((current) => new Set(current).add(step.id));
    setActiveStepId(step.id);
  }

  function removeStep(stepId) {
    const nextSteps = steps.filter((step) => step.id !== stepId);
    setSteps((current) => current.filter((step) => step.id !== stepId));
    setOpenIds((current) => {
      const next = new Set(current);
      next.delete(stepId);
      return next;
    });
    setActiveStepId((current) => current === stepId ? nextSteps[0]?.id ?? null : current);
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
    const open = !openIds.has(stepId);
    setOpenIds(new Set(open ? [stepId] : []));
    setActiveStepId(open ? stepId : null);
  }

  function renderStepEditor(step) {
    const index = steps.findIndex((item) => item.id === step.id);
    const stepNumber = index >= 0 ? index + 1 : 1;
    return (
      <div className="book-step-edit-panel">
        <label className="book-step-title-field">
          <span>Step {stepNumber} 제목</span>
          <input
            value={step.title}
            onChange={(event) => updateStep(step.id, { title: event.target.value })}
            aria-label={`Step ${stepNumber} 제목`}
          />
        </label>
        <div className="book-step-edit-meta">
          <small>{step.activities.length}개 활동 · {step.resources.length}개 자료</small>
          <button type="button" className="btn-ghost role-danger-btn book-step-remove" onClick={() => removeStep(step.id)}>
            <IconTrash size={15} /> Step 삭제
          </button>
        </div>
        {step.activities.length > 0 ? (
          <BookProjectEditorItems label="활동" items={step.activities} onChange={(id, patch) => updateItem(step.id, "activities", id, patch)} onRemove={(id) => removeItem(step.id, "activities", id)} />
        ) : (
          <p className="book-step-empty">등록된 활동이 없습니다.</p>
        )}
        {step.resources.length > 0 ? (
          <BookProjectEditorItems label="자료" items={step.resources} resource onChange={(id, patch) => updateItem(step.id, "resources", id, patch)} onRemove={(id) => removeItem(step.id, "resources", id)} />
        ) : (
          <p className="book-step-empty">등록된 자료가 없습니다.</p>
        )}
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
          {saving ? "저장 중..." : `Step ${stepNumber} 저장`}
        </button>
      </div>
    );
  }

  const draftProject = { ...project, title, steps };

  return (
    <div className="book-project-editor">
      <BookProjectSidebarTools
        project={draftProject}
        participantCount={participantCount}
        activeStepId={activeStepId}
        editing
        openStepIds={openIds}
        onPickStep={toggleStep}
        renderStepContent={renderStepEditor}
      />
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
      <button type="button" className="btn-outline book-step-add" onClick={addStep}>
        <IconAddFeature size={17} /> Step 추가
      </button>
    </div>
  );
}
