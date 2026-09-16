"use client";

import { useEffect, useState } from "react";
import BooksHome from "@/components/BooksHome";
import { getSelectedClassId, setSelectedClassId } from "@/lib/classroom";
import { isFirebaseConfigured } from "@/lib/firebase";
import { getBookProject, saveBookProject, subscribeBookProject } from "@/lib/store";

const owner = { uid: "guidance-teacher", displayName: "선생님" };
const student = { uid: "guidance-student", displayName: "김학생", realName: "김학생" };
const classes = [{ id: "guidance-a", name: "1반" }, { id: "guidance-b", name: "2반" }];
const storageKey = "step-guidance-fixture-projects";
const noop = () => {};
let seed;

function initialProject(classItem) {
  return {
    classId: classItem.id,
    title: `${classItem.name} 개발 프로젝트`,
    steps: [
      { id: "shared-step-1", title: "개발 환경 준비", description: `${classItem.name} 활동을 시작하기 전에 준비물을 확인하세요.\n설치 자료를 읽고 첫 번째 활동을 진행합니다.`,
        activities: [{ id: `${classItem.id}-activity-1`, title: "Antigravity 설치하기", content: "<p>설치 자료를 읽고 개발 환경을 준비하세요.</p>", requiresAnswer: false }],
        resources: [{ id: `${classItem.id}-resource-1`, title: "시작하기 자료", content: "<p>첫 활동에 필요한 준비 자료입니다.</p>" }] },
      { id: "shared-step-2", title: "아이디어 만들기", description: `${classItem.name} 두 번째 단계 안내`,
        activities: [{ id: `${classItem.id}-activity-2`, title: "아이디어 기록하기", content: "<p>직접 만든 아이디어를 정리하세요.</p>", requiresAnswer: false }], resources: [] },
      { id: "shared-step-3", title: "돌아보기", activities: [{ id: `${classItem.id}-activity-3`, title: "결과 돌아보기", content: "<p>완성한 활동을 돌아보세요.</p>", requiresAnswer: false }], resources: [] },
    ],
  };
}

async function persistProjects() {
  const projects = await Promise.all(classes.map(classItem => getBookProject(classItem.id)));
  localStorage.setItem(storageKey, JSON.stringify(projects));
}

async function seedProjects() {
  if (isFirebaseConfigured) throw new Error("Step guidance fixture requires the Firebase stub");
  const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
  for (const classItem of classes) {
    await saveBookProject(owner, saved?.find(project => project.classId === classItem.id) || initialProject(classItem));
  }
}

function legacyProject(project) {
  if (!project) return null;
  return { ...project, steps: project.steps.map(step => {
    if (step.id !== "shared-step-3") return step;
    const { description, ...legacy } = step;
    return legacy;
  }) };
}

export default function StepGuidancePage() {
  const [role, setRole] = useState(null);
  const [classId, setClassId] = useState(classes[0].id);
  const [project, setProject] = useState(null);
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    seed ??= seedProjects();
    seed.then(() => {
      setSelectedClassId(classes[0].id);
      setRole(query.get("role") || "teacher");
      setReady(true);
      setLoaded(!query.has("delayed"));
    });
    const onClassChange = () => setClassId(getSelectedClassId() || classes[0].id);
    window.addEventListener("class-change", onClassChange);
    return () => window.removeEventListener("class-change", onClassChange);
  }, []);

  useEffect(() => {
    if (!ready || !loaded) { setProject(null); return; }
    return subscribeBookProject(classId, value => setProject(legacyProject(value)));
  }, [classId, loaded, ready]);

  useEffect(() => {
    window.__stepGuidance = {
      load: () => setLoaded(true),
      stored: () => getBookProject(classId),
      updateDescription: async (stepId, description) => {
        const current = await getBookProject(classId);
        await saveBookProject(owner, { ...current, steps: current.steps.map(step => step.id === stepId ? { ...step, description } : step) });
        await persistProjects();
      },
    };
    return () => { delete window.__stepGuidance; };
  }, [classId]);

  if (!role) return null;
  const admin = role === "teacher";
  const currentClass = classes.find(classItem => classItem.id === classId);
  return <div className="board-shell books-board-shell" data-fixture-class={classId} data-fixture-ready={ready}>
    <BooksHome
      topNav={<header className="topbar"><div className="topbar-left"><strong className="logo">교사 개발자</strong></div></header>}
      admin={admin} user={admin ? owner : student} classId={classId} classes={classes} currentClass={currentClass}
      myClasses={classes} myClassesAll={classes} allTeacherClasses={classes} membershipIds={classes.map(classItem => classItem.id)}
      roster={[student]} participants={[student]} project={project} displayedProject={project}
      visibleActivities={project?.steps.flatMap(step => step.activities) || []}
      liveProjectReady={loaded} editingProject={editing} projectEditorKey={editorKey} savingProject={saving}
      onSelectTeacherClass={setClassId} onToast={noop}
      onEditProject={() => { setEditing(true); setEditorKey(value => value + 1); }}
      onSaveProject={async draft => {
        setSaving(true);
        try {
          await saveBookProject(owner, { ...draft, classId });
          await persistProjects();
          setEditing(false);
          return true;
        } finally { setSaving(false); }
      }}
      onToggleActivityLock={noop} onToggleProjectItemLock={noop}
    />
  </div>;
}
