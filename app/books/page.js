"use client";

import { useEffect, useMemo, useState } from "react";
import {
  deleteBookActivity,
  classAcceptsJoin,
  getBookProject,
  joinClassByCode,
  saveBookProject,
  subscribeBookActivities,
  subscribeBookProject,
  subscribeClassMembers,
  subscribeClasses,
  subscribeMyMemberships,
  subscribeUserDirectory,
  updateBookActivity,
} from "@/lib/store";
import { isAdmin, isTeacher } from "@/lib/user";
import {
  getSelectedClassId,
  getSelectedClassPurpose,
  setSelectedClassId,
} from "@/lib/classroom";
import { getClassPurpose } from "@/lib/classPurpose";
import {
  appendClonedBookProjectItem,
  appendClonedBookProjectStep,
  appendClonedBookProjectSteps,
} from "@/lib/bookProjectExport";
import { useAutomaticClassMembership } from "@/lib/useAutomaticClassMembership";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useRequireAuth } from "@/lib/useRequireAuth";
import TopNav from "@/components/TopNav";
import Toast from "@/components/Toast";
import BooksHome from "@/components/BooksHome";
import ClassJoinPanel from "@/components/ClassJoinPanel";
import ProjectItemDeleteModal from "@/components/ProjectItemDeleteModal";

export default function BooksPage() {
  return <BooksPageInner />;
}

function BooksPageInner() {
  const user = useCurrentUser();
  useRequireAuth();
  const admin = user ? isTeacher(user) : false;
  const superAdmin = user ? isAdmin(user) : false;

  const [classes, setClasses] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [localSelectedId, setLocalSelectedId] = useState(null);
  const [classPurpose, setClassPurpose] = useState(getSelectedClassPurpose);
  const [teacherClassId, setTeacherClassId] = useState(null);
  const [directory, setDirectory] = useState([]);
  const [memberUids, setMemberUids] = useState([]);
  const [activities, setActivities] = useState([]);
  const [project, setProject] = useState(null);
  const [editingProject, setEditingProject] = useState(false);
  const [projectEditorKey, setProjectEditorKey] = useState(0);
  const [appendProjectStep, setAppendProjectStep] = useState(false);
  const [projectEditorStepId, setProjectEditorStepId] = useState(null);
  const [savingProject, setSavingProject] = useState(false);
  const [exportingProject, setExportingProject] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [toast, setToast] = useState("");
  const [joiningClass, setJoiningClass] = useState(false);

  useEffect(() => {
    function sync() {
      setLocalSelectedId(getSelectedClassId());
    }
    sync();
    window.addEventListener("class-change", sync);
    return () => window.removeEventListener("class-change", sync);
  }, []);

  useEffect(() => {
    function syncPurpose() {
      setClassPurpose(getSelectedClassPurpose());
    }
    syncPurpose();
    window.addEventListener("class-purpose-change", syncPurpose);
    return () => window.removeEventListener("class-purpose-change", syncPurpose);
  }, []);

  useEffect(() => subscribeClasses(setClasses), []);

  useEffect(() => {
    if (!user || admin) {
      setMemberships([]);
      return;
    }
    return subscribeMyMemberships(user.uid, setMemberships);
  }, [user?.uid, admin]);

  useAutomaticClassMembership({ user, isOperator: admin, classes, memberships });

  useEffect(() => {
    if (!admin) {
      setDirectory([]);
      return;
    }
    return subscribeUserDirectory(setDirectory);
  }, [admin]);

  const ownedClassesAll = useMemo(
    () => (superAdmin ? classes : classes.filter((c) => c.createdBy === user?.uid)),
    [classes, superAdmin, user?.uid]
  );
  const myClassesAll = useMemo(
    () => ownedClassesAll.filter((c) => getClassPurpose(c) === classPurpose),
    [ownedClassesAll, classPurpose]
  );
  const myClasses = useMemo(() => myClassesAll.filter((c) => !c.archived), [myClassesAll]);
  const membershipIds = useMemo(() => memberships.map((m) => m.classId), [memberships]);
  const joinableClasses = useMemo(() => classes.filter(classAcceptsJoin), [classes]);
  const studentClassId =
    localSelectedId && membershipIds.includes(localSelectedId)
      ? localSelectedId
      : membershipIds[0] ?? null;

  useEffect(() => {
    if (!admin) return;
    if (myClasses.length === 0) {
      if (teacherClassId) setTeacherClassId(null);
      if (localSelectedId) setSelectedClassId(null);
      return;
    }
    if (teacherClassId && myClasses.some((c) => c.id === teacherClassId)) return;
    const remembered =
      localSelectedId && myClasses.some((c) => c.id === localSelectedId)
        ? localSelectedId
        : myClasses[0].id;
    setTeacherClassId(remembered);
    if (localSelectedId !== remembered) setSelectedClassId(remembered);
  }, [admin, myClasses, teacherClassId, localSelectedId]);

  const classId = admin ? (teacherClassId && myClasses.some((classItem) => classItem.id === teacherClassId) ? teacherClassId : myClasses[0]?.id ?? null) : studentClassId;
  const currentClass = (admin ? myClassesAll : classes).find((c) => c.id === classId) ?? null;

  useEffect(() => subscribeBookActivities(classId, setActivities), [classId]);
  useEffect(() => subscribeBookProject(classId, setProject), [classId]);

  useEffect(() => {
    if (!admin || !classId) {
      setMemberUids([]);
      return;
    }
    return subscribeClassMembers(classId, setMemberUids);
  }, [admin, classId]);

  const roster = useMemo(() => {
    const dir = new Map(directory.map((d) => [d.uid, d]));
    return memberUids
      .map((uid) => {
        const d = dir.get(uid) ?? {};
        return {
          uid,
          name: d.realName || "이름 미설정",
          schoolName: d.schoolName || "",
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [memberUids, directory]);

  const visibleActivities = useMemo(
    () => {
      if (!project) return activities.filter((activity) => activity.type === "book");

      const activityById = new Map(activities.map((activity) => [activity.id, activity]));
      return (project.steps ?? [])
        .flatMap((step) => step.activities ?? [])
        .map((projectActivity) => activityById.get(projectActivity.id))
        .filter((activity) => activity
          && activity.projectId === project.id
          && (!project.version || activity.projectVersion === project.version));
    },
    [activities, project]
  );
  const displayedProject = useMemo(() => {
    if (!project) return null;
    const activityById = new Map(visibleActivities.map((activity) => [activity.id, activity]));
    return {
      ...project,
      steps: (project.steps ?? []).map((step) => ({
        ...step,
        activities: (step.activities ?? [])
          .map((activity) => activityById.get(activity.id) ?? activity)
          .filter(Boolean),
      })),
    };
  }, [project, visibleActivities]);
  const participants = useMemo(() => {
    if (admin) return roster;
    if (!user) return [];
    return [{
      uid: user.uid,
      name: user.realName || user.displayName,
      schoolName: user.schoolName || "",
      emoji: user.emoji,
    }];
  }, [admin, roster, user]);

  async function handleSaveProject(draft) {
    setSavingProject(true);
    try {
      await saveBookProject(user, { classId, ...draft });
      setEditingProject(false);
      setToast("프로젝트를 저장했어요.");
      return true;
    } catch (error) {
      console.error("[책방] 프로젝트 저장 실패:", error);
      setToast("프로젝트를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
      return false;
    } finally {
      setSavingProject(false);
    }
  }

  async function handleToggleActivityLock(activity, locked) {
    try {
      await updateBookActivity(activity.id, { locked });
      setToast(locked ? "활동을 잠갔어요." : "활동을 열었어요.");
    } catch (error) {
      console.error("[책방] 활동 잠금 변경 실패:", error);
      setToast("활동 상태를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  }

  async function handleToggleProjectItemLock(item, locked) {
    const source = item?.source ?? item;
    if (!source?.id) return;

    if (item?.kind === "activity") {
      await handleToggleActivityLock(source, locked);
      return;
    }

    const currentProject = displayedProject ?? project;
    if (!currentProject) return;

    const nextSteps = (currentProject.steps ?? []).map((step) => ({
      ...step,
      resources: (step.resources ?? []).map((resource) => (
        resource.id === source.id ? { ...resource, locked } : resource
      )),
    }));

    try {
      await saveBookProject(user, { classId, title: currentProject.title, steps: nextSteps });
      setToast(locked ? "자료를 잠갔어요." : "자료를 열었어요.");
    } catch (error) {
      console.error("[책방] 자료 잠금 변경 실패:", error);
      setToast("자료 상태를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  }

  function openProjectEditor(appendStep = false, stepId = null) {
    setAppendProjectStep(appendStep);
    setProjectEditorStepId(stepId);
    setProjectEditorKey((current) => current + 1);
    setEditingProject(true);
  }

  async function handleDelete() {
    const target = confirmDelete;
    setConfirmDelete(null);
    const nextSteps = (project?.steps ?? []).map((step) => step.id !== target.stepId ? step : {
      ...step,
      activities: target.kind === "activity" ? step.activities.filter((item) => item.id !== target.item.id) : step.activities,
      resources: target.kind === "resource" ? step.resources.filter((item) => item.id !== target.item.id) : step.resources,
    });
    try {
      if (target.kind === "activity") await deleteBookActivity(target.item.id);
      await saveBookProject(user, { classId, title: project.title, steps: nextSteps });
      setToast(`${target.kind === "activity" ? "활동" : "자료"}을 삭제했어요.`);
    } catch (error) {
      console.error("[책방] 프로젝트 항목 삭제 실패:", error);
      setToast("삭제하지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  }

  async function handleExportProjectItem(request) {
    const sourceProject = displayedProject ?? project;
    if (!user || !sourceProject || !request?.targetClassId) return false;
    const sourceStep = (sourceProject.steps ?? []).find((step) => step.id === request.sourceStepId) ?? null;
    if (request.scope !== "project" && !sourceStep) return false;

    setExportingProject(true);
    try {
      const targetProject = await getBookProject(request.targetClassId);
      let draft;
      if (request.scope === "project") {
        draft = appendClonedBookProjectSteps(targetProject, sourceProject);
      } else if (request.scope === "step") {
        draft = appendClonedBookProjectStep(targetProject, sourceProject, sourceStep);
      } else {
        const sourceItems = request.sourceItemKind === "resource" ? sourceStep.resources ?? [] : sourceStep.activities ?? [];
        const sourceItem = sourceItems.find((item) => item.id === request.sourceItemId);
        if (!sourceItem) return false;
        draft = appendClonedBookProjectItem(
          targetProject,
          sourceProject,
          sourceStep,
          request.sourceItemKind,
          sourceItem,
          request.targetStepId
        );
      }
      await saveBookProject(user, { classId: request.targetClassId, ...draft });
      setToast("목적 클래스에 내보냈어요.");
      return true;
    } catch (error) {
      console.error("[책방] 프로젝트 항목 내보내기 실패:", error);
      setToast("내보내지 못했어요. 목적 클래스를 다시 확인해 주세요.");
      return false;
    } finally {
      setExportingProject(false);
    }
  }

  async function handleJoinClass(code) {
    if (!user?.uid || joiningClass) return;
    setJoiningClass(true);
    try {
      const joinedClass = await joinClassByCode(code, user);
      setSelectedClassId(joinedClass.id);
      setToast(`${joinedClass.name ?? "우리 반"}에 참여했어요.`);
    } catch (error) {
      console.error("[책방] 반 참여 실패:", error);
      setToast("참여 코드를 확인하지 못했어요. 선생님이 알려 준 코드를 다시 입력해 주세요.");
    } finally {
      setJoiningClass(false);
    }
  }

  if (!admin && user && !classId) {
    return (
      <div className="board-shell books-board-shell">
        <main className="books-main books-main--join">
          <TopNav active="books" />
          <ClassJoinPanel
            joinableCount={joinableClasses.length}
            joining={joiningClass}
            onJoin={handleJoinClass}
          />
        </main>
        {toast && <Toast message={toast} onDone={() => setToast("")} />}
      </div>
    );
  }

  return (
    <div className="board-shell books-board-shell">
      <BooksHome
        topNav={<TopNav active="books" />}
        admin={admin} user={user} classId={classId} classes={classes} currentClass={currentClass}
        classPurpose={classPurpose} myClasses={myClasses} myClassesAll={myClassesAll}
        allTeacherClasses={ownedClassesAll} membershipIds={membershipIds} roster={roster}
        project={project} displayedProject={displayedProject} visibleActivities={visibleActivities}
        participants={participants} editingProject={editingProject} projectEditorKey={projectEditorKey}
        appendProjectStep={appendProjectStep} projectEditorStepId={projectEditorStepId} savingProject={savingProject}
        exportingProject={exportingProject}
        onSelectTeacherClass={setTeacherClassId} onToast={setToast} onEditProject={openProjectEditor}
        onSaveProject={handleSaveProject}
        onToggleActivityLock={handleToggleActivityLock} onToggleProjectItemLock={handleToggleProjectItemLock} onDelete={setConfirmDelete}
        onExportProjectItem={handleExportProjectItem}
        loadProject={getBookProject}
      />

      <ProjectItemDeleteModal target={confirmDelete} onConfirm={handleDelete} onClose={() => setConfirmDelete(null)} />

      {toast && <Toast message={toast} onDone={() => setToast("")} />}
    </div>
  );
}
