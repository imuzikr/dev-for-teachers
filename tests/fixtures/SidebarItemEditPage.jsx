"use client";
import { useState } from "react";
import BookProjectPanel from "@/components/BookProjectPanel";

export default function SidebarItemEditPage() {
  const [project, setProject] = useState({ title: "항목 편집 테스트", steps: [
    { id: "s1", title: "첫 번째 Step", activities: [{ id: "a1", title: "수정할 활동", content: "활동 안내", requiresAnswer: false }, { id: "a2", title: "다른 활동", content: "유지할 내용" }], resources: [{ id: "r1", title: "수정할 자료", content: "자료 안내", url: "https://example.com" }], itemOrder: [{ kind: "activity", id: "a1" }, { kind: "resource", id: "r1" }, { kind: "activity", id: "a2" }] },
    { id: "s2", title: "다른 Step", activities: [], resources: [] },
  ] });
  const [saving, setSaving] = useState(false);
  const [fail, setFail] = useState(false);
  const [stepEdits, setStepEdits] = useState(0);
  async function save(next) {
    setSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 150));
    setSaving(false);
    if (fail) return false;
    setProject(next);
    return true;
  }
  return <main style={{ maxWidth: 360, padding: 12 }}>
    <label><input type="checkbox" checked={fail} onChange={(e) => setFail(e.target.checked)} />저장 실패</label>
    <output data-testid="step-edits">{stepEdits}</output>
    <BookProjectPanel project={project} onSave={save} saving={saving} onEdit={() => setStepEdits((n) => n + 1)} />
    <script type="application/json" data-testid="saved-project">{JSON.stringify(project)}</script>
  </main>;
}
