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
    [to]: [...(step[to] ?? []), { ...updated, url, bookUrl: url, requiresAnswer: updated.requiresAnswer === true }],
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
      activities: items.filter((item) => item.kind === "activity"),
      resources: items.filter((item) => item.kind === "resource"),
      items,
    };
  });
}

export function bookProjectItemCount(sections) {
  return sections.reduce((total, section) => total + section.items.length, 0);
}
