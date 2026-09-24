"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import BookPersonalDashboard from "@/components/BookPersonalDashboard";
import StudentActivityPanel from "@/components/StudentActivityPanel";
import { bookDetailSections } from "@/components/bookProjectItems";
import { isFirebaseConfigured } from "@/lib/firebase";
import { getBookProject, saveBookDashboardText, saveBookProject, subscribeBookEntries, subscribeMyBookEntry } from "@/lib/store";
import { bookConfirmationKey, saveBookConfirmation, subscribeBookConfirmations } from "@/lib/bookConfirmations";

const owner = { uid: "urls-teacher", role: "admin", displayName: "선생님" };
const students = [
  { uid: "urls-student-a", role: "student", displayName: "김학생", realName: "김학생" },
  { uid: "urls-student-b", role: "student", displayName: "이학생", realName: "이학생" },
];
const classId = "urls-class";
const snapshotKey = "student-activity-urls-fixture";
const noop = () => {};
let seed;

function initialProject() {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
  return { classId, title: "우리 앱 소개하기", steps: [{ id: "urls-step", title: "결과 공유", description: "활동에서 만든 앱의 주소를 공유해 보세요.",
    activities: [
      { id: "activity-answer", title: "완성한 앱 소개하기", content: "<p>완성한 앱을 소개해 보세요.</p><p>GitHub 저장소와 배포한 앱의 주소를 함께 공유하세요.</p>", requiresAnswer: true, bookUrl: "https://primary.example.test/activity", images: [canvas.toDataURL("image/jpeg")] },
      { id: "activity-confirmed", title: "확인한 활동", content: "<p>확인한 뒤에도 링크를 수정할 수 있어요.</p>", requiresAnswer: false },
      { id: "activity-template", title: "템플릿 활동", content: "<p>앱 이름: {{앱 이름}}</p>", templateEnabled: true, requiresAnswer: false },
      { id: "activity-checklist", title: "체크리스트 활동", content: '<ul class="rte-checklist"><li><label><input type="checkbox"><span class="rte-checklist-text">앱 완성하기</span></label></li></ul>', requiresAnswer: false },
    ], resources: [{ id: "resource-help", title: "배포 도움 자료", content: "<p>웹 앱을 배포할 때 참고할 자료입니다.</p>", url: "https://primary.example.test/resource" }],
  }] };
}
function readEntries(activityId) {
  let result = []; const unsubscribe = subscribeBookEntries(activityId, entries => { result = entries; }); unsubscribe(); return result;
}
async function seedFixture() {
  if (isFirebaseConfigured) throw new Error("Student URL fixture requires the Firebase stub");
  await saveBookProject(owner, initialProject());
  const project = await getBookProject(classId);
  const snapshot = sessionStorage.getItem(snapshotKey);
  const restored = snapshot ? JSON.parse(snapshot) : [{ title: "완성한 앱 소개하기", uid: students[0].uid, dashboardText: "이전 답변" }, { title: "완성한 앱 소개하기", uid: students[1].uid, dashboardText: "친구의 답변", urls: ["https://links.example.test/other-student"] }];
  for (const entry of restored) {
    const activity = project.steps[0].activities.find(item => item.title === entry.title);
    await saveBookDashboardText(activity.id, students.find(user => user.uid === entry.uid), entry.dashboardText, entry.urls);
  }
  const confirmed = project.steps[0].activities.find(item => item.title === "확인한 활동");
  await saveBookConfirmation({ classId, projectId: project.id, itemKind: "activity", itemId: confirmed.id, stepId: project.steps[0].id, user: students[0], confirmed: true });
  return project;
}

export default function ActivityUrlsPage() {
  const [project, setProject] = useState(null);
  const [actor, setActor] = useState("a");
  const [entries, setEntries] = useState({});
  const [records, setRecords] = useState([]);
  const [selectedStepId, setSelectedStepId] = useState("urls-step");
  const [unsafeUrls, setUnsafeUrls] = useState(null);
  const control = useRef({ calls: [], failSave: 0 });
  const user = actor === "teacher" ? owner : students[actor === "b" ? 1 : 0];
  const isTeacher = actor === "teacher";
  const activities = project?.steps.flatMap(step => step.activities) ?? [];
  const sections = useMemo(() => bookDetailSections(project, activities), [project]);
  const itemKeys = useMemo(() => new Set(sections.flatMap(section => section.items.map(item => `${item.kind}:${item.id}`))), [sections]);
  useEffect(() => { seed ??= seedFixture(); seed.then(setProject); }, []);
  useEffect(() => {
    if (!project) return;
    setEntries({});
    const unsubscribes = activities.map(activity => isTeacher
      ? subscribeBookEntries(activity.id, values => setEntries(current => ({ ...current, [activity.id]: values })))
      : subscribeMyBookEntry(activity.id, user.uid, value => setEntries(current => ({ ...current, [activity.id]: value ? [value] : [] }))));
    return () => unsubscribes.forEach(unsubscribe => unsubscribe());
  }, [project, actor]);
  useEffect(() => subscribeBookConfirmations({ classId, callback: setRecords }), []);
  function persistSnapshot() {
    // Test-only serialization restores the real in-memory mock store on reload.
    const snapshot = activities.flatMap(activity => readEntries(activity.id).map(entry => ({ ...entry, title: activity.title, uid: entry.authorId })));
    sessionStorage.setItem(snapshotKey, JSON.stringify(snapshot));
  }
  async function save(activityId, user, text, urls) {
    control.current.calls.push({ activityId, uid: user.uid, text, urls });
    if (control.current.holdSave) await new Promise(resolve => { control.current.releaseSave = resolve; });
    if (control.current.failSave-- > 0) throw new Error("Fixture student URL save failure");
    await saveBookDashboardText(activityId, user, text, urls);
    persistSnapshot();
  }
  const confirm = (item, state) => saveBookConfirmation({ classId, projectId: project.id, itemKind: item.kind, itemId: item.id, stepId: item.stepId, user, ...state });
  useEffect(() => {
    window.__activityUrls = {
      state: () => ({ actor, calls: control.current.calls, records }), actor: setActor,
      entries: () => activities.flatMap(activity => readEntries(activity.id).map(entry => ({ ...entry, title: activity.title }))),
      storedProject: () => getBookProject(classId), configure: patch => Object.assign(control.current, patch),
      releaseSave: () => { control.current.holdSave = false; control.current.releaseSave?.(); }, unsafe: setUnsafeUrls,
    };
    return () => { delete window.__activityUrls; };
  });
  if (!project) return null;
  const progress = new Map(students.map(student => [student.uid, new Set(records.filter(record => record.authorId === student.uid && record.confirmed).map(record => bookConfirmationKey(record.itemKind, record.itemId)))]));
  const displayedEntries = unsafeUrls ? Object.fromEntries(Object.entries(entries).map(([id, values]) => [id, values.map(entry => ({ ...entry, urls: unsafeUrls }))])) : entries;
  return <div className="board-shell books-board-shell" data-fixture-role={actor} data-fixture-ready={Object.keys(entries).length === activities.length}>
    <main className="books-main books-main--split">
      <StudentActivityPanel key={actor} enabled={!isTeacher} scope={`${classId}:${user.uid}`} itemKeys={itemKeys} records={records.filter(record => record.authorId === user.uid)} saveChecklist={confirm}>
        {({ collapsed, sidebar }) => <div className={`book-library-layout is-student-main has-student-panel is-help-collapsed${collapsed ? " is-library-collapsed" : ""}`}>
          {sidebar}<section className="book-library-main" aria-label="개발자실 메인 화면">
            <header className="topbar"><div className="topbar-left"><strong className="logo">교사 개발자</strong></div><strong>{user.displayName}</strong></header>
            <div className="books-content-head"><h1>개발자실</h1></div>
            <BookPersonalDashboard participants={students} activities={activities} sections={sections} project={project} entriesByActivity={displayedEntries} progressByUser={progress} user={user} isTeacher={isTeacher}
              onConfirmItem={confirm} saveDashboardText={save} selectedStepId={selectedStepId} onSelectStep={setSelectedStepId} onToggleActivityLock={noop} onToggleProjectItemLock={noop} />
          </section>
        </div>}
      </StudentActivityPanel>
    </main>
  </div>;
}
