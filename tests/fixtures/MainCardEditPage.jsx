"use client";
import { useState } from "react";
import BookWorkspace from "@/components/BookWorkspace";

export default function MainCardEditPage() {
  const [project, setProject] = useState({ title: "항목 편집", steps: [
    { id: "s1", title: "Database 연결하기", activities: [
      { id: "a1", title: "Firestore 연결을 위한 프롬프트 입력", content: "활동 안내", requiresAnswer: false, locked: true },
      { id: "a2", title: "메모를 저장하고 확인하기", content: "유지할 내용", locked: false },
    ], resources: [{ id: "r1", title: "Firestore 참고 자료", content: "자료 안내", url: "https://example.com", locked: true }], itemOrder: [{ kind: "activity", id: "a1" }, { kind: "activity", id: "a2" }, { kind: "resource", id: "r1" }] },
    { id: "s2", title: "다른 Step", activities: [], resources: [] },
  ] });
  const [saving, setSaving] = useState(false);
  const [fail, setFail] = useState(false);
  const [teacher, setTeacher] = useState(true);
  async function save(next) {
    setSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 100));
    setSaving(false);
    if (fail) return false;
    setProject(next);
    return true;
  }
  function toggleLock(item, locked) {
    const collection = item.kind === "resource" ? "resources" : "activities";
    setProject((current) => ({ ...current, steps: current.steps.map((step) => ({ ...step, [collection]: step[collection].map((entry) => entry.id === item.id ? { ...entry, locked } : entry) })) }));
  }
  return <div className="books-main--split">
    <label><input type="checkbox" checked={fail} onChange={(event) => setFail(event.target.checked)} />저장 실패</label>
    <label><input type="checkbox" checked={teacher} onChange={(event) => setTeacher(event.target.checked)} />교사 화면</label>
    <BookWorkspace project={project} activities={[]} participants={[]} user={null} isTeacher={teacher} hasClass selectedStepId="s1" onSaveProject={save} savingProject={saving} onToggleProjectItemLock={toggleLock} />
    <script type="application/json" data-testid="saved-project">{JSON.stringify(project)}</script>
  </div>;
}
