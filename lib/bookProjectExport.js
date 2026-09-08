"use client";

import { normalizeBookItemImages, normalizeBookImageSizes } from "./bookProjectImages";

function newId() {
  return crypto.randomUUID();
}

function orderKey(kind, id) {
  return `${kind}:${id}`;
}

function orderEntry(kind, id) {
  return { kind, id };
}

function cloneActivity(activity) {
  return {
    id: newId(),
    title: activity.title,
    content: activity.content || "",
    images: normalizeBookItemImages(activity.images),
    imageSizes: normalizeBookImageSizes(activity.imageSizes, activity.images),
    url: activity.bookUrl || activity.url || "",
    bookUrl: activity.bookUrl || activity.url || "",
    locked: activity.locked !== false,
    requiresAnswer: activity.requiresAnswer !== false,
    templateEnabled: activity.templateEnabled === true,
  };
}

function cloneResource(resource) {
  return {
    id: newId(),
    title: resource.title,
    content: resource.content || "",
    images: normalizeBookItemImages(resource.images),
    imageSizes: normalizeBookImageSizes(resource.imageSizes, resource.images),
    url: resource.url || "",
    locked: resource.locked === true,
  };
}

function cloneItem(kind, item) {
  return kind === "resource" ? cloneResource(item) : cloneActivity(item);
}

function itemOrderFrom(step) {
  const valid = new Set([
    ...(step.activities ?? []).map((item) => orderKey("activity", item.id)),
    ...(step.resources ?? []).map((item) => orderKey("resource", item.id)),
  ]);
  const seen = new Set();
  const ordered = (step.itemOrder ?? [])
    .filter((entry) => {
      const kind = entry?.kind === "resource" ? "resource" : entry?.kind === "activity" ? "activity" : "";
      const key = kind && entry?.id ? orderKey(kind, entry.id) : "";
      if (!key || !valid.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((entry) => orderEntry(entry.kind, entry.id));
  return [
    ...ordered,
    ...(step.activities ?? []).filter((item) => !seen.has(orderKey("activity", item.id))).map((item) => orderEntry("activity", item.id)),
    ...(step.resources ?? []).filter((item) => !seen.has(orderKey("resource", item.id))).map((item) => orderEntry("resource", item.id)),
  ];
}

export function cloneBookProjectStep(step) {
  const activityPairs = (step.activities ?? []).map((activity) => [activity.id, cloneActivity(activity)]);
  const resourcePairs = (step.resources ?? []).map((resource) => [resource.id, cloneResource(resource)]);
  const idMap = new Map([...activityPairs, ...resourcePairs].map(([sourceId, item]) => [sourceId, item.id]));
  const clonedStep = {
    id: newId(),
    title: step.title || "내보낸 Step",
    activities: activityPairs.map(([, activity]) => activity),
    resources: resourcePairs.map(([, resource]) => resource),
    itemOrder: [],
  };
  clonedStep.itemOrder = itemOrderFrom(step)
    .map((entry) => ({ kind: entry.kind, id: idMap.get(entry.id) }))
    .filter((entry) => entry.id);
  return clonedStep;
}

export function appendClonedBookProjectSteps(targetProject, sourceProject) {
  const currentSteps = targetProject?.steps ?? [];
  return {
    title: targetProject?.title || sourceProject?.title || "개발자실 프로젝트",
    steps: [
      ...currentSteps,
      ...(sourceProject?.steps ?? []).map(cloneBookProjectStep),
    ],
  };
}

export function appendClonedBookProjectStep(targetProject, sourceProject, sourceStep) {
  const currentSteps = targetProject?.steps ?? [];
  return {
    title: targetProject?.title || sourceProject?.title || "개발자실 프로젝트",
    steps: [...currentSteps, cloneBookProjectStep(sourceStep)],
  };
}

export function appendClonedBookProjectItem(targetProject, sourceProject, sourceStep, itemKind, sourceItem, targetStepId) {
  const currentSteps = targetProject?.steps ?? [];
  const fallbackStep = {
    id: newId(),
    title: sourceStep?.title || "내보낸 Step",
    activities: [],
    resources: [],
    itemOrder: [],
  };
  const targetSteps = currentSteps.length > 0 ? currentSteps : [fallbackStep];
  const selectedStepId = targetSteps.some((step) => step.id === targetStepId)
    ? targetStepId
    : targetSteps[targetSteps.length - 1].id;
  const collectionKey = itemKind === "resource" ? "resources" : "activities";
  const clonedItem = cloneItem(itemKind, sourceItem);
  return {
    title: targetProject?.title || sourceProject?.title || "개발자실 프로젝트",
    steps: targetSteps.map((step) => (
      step.id === selectedStepId
        ? {
            ...step,
            [collectionKey]: [...(step[collectionKey] ?? []), clonedItem],
            itemOrder: [...itemOrderFrom(step), orderEntry(itemKind, clonedItem.id)],
          }
        : step
    )),
  };
}
