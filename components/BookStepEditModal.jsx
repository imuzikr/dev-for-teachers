"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { backdropClose } from "@/lib/modal";
import BookProjectEditorItems from "./BookProjectEditorItems";
import BookProjectItemEditModal from "./BookProjectItemEditModal";

function orderKey(kind, id) {
  return `${kind}:${id}`;
}

function orderEntry(kind, id) {
  return { kind, id };
}

function newItem(kind = "activity") {
  return {
    id: crypto.randomUUID(),
    title: "",
    content: "",
    url: "",
    bookUrl: "",
    locked: false,
    ...(kind === "activity" ? { requiresAnswer: false } : {}),
  };
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

export default function BookStepEditModal({ project, step, stepNumber, saving, onSave, onClose }) {
  const [mounted, setMounted] = useState(false);
  const [title, setTitle] = useState(step?.title ?? "");
  const [activities, setActivities] = useState(() => (step?.activities ?? []).map((item) => ({ ...item })));
  const [resources, setResources] = useState(() => (step?.resources ?? []).map((item) => ({ ...item })));
  const [itemOrder, setItemOrder] = useState(() => normalizedOrder(step ?? { activities: [], resources: [] }));
  const [addingItem, setAddingItem] = useState(null);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setTitle(step?.title ?? "");
    setActivities((step?.activities ?? []).map((item) => ({ ...item })));
    setResources((step?.resources ?? []).map((item) => ({ ...item })));
    setItemOrder(normalizedOrder(step ?? { activities: [], resources: [] }));
  }, [step]);

  const draftStep = useMemo(() => ({
    ...(step ?? {}),
    title,
    activities,
    resources,
    itemOrder: normalizedOrder({ activities, resources, itemOrder }),
  }), [activities, itemOrder, resources, step, title]);

  const draftProject = useMemo(() => ({
    ...(project ?? {}),
    steps: (project?.steps ?? []).map((candidate) => (
      candidate.id === step?.id ? draftStep : candidate
    )),
  }), [draftStep, project, step?.id]);

  if (!mounted || !project || !step) return null;

  function updateItem(kind, itemId, patch) {
    const setCollection = kind === "resource" ? setResources : setActivities;
    setCollection((current) => current.map((item) => item.id === itemId ? { ...item, ...patch } : item));
  }

  function removeItem(kind, itemId) {
    const setCollection = kind === "resource" ? setResources : setActivities;
    setCollection((current) => current.filter((item) => item.id !== itemId));
    setItemOrder((current) => current.filter((item) => item.kind !== kind || item.id !== itemId));
  }

  function moveItem(fromKey, toKey) {
    if (fromKey === toKey) return;
    const currentOrder = normalizedOrder(draftStep);
    const fromIndex = currentOrder.findIndex((item) => orderKey(item.kind, item.id) === fromKey);
    const toIndex = currentOrder.findIndex((item) => orderKey(item.kind, item.id) === toKey);
    if (fromIndex < 0 || toIndex < 0) return;
    const nextOrder = [...currentOrder];
    const [moved] = nextOrder.splice(fromIndex, 1);
    nextOrder.splice(toIndex, 0, moved);
    setItemOrder(nextOrder);
  }

  async function saveAddedItem(patch) {
    if (!addingItem) return false;
    const item = { ...newItem(addingItem), ...patch };
    const setCollection = addingItem === "resource" ? setResources : setActivities;
    setCollection((current) => [...current, item]);
    setItemOrder((current) => [...current, orderEntry(addingItem, item.id)]);
    setAddingItem(null);
    return true;
  }

  async function saveStep() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || saving) return;
    const savedStep = { ...draftStep, title: trimmedTitle };
    setSaveError("");
    try {
      const saved = await onSave?.({
        title: project.title,
        steps: (project.steps ?? []).map((candidate) => (
          candidate.id === step.id ? savedStep : candidate
        )),
      });
      if (saved !== false) onClose();
      else setSaveError("저장하지 못했어요. 입력 내용은 유지됩니다. 다시 저장해 주세요.");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "저장하지 못했어요. 다시 저장해 주세요.");
    }
  }

  return createPortal(
    <div className="modal-backdrop book-item-edit-backdrop" {...backdropClose(onClose)}>
      <section className="modal book-step-edit-modal" role="dialog" aria-modal="true" aria-labelledby="book-step-edit-title" onClick={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div>
            <span>Step 크게 편집</span>
            <h3 id="book-step-edit-title">{title.trim() || `Step ${stepNumber}`}</h3>
          </div>
          <button type="button" className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </header>
        <div className="book-step-edit-modal-body">
          <label className="book-item-edit-field book-step-modal-title-field">
            <span>Step 제목</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              aria-label={`Step ${stepNumber} 제목`}
            />
          </label>
          <BookProjectEditorItems
            step={draftStep}
            onChange={updateItem}
            onRemove={removeItem}
            onMove={moveItem}
            onAdd={setAddingItem}
            disabled={saving}
          />
          {activities.length + resources.length === 0 && <div className="book-step-add-actions book-step-modal-add-actions">
            <button type="button" className="btn-ghost" onClick={() => setAddingItem("activity")}>+ 활동 추가</button>
            <button type="button" className="btn-ghost" onClick={() => setAddingItem("resource")}>+ 자료 추가</button>
          </div>}
        </div>
        {saveError && <p className="book-item-images-error" role="alert">{saveError}</p>}
        <footer className="book-item-edit-footer">
          <button type="button" className="btn-outline" onClick={onClose}>닫기</button>
          <button type="button" className="btn-primary" disabled={saving || !title.trim()} onClick={saveStep}>
            {saving ? "저장 중..." : "Step 저장"}
          </button>
        </footer>
      </section>
      {addingItem && (
        <BookProjectItemEditModal
          project={draftProject}
          step={draftStep}
          item={null}
          kind={addingItem}
          saving={saving}
          onSave={saveAddedItem}
          onClose={() => setAddingItem(null)}
        />
      )}
    </div>,
    document.body
  );
}
