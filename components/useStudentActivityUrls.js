"use client";

import { useEffect, useRef, useState } from "react";
import { normalizeBookItemUrls } from "@/lib/bookItemUrls";

function initialState(scope, generation, urls) {
  const draft = Array.isArray(urls) ? [...urls] : [];
  return { scope, generation, draft, sourceKey: JSON.stringify(draft), savedKey: JSON.stringify(draft), revision: 0, dirty: false, saving: false, error: "" };
}

export default function useStudentActivityUrls({ urls, scope, enabled, ready = true, onSave }) {
  const current = useRef({ scope, enabled, generation: 0 });
  if (current.current.scope !== scope || current.current.enabled !== enabled) current.current.generation += 1;
  const generation = current.current.generation;
  current.current = { scope, enabled, ready, onSave, generation };
  const [state, setState] = useState(() => initialState(scope, generation, urls));
  const latest = useRef(state);
  const operation = useRef(null);
  const sourceKey = JSON.stringify(Array.isArray(urls) ? urls : []);

  function update(next) {
    latest.current = next;
    setState(next);
  }

  function isCurrent() {
    const context = current.current;
    return context.scope === scope && context.generation === generation && context.enabled && context.ready;
  }

  useEffect(() => {
    const previous = latest.current;
    if (previous.scope !== scope || previous.generation !== generation) {
      operation.current = null;
      update(initialState(scope, generation, urls));
    } else if (previous.sourceKey !== sourceKey) {
      const draft = previous.dirty || previous.saving ? previous.draft : JSON.parse(sourceKey);
      update({ ...previous, sourceKey, savedKey: sourceKey, draft, dirty: JSON.stringify(draft) !== sourceKey });
    }
  }, [scope, generation, sourceKey]);

  function change(next) {
    if (!isCurrent() || !Array.isArray(next)) return false;
    const previous = latest.current;
    if (previous.scope !== scope || previous.generation !== generation) return false;
    const draft = [...next];
    update({ ...previous, draft, revision: previous.revision + 1, dirty: JSON.stringify(draft) !== previous.savedKey, error: "" });
    return true;
  }

  async function save(persist = current.current.onSave) {
    const previous = latest.current;
    if (!isCurrent() || operation.current || previous.scope !== scope || previous.generation !== generation || typeof persist !== "function") return false;
    let normalized;
    try {
      normalized = normalizeBookItemUrls(previous.draft);
    } catch (failure) {
      update({ ...previous, error: failure instanceof Error ? failure.message : "올바른 URL을 입력해 주세요." });
      return false;
    }
    const active = { scope, generation, revision: previous.revision };
    operation.current = active;
    update({ ...previous, saving: true, error: "" });
    try {
      const saved = await persist(normalized);
      if (!isCurrent() || operation.current !== active) return false;
      if (saved === false) throw new Error("URL을 저장하지 못했어요. 다시 시도해 주세요.");
      const latestState = latest.current;
      const draft = latestState.revision === active.revision ? normalized : latestState.draft;
      const savedKey = JSON.stringify(normalized);
      update({ ...latestState, draft, savedKey, dirty: JSON.stringify(draft) !== savedKey, error: "" });
      return true;
    } catch {
      if (isCurrent() && operation.current === active) {
        update({ ...latest.current, error: "URL을 저장하지 못했어요. 입력 내용은 유지됩니다. 다시 시도해 주세요." });
      }
      return false;
    } finally {
      if (operation.current === active) {
        operation.current = null;
        if (current.current.scope === scope && current.current.generation === generation) update({ ...latest.current, saving: false });
      }
    }
  }

  const view = state.scope === scope && state.generation === generation ? state : initialState(scope, generation, urls);
  return { draft: view.draft, change, saving: view.saving, error: view.error, save, dirty: view.dirty };
}
