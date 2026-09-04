"use client";

import { useEffect, useMemo, useState } from "react";
import {
  deleteBookActivity,
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
import { getSelectedClassId, setSelectedClassId } from "@/lib/classroom";
import { useAutomaticClassMembership } from "@/lib/useAutomaticClassMembership";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useRequireAuth } from "@/lib/useRequireAuth";
import TopNav from "@/components/TopNav";
import Toast from "@/components/Toast";
import BooksHome from "@/components/BooksHome";
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
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    function sync() {
      setLocalSelectedId(getSelectedClassId());
    }
    sync();
    window.addEventListener("class-change", sync);
    return () => window.removeEventListener("class-change", sync);
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

  const myClassesAll = useMemo(
    () => (superAdmin ? classes : classes.filter((c) => c.createdBy === user?.uid)),
    [classes, superAdmin, user?.uid]
  );
  const myClasses = useMemo(() => myClassesAll.filter((c) => !c.archived), [myClassesAll]);
  const membershipIds = useMemo(() => memberships.map((m) => m.classId), [memberships]);
  const studentClassId =
    localSelectedId && membershipIds.includes(localSelectedId)
      ? localSelectedId
      : membershipIds[0] ?? null;

  useEffect(() => {
    if (!admin || myClasses.length === 0) return;
    if (teacherClassId && myClasses.some((c) => c.id === teacherClassId)) return;
    const remembered =
      localSelectedId && myClasses.some((c) => c.id === localSelectedId)
        ? localSelectedId
        : myClasses[0].id;
    setTeacherClassId(remembered);
    if (localSelectedId !== remembered) setSelectedClassId(remembered);
  }, [admin, myClasses, teacherClassId, localSelectedId]);

  const classId = admin ? teacherClassId : studentClassId;
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
          name: d.realName || d.studentId || "이름 미설정",
          studentId: d.studentId || null,
          emoji: d.emoji || "🙂",
          schoolName: d.schoolName || "",
        };
      })
      .sort((a, b) => (a.studentId || a.name).localeCompare(b.studentId || b.name, "ko"));
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
          .map((activity) => activityById.get(activity.id))
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
    } catch (error) {
      console.error("[책방] 프로젝트 저장 실패:", error);
      setToast("프로젝트를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSavingProject(false);
    }
  }

  async function handleOpenActivity(activity) {
    if (!admin) return;
    if (!activity.locked) {
      setToast("이미 열려 있는 활동입니다.");
      return;
    }
    try {
      await updateBookActivity(activity.id, { locked: false });
      setToast("활동을 열었어요.");
    } catch (error) {
      console.error("[책방] 활동 열기 실패:", error);
      setToast("활동을 열지 못했어요. 잠시 후 다시 시도해 주세요.");
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

  return (
    <div className="board-shell books-board-shell">
      <BooksHome
        topNav={<TopNav active="books" />}
        admin={admin} user={user} classId={classId} classes={classes} currentClass={currentClass}
        myClasses={myClasses} myClassesAll={myClassesAll} membershipIds={membershipIds} roster={roster}
        project={project} displayedProject={displayedProject} visibleActivities={visibleActivities}
        participants={participants} editingProject={editingProject} projectEditorKey={projectEditorKey}
        appendProjectStep={appendProjectStep} projectEditorStepId={projectEditorStepId} savingProject={savingProject}
        onSelectTeacherClass={setTeacherClassId} onToast={setToast} onEditProject={openProjectEditor}
        onSaveProject={handleSaveProject} onOpenActivity={handleOpenActivity}
        onToggleActivityLock={handleToggleActivityLock} onToggleProjectItemLock={handleToggleProjectItemLock} onDelete={setConfirmDelete}
      />

      <ProjectItemDeleteModal target={confirmDelete} onConfirm={handleDelete} onClose={() => setConfirmDelete(null)} />

      {toast && <Toast message={toast} onDone={() => setToast("")} />}
    </div>
  );
}
