const ITEM_COLLECTIONS = {
  activity: "activities",
  resource: "resources",
};

const ITEM_KINDS = Object.keys(ITEM_COLLECTIONS);

export function bookProjectError(message, code) {
  return Object.assign(new Error(message), { code });
}

function stepSummary(step) {
  return {
    id: step.id,
    title: step.title ?? "",
    description: step.description ?? "",
  };
}

function itemIdentity(kind, id) {
  return `${kind}:${id}`;
}

function itemIdentitySets(project) {
  const identities = new Set();
  const idsByKind = Object.fromEntries(ITEM_KINDS.map((kind) => [kind, new Set()]));
  (project?.steps ?? []).forEach((step) => {
    ITEM_KINDS.forEach((kind) => {
      (step[ITEM_COLLECTIONS[kind]] ?? []).forEach((item) => {
        identities.add(itemIdentity(kind, item.id));
        idsByKind[kind].add(item.id);
      });
    });
  });
  return { identities, idsByKind };
}

function otherKind(kind) {
  return kind === "activity" ? "resource" : "activity";
}

function hasItemAfterEdit(kind, id, previousItems, nextItems) {
  if (nextItems.identities.has(itemIdentity(kind, id))) return true;
  const counterpart = otherKind(kind);
  return nextItems.idsByKind[counterpart].has(id) && !previousItems.idsByKind[counterpart].has(id);
}

function stepWithoutMovedItems(step, previousItems, nextItems) {
  const activities = (step.activities ?? []).filter((item) => !hasItemAfterEdit("activity", item.id, previousItems, nextItems));
  const resources = (step.resources ?? []).filter((item) => !hasItemAfterEdit("resource", item.id, previousItems, nextItems));
  const kept = new Set([
    ...activities.map((item) => itemIdentity("activity", item.id)),
    ...resources.map((item) => itemIdentity("resource", item.id)),
  ]);
  return {
    ...step,
    activities,
    resources,
    itemOrder: (step.itemOrder ?? []).filter((item) => kept.has(itemIdentity(item?.kind, item?.id))),
  };
}

function orderIndexFor(step, kind, id) {
  return (step.itemOrder ?? []).findIndex((item) => item?.kind === kind && item?.id === id);
}

function trashBase({ classId, kind, title, projectVersion, projectTitle, payload, deletedBy, deletedAt }) {
  return {
    classId,
    kind,
    title,
    projectVersion: projectVersion ?? null,
    projectTitle: projectTitle ?? "",
    payload,
    deletedBy,
    deletedAt,
  };
}

export function projectTrashDoc(project, { deletedBy, deletedAt }) {
  return trashBase({
    classId: project.classId,
    kind: "project",
    title: project.title ?? "책방 프로젝트",
    projectVersion: project.version ?? null,
    projectTitle: project.title ?? "",
    payload: { project },
    deletedBy,
    deletedAt,
  });
}

export function removedBookProjectTrashDocs(existingProject, storedSteps, { deletedBy, deletedAt }) {
  if (!existingProject) return [];
  const classId = existingProject.classId;
  const nextStepIds = new Set(storedSteps.map((step) => step.id));
  const previousItems = itemIdentitySets(existingProject);
  const nextItems = itemIdentitySets({ steps: storedSteps });
  const projectVersion = existingProject.version ?? null;
  const projectTitle = existingProject.title ?? "";
  const docs = [];

  (existingProject.steps ?? []).forEach((step, index) => {
    if (!nextStepIds.has(step.id)) {
      const archivedStep = stepWithoutMovedItems(step, previousItems, nextItems);
      docs.push(trashBase({
        classId,
        kind: "step",
        title: step.title ?? `Step ${index + 1}`,
        projectVersion,
        projectTitle,
        payload: { step: archivedStep, index },
        deletedBy,
        deletedAt,
      }));
      return;
    }

    ITEM_KINDS.forEach((kind) => {
      const collection = ITEM_COLLECTIONS[kind];
      (step[collection] ?? []).forEach((item, itemIndex) => {
        if (hasItemAfterEdit(kind, item.id, previousItems, nextItems)) return;
        docs.push(trashBase({
          classId,
          kind,
          title: item.title ?? "",
          projectVersion,
          projectTitle,
          payload: {
            item,
            step: stepSummary(step),
            index,
            itemIndex,
            orderIndex: orderIndexFor(step, kind, item.id),
          },
          deletedBy,
          deletedAt,
        }));
      });
    });
  });

  return docs;
}

function insertAt(list, item, index) {
  const next = [...list];
  const bounded = Math.max(0, Math.min(Number.isInteger(index) ? index : next.length, next.length));
  next.splice(bounded, 0, item);
  return next;
}

function projectItemIds(project) {
  return itemIdentitySets(project).identities;
}

function ensureVersion(project, trash) {
  if (!trash.projectVersion) {
    throw bookProjectError("버전 정보가 없는 예전 휴지통 항목은 안전하게 복원할 수 없어요.", "book-trash/unsupported");
  }
  if ((project.version ?? null) !== (trash.projectVersion ?? null)) {
    throw bookProjectError("프로젝트가 변경되었어요. 다시 확인해 주세요.", "book-project/stale");
  }
}

function ensureItemAvailable(project, kind, id) {
  if (projectItemIds(project).has(`${kind}:${id}`)) {
    throw bookProjectError("같은 항목이 이미 프로젝트에 있어요. 덮어쓰지 않고 복원을 멈췄습니다.", "book-trash/conflict");
  }
}

function restoreStep(project, trash) {
  ensureVersion(project, trash);
  const step = trash.payload?.step;
  if (!step?.id) throw bookProjectError("복원할 단계를 찾지 못했어요.", "book-trash/invalid");
  for (const kind of ITEM_KINDS) {
    for (const item of step[ITEM_COLLECTIONS[kind]] ?? []) ensureItemAvailable(project, kind, item.id);
  }
  const steps = [...(project.steps ?? [])];
  const existingIndex = steps.findIndex((item) => item.id === step.id);
  if (existingIndex >= 0) {
    const existingStep = steps[existingIndex];
    const existingIds = new Set(ITEM_KINDS.flatMap((kind) =>
      (existingStep[ITEM_COLLECTIONS[kind]] ?? []).map((item) => `${kind}:${item.id}`)
    ));
    const merged = { ...existingStep, title: existingStep.title || step.title, description: existingStep.description || step.description };
    ITEM_KINDS.forEach((kind) => {
      const collection = ITEM_COLLECTIONS[kind];
      merged[collection] = [...(existingStep[collection] ?? []), ...(step[collection] ?? [])];
    });
    merged.itemOrder = [
      ...(existingStep.itemOrder ?? []),
      ...(step.itemOrder ?? []).filter((item) => !existingIds.has(`${item.kind}:${item.id}`)),
    ];
    steps[existingIndex] = merged;
    return { ...project, steps };
  }
  return { ...project, steps: insertAt(steps, step, trash.payload?.index) };
}

function emptyStep(summary) {
  return {
    id: summary.id,
    title: summary.title ?? "",
    description: summary.description ?? "",
    activities: [],
    resources: [],
    itemOrder: [],
  };
}

function restoreItem(project, trash) {
  ensureVersion(project, trash);
  const collection = ITEM_COLLECTIONS[trash.kind];
  const item = trash.payload?.item;
  const stepSummaryPayload = trash.payload?.step;
  if (!collection || !item?.id || !stepSummaryPayload?.id) {
    throw bookProjectError("복원할 항목을 찾지 못했어요.", "book-trash/invalid");
  }
  ensureItemAvailable(project, trash.kind, item.id);
  const steps = [...(project.steps ?? [])];
  let stepIndex = steps.findIndex((step) => step.id === stepSummaryPayload.id);
  if (stepIndex < 0) {
    stepIndex = Math.max(0, Math.min(Number.isInteger(trash.payload?.index) ? trash.payload.index : steps.length, steps.length));
    steps.splice(stepIndex, 0, emptyStep(stepSummaryPayload));
  }
  const step = steps[stepIndex];
  const itemOrder = insertAt(step.itemOrder ?? [], { kind: trash.kind, id: item.id }, trash.payload?.orderIndex);
  steps[stepIndex] = {
    ...step,
    [collection]: insertAt(step[collection] ?? [], item, trash.payload?.itemIndex),
    itemOrder,
  };
  return { ...project, steps };
}

export function restoreBookProjectFromTrash(currentProject, trash) {
  if (trash.kind === "project") {
    if (currentProject) {
      throw bookProjectError("현재 책방 프로젝트가 있어요. 먼저 현재 프로젝트를 휴지통으로 옮긴 뒤 원래 프로젝트를 복원해 주세요.", "book-trash/conflict");
    }
    const project = trash.payload?.project;
    if (!project?.classId) throw bookProjectError("복원할 프로젝트를 찾지 못했어요.", "book-trash/invalid");
    if (!project.version) throw bookProjectError("버전 정보가 없는 예전 프로젝트는 안전하게 복원할 수 없어요.", "book-trash/unsupported");
    return project;
  }
  if (!currentProject) {
    throw bookProjectError("복원할 원래 책방 프로젝트를 먼저 복원해 주세요.", "book-project/not-found");
  }
  if (trash.kind === "step") return restoreStep(currentProject, trash);
  return restoreItem(currentProject, trash);
}
