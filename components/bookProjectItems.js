import { orderedStepItems } from "./BookProjectPreview";

function orderKey(kind, id) {
  return `${kind}:${id}`;
}

function orderEntry(item) {
  return { kind: item.kind, id: item.id };
}

export function updateBookProjectItem(step, kind, id, patch, nextKind = kind) {
  const from = kind === "resource" ? "resources" : "activities";
  const to = nextKind === "resource" ? "resources" : "activities";
  const original = step[from]?.find(item => item.id === id);
  if (!original) return step;
  const updated = { ...original, ...patch, id };
  if (from === to) return { ...step, [from]: step[from].map(item => item.id === id ? updated : item) };
  if (step[to]?.some(item => item.id === id)) throw new Error("같은 ID의 항목이 있어 변환할 수 없습니다.");
  const url = kind === "activity" ? updated.bookUrl || updated.url || "" : updated.url || "";
  return {
    ...step,
    [from]: step[from].filter(item => item.id !== id),
    [to]: [...(step[to] ?? []), { ...updated, locked: false, url, bookUrl: url, requiresAnswer: updated.requiresAnswer === true }],
    itemOrder: orderedStepItems(step).map(item => ({ kind: item.kind === kind && item.id === id ? nextKind : item.kind, id: item.id })),
  };
}

function fallbackActivityItems(activities) {
  return activities.map((activity) => ({
    id: activity.id,
    kind: "activity",
    label: "활동",
    title: activity.title,
    source: activity,
    stepId: "activities",
    stepTitle: "활동",
  }));
}

export function reorderBookProjectStepItem(step, item, target) {
  const items = orderedStepItems(step);
  const fromKey = orderKey(item?.kind, item?.id);
  const fromIndex = items.findIndex((entry) => orderKey(entry.kind, entry.id) === fromKey);
  if (fromIndex < 0) return step;

  const toIndex = typeof target === "number"
    ? fromIndex + target
    : items.findIndex((entry) => orderKey(entry.kind, entry.id) === orderKey(target?.kind, target?.id));
  if (toIndex < 0 || toIndex >= items.length || toIndex === fromIndex) return step;

  const nextItems = [...items];
  const [moved] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, moved);
  return { ...step, itemOrder: nextItems.map(orderEntry) };
}

// Cross-STEP moves retain item identity and append after the destination's mixed list.
export function reorderBookProjectSteps(steps, stepId, target) {
  const from = steps.findIndex(step => step.id === stepId);
  const to = typeof target === "number" ? from + target : steps.findIndex(step => step.id === target);
  if (from < 0 || to < 0 || to >= steps.length || from === to) return steps;
  const next = [...steps];
  const [step] = next.splice(from, 1);
  next.splice(to, 0, step);
  return next;
}

export function moveBookProjectItem(steps, item, target) {
  if (!["activity", "resource"].includes(item?.kind)) return steps;
  const source = steps.find(step => step.id === item.stepId);
  if (!source) return steps;
  const destinationId = typeof target === "number" ? item.stepId : target?.stepId ?? item.stepId;
  if (destinationId === item.stepId) {
    const next = reorderBookProjectStepItem(source, item, target);
    return next === source ? steps : steps.map(step => step === source ? next : step);
  }
  const destination = steps.find(step => step.id === destinationId);
  const collection = item.kind === "resource" ? "resources" : "activities";
  const original = source[collection]?.find(entry => entry.id === item.id);
  if (!destination || !original) return steps;
  if (destination[collection]?.some(entry => entry.id === item.id)) throw new Error("대상 STEP에 같은 ID의 항목이 있어 이동할 수 없습니다.");
  return steps.map(step => {
    if (step === source) return { ...step,
      [collection]: step[collection].filter(entry => entry.id !== item.id),
      itemOrder: orderedStepItems(step).filter(entry => !(entry.kind === item.kind && entry.id === item.id)).map(orderEntry),
    };
    if (step === destination) return { ...step,
      [collection]: [...(step[collection] ?? []), original],
      itemOrder: [...orderedStepItems(step).map(orderEntry), { kind: item.kind, id: item.id }],
    };
    return step;
  });
}

export function bookDetailSections(project, activities) {
  if (!project?.steps?.length) {
    return activities.length
      ? [{ id: "activities", title: "활동", activities, resources: [], items: fallbackActivityItems(activities) }]
      : [];
  }

  const activityIds = new Set(activities.map((activity) => activity.id));
  return project.steps.map((step, index) => {
    const stepId = step.id ?? `step-${index + 1}`;
    const stepTitle = step.title || `Step ${index + 1}`;
    const items = orderedStepItems(step)
      .filter((item) => item.kind === "resource" || activityIds.has(item.id))
      .map((item) => ({
        ...item,
        stepId,
        stepTitle,
        isActive: project.activeItemByStep?.[stepId] === `${item.kind}:${item.id}`,
      }));
    return {
      id: stepId,
      title: stepTitle,
      description: typeof step.description === "string" ? step.description : "",
      activities: items.filter((item) => item.kind === "activity"),
      resources: items.filter((item) => item.kind === "resource"),
      items,
    };
  });
}

export function bookProjectItemCount(sections) {
  return sections.reduce((total, section) => total + section.items.length, 0);
}
