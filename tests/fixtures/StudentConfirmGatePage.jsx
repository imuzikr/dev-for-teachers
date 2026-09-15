"use client";
import { useState } from "react";
import BookPersonalDetail from "@/components/BookPersonalDetail";
import StudentActivityPanel from "@/components/StudentActivityPanel";
import { BookPersonalActivityCard } from "@/components/BookPersonalDetailCards";

const user = { uid: "qa-student", realName: "학생" };
const activities = ["first", "second"].map(id => ({ id, title: id, content: "<p>활동 안내</p>", requiresAnswer: true }));
const resource = { id: "resource", title: "자료", content: "<p>읽기 자료</p>" };
const items = [...activities.map(source => ({ id: source.id, kind: "activity", source })), { id: resource.id, kind: "resource", source: resource }];
const sections = [{ id: "step", title: "연습", activities, resources: [resource], items }];
const keys = new Set(items.map(item => `${item.kind}:${item.id}`));
export default function StudentConfirmGatePage() {
  const [progress, setProgress] = useState(new Set());
  const [saved, setSaved] = useState({});
  const [fail, setFail] = useState(false);
  const [active, setActive] = useState(false);
  return <>
    <button onClick={() => setFail(true)}>Fail next save</button>
    <output data-testid="saved">{JSON.stringify(saved)}</output>
    <StudentActivityPanel enabled scope="qa-confirm-gate" itemKeys={keys}>
      {({ sidebar }) => <div style={{ display: "flex" }}>{sidebar}<BookPersonalDetail
        selected={user} sections={sections} activities={activities} entriesByActivity={{}} selectedProgress={progress}
        itemCount={3} user={user} isTeacher={false} onBack={() => {}}
        saveDashboardText={async (id, actor, text) => { if (fail) { setFail(false); throw new Error("Test failure"); } setSaved(current => ({ ...current, [id]: text })); }}
        onConfirmItem={async (item, state) => { if (state.confirmed) setProgress(current => new Set([...current, `${item.kind}:${item.id}`])); }}
      /></div>}
    </StudentActivityPanel>
    <div data-testid="teacher-card">
      <BookPersonalActivityCard detailItem={{ ...items[0], isActive: active }} index={0} isTeacher
        selectedProgress={new Set()} saveState={{}} onPresent={() => {}} onActivate={() => setActive(value => !value)} />
    </div>
  </>;
}
