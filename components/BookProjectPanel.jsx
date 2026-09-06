"use client";

import { useEffect, useState } from "react";
import BookProjectEditor from "./BookProjectEditor";
import BookProjectItemEditModal from "./BookProjectItemEditModal";
import BookStepEditModal from "./BookStepEditModal";
import { ProjectDisplayItem, ProjectSection, stepPreviewItems } from "./BookProjectPreview";
import BookProjectSidebarTools from "./BookProjectSidebarTools";
import { IconAddFeature } from "./StatusIcons";

function IconExpandStep({ size = 15 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 4H4v4M16 4h4v4M20 16v4h-4M4 16v4h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M9 9 4.8 4.8M15 9l4.2-4.2M15 15l4.2 4.2M9 15l-4.2 4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;
}

export default function BookProjectPanel({ project, editing, appendStep, initialOpenStepId, saving, exporting, participantCount = 0, currentClassId = "", exportTargets = [], loadProject, onSave, onEdit, onDelete, onToggleActivityLock, onToggleProjectItemLock, onDraftChange, onExportProjectItem }) {
  const [viewOpenIds, setViewOpenIds] = useState(new Set());
  const [activeStepId, setActiveStepId] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [editingStepId, setEditingStepId] = useState(null);
  const [draggingKey, setDraggingKey] = useState(null);
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

  function itemKey(kind, id) {
    return `${kind}:${id}`;
  }

  function collectionKey(kind) {
    return kind === "resource" ? "resources" : "activities";
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

  async function saveProjectItem(stepId, kind, itemId, patch) {
    if (!onSave) return;
    const key = collectionKey(kind);
    const nextSteps = (project.steps ?? []).map((step) => (
      step.id === stepId
        ? {
            ...step,
            [key]: (step[key] ?? []).map((item) => (
              item.id === itemId ? { ...item, ...patch } : item
            )),
          }
        : step
    ));
    const saved = await onSave({ title: project.title, steps: nextSteps });
    if (saved !== false) setEditingItem(null);
    return saved;
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
        onDraftChange={onDraftChange}
      />
    );
  }

  if (!project) return <div className="book-library-empty">오른쪽 위의 프로젝트 만들기 버튼으로 수업 흐름을 준비하세요.</div>;

  const editingStep = (project.steps ?? []).find((step) => step.id === editingItem?.stepId);
  const activeStepEditor = (project.steps ?? []).find((step) => step.id === editingStepId) ?? null;
  const editingItems = editingStep ? stepPreviewItems(editingStep) : [];
  const activeEditingItem = editingItems.find((item) => item.kind === editingItem?.kind && item.id === editingItem?.itemId) ?? null;
  const stepIndexById = new Map((project.steps ?? []).map((step, index) => [step.id, index]));

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
              onPreview={() => setEditingItem({ stepId: step.id, kind: entry.kind, itemId: entry.id })}
              onEdit={onEdit ? () => onEdit(false, step.id) : null}
              onDelete={onDelete ? () => onDelete({ kind: entry.kind, item: entry.source, stepId: step.id }) : null}
              onToggleLock={onToggleProjectItemLock
                ? (locked) => onToggleProjectItemLock(entry, locked)
                : entry.kind === "activity" && onToggleActivityLock
                  ? (locked) => onToggleActivityLock(entry.source, locked)
                  : null}
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
        renderStepAction={onSave ? (step, displayIndex) => (
          <button
            type="button"
            className="btn-ghost book-step-expand-action"
            title={`Step ${displayIndex + 1} 크게 편집`}
            aria-label={`Step ${displayIndex + 1} 크게 편집`}
            onClick={(event) => {
              event.stopPropagation();
              setEditingStepId(step.id);
            }}
          >
            <IconExpandStep />
          </button>
        ) : null}
        stepIndexById={stepIndexById}
      />
      {onEdit && (
        <button type="button" className="btn-outline book-step-add" onClick={() => onEdit(true)}>
          <IconAddFeature size={17} /> Step 추가
        </button>
      )}
    </div>
	    {activeEditingItem && (
	      <BookProjectItemEditModal
	        project={project}
	        step={editingStep}
	        item={activeEditingItem.source}
	        kind={activeEditingItem.kind}
	        saving={saving}
	        exporting={exporting}
	        currentClassId={currentClassId}
	        exportTargets={exportTargets}
	        loadProject={loadProject}
	        onSave={(patch) => saveProjectItem(editingStep.id, activeEditingItem.kind, activeEditingItem.id, patch)}
	        onExport={(request) => onExportProjectItem?.({
	          ...request,
	          sourceStepId: editingStep.id,
	          sourceItemKind: activeEditingItem.kind,
	          sourceItemId: activeEditingItem.id,
	        })}
	        onClose={() => setEditingItem(null)}
	      />
	    )}
        {activeStepEditor && (
          <BookStepEditModal
            project={project}
            step={activeStepEditor}
            stepNumber={(stepIndexById.get(activeStepEditor.id) ?? 0) + 1}
            saving={saving}
            onSave={onSave}
            onClose={() => setEditingStepId(null)}
          />
        )}
    </>
  );
}
