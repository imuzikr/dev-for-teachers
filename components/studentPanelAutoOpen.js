import { useEffect, useRef, useState } from "react";

function panelItemKey(item) {
  return `${item.kind}:${item.id}`;
}

export function panelActiveState(sections) {
  return new Map(sections.flatMap(section => section.items.map(item => [panelItemKey(item), item.isActive === true])));
}

export function latestActivatedPanelItem(previous, sections) {
  if (!previous) return null;
  let activated = null;
  sections.forEach(section => section.items.forEach(item => {
    if (item.isActive === true && previous.get(panelItemKey(item)) !== true) {
      activated = { key: panelItemKey(item), stepId: item.stepId || section.id };
    }
  }));
  return activated;
}

export function useStudentPanelAutoOpenRequest({ sections, isTeacher, onSelectStep, ready = true, scope }) {
  const [autoOpenRequest, setAutoOpenRequest] = useState(null);
  const previousActiveState = useRef({ scope: "", state: null });
  const scopeGeneration = useRef({ identity: "", generation: 0 });
  const scopeIdentity = `${scope}:${isTeacher ? "teacher" : "student"}:${ready ? "ready" : "pending"}`;

  if (scopeGeneration.current.identity !== scopeIdentity) {
    scopeGeneration.current = {
      identity: scopeIdentity,
      generation: scopeGeneration.current.generation + 1,
    };
  }

  useEffect(() => {
    const activeScope = scopeIdentity;
    const generation = scopeGeneration.current.generation;
    if (!ready) {
      previousActiveState.current = { scope: activeScope, state: null };
      setAutoOpenRequest(null);
      return;
    }
    const previousActive = previousActiveState.current.scope === activeScope ? previousActiveState.current.state : null;
    previousActiveState.current = { scope: activeScope, state: panelActiveState(sections) };
    const activated = latestActivatedPanelItem(previousActive, sections);
    if (!activated) return;
    onSelectStep?.(activated.stepId);
    setAutoOpenRequest((current) => ({
      key: activated.key,
      stepId: activated.stepId,
      scope,
      generation,
      requestId: (current?.requestId ?? 0) + 1,
    }));
  }, [sections, isTeacher, onSelectStep, ready, scope, scopeIdentity]);

  return ready && autoOpenRequest?.scope === scope && autoOpenRequest?.generation === scopeGeneration.current.generation
    ? autoOpenRequest
    : null;
}
