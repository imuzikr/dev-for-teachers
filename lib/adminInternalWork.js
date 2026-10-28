export function internalClassesForUser(classes, memberships, uid) {
  const ids = new Set((memberships ?? []).filter(member => member.uid === uid).map(member => member.classId));
  return classes.filter(item => item.purpose === "internal" && ids.has(item.id));
}

// Never reuse another user's entry or a previous project's confirmation.
export function internalWorkRecord({ item, entry, confirmations, uid, classId, projectId }) {
  const ownedEntry = item.kind === "activity" && entry?.authorId === uid && entry.activityId === item.id ? entry : null;
  const confirmation = confirmations.find(record => record.authorId === uid && record.classId === classId
    && record.projectId === projectId && record.itemKind === item.kind && record.itemId === item.id);
  const values = ownedEntry?.templateValues ?? confirmation?.templateValues ?? {};
  const templateValues = Object.fromEntries(Object.entries(values).filter(([, value]) => typeof value === "string"));
  const legacy = ownedEntry?.answers;
  const answer = typeof ownedEntry?.dashboardText === "string" ? ownedEntry.dashboardText
    : typeof legacy === "string" ? legacy : typeof legacy?.dashboardText === "string" ? legacy.dashboardText : "";
  const answers = Object.entries(legacy && typeof legacy === "object" ? legacy : {})
    .filter(([key, value]) => key !== "dashboardText" && typeof value === "string" && value.trim());
  const urls = Array.isArray(ownedEntry?.urls) ? ownedEntry.urls : [];
  const images = Array.isArray(ownedEntry?.images) ? ownedEntry.images : [];
  const hasTemplate = Object.values(templateValues).some(value => value.trim());
  const checklist = Array.isArray(confirmation?.checklistValues) ? confirmation.checklistValues : null;
  return {
    answer, answers, urls, images, templateValues,
    templateText: typeof confirmation?.templateText === "string" ? confirmation.templateText : "",
    hasTemplate, checklist,
    viewed: confirmation?.viewed === true || confirmation?.confirmed === true,
    hasContent: Boolean(answer.trim() || answers.length || urls.length || images.length || hasTemplate || checklist?.length),
    updatedAt: ownedEntry?.updatedAt ?? confirmation?.updatedAt ?? null,
  };
}
