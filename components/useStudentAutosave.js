"use client";

import { useEffect, useMemo, useState } from "react";
import { registerStudentAutosaveFlush } from "@/lib/studentAutosave";

const DEBOUNCE_MS = 700;
const CACHE_PREFIX = "student-autosave:";
const draftsByScope = new Map();

function clonePlain(value) {
  if (value == null || typeof value !== "object") return {};
  return JSON.parse(JSON.stringify(value));
}

function equalPlain(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function cacheKey(scope) {
  return scope ? `${CACHE_PREFIX}${encodeURIComponent(scope)}` : "";
}

function readCache(scope) {
  const key = cacheKey(scope);
  if (!key || typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "null");
    if (!parsed || parsed.scope !== scope || !parsed.draft || !Array.isArray(parsed.dirtyKeys)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(scope, base, draft, dirtyKeys) {
  const key = cacheKey(scope);
  if (!key || typeof window === "undefined") return;
  try {
    if (!dirtyKeys.length) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, JSON.stringify({
      version: 1,
      scope,
      base,
      draft,
      dirtyKeys,
      updatedAt: Date.now(),
    }));
  } catch {}
}


function createDraft(scope, source, enabled) {
  if (draftsByScope.has(scope)) return draftsByScope.get(scope);
  const cached = enabled ? readCache(scope) : null;
  const state = {
    source: clonePlain(source), draft: clonePlain(source), dirty: new Set(), acknowledged: {},
    status: "idle", error: "", timer: null, operation: null, listeners: new Set(),
    notify() { for (const listener of state.listeners) listener(); },
    enabled: false, paused: false, save: null,
  };
  for (const key of cached?.dirtyKeys || []) {
    if (Object.hasOwn(source, key) && Object.hasOwn(cached.draft, key)) {
      state.draft[key] = cached.draft[key];
      state.dirty.add(key);
    }
  }
  if (state.dirty.size) state.status = "pending";
  const cache = () => writeCache(scope, state.source, state.draft, [...state.dirty]);
  const stopTimer = () => { clearTimeout(state.timer); state.timer = null; };
  function schedule() {
    stopTimer();
    if (state.enabled && !state.paused && state.dirty.size && state.status !== "failed") {
      state.timer = setTimeout(() => { state.timer = null; void flush(); }, DEBOUNCE_MS);
    }
  }
  function sync(nextSource) {
    const next = clonePlain(nextSource);
    for (const [key, value] of Object.entries(state.acknowledged)) {
      if (equalPlain(next[key], value)) delete state.acknowledged[key];
    }
    state.source = next;
    const merged = { ...next, ...state.acknowledged };
    for (const key of state.dirty) merged[key] = state.draft[key];
    if (!equalPlain(merged, state.draft)) {
      state.draft = merged;
      state.notify();
    }
  }
  function change(patch) {
    if (!state.enabled || !patch || typeof patch !== "object") return;
    let changed = false;
    const next = { ...state.draft };
    for (const [key, value] of Object.entries(patch)) {
      if (!Object.hasOwn(state.source, key) || equalPlain(next[key], value)) continue;
      next[key] = value;
      state.dirty.add(key);
      delete state.acknowledged[key];
      changed = true;
    }
    if (!changed) return;
    state.draft = next;
    state.status = "pending";
    state.error = "";
    cache();
    state.notify();
    schedule();
  }
  function flush() {
    stopTimer();
    if (state.operation) return state.operation;
    if (state.paused) return Promise.resolve(false);
    if (!state.enabled || !state.dirty.size) return Promise.resolve(!state.dirty.size);
    const run = async () => {
      while (state.enabled && !state.paused && state.dirty.size) {
        const patch = Object.fromEntries([...state.dirty].map((key) => [key, state.draft[key]]));
        const save = state.save;
        state.status = "saving";
        state.notify();
        try {
          if (await save(clonePlain(patch)) === false) throw new Error("자동 저장하지 못했어요. 다시 시도해 주세요.");
        } catch (error) {
          stopTimer();
          state.operation = null;
          state.status = "failed";
          state.error = error?.message || "자동 저장하지 못했어요. 다시 시도해 주세요.";
          cache();
          state.notify();
          return false;
        }
        for (const [key, value] of Object.entries(patch)) {
          if (!equalPlain(state.source[key], value)) state.acknowledged[key] = value;
          if (equalPlain(state.draft[key], value)) state.dirty.delete(key);
        }
        cache();
        state.status = state.dirty.size ? "pending" : "saved";
        state.error = "";
        state.notify();
      }
      return !state.dirty.size;
    };
    const operation = Promise.resolve().then(run).finally(() => {
      if (state.operation === operation) state.operation = null;
    });
    state.operation = operation;
    return operation;
  }
  const controller = { state, sync, change, flush, schedule, stopTimer, release() {
    if (!state.listeners.size && !state.operation && draftsByScope.get(scope) === controller) draftsByScope.delete(scope);
  } };
  draftsByScope.set(scope, controller);
  return controller;
}

export default function useStudentAutosave({ scope, value, enabled, ready = true, paused = false, onSave }) {
  const sourceSignature = JSON.stringify(value ?? {});
  const source = useMemo(() => JSON.parse(sourceSignature), [sourceSignature]);
  const controller = useMemo(() => createDraft(scope, source, enabled), [scope]);
  const [, redraw] = useState(0);
  const state = controller.state;
  state.enabled = Boolean(enabled && ready && scope && typeof onSave === "function");
  state.paused = paused;
  state.save = onSave;
  useEffect(() => {
    const notify = () => redraw((revision) => revision + 1);
    state.listeners.add(notify);
    const unregister = registerStudentAutosaveFlush(controller, controller.flush);
    const pagehide = () => { void controller.flush(); };
    window.addEventListener("pagehide", pagehide);
    return () => {
      state.listeners.delete(notify);
      unregister();
      window.removeEventListener("pagehide", pagehide);
      controller.stopTimer();
      void controller.flush().finally(controller.release);
    };
  }, [controller]);
  useEffect(() => { controller.sync(source); }, [controller, source]);
  useEffect(() => {
    controller.schedule();
    return controller.stopTimer;
  }, [controller, enabled, ready, paused]);
  return { draft: state.draft, change: controller.change, flush: controller.flush, status: state.status, error: state.error, dirty: state.dirty.size > 0 };
}
