"use client";

import { useEffect, useState } from "react";
import BookProjectEditor from "./BookProjectEditor";
import { stepPreviewItems } from "./BookProjectPreview";
import BookProjectSidebarTools from "./BookProjectSidebarTools";

export default function BookProjectPanel({ project, editing, expandRequest, appendStep, initialOpenStepId, saving, participantCount = 0, onSave, onEdit, onDraftChange }) {
  const [viewOpenIds, setViewOpenIds] = useState(new Set());
  const [activeStepId, setActiveStepId] = useState(null);
  const [orderSaving, setOrderSaving] = useState(false);
  const [orderError, setOrderError] = useState("");
  const stepIdentity = (project?.steps ?? []).map((step) => step.id).join("|");

  useEffect(() => {
    if (editing) return;
    const stepIds = stepIdentity ? stepIdentity.split("|") : [];
    setViewOpenIds((current) => {
      const preserved = stepIds.filter((stepId) => current.has(stepId));
      return new Set(preserved);
    });
    setActiveStepId((current) => stepIds.includes(current) ? current : null);
  }, [editing, stepIdentity]);

  function toggleStep(stepId) {
    const open = !viewOpenIds.has(stepId);
    setViewOpenIds((current) => {
      const next = new Set(current);
      if (open) {
        next.add(stepId);
      } else {
        next.delete(stepId);
      }
      return next;
    });
    setActiveStepId(open ? stepId : null);
  }

  if (editing) {
    return (
      <BookProjectEditor
        expandRequest={expandRequest}
        project={project}
        appendStep={appendStep}
        initialOpenStepId={initialOpenStepId}
        saving={saving}
        participantCount={participantCount}
        onSave={onSave}
        onDraftChange={onDraftChange}
      />
    );
  }

  if (!project) return <div className="book-library-empty">오른쪽 위의 프로젝트 만들기 버튼으로 수업 흐름을 준비하세요.</div>;

  const stepIndexById = new Map((project.steps ?? []).map((step, index) => [step.id, index]));

  async function saveOrder(nextSteps, failureMessage) {
    if (!onSave || saving || orderSaving) return;
    setOrderSaving(true);
    setOrderError("");
    try {
      const saved = await onSave({ title: project.title, steps: nextSteps });
      if (saved === false) setOrderError(failureMessage);
    } catch (error) {
      console.error(failureMessage, error);
      setOrderError(error instanceof Error ? error.message : failureMessage);
    } finally {
      setOrderSaving(false);
    }
  }

  async function moveProjectStep(stepId, direction) {
    if (!onSave || saving || orderSaving) return;
    const currentSteps = project.steps ?? [];
    const fromIndex = currentSteps.findIndex((step) => step.id === stepId);
    const toIndex = fromIndex + direction;
    if (fromIndex < 0 || toIndex < 0 || toIndex >= currentSteps.length) return;
    const nextSteps = [...currentSteps];
    const [moved] = nextSteps.splice(fromIndex, 1);
    nextSteps.splice(toIndex, 0, moved);
    setActiveStepId(stepId);
    await saveOrder(nextSteps, "Step 순서를 저장하지 못했어요. 다시 시도해 주세요.");
  }

  async function moveStepItem(stepId, itemIndex, direction) {
    if (!onSave || saving || orderSaving) return;
    const currentSteps = project.steps ?? [];
    const step = currentSteps.find((candidate) => candidate.id === stepId);
    if (!step) return;
    const items = stepPreviewItems(step);
    const toIndex = itemIndex + direction;
    if (itemIndex < 0 || toIndex < 0 || toIndex >= items.length) return;
    const nextItems = [...items];
    const [moved] = nextItems.splice(itemIndex, 1);
    nextItems.splice(toIndex, 0, moved);
    const nextSteps = currentSteps.map((candidate) => (
      candidate.id === stepId
        ? { ...candidate, itemOrder: nextItems.map((item) => ({ kind: item.kind, id: item.id })) }
        : candidate
    ));
    await saveOrder(nextSteps, "활동과 자료 순서를 저장하지 못했어요. 다시 시도해 주세요.");
  }

  function renderStepContent(step) {
    const items = stepPreviewItems(step);
    return (
      <div className="book-step-order-panel">
        {items.length > 0 ? (
          <ol className="book-step-order-list" aria-label={`${step.title || "Step"} 활동과 자료 순서`}>
            {items.map((entry, index) => (
              <li key={`${entry.kind}:${entry.id}`}>
                <span>{index + 1}</span>
                <strong>{entry.title || (entry.kind === "activity" ? "제목 없는 활동" : "제목 없는 자료")}</strong>
                <small>{entry.label}</small>
                <div className="book-step-item-reorder-actions" aria-label={`${entry.title || entry.label} 순서 이동`}>
                  <button
                    type="button"
                    className="book-step-order-btn"
                    aria-label={`${entry.label} ${index + 1} 위로 이동`}
                    title="위로 이동"
                    disabled={saving || orderSaving || !onSave || index <= 0}
                    onClick={() => moveStepItem(step.id, index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="book-step-order-btn"
                    aria-label={`${entry.label} ${index + 1} 아래로 이동`}
                    title="아래로 이동"
                    disabled={saving || orderSaving || !onSave || index >= items.length - 1}
                    onClick={() => moveStepItem(step.id, index, 1)}
                  >
                    ↓
                  </button>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="book-step-order-empty">등록된 활동과 자료가 없습니다.</p>
        )}
      </div>
    );
  }

  function renderStepOrderAction(step, displayIndex) {
    const index = stepIndexById.get(step.id) ?? displayIndex;
    return (
      <div className="book-step-reorder-actions" aria-label={`${step.title || "Step"} 순서 이동`}>
        <button
          type="button"
          className="book-step-order-btn"
          aria-label={`Step ${index + 1} 위로 이동`}
          title="위로 이동"
          disabled={saving || orderSaving || !onSave || index <= 0}
          onClick={(event) => {
            event.stopPropagation();
            moveProjectStep(step.id, -1);
          }}
        >
          ↑
        </button>
        <button
          type="button"
          className="book-step-order-btn"
          aria-label={`Step ${index + 1} 아래로 이동`}
          title="아래로 이동"
          disabled={saving || orderSaving || !onSave || index >= (project.steps?.length ?? 0) - 1}
          onClick={(event) => {
            event.stopPropagation();
            moveProjectStep(step.id, 1);
          }}
        >
          ↓
        </button>
      </div>
    );
  }

  return (
    <>
    <div className="book-project-view">
      <header>
        <span><strong>{project.title}</strong><small>{project.steps?.length ?? 0} Steps</small></span>
        {onEdit && <button type="button" className="btn-ghost book-project-edit" onClick={() => onEdit(false)}>프로젝트 크게 편집</button>}
      </header>
      {orderError && <p className="book-item-images-error" role="alert">{orderError}</p>}
      <BookProjectSidebarTools
        project={project}
        participantCount={participantCount}
        activeStepId={activeStepId}
        editing={false}
        openStepIds={viewOpenIds}
        onPickStep={toggleStep}
        renderStepContent={renderStepContent}
        renderStepAction={renderStepOrderAction}
        stepIndexById={stepIndexById}
      />
    </div>
    </>
  );
}
