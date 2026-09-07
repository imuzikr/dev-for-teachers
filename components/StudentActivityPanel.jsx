"use client";

import { createContext, useContext, useState } from "react";

const PanelContext = createContext(null);

export function useStudentActivityPanel() {
  return useContext(PanelContext);
}

export default function StudentActivityPanel({ children, enabled }) {
  const [selectedKey, setSelectedKey] = useState(null);
  const [collapsed, setCollapsed] = useState(true);
  const [target, setTarget] = useState(null);
  const value = enabled ? {
    selectedKey,
    target,
    open(key) { setSelectedKey(key); setCollapsed(false); },
  } : null;

  return (
    <PanelContext.Provider value={value}>
      {children({ collapsed, sidebar: enabled ? (
        <aside className={`book-library-side student-activity-side${collapsed ? " is-collapsed" : ""}`} aria-label="선택한 활동과 자료">
          <button type="button" className="book-library-collapse" onClick={() => setCollapsed(!collapsed)} aria-expanded={!collapsed} aria-label={collapsed ? "활동 패널 펼치기" : "활동 패널 접기"} title={collapsed ? "활동 패널 펼치기" : "활동 패널 접기"}>
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
