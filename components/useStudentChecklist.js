"use client";

import { useEffect, useRef, useState } from "react";
import { safeDisplayHtml } from "@/lib/html";
import { checklistComplete, checklistSnapshot, checklistVersion } from "@/lib/activityChecklist";
import { useStudentActivityPanel } from "./StudentActivityPanel";

export default function useStudentChecklist(item) {
  const panel = useStudentActivityPanel();
  const key = `${item.kind}:${item.id}`;
  const version = checklistVersion(item.source.content || "");
  const [values, setValues] = useState({});
  const [defaults, setDefaults] = useState([]);
  const [loadedVersion, setLoadedVersion] = useState(null);
  const [status, setStatus] = useState("");
  const revision = useRef(0);
  const pending = useRef(false);
  const record = panel?.records?.find((entry) => `${entry.itemKind}:${entry.itemId}` === key);
  const storageKey = panel ? `book-checklist:${panel.scope}:${key}` : null;

  useEffect(() => {
    const root = document.createElement("div");
    root.innerHTML = safeDisplayHtml(item.source.content || "");
    setDefaults([...root.querySelectorAll('input[type="checkbox"]')].map((input) => input.checked));
    setLoadedVersion(version);
    setValues({});
    setStatus("");
    pending.current = false;
    revision.current += 1;
    if (!storageKey) return;
    try {
      const cached = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (cached?.version === version && Array.isArray(cached.values)) {
        setValues(cached.values);
        if (cached.pending) { pending.current = true; setStatus("failed"); }
      }
    } catch { /* Storage can be unavailable in private sessions. */ }
  }, [storageKey, version, item.source.content]);

  useEffect(() => {
    if (!pending.current && record?.checklistVersion === version && Array.isArray(record.checklistValues)) {
      setValues(record.checklistValues);
    }
  }, [record, version]);

  function cache(next, isPending) {
    if (!storageKey) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ version, values: next, pending: isPending })); }
    catch { /* Server persistence remains available without local storage. */ }
  }

  async function persist(next) {
    setValues(next);
    if (!panel?.saveChecklist) return;
    const request = ++revision.current;
    pending.current = true;
    setStatus("saving");
    cache(next, true);
    try {
      await panel.saveChecklist(item, {
        checklistValues: next, checklistVersion: version,
        confirmed: false,
      });
      if (revision.current === request) {
        pending.current = false;
        setStatus("saved");
        cache(next, false);
      }
    } catch {
      if (revision.current === request) setStatus("failed");
    }
  }

  const snapshot = checklistSnapshot(defaults, values);
  return {
    values, status: loadedVersion === version ? status : "loading", hasChecklist: defaults.length > 0,
    complete: checklistComplete(snapshot),
    change: (next) => persist(checklistSnapshot(defaults, next)),
    checkAll: () => {
      if (loadedVersion !== version || defaults.length === 0) return;
      return persist(defaults.map(() => true));
    },
    uncheckAll: () => {
      if (loadedVersion !== version || defaults.length === 0) return;
      return persist(defaults.map(() => false));
    },
    retry: () => persist(snapshot),
    async confirm(save) {
      if (loadedVersion !== version || !checklistComplete(snapshot)) return false;
      const request = ++revision.current;
      pending.current = true;
      const saved = await save();
      if (request === revision.current) {
        pending.current = saved === false;
        setStatus(saved === false ? "failed" : "saved");
        cache(snapshot, saved === false);
      }
      return saved;
    },
    confirmation: { checklistValues: snapshot, checklistVersion: version, confirmed: checklistComplete(snapshot) },
  };
}
