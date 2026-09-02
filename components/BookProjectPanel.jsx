"use client";

import { useEffect, useState } from "react";
import BookProjectEditor from "./BookProjectEditor";
import { ProjectDisplayItem, ProjectSection, StepContentModal, stepPreviewItems } from "./BookProjectPreview";
import BookProjectSidebarTools from "./BookProjectSidebarTools";
import { IconAddFeature } from "./StatusIcons";

export default function BookProjectPanel({ project, editing, appendStep, initialOpenStepId, saving, participantCount = 0, onSave, onEdit, onOpen, onDelete, onToggleActivityLock }) {
  const [viewOpenIds, setViewOpenIds] = useState(new Set());
  const [activeStepId, setActiveStepId] = useState(null);
  const [preview, setPreview] = useState(null);
  const [draggingKey, setDraggingKey] = useState(null);
  const projectKey = project?.id || project?.classId || "";
  const stepIdentity = (project?.steps ?? []).map((step) => step.id).join("|");

  useEffect(() => {
    if (editing) return;
    const stepIds = stepIdentity ? stepIdentity.split("|") : [];
    const firstStepId = stepIds[0] ?? null;
    setViewOpenIds((current) => {
      const preserved = stepIds.filter((stepId) => current.has(stepId));
      return new Set(preserved.length ? preserved : firstStepId ? [firstStepId] : []);
    });
    setActiveStepId((current) => stepIds.includes(current) ? current : firstStepId);
  }, [editing, projectKey, stepIdentity]);

  function toggleStep(stepId) {
    const open = !viewOpenIds.has(stepId);
    setViewOpenIds(new Set(open ? [stepId] : []));
    setActiveStepId(open ? stepId : null);
  }

  function openPreview(step, kind, itemId) {
    const items = stepPreviewItems(step);
    const index = items.findIndex((item) => item.kind === kind && item.id === itemId);
    if (index >= 0) setPreview({ stepId: step.id, index });
  }

  function itemKey(kind, id) {
    return `${kind}:${id}`;
  }

  function orderFromItems(items) {
    return items.map((item) => ({ kind: item.kind, id: item.id }));
  }

  function moveStepItem(step, fromKey, toKey) {
    if (!onSave || fromKey === toKey) return;
    const items = stepPreviewItems(step);
    const fromIndex = items.findIndex((item) => itemKey(item.kind, item.id) === fromKey);
    const toIndex = items.findIndex((item) => itemKey(item.kind, item.id) === toKey);
    if (fromIndex < 0 || toIndex < 0) return;
    const nextItems = [...items];
    const [moved] = nextItems.splice(fromIndex, 1);
    nextItems.splice(toIndex, 0, moved);
    const nextSteps = (project.steps ?? []).map((candidate) => (
      candidate.id === step.id
        ? { ...candidate, itemOrder: orderFromItems(nextItems) }
        : candidate
    ));
    onSave({ title: project.title, steps: nextSteps });
  }

  if (editing) {
    return (
      <BookProjectEditor
        project={project}
        appendStep={appendStep}
        initialOpenStepId={initialOpenStepId}
        saving={saving}
        participantCount={participantCount}
        onSave={onSave}
      />
    );
  }

  if (!project) return <div className="book-library-empty">오른쪽 위의 프로젝트 만들기 버튼으로 수업 흐름을 준비하세요.</div>;

  const previewStep = (project.steps ?? []).find((step) => step.id === preview?.stepId);
  const previewItems = previewStep ? stepPreviewItems(previewStep) : [];
  const previewItem = previewItems[preview?.index] ?? null;

  function renderStepContent(step) {
    const items = stepPreviewItems(step);
    return (
      <div className="book-step-content">
        <ProjectSection title="활동과 자료" empty="등록된 활동과 자료가 없습니다.">
          {items.map((entry) => (
            <ProjectDisplayItem
              key={`${entry.kind}:${entry.id}`}
              item={entry.source}
              kind={entry.kind}
              onOpen={entry.kind === "activity" ? () => onOpen(entry.source) : () => openPreview(step, entry.kind, entry.id)}
              onPreview={() => openPreview(step, entry.kind, entry.id)}
              onEdit={onEdit ? () => onEdit(false, step.id) : null}
              onDelete={onDelete ? () => onDelete({ kind: entry.kind, item: entry.source, stepId: step.id }) : null}
              onToggleLock={entry.kind === "activity" && onToggleActivityLock ? (locked) => onToggleActivityLock(entry.source, locked) : null}
              dragging={draggingKey === itemKey(entry.kind, entry.id)}
              dragProps={onEdit ? {
                onDragStart: (event) => {
                  const key = itemKey(entry.kind, entry.id);
                  event.dataTransfer.setData("text/plain", key);
                  event.dataTransfer.effectAllowed = "move";
                  setDraggingKey(key);
                },
                onDragEnd: () => setDraggingKey(null),
                onDragOver: (event) => event.preventDefault(),
                onDrop: (event) => {
                  event.preventDefault();
                  moveStepItem(step, event.dataTransfer.getData("text/plain"), itemKey(entry.kind, entry.id));
                  setDraggingKey(null);
                },
              } : null}
            />
          ))}
        </ProjectSection>
        {onEdit && (
          <button type="button" className="btn-ghost book-step-flow-edit" onClick={() => onEdit(false, step.id)}>
            Step 편집
          </button>
        )}
      </div>
    );
  }

  return (
    <>
    <div className="book-project-view">
      <header>
        <span><strong>{project.title}</strong><small>{project.steps?.length ?? 0} Steps</small></span>
        {onEdit && <button type="button" className="btn-ghost book-project-edit" onClick={() => onEdit(false)}>프로젝트 편집</button>}
      </header>
      <BookProjectSidebarTools
        project={project}
        participantCount={participantCount}
        activeStepId={activeStepId}
        editing={false}
        openStepIds={viewOpenIds}
        onPickStep={toggleStep}
        renderStepContent={renderStepContent}
      />
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
