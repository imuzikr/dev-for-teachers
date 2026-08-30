"use client";

import { useEffect, useState } from "react";
import BookProjectEditor from "./BookProjectEditor";
import { ProjectDisplayItem, ProjectSection, StepContentModal, stepPreviewItems } from "./BookProjectPreview";
import BookProjectSidebarTools from "./BookProjectSidebarTools";
import { IconAddFeature } from "./StatusIcons";

export default function BookProjectPanel({ project, editing, appendStep, initialOpenStepId, saving, participantCount = 0, onSave, onEdit, onOpen, onDelete }) {
  const [viewOpenIds, setViewOpenIds] = useState(new Set());
  const [activeStepId, setActiveStepId] = useState(null);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (editing) return;
    const firstStepId = project?.steps?.[0]?.id ?? null;
    setViewOpenIds(new Set(firstStepId ? [firstStepId] : []));
    setActiveStepId(firstStepId);
  }, [editing, project]);

  function pickStep(stepId) {
    setActiveStepId(stepId);
    setViewOpenIds((current) => new Set(current).add(stepId));
    if (typeof document !== "undefined") {
      window.requestAnimationFrame(() => {
        document.getElementById(`book-step-${stepId}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
    }
  }

  function toggleViewStep(stepId, open) {
    setViewOpenIds((current) => {
      const next = new Set(current);
      if (open) next.add(stepId);
      else next.delete(stepId);
      return next;
    });
    if (open) setActiveStepId(stepId);
  }

  function openPreview(step, kind, itemId) {
    const items = stepPreviewItems(step);
    const index = items.findIndex((item) => item.kind === kind && item.id === itemId);
    if (index >= 0) setPreview({ stepId: step.id, index });
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

  return (
    <>
    <div className="book-project-view">
      <BookProjectSidebarTools
        project={project}
        participantCount={participantCount}
        activeStepId={activeStepId}
        editing={false}
        onPickStep={pickStep}
      />
      <header>
        <span><strong>{project.title}</strong><small>{project.steps?.length ?? 0} Steps</small></span>
        {onEdit && <button type="button" className="btn-ghost book-project-edit" onClick={() => onEdit(false)}>프로젝트 편집</button>}
      </header>
      {(project.steps ?? []).map((step, index) => (
        <article className="book-step-view-shell" id={`book-step-${step.id}`} key={step.id}>
          <details className={`book-step-card book-step-view-card${activeStepId === step.id ? " is-active" : ""}`} open={viewOpenIds.has(step.id)} onToggle={(event) => toggleViewStep(step.id, event.currentTarget.open)}>
            <summary><span>Step {index + 1}</span><strong>{step.title}</strong><small>{step.activities.length}개 활동 · {step.resources.length}개 자료</small></summary>
            <div className="book-step-content">
              <ProjectSection title="활동" empty="등록된 활동이 없습니다.">
                {step.activities.map((activity) => (
                  <ProjectDisplayItem
                    key={activity.id}
                    item={activity}
                    kind="activity"
                    onOpen={() => openPreview(step, "activity", activity.id)}
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
                    onOpen={() => openPreview(step, "resource", resource.id)}
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
