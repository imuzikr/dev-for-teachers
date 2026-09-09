"use client";
import { useState } from "react";
import BookPersonalItemViewModal from "@/components/BookPersonalItemViewModal";
import useStudentChecklist from "@/components/useStudentChecklist";

export default function ConfirmModalPage() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("resource");
  const [fail, setFail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [panel, setPanel] = useState(false);
  const [target, setTarget] = useState(null);
  const [withChecklist, setWithChecklist] = useState(false);
  const detailItem = { kind, id: "fixture", source: { title: "확인할 자료", requiresAnswer: false, content: withChecklist ? '<ul class="rte-checklist"><li><label><input type="checkbox"><span class="rte-checklist-text">첫 번째 할 일</span></label></li><li><label><input type="checkbox"><span class="rte-checklist-text">두 번째 할 일</span></label></li></ul>' : "활동 안내사항" } };
  const checklist = useStudentChecklist(detailItem);
  async function save() {
    setSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 100));
    setSaving(false);
    if (fail) return false;
    setConfirmed(true);
    return true;
  }
  return <main style={{ padding: 24 }}>
    <select aria-label="종류" value={kind} onChange={(e) => setKind(e.target.value)}><option value="resource">자료</option><option value="activity">활동</option></select>
    <label><input type="checkbox" checked={fail} onChange={(e) => setFail(e.target.checked)} />저장 실패</label>
    <label><input type="checkbox" checked={panel} onChange={(e) => setPanel(e.target.checked)} />패널</label>
    <label><input type="checkbox" checked={withChecklist} onChange={(e) => setWithChecklist(e.target.checked)} />할 일 사용</label>
    <button onClick={() => checklist.confirm(save)}>직접 확인</button>
    <button onClick={() => { setConfirmed(false); setOpen(true); }}>열기</button>
    <output>{confirmed ? "확인 완료" : "미확인"}</output>
    <div ref={setTarget} />
    {open && <BookPersonalItemViewModal detailItem={detailItem} index={0} isTeacher={false} panelTarget={panel ? target : null} onExpand={() => {}} onClose={() => setOpen(false)} onSave={() => checklist.confirm(save)} saving={saving} confirmed={confirmed} hasChecklist={checklist.hasChecklist} checklistComplete={checklist.complete} checklistValues={checklist.values} onChecklistChange={checklist.change} checklistStatus={checklist.status} />}
  </main>;
}
