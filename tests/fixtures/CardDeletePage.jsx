"use client";

import { useEffect, useRef, useState } from "react";
import BooksHome from "@/components/BooksHome";
import ProjectItemDeleteModal from "@/components/ProjectItemDeleteModal";
import { useBookProjectDeletion } from "@/components/useBookProjectDeletion";
import { getSelectedClassId, setSelectedClassId } from "@/lib/classroom";
import { isFirebaseConfigured } from "@/lib/firebase";
import { deleteBookActivity, getBookProject, saveBookProject, subscribeBookActivities, subscribeBookProject } from "@/lib/store";
import { isTeacher } from "@/lib/user";

const owner = { uid: "delete-teacher", role: "admin", displayName: "선생님" };
const student = { uid: "delete-student", role: "student", displayName: "김학생", realName: "김학생" };
const classes = [{ id: "delete-a", name: "1반" }, { id: "delete-b", name: "2반" }];
const noop = () => {};
let seed;

function initialProject(classItem, image) {
  return {
    classId: classItem.id, title: `${classItem.name} 개발 프로젝트`,
    steps: [
      { id: "shared-step-1", title: "개발 환경 준비", description: "활동과 자료를 확인하고 개발 환경을 준비하세요.",
        activities: [
          { id: "activity-target", title: "Antigravity 설치하기", content: "<p>설치 자료를 읽고 개발 환경을 준비하세요.</p>", requiresAnswer: false },
          { id: "activity-sibling", title: "Node.js 설치하기", content: "<p>다음 활동 안내입니다.</p>", requiresAnswer: false },
        ],
        resources: [
          { id: `${classItem.id}-resource-target`, title: "학습지원 소프트웨어 심의 관련 자료", content: "<p>수업에 사용할 소프트웨어의 심의 자료입니다.</p>", images: [image], url: "https://example.test/review" },
          { id: `${classItem.id}-resource-sibling`, title: "설치 도움 자료", content: "<p>설치 안내를 확인하세요.</p>" },
        ],
        itemOrder: [
          { kind: "resource", id: `${classItem.id}-resource-target` },
          { kind: "activity", id: "activity-target" },
          { kind: "resource", id: `${classItem.id}-resource-sibling` },
          { kind: "activity", id: "activity-sibling" },
        ],
      },
      { id: "shared-step-2", title: "돌아보기", description: "완성한 결과를 돌아봅니다.",
        activities: [{ id: "activity-next", title: "결과 돌아보기", content: "<p>완성한 활동을 돌아보세요.</p>", requiresAnswer: false }], resources: [],
      },
    ],
  };
}

async function seedProjects() {
  if (isFirebaseConfigured) throw new Error("Card deletion fixture requires the Firebase stub");
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const image = canvas.toDataURL("image/jpeg");
  for (const classItem of classes) await saveBookProject(owner, initialProject(classItem, image));
}

function storedActivities(classId) {
  let result;
  const unsubscribe = subscribeBookActivities(classId, items => { result = items; });
  unsubscribe();
  return result;
}

export default function CardDeletePage() {
  const [role, setRole] = useState(null);
  const [classId, setClassId] = useState(classes[0].id);
  const [project, setProject] = useState(null);
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState(false);
  const control = useRef({ saveCalls: [], cleanupCalls: [], requests: [], toasts: [], failSave: 0, failCleanup: 0 });
  const user = role === "teacher" ? owner : student;
  const deletion = useBookProjectDeletion({
    user, classId, project, ready,
    saveProject: async (actor, draft) => {
      const state = control.current;
      state.saveCalls.push(structuredClone(draft));
      if (state.holdSave) await new Promise(resolve => { state.releaseSave = resolve; });
      if (state.failSave-- > 0) throw new Error("Fixture project save failure");
      await saveBookProject(actor, draft);
    },
    deleteActivity: async id => {
      const state = control.current;
      state.cleanupCalls.push(id);
      if (state.holdCleanup) await new Promise(resolve => { state.releaseCleanup = resolve; });
      if (state.failCleanup-- > 0) throw new Error("Fixture activity cleanup failure");
      await deleteBookActivity(id);
    },
    onToast: text => control.current.toasts.push(text),
  });

  useEffect(() => {
    seed ??= seedProjects();
    seed.then(() => {
      setSelectedClassId(classes[0].id);
      setRole(new URLSearchParams(location.search).get("role") || "teacher");
      setReady(true);
    });
    const onClassChange = () => setClassId(getSelectedClassId() || classes[0].id);
    window.addEventListener("class-change", onClassChange);
    return () => window.removeEventListener("class-change", onClassChange);
  }, []);

  useEffect(() => {
    if (!ready) return;
    return subscribeBookProject(classId, setProject);
  }, [classId, ready]);

  useEffect(() => {
    window.__cardDelete = {
      state: () => ({ role, classId, target: deletion.target, pending: deletion.pending, error: deletion.error,
        saveCalls: control.current.saveCalls, cleanupCalls: control.current.cleanupCalls,
        requests: control.current.requests, toasts: control.current.toasts }),
      stored: (id = classId) => getBookProject(id),
      activities: (id = classId) => storedActivities(id),
      configure: patch => Object.assign(control.current, patch),
      releaseSave: () => { control.current.holdSave = false; control.current.releaseSave?.(); },
      releaseCleanup: () => { control.current.holdCleanup = false; control.current.releaseCleanup?.(); },
      role: setRole,
      editing: setEditing,
      request: deletion.requestDelete,
      confirm: deletion.confirmDelete,
      close: deletion.closeDelete,
    };
    return () => { delete window.__cardDelete; };
  });

  if (!role) return null;
  const admin = isTeacher(user);
  return <div className="board-shell books-board-shell" data-fixture-class={classId} data-fixture-role={role} data-fixture-ready={ready && Boolean(project)}>
    <BooksHome
      topNav={<header className="topbar"><div className="topbar-left"><strong className="logo">교사 개발자</strong></div></header>}
      admin={admin} user={user} classId={classId} classes={classes} currentClass={classes.find(item => item.id === classId)}
      myClasses={classes} myClassesAll={classes} allTeacherClasses={classes} membershipIds={classes.map(item => item.id)}
      roster={[student]} participants={[student]} project={project} displayedProject={project}
      visibleActivities={project?.steps.flatMap(step => step.activities) || []}
      liveProjectReady={ready} editingProject={editing} projectEditorKey={0} savingProject={deletion.pending}
      onSelectTeacherClass={setClassId} onToast={noop} onEditProject={noop} onSaveProject={noop}
      onToggleActivityLock={noop} onToggleProjectItemLock={noop}
      onDelete={request => { control.current.requests.push(structuredClone(request)); return deletion.requestDelete(request); }}
    />
    <ProjectItemDeleteModal target={deletion.target} pending={deletion.pending} error={deletion.error}
      cleanupPending={deletion.cleanupPending} onConfirm={deletion.confirmDelete} onClose={deletion.closeDelete} />
  </div>;
}
