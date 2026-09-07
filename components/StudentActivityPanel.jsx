"use client";

import { createContext, useContext, useEffect, useState } from "react";

const PanelContext = createContext(null);

export function useStudentActivityPanel() {
  return useContext(PanelContext);
}

export default function StudentActivityPanel({ children, enabled, scope = "", records = [], saveChecklist }) {
  const [selectedKey, setSelectedKey] = useState(null);
  const [collapsed, setCollapsed] = useState(true);
  const [target, setTarget] = useState(null);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`student-panel:${scope}`) || "null");
      if (saved) { setSelectedKey(saved.selectedKey); setCollapsed(saved.collapsed !== false); }
    } catch { /* Keep the default panel when browser storage is unavailable. */ }
  }, [scope]);
  function remember(key, nextCollapsed) {
    setSelectedKey(key);
    setCollapsed(nextCollapsed);
    try { localStorage.setItem(`student-panel:${scope}`, JSON.stringify({ selectedKey: key, collapsed: nextCollapsed })); }
    catch { /* In-memory panel state still works without browser storage. */ }
  }
  const value = enabled ? {
    selectedKey, scope, records, saveChecklist,
    target,
    open(key) { remember(key, false); },
  } : null;

  return (
    <PanelContext.Provider value={value}>
      {children({ collapsed, sidebar: enabled ? (
        <aside className={`book-library-side student-activity-side${collapsed ? " is-collapsed" : ""}`} aria-label="선택한 활동과 자료">
          <button type="button" className="book-library-collapse" onClick={() => remember(selectedKey, !collapsed)} aria-expanded={!collapsed} aria-label={collapsed ? "활동 패널 펼치기" : "활동 패널 접기"} title={collapsed ? "활동 패널 펼치기" : "활동 패널 접기"}>
            <span aria-hidden="true">{collapsed ? "»" : "«"}</span>
          </button>
          <div className="student-activity-panel-content" hidden={collapsed}>
            <div ref={setTarget} />
          </div>
        </aside>
      ) : null })}
    </PanelContext.Provider>
  );
}
