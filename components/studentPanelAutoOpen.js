import { useEffect, useRef, useState } from "react";

function panelItemKey(item) {
  return `${item.kind}:${item.id}`;
}

export function studentPanelLockState(sections) {
  return new Map(sections.flatMap((section) => (
    section.items.map((item) => [panelItemKey(item), item.source?.locked === true])
  )));
}

export function latestUnlockedPanelItem(previousLockState, sections) {
  if (!previousLockState) return null;

  let unlocked = null;
  sections.forEach((section) => {
    section.items.forEach((item) => {
      const key = panelItemKey(item);
      if (previousLockState.get(key) === true && item.source?.locked !== true) {
        unlocked = { key, stepId: item.stepId || section.id };
      }
    });
  });
  return unlocked;
}

export function useStudentPanelAutoOpenRequest({ sections, isTeacher, onSelectStep, ready = true, scope }) {
  const [autoOpenRequest, setAutoOpenRequest] = useState(null);
  const previousLockState = useRef({ scope: "", lockState: null });
  const scopeGeneration = useRef({ identity: "", generation: 0 });
  const scopeIdentity = `${scope}:${isTeacher ? "teacher" : "student"}:${ready ? "ready" : "pending"}`;

  if (scopeGeneration.current.identity !== scopeIdentity) {
    scopeGeneration.current = {
      identity: scopeIdentity,
      generation: scopeGeneration.current.generation + 1,
    };
  }

  useEffect(() => {
    const nextLockState = studentPanelLockState(sections);
    const lockScope = scopeIdentity;
    const generation = scopeGeneration.current.generation;
    if (!ready) {
      previousLockState.current = { scope: lockScope, lockState: null };
      setAutoOpenRequest(null);
      return;
    }
    const previous = previousLockState.current.scope === lockScope
      ? previousLockState.current.lockState
      : null;
    previousLockState.current = { scope: lockScope, lockState: nextLockState };
    if (isTeacher) return;

    const unlocked = latestUnlockedPanelItem(previous, sections);
    if (!unlocked) return;
    onSelectStep?.(unlocked.stepId);
    setAutoOpenRequest((current) => ({
      key: unlocked.key,
      stepId: unlocked.stepId,
      scope,
      generation,
      requestId: (current?.requestId ?? 0) + 1,
    }));
  }, [sections, isTeacher, onSelectStep, ready, scope, scopeIdentity]);

  return ready && autoOpenRequest?.scope === scope && autoOpenRequest?.generation === scopeGeneration.current.generation
    ? autoOpenRequest
    : null;
}
