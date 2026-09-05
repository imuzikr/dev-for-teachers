import { orderedStepItems } from "./BookProjectPreview";

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
      .map((item) => ({ ...item, stepId, stepTitle }));
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
