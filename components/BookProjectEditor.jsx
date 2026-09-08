"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { assertBookProjectSize, normalizeBookItemImages } from "@/lib/bookProjectImages";
import { backdropClose } from "@/lib/modal";
import BookProjectItemEditModal from "./BookProjectItemEditModal";
import BookProjectEditorItems from "./BookProjectEditorItems";
import BookProjectSidebarTools from "./BookProjectSidebarTools";
import { IconAddFeature, IconTrash } from "./StatusIcons";

function newStep(index) {
  return { id: crypto.randomUUID(), title: `Step ${index + 1}`, activities: [], resources: [], itemOrder: [] };
}

function newItem(kind = "activity") {
  return { id: crypto.randomUUID(), title: "", content: "", url: "", bookUrl: "", ...(kind === "activity" ? { requiresAnswer: false } : {}) };
}

function orderKey(kind, id) {
  return `${kind}:${id}`;
}

function orderEntry(kind, id) {
  return { kind, id };
}

function defaultOrder(step) {
  return [
    ...(step.activities ?? []).map((item) => orderEntry("activity", item.id)),
    ...(step.resources ?? []).map((item) => orderEntry("resource", item.id)),
  ];
}

function normalizedOrder(step) {
  const valid = new Set(defaultOrder(step).map((item) => orderKey(item.kind, item.id)));
  const seen = new Set();
  const ordered = (step.itemOrder ?? [])
    .filter((item) => {
      const key = orderKey(item.kind, item.id);
      if (!valid.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((item) => orderEntry(item.kind, item.id));
  return [
    ...ordered,
    ...defaultOrder(step).filter((item) => !seen.has(orderKey(item.kind, item.id))),
  ];
}

function collectionKey(kind) {
  return kind === "resource" ? "resources" : "activities";
}

function initialDraft(project, appendStep, initialOpenStepId) {
  const existingSteps = (project?.steps ?? []).map((step) => ({
    ...step,
    activities: (step.activities ?? []).map((activity) => ({ ...activity })),
    resources: (step.resources ?? []).map((resource) => ({ ...resource })),
    itemOrder: normalizedOrder(step),
  }));
  const steps = appendStep ? [...existingSteps, newStep(existingSteps.length)] : existingSteps;
  const selectedStepId = appendStep
    ? steps.at(-1)?.id
    : steps.some((step) => step.id === initialOpenStepId)
      ? initialOpenStepId
      : null;
  return {
    title: project?.title ?? "",
    steps,
    selectedStepId,
    openIds: new Set(selectedStepId ? [selectedStepId] : []),
  };
}

export default function BookProjectEditor({
  project,
  expandRequest,
  appendStep,
  initialOpenStepId,
  saving,
  participantCount,
  onSave,
  onDraftChange,
}) {
  const [draft] = useState(() => initialDraft(project, appendStep, initialOpenStepId));
  const [title, setTitle] = useState(draft.title);
  const [steps, setSteps] = useState(draft.steps);
  const [openIds, setOpenIds] = useState(draft.openIds);
  const [activeStepId, setActiveStepId] = useState(draft.selectedStepId ?? null);
  const [addingItem, setAddingItem] = useState(null);
  const [expanded, setExpanded] = useState(!appendStep && !initialOpenStepId);
  const [mounted, setMounted] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [busyImages, setBusyImages] = useState(new Set());
  const dialogRef = useRef(null);
  const expandRef = useRef(null);
  const previousExpandRequest = useRef(expandRequest);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (previousExpandRequest.current !== expandRequest) setExpanded(true);
    previousExpandRequest.current = expandRequest;
  }, [expandRequest]);

  useEffect(() => {
    if (!mounted || !expanded || addingItem) return;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector("input")?.focus();
    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        setExpanded(false);
      }
      if (event.key !== "Tab") return;
      const controls = [...(dialogRef.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"], [contenteditable="true"]') ?? [])].filter((element) => element.getClientRects().length);
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKeyDown);
      if (previous?.isConnected) previous.focus();
      else expandRef.current?.focus();
    };
  }, [addingItem, expanded, mounted]);

  async function saveProject() {
    if (saving || busyImages.size > 0 || !title.trim()) return;
    setSaveError("");
    try {
      const nextProject = { title: title.trim(), steps };
      for (const step of steps) {
        for (const item of [...step.activities, ...step.resources]) normalizeBookItemImages(item.images);
      }
      assertBookProjectSize(nextProject);
      await onSave(nextProject);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  }

  function updateStep(stepId, patch) {
    setSteps((current) => current.map((step) => step.id === stepId ? { ...step, ...patch } : step));
  }

  function addStep() {
    const step = newStep(steps.length);
    setSteps((current) => [...current, step]);
    setOpenIds(new Set([step.id]));
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
    setActiveStepId((current) => current === stepId ? null : current);
  }

  function addItem(stepId, key, patch = null) {
    const step = steps.find((item) => item.id === stepId);
    if (!step) return;
    const kind = key === "resources" ? "resource" : "activity";
    const item = { ...newItem(kind), ...(patch ?? {}) };
    updateStep(stepId, {
      [key]: [...step[key], item],
      itemOrder: [...normalizedOrder(step), orderEntry(kind, item.id)],
    });
  }

  function openAddItemModal(stepId, kind) {
    setAddingItem({ stepId, kind });
  }

  async function saveAddedItem(patch) {
    if (!addingItem) return false;
    addItem(addingItem.stepId, addingItem.kind === "resource" ? "resources" : "activities", patch);
    setAddingItem(null);
    return true;
  }

  function updateItem(stepId, kind, itemId, patch) {
    const step = steps.find((item) => item.id === stepId);
    if (!step) return;
    const key = collectionKey(kind);
    updateStep(stepId, {
      [key]: step[key].map((item) => item.id === itemId ? { ...item, ...patch } : item),
    });
  }

  function removeItem(stepId, kind, itemId) {
    const step = steps.find((item) => item.id === stepId);
    if (!step) return;
    const key = collectionKey(kind);
    updateStep(stepId, {
      [key]: step[key].filter((item) => item.id !== itemId),
      itemOrder: normalizedOrder(step).filter((item) => item.kind !== kind || item.id !== itemId),
    });
  }

  function moveItem(stepId, fromKey, toKey) {
    if (fromKey === toKey) return;
    const step = steps.find((item) => item.id === stepId);
    if (!step) return;
    const currentOrder = normalizedOrder(step);
    const fromIndex = currentOrder.findIndex((item) => orderKey(item.kind, item.id) === fromKey);
    const toIndex = currentOrder.findIndex((item) => orderKey(item.kind, item.id) === toKey);
    if (fromIndex < 0 || toIndex < 0) return;
    const nextOrder = [...currentOrder];
    const [moved] = nextOrder.splice(fromIndex, 1);
    nextOrder.splice(toIndex, 0, moved);
    updateStep(stepId, { itemOrder: nextOrder });
  }

  function toggleStep(stepId) {
    const open = !openIds.has(stepId);
    setOpenIds((current) => {
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
        <BookProjectEditorItems
          step={step}
          disabled={saving}
          onImageBusyChange={(key, busy) => setBusyImages((current) => {
            const next = new Set(current);
            const itemKey = `${step.id}:${key}`;
            if (busy) next.add(itemKey);
            else next.delete(itemKey);
            return next;
          })}
          onChange={(kind, id, patch) => updateItem(step.id, kind, id, patch)}
          onRemove={(kind, id) => removeItem(step.id, kind, id)}
          onMove={(fromKey, toKey) => moveItem(step.id, fromKey, toKey)}
        />
        <div className="book-step-add-actions">
          <button type="button" className="btn-ghost" onClick={() => openAddItemModal(step.id, "activity")}>+ 활동 추가</button>
          <button type="button" className="btn-ghost" onClick={() => openAddItemModal(step.id, "resource")}>+ 자료 추가</button>
        </div>
        <button
          type="button"
          className="btn-primary book-step-save"
          disabled={saving || busyImages.size > 0 || !title.trim()}
          onClick={saveProject}
        >
          {saving ? "저장 중..." : `Step ${stepNumber} 저장`}
        </button>
      </div>
    );
  }

  const draftProject = useMemo(() => ({ ...project, title, steps }), [project, steps, title]);
  const addingStep = addingItem ? steps.find((step) => step.id === addingItem.stepId) ?? null : null;

  useEffect(() => {
    onDraftChange?.(draftProject);
  }, [draftProject, onDraftChange]);

  const editor = (
      <div className="book-project-editor">
        {saveError && <p className="book-item-images-error" role="alert">{saveError}</p>}
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
          disabled={saving || busyImages.size > 0 || !title.trim() || steps.length === 0}
          onClick={saveProject}
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

  return (
    <>
      <button ref={expandRef} type="button" className="btn-outline book-project-expand" onClick={() => setExpanded(true)}>프로젝트 크게 편집</button>
      {!expanded && editor}
      {mounted && expanded && createPortal(
        <div className="modal-backdrop book-project-edit-backdrop" {...backdropClose(() => setExpanded(false))}>
          <section ref={dialogRef} inert={addingItem ? true : undefined} className="modal book-step-edit-modal book-project-edit-modal" role="dialog" aria-modal="true" aria-labelledby="book-project-dialog-title">
            <header className="modal-head">
              <h3 id="book-project-dialog-title">{project ? "프로젝트 편집" : "프로젝트 만들기"}</h3>
              <button type="button" className="btn-close" aria-label="패널로 돌아가기" onClick={() => setExpanded(false)}>×</button>
            </header>
            <div className="book-step-edit-modal-body">{editor}</div>
            <footer className="book-item-edit-footer">
              <button type="button" className="btn-outline" onClick={() => setExpanded(false)}>패널에서 계속 편집</button>
              <button type="button" className="btn-primary" disabled={saving || busyImages.size > 0 || !title.trim() || steps.length === 0} onClick={saveProject}>{saving ? "저장 중..." : "프로젝트 저장"}</button>
            </footer>
          </section>
        </div>, document.body
      )}
      {addingItem && addingStep && (
        <BookProjectItemEditModal
          project={draftProject}
          step={addingStep}
          item={null}
          kind={addingItem.kind}
          saving={saving}
          onSave={saveAddedItem}
          onClose={() => setAddingItem(null)}
        />
      )}
    </>
  );
}
