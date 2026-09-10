"use client";
import { useState } from "react";
import StudentActivityPanel, { useStudentActivityPanel } from "@/components/StudentActivityPanel";
import BookPersonalItemViewModal from "@/components/BookPersonalItemViewModal";

const keys = new Set(["layout"]);
export const previewCode = "메모에 입력된 글자의 수가 5글자 이상이면 저장하도록 작성해 주세요. ".repeat(8);
function Content() {
  const panel = useStudentActivityPanel();
  const [expanded, setExpanded] = useState(false);
  const detailItem = { kind: "activity", source: {
    title: "MCP 설치하기", requiresAnswer: false,
    content: `<ul class="rte-checklist"><li><label><input type="checkbox"><span class="rte-checklist-text">Firebase MCP 설치하기</span></label></li><li><label><input type="checkbox"><span class="rte-checklist-text">Firestore Rules 수정하기</span></label></li><li><label><input type="checkbox"><span class="rte-checklist-text"><pre><code>${previewCode}</code></pre></span></label></li></ul>`,
    images: typeof location === "undefined" ? [] : [`${location.origin}/teacher-collaboration-hero.png`],
  } };
  return <main><button onClick={() => panel.open("layout")}>활동 열기</button>
    {panel.selectedKey && panel.target && <BookPersonalItemViewModal detailItem={detailItem} index={2} panelTarget={expanded ? null : panel.target} onExpand={() => setExpanded(true)} onClose={() => setExpanded(false)} onSave={async () => true} />}
  </main>;
}
export default function StudentPanelLayoutPage() {
  return <div className="books-main--split"><StudentActivityPanel enabled itemKeys={keys} scope="layout-fixture">
    {({ collapsed, sidebar }) => <div className={`book-library-layout is-student-main has-student-panel${collapsed ? " is-library-collapsed" : ""}`}>{sidebar}<Content /></div>}
  </StudentActivityPanel></div>;
}
