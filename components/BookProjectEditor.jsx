"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { assertBookProjectSize, normalizeBookItemImages } from "@/lib/bookProjectImages";
import { backdropClose } from "@/lib/modal";
import BookProjectItemEditModal from "./BookProjectItemEditModal";
import BookProjectEditorItems from "./BookProjectEditorItems";
import { updateBookProjectItem } from "./bookProjectItems";
import { IconAddFeature, IconTrash } from "./StatusIcons";
import { initialBookProject } from "@/lib/internalProjectTemplate.mjs";
import { appendClonedBookProjectSteps } from "@/lib/bookProjectExport";
import BookProjectCopyPicker from "./BookProjectCopyPicker";

function newStep(index) {
  return { id: crypto.randomUUID(), title: `Step ${index + 1}`, description: "", activities: [], resources: [], itemOrder: [] };
}

function newItem(kind = "activity") {
  return { id: crypto.randomUUID(), title: "", content: "", url: "", bookUrl: "", locked: false, ...(kind === "activity" ? { requiresAnswer: false } : {}) };
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
  };
}

export default function BookProjectEditor({
  project,
  classPurpose,
  expandRequest,
  appendStep,
  initialOpenStepId,
  saving,
  participantCount,
  onSave,
  onDraftChange,
  currentClassId,
  copyClasses,
  loadProject,
}) {
  const [draft] = useState(() => initialDraft(
    initialBookProject(project, classPurpose),
    appendStep && (project != null || classPurpose !== "internal"),
    initialOpenStepId,
  ));
  const [title, setTitle] = useState(draft.title);
  const [steps, setSteps] = useState(draft.steps);
  const [activeStepId, setActiveStepId] = useState(draft.selectedStepId ?? null);
  const [addingItem, setAddingItem] = useState(null);
  const [expanded, setExpanded] = useState(!appendStep && !initialOpenStepId);
  const [mounted, setMounted] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [busyImages, setBusyImages] = useState(new Set());
  const dialogRef = useRef(null);
  const expandRef = useRef(null);
  const previousExpandRequest = useRef(expandRequest);

  const copyPicker = !project && loadProject ? <BookProjectCopyPicker
    classes={copyClasses} currentClassId={currentClassId} loadProject={loadProject}
    disabled={saving || busyImages.size > 0}
    onCopy={(source) => {
      const copied = appendClonedBookProjectSteps(null, source);
      setTitle(copied.title);
      setSteps(copied.steps);
      setActiveStepId(null);
      setSaveError("");
    }}
  /> : null;

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
      assertBookProjectSize(nextProject, { pendingImageUploads: true });
      const saved = await onSave(nextProject);
      if (saved === false) setSaveError("저장하지 못했어요. 입력 내용은 유지됩니다. 다시 저장해 주세요.");
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
    setActiveStepId(step.id);
  }

  function moveStep(stepId, direction) {
    setSteps((current) => {
      const fromIndex = current.findIndex((step) => step.id === stepId);
      const toIndex = fromIndex + direction;
      if (fromIndex < 0 || toIndex < 0 || toIndex >= current.length) return current;
      const nextSteps = [...current];
      const [moved] = nextSteps.splice(fromIndex, 1);
      nextSteps.splice(toIndex, 0, moved);
      return nextSteps;
    });
    setActiveStepId(stepId);
  }

  function removeStep(stepId) {
    if (saving || busyImages.size > 0 || steps.length <= 1) return;
    const step = steps.find((candidate) => candidate.id === stepId);
    if (!step || !window.confirm(`“${step.title || "제목 없는 Step"}”을 삭제할까요?
활동 ${step.activities.length}개와 자료 ${step.resources.length}개가 함께 삭제됩니다.
프로젝트 저장 후 휴지통에서 복원할 수 있습니다.`)) return;
    setSteps((current) => current.filter((step) => step.id !== stepId));
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

  async function saveAddedItem(patch, nextKind = addingItem?.kind) {
    if (!addingItem) return false;
    addItem(addingItem.stepId, nextKind === "resource" ? "resources" : "activities", patch);
    setAddingItem(null);
    return true;
  }

  function updateItem(stepId, kind, itemId, patch, nextKind = kind) {
    const step = steps.find((item) => item.id === stepId);
    if (!step) return;
    updateStep(stepId, updateBookProjectItem(step, kind, itemId, patch, nextKind));
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

  function renderStepEditor(step) {
    const index = steps.findIndex((item) => item.id === step.id);
    const stepNumber = index >= 0 ? index + 1 : 1;
    return (
      <div className="book-step-edit-panel">
        <details className="book-editor-step-settings"><summary>STEP {stepNumber} 이름·학습 안내 수정</summary>
        <label className="book-step-title-field">
          <span>Step {stepNumber} 제목</span>
          <input
            value={step.title}
            onChange={(event) => updateStep(step.id, { title: event.target.value })}
            aria-label={`Step ${stepNumber} 제목`}
          />
        </label>
        <label className="book-step-description-field">
          <span>Step {stepNumber} 안내</span>
          <textarea
            rows={4}
            value={step.description ?? ""}
            onChange={(event) => updateStep(step.id, { description: event.target.value })}
            aria-label={`Step ${stepNumber} 안내`}
            disabled={saving}
          />
          <small>이 Step의 활동과 자료를 소개해 주세요. 비워 두어도 됩니다.</small>
        </label>
        </details>
        <div className="book-step-edit-meta">
          <small>{step.activities.length}개 활동 · {step.resources.length}개 자료</small>

        </div>
        <BookProjectEditorItems
          step={step}
          disabled={saving || busyImages.size > 0}
          onImageBusyChange={(key, busy) => setBusyImages((current) => {
            const next = new Set(current);
            const itemKey = `${step.id}:${key}`;
            if (busy) next.add(itemKey);
            else next.delete(itemKey);
            return next;
          })}
          onChange={(kind, id, patch, nextKind) => updateItem(step.id, kind, id, patch, nextKind)}
          onRemove={(kind, id) => removeItem(step.id, kind, id)}
          onMove={(fromKey, toKey) => moveItem(step.id, fromKey, toKey)}
          onAdd={(kind) => openAddItemModal(step.id, kind)}
        />
        {step.activities.length + step.resources.length === 0 && <div className="book-step-add-actions">
          <button type="button" className="btn-ghost" onClick={() => openAddItemModal(step.id, "activity")}>+ 활동 추가</button>
          <button type="button" className="btn-ghost" onClick={() => openAddItemModal(step.id, "resource")}>+ 자료 추가</button>
        </div>}

      </div>
    );
  }

  function renderStepOrderAction(step) {
    const index = steps.findIndex((item) => item.id === step.id);
    return (
      <div className="book-step-reorder-actions" aria-label={`${step.title || "Step"} 순서 이동`}>
        <button type="button" className="book-step-order-btn book-step-delete-btn" aria-label={`Step ${index + 1} 삭제`} title={steps.length <= 1 ? "프로젝트에는 최소 한 개의 Step이 필요합니다." : "Step 삭제"} disabled={saving || busyImages.size > 0 || steps.length <= 1} onClick={() => removeStep(step.id)}>
          <IconTrash size={15} />
        </button>
        <button
          type="button"
          className="book-step-order-btn"
          aria-label={`Step ${index + 1} 왼쪽으로 이동`}
          title="왼쪽으로 이동"
          disabled={saving || index <= 0}
          onClick={(event) => {
            event.stopPropagation();
            moveStep(step.id, -1);
          }}
        >
          ←
        </button>
        <button
          type="button"
          className="book-step-order-btn"
          aria-label={`Step ${index + 1} 오른쪽으로 이동`}
          title="오른쪽으로 이동"
          disabled={saving || index < 0 || index >= steps.length - 1}
          onClick={(event) => {
            event.stopPropagation();
            moveStep(step.id, 1);
          }}
        >
          →
        </button>
      </div>
    );
  }

  const draftProject = useMemo(() => ({ ...project, title, steps }), [project, steps, title]);
  const addingStep = addingItem ? steps.find((step) => step.id === addingItem.stepId) ?? null : null;

  useEffect(() => {
    onDraftChange?.(draftProject);
  }, [draftProject, onDraftChange]);

  const selectedEditorStep = steps.find(step => step.id === activeStepId) ?? steps[0];
  const fullEditor = (
    <div className="book-project-editor book-project-editor--visual">
      {copyPicker}
      {saveError && <p className="book-item-images-error" role="alert">{saveError}</p>}
      <label className="book-project-title-field">
        <span>프로젝트 이름</span>
        <input value={title} disabled={saving} onChange={event => setTitle(event.target.value)} placeholder="예: 우리 동네 생태 탐구" />
      </label>
      <div className="book-editor-section-heading"><strong>1. STEP 선택</strong><span>STEP을 선택한 뒤 활동과 자료를 편집하세요.</span></div>
      <nav className="book-editor-step-track" aria-label="프로젝트 STEP 선택">
        {steps.map((step, index) => <button type="button" key={step.id} className={`book-editor-step-tab${selectedEditorStep?.id === step.id ? " is-selected" : ""}`} aria-pressed={selectedEditorStep?.id === step.id} disabled={saving || busyImages.size > 0} onClick={() => setActiveStepId(step.id)}>
          <small>STEP {String(index + 1).padStart(2, "0")}</small><strong>{step.title || "제목 없는 STEP"}</strong><span>{step.activities.length} 활동 · {step.resources.length} 자료</span>
        </button>)}
        <button type="button" className="btn-outline book-editor-add-step" disabled={saving || busyImages.size > 0} onClick={addStep}><IconAddFeature size={17} /> STEP 추가</button>
      </nav>
      {selectedEditorStep && <section className="book-editor-selected-step" key={selectedEditorStep.id} aria-label={`${selectedEditorStep.title} 편집`}>
        <header className="book-editor-selected-heading"><h3>{selectedEditorStep.title}</h3>{renderStepOrderAction(selectedEditorStep)}</header>
        {renderStepEditor(selectedEditorStep)}
      </section>}
      {!expanded && <button type="button" className="btn-primary book-project-save" disabled={saving || busyImages.size > 0 || !title.trim() || steps.length === 0} onClick={saveProject}>{saving ? "저장 중..." : "프로젝트 저장"}</button>}
    </div>
  );

  return (
    <>
      <button ref={expandRef} type="button" className="btn-outline book-project-expand" onClick={() => setExpanded(true)}>프로젝트 크게 편집</button>
      {!expanded && fullEditor}
      {mounted && expanded && createPortal(
        <div className="modal-backdrop book-project-edit-backdrop" {...backdropClose(() => setExpanded(false))}>
          <section ref={dialogRef} inert={addingItem ? true : undefined} className="modal book-step-edit-modal book-project-edit-modal" role="dialog" aria-modal="true" aria-labelledby="book-project-dialog-title">
            <header className="modal-head">
              <h3 id="book-project-dialog-title">{project ? "프로젝트 편집" : "프로젝트 만들기"}</h3>
              <button type="button" className="btn-close" aria-label="패널로 돌아가기" onClick={() => setExpanded(false)}>×</button>
            </header>
            <div className="book-step-edit-modal-body">{fullEditor}</div>
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
