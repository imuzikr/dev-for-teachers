"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";

const PanelContext = createContext(null);

export function useStudentActivityPanel() {
  return useContext(PanelContext);
}

export default function StudentActivityPanel({ children, enabled, scope = "", records = [], saveChecklist, itemKeys }) {
  const [selectedKey, setSelectedKey] = useState(null);
  const [requestedKey, setRequestedKey] = useState(null);
  const [collapsed, setCollapsed] = useState(true);
  const [target, setTarget] = useState(null);
  const restored = useRef(false);
  const visibleKey = itemKeys.has(selectedKey) ? selectedKey : null;
  const nextKey = itemKeys.has(requestedKey) ? requestedKey : null;
  const switching = visibleKey !== null && nextKey !== visibleKey;

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`student-panel:${scope}`) || "null");
      if (saved) {
        const key = itemKeys.has(saved.selectedKey) ? saved.selectedKey : null;
        setSelectedKey(key);
        setRequestedKey(key);
        setCollapsed(saved.collapsed !== false);
      }
    } catch { /* Keep the default panel when browser storage is unavailable. */ }
    restored.current = true;
  }, [scope]);

  useEffect(() => {
    if (requestedKey !== nextKey) setRequestedKey(nextKey);
    if (selectedKey && !visibleKey) setSelectedKey(null);
    if (restored.current) {
      try { localStorage.setItem(`student-panel:${scope}`, JSON.stringify({ selectedKey: nextKey, collapsed })); }
      catch { /* In-memory panel state still works without browser storage. */ }
    }
    if (visibleKey === nextKey) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => {
      setSelectedKey(nextKey);
      if (target) target.closest("aside").scrollTop = 0;
    }, switching && !collapsed && !reduceMotion ? 120 : 0);
    return () => window.clearTimeout(timer);
  }, [requestedKey, nextKey, selectedKey, visibleKey, switching, collapsed, scope, target]);

  const value = enabled ? {
    selectedKey: visibleKey, scope, records, saveChecklist, target,
    open(key) {
      if (!itemKeys.has(key)) return;
      setRequestedKey(key);
      setCollapsed(false);
    },
  } : null;

  return (
    <PanelContext.Provider value={value}>
      {children({ collapsed, sidebar: enabled ? (
        <aside className={`book-library-side student-activity-side${collapsed ? " is-collapsed" : ""}`} aria-label="선택한 활동과 자료">
          <button type="button" className="book-library-collapse" onClick={() => setCollapsed(!collapsed)} aria-expanded={!collapsed} aria-label={collapsed ? "활동 패널 펼치기" : "활동 패널 접기"} title={collapsed ? "활동 패널 펼치기" : "활동 패널 접기"}>
            <span aria-hidden="true">{collapsed ? "»" : "«"}</span>
          </button>
          <div className="student-activity-panel-content" inert={collapsed} aria-hidden={collapsed}>
            <div className={`student-activity-panel-item${switching ? " is-switching" : ""}`} inert={switching} ref={setTarget} />
          </div>
        </aside>
      ) : null })}
    </PanelContext.Provider>
  );
}
