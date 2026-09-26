"use client";

import { useEffect, useRef, useState } from "react";
import { isTeacher } from "@/lib/user";

function projectItem(project, target) {
  const step = project?.steps?.find((item) => item.id === target?.stepId);
  const items = target?.kind === "activity" ? step?.activities
    : target?.kind === "resource" ? step?.resources : [];
  return items?.find((item) => item.id === target?.item?.id) ?? null;
}

export function useBookProjectDeletion({
  user, classId, project, ready = true, saveProject, onToast,
}) {
  const scope = JSON.stringify([user?.uid, user?.role, classId, project?.id, project?.version]);
  const current = useRef(null);
  current.current = { user, classId, project, ready, scope };
  const operation = useRef(null);
  const busy = useRef(false);
  const [target, setTarget] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  function canDelete(targetScope) {
    const context = current.current;
    return context.ready && isTeacher(context.user) && Boolean(context.user?.uid)
      && Boolean(context.classId) && context.project?.id === context.classId
      && (!context.project.classId || context.project.classId === context.classId)
      && context.scope === targetScope;
  }

  function canFinish(active) {
    const currentUser = current.current.user;
    return isTeacher(currentUser) && currentUser?.uid === active.userId
      && currentUser?.role === active.userRole;
  }

  useEffect(() => {
    const active = operation.current;
    if (active && canFinish(active)
      && (busy.current || (active.scope === scope && canDelete(scope)))) return;
    operation.current = null;
    setTarget(null);
    setError("");
  }, [scope, ready]);

  function requestDelete(request) {
    if (busy.current || !canDelete(scope)
      || request?.classId !== classId || request?.projectId !== project.id) return false;
    const item = projectItem(project, request);
    if (!item) return false;
    const nextTarget = { ...request, item };
    operation.current = {
      target: nextTarget, scope, userId: user.uid, userRole: user.role,
    };
    setTarget(nextTarget);
    setError("");
    return true;
  }

  function closeDelete() {
    if (busy.current) return;
    operation.current = null;
    setTarget(null);
    setError("");
  }

  async function confirmDelete() {
    const active = operation.current;
    if (busy.current || !active || !canDelete(active.scope)) return false;
    const { target: selected } = active;
    const context = current.current;
    if (!active.projectSaved && !projectItem(context.project, selected)) {
      setError("이 항목이 변경되었거나 이미 삭제됐어요. 창을 닫고 다시 확인해 주세요.");
      return false;
    }
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const collection = selected.kind === "activity" ? "activities" : "resources";
      const nextSteps = context.project.steps.map((step) => step.id !== selected.stepId ? step : {
        ...step,
        [collection]: (step[collection] ?? []).filter((item) => item.id !== selected.item.id),
        itemOrder: (step.itemOrder ?? []).filter((item) => (
          item.kind !== selected.kind || item.id !== selected.item.id
        )),
      });
      await saveProject(context.user, {
        classId: context.classId, title: context.project.title, steps: nextSteps,
      });
      if (!canFinish(active) || operation.current !== active) return false;
      operation.current = null;
      setTarget(null);
      if (canDelete(active.scope)) onToast?.(selected.kind === "activity" ? "활동을 휴지통으로 옮겼어요." : "자료를 휴지통으로 옮겼어요.");
      return true;
    } catch (failure) {
      console.error("[책방] 프로젝트 항목 삭제 실패:", failure);
      if (canFinish(active) && operation.current === active) {
        setError("휴지통으로 옮기지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
      return false;
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return {
    target: canDelete(operation.current?.scope) ? target : null,
    pending, error, cleanupPending: false, requestDelete, confirmDelete, closeDelete,
  };
}
