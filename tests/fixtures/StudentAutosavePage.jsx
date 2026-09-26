"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import BookPersonalDashboard from "@/components/BookPersonalDashboard";
import StudentActivityPanel from "@/components/StudentActivityPanel";
import { bookDetailSections } from "@/components/bookProjectItems";
import { CLASS_PURPOSE_INTERNAL } from "@/lib/classPurpose";
import { isFirebaseConfigured } from "@/lib/firebase";
import { getBookProject, saveBookDashboardText, saveBookProject, subscribeBookEntries, subscribeMyBookEntry } from "@/lib/store";
import { bookConfirmationKey, saveBookConfirmation, saveBookTemplateDraft, subscribeBookConfirmations } from "@/lib/bookConfirmations";

const classId = "student-autosave-class";
const snapshotKey = "student-autosave-fixture-snapshot";
const templateSnapshotKey = "student-autosave-template-fixture-snapshot";
const teacher = { uid: "autosave-teacher", role: "admin", displayName: "선생님", realName: "선생님" };
const students = [
  { uid: "autosave-student", role: "student", displayName: "김학생", realName: "김학생", schoolName: "테스트 학교" },
  { uid: "autosave-other", role: "student", displayName: "이학생", realName: "이학생", schoolName: "테스트 학교" },
];

let seeded;

function projectSeed() {
  return {
    id: classId,
    classId,
    version: "autosave-project",
    title: "학생 자동 저장 프로젝트",
    purpose: CLASS_PURPOSE_INTERNAL,
    steps: [
      {
        id: "step-plan",
        title: "문제 정의",
        description: "학생이 작성 중인 답변을 자동 저장합니다.",
        activities: [
          { id: "activity-problem", title: "문제 정의 작성", content: "<p>해결하고 싶은 문제를 적어 보세요.</p>", requiresAnswer: true },
          { id: "activity-solution", title: "해결 방안 정리", content: "<p>해결 방안을 적고 URL과 캡처를 남겨 보세요.</p>", requiresAnswer: true },
        ],
        resources: [],
      },
      {
        id: "step-template",
        title: "프롬프트와 자료",
        description: "템플릿 입력도 같은 초안으로 자동 저장합니다.",
        activities: [
          { id: "activity-template", title: "프롬프트 만들기", content: "<p>문제: {{문제 정의}}</p><p>해결: {{해결 방안}}</p>", templateEnabled: true, requiresAnswer: false },
        ],
        resources: [
          { id: "resource-template", title: "자료 템플릿", content: "<p>발표 제목: {{발표 제목}}</p><p>핵심 문장: {{핵심 문장}}</p>", teacherDescription: "학생이 붙여 넣을 문장을 완성합니다.", templateEnabled: true },
        ],
      },
    ],
  };
}

function readEntries(activityId) {
  let result = [];
  const unsubscribe = subscribeBookEntries(activityId, (entries) => { result = entries; });
  unsubscribe();
  return result;
}

function snapshotProject(project) {
  return project.steps.flatMap((step) => [
    ...(step.activities ?? []),
    ...(step.resources ?? []),
  ]).flatMap((item) => readEntries(item.id).map((entry) => ({ ...entry, itemId: item.id })));
}

async function seedFixture() {
  if (isFirebaseConfigured) throw new Error("Student autosave fixture requires Firebase stub mode.");
  await saveBookProject(teacher, projectSeed());
  const project = await getBookProject(classId);
  const snapshot = JSON.parse(sessionStorage.getItem(snapshotKey) || "[]");
  for (const entry of snapshot) {
    const owner = students.find((student) => student.uid === entry.authorId) ?? students[0];
    await saveBookDashboardText(entry.itemId || entry.activityId, owner, entry.dashboardText, entry.urls, entry.images, entry.templateValues);
  }
  const templates = JSON.parse(sessionStorage.getItem(templateSnapshotKey) || "[]");
  for (const draft of templates) {
    const owner = students.find((student) => student.uid === draft.authorId) ?? students[0];
    await saveBookTemplateDraft({ ...draft, classId, projectId: project.id, user: owner });
  }
  return project;
}

export default function StudentAutosavePage() {
  const [project, setProject] = useState(null);
  const [actor, setActor] = useState("student");
  const [selectedStepId, setSelectedStepId] = useState("step-plan");
  const [entries, setEntries] = useState({});
  const [records, setRecords] = useState([]);
  const control = useRef({ calls: [], failNext: 0, delayMs: 0 });

  const user = actor === "teacher" ? teacher : students[0];
  const isTeacher = actor === "teacher";
  const selectedParticipantUid = isTeacher ? students[0].uid : undefined;
  const activities = useMemo(() => project?.steps.flatMap((step) => step.activities ?? []) ?? [], [project]);
  const sections = useMemo(() => bookDetailSections(project, activities), [project, activities]);
  const itemKeys = useMemo(() => new Set(sections.flatMap((section) => section.items.map((item) => `${item.kind}:${item.id}`))), [sections]);

  useEffect(() => { seeded ??= seedFixture(); seeded.then(setProject); }, []);

  useEffect(() => {
    if (!project) return undefined;
    setEntries({});
    const allItems = project.steps.flatMap((step) => [...(step.activities ?? []), ...(step.resources ?? [])]);
    const unsubscribes = allItems.map((item) => (
      isTeacher
        ? subscribeBookEntries(item.id, (values) => setEntries((current) => ({ ...current, [item.id]: values })))
        : subscribeMyBookEntry(item.id, user.uid, (value) => setEntries((current) => ({ ...current, [item.id]: value ? [value] : [] })))
    ));
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [project, actor, user.uid, isTeacher]);

  useEffect(() => subscribeBookConfirmations({ classId, callback: setRecords }), []);

  function persistSnapshot(nextProject = project) {
    if (!nextProject) return;
    sessionStorage.setItem(snapshotKey, JSON.stringify(snapshotProject(nextProject)));
  }

  async function save(itemId, actorUser, dashboardText, urls, images, templateValues) {
    const title = project?.steps.flatMap((step) => [...(step.activities ?? []), ...(step.resources ?? [])]).find((item) => item.id === itemId)?.title ?? itemId;
    control.current.calls.push({ itemId, title, uid: actorUser.uid, dashboardText, urls, images, templateValues, at: Date.now() });
    if (control.current.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, control.current.delayMs));
    if (control.current.failNext > 0) {
      control.current.failNext -= 1;
      throw new Error("fixture autosave failure");
    }
    await saveBookDashboardText(itemId, actorUser, dashboardText, urls, images, templateValues);
    persistSnapshot();
  }

  async function confirm(item, state) {
    await saveBookConfirmation({ classId, projectId: project.id, itemKind: item.kind, itemId: item.id, stepId: item.stepId, user, ...state });
  }

  async function saveTemplate(item, templateValues, templateText) {
    control.current.calls.push({ itemId: item.id, title: item.title, uid: user.uid, templateValues, templateText, at: Date.now() });
    if (control.current.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, control.current.delayMs));
    if (control.current.failNext > 0) {
      control.current.failNext -= 1;
      throw new Error("fixture autosave failure");
    }
    await saveBookTemplateDraft({ classId, projectId: project.id, itemKind: item.kind, itemId: item.id, itemTitle: item.title, stepId: item.stepId, user, templateValues, templateText });
    const snapshots = JSON.parse(sessionStorage.getItem(templateSnapshotKey) || "[]").filter((draft) => !(draft.authorId === user.uid && draft.itemKind === item.kind && draft.itemId === item.id));
    snapshots.push({ authorId: user.uid, itemKind: item.kind, itemId: item.id, itemTitle: item.title, stepId: item.stepId, templateValues, templateText });
    sessionStorage.setItem(templateSnapshotKey, JSON.stringify(snapshots));
  }

  useEffect(() => {
    const itemByTitle = (title) => project?.steps.flatMap((step) => [...(step.activities ?? []), ...(step.resources ?? [])]).find((item) => item.title === title) ?? null;
    window.__studentAutosave = {
      actor: setActor,
      selectStep: setSelectedStepId,
      configure: (patch) => Object.assign(control.current, patch),
      calls: () => [...control.current.calls],
      records: () => [...records],
      recordFor: (kind, id, uid = students[0].uid) => records.find((record) => record.authorId === uid && record.itemKind === kind && record.itemId === id) ?? null,
      recordForTitle: (kind, title, uid = students[0].uid) => {
        const item = itemByTitle(title);
        return item ? records.find((record) => record.authorId === uid && record.itemKind === kind && record.itemId === item.id) ?? null : null;
      },
      entries: () => project ? snapshotProject(project) : [],
      entryFor: (id, uid = students[0].uid) => readEntries(id).find((entry) => entry.authorId === uid) ?? null,
      entryForTitle: (title, uid = students[0].uid) => {
        const item = itemByTitle(title);
        return item ? readEntries(item.id).find((entry) => entry.authorId === uid) ?? null : null;
      },
      itemIdForTitle: (title) => itemByTitle(title)?.id ?? "",
      clearCalls: () => { control.current.calls = []; },
    };
    return () => { delete window.__studentAutosave; };
  });

  if (!project) return null;

  const progress = new Map(students.map((student) => [
    student.uid,
    new Set(records.filter((record) => record.authorId === student.uid && record.confirmed).map((record) => bookConfirmationKey(record.itemKind, record.itemId))),
  ]));

  return (
    <main className="books-main books-main--split" data-fixture-role={actor}>
      <StudentActivityPanel
        key={actor}
        enabled
        readOnly={isTeacher}
        scope={`${classId}:${user.uid}`}
        draftScope={`${classId}:${students[0].uid}`}
        records={records.filter((record) => record.authorId === user.uid)}
        itemKeys={itemKeys}
        saveChecklist={confirm}
        saveTemplate={saveTemplate}
      >
        {({ collapsed, sidebar }) => (
          <div className={`book-library-layout is-student-main has-student-panel is-help-collapsed${collapsed ? " is-library-collapsed" : ""}`}>
            {sidebar}
            <section className="book-library-main" aria-label="학생 자동 저장 검증 화면">
              <div className="qa-autosave-toolbar" aria-label="자동 저장 검증 제어">
                <button type="button" onClick={() => setActor(actor === "teacher" ? "student" : "teacher")}>{actor === "teacher" ? "학생 보기" : "교사 보기"}</button>
                <button type="button" onClick={() => setSelectedStepId("step-plan")}>STEP 1 선택</button>
                <button type="button" onClick={() => setSelectedStepId("step-template")}>STEP 2 선택</button>
              </div>
              <BookPersonalDashboard
                classPurpose={CLASS_PURPOSE_INTERNAL}
                classId={classId}
                className="자동 저장 차시"
                participants={students}
                activities={activities}
                sections={sections}
                project={project}
                entriesByActivity={entries}
                progressByUser={progress}
                user={user}
                isTeacher={isTeacher}
                selectedStepId={selectedStepId}
                onSelectStep={setSelectedStepId}
                selectedParticipantUid={selectedParticipantUid}
                onSelectParticipant={() => {}}
                onConfirmItem={confirm}
                saveDashboardText={save}
              />
            </section>
          </div>
        )}
      </StudentActivityPanel>
    </main>
  );
}
