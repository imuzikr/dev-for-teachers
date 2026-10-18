"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ClassChangeModal from "./ClassChangeModal";
import { setSelectedClassId } from "@/lib/classroom";
import { getClassPurpose } from "@/lib/classPurpose";
import BookClassroomTools from "./BookClassroomTools";
import BookWorkspace from "./BookWorkspace";
import ClassroomCatalog from "./ClassroomCatalog";
import "@/app/classroom-catalog.css";

export default function BooksHome(props) {
  const {
    topNav, admin, user, classId, classes, currentClass, classPurpose,
    myClasses, myClassesAll, allTeacherClasses, membershipIds, roster,
    project, displayedProject, visibleActivities, participants, editingProject, projectEditorKey,
    appendProjectStep, projectEditorStepId, savingProject, onSelectTeacherClass, onToast,
    exportingProject, onEditProject, onSaveProject, onToggleActivityLock, onToggleProjectItemLock, onDelete,
    onExportProjectItem, loadProject, joiningClass, onJoinClass, liveProjectReady,
    onProjectDeleted, onProjectDeletionPending, deletingProject,
  } = props;
  const stepTabs = useMemo(() => (
    (displayedProject?.steps ?? []).map((step, index) => ({
      id: step.id ?? `step-${index + 1}`,
      index,
    }))
  ), [displayedProject]);
  const exportTargets = useMemo(
    () => (allTeacherClasses ?? myClassesAll).filter((classItem) => !classItem.archived),
    [allTeacherClasses, myClassesAll]
  );
  const stepScope = JSON.stringify([classId, displayedProject?.id, user?.uid, admin]);
  const [stepSelection, setStepSelection] = useState({ scope: stepScope, id: undefined });
  const setSelectedStepId = useCallback((id) => setStepSelection({ scope: stepScope, id }), [stepScope]);
  const [openedClassId, setOpenedClassId] = useState(null);
  const [changingClass, setChangingClass] = useState(false);
  const catalogClasses = useMemo(() => admin ? myClasses : classes.filter((item) => membershipIds.includes(item.id) && !item.archived), [admin, myClasses, classes, membershipIds]);
  const openClass = useCallback((id) => {
    if (deletingProject) return;
    setOpenedClassId(id);
    if (admin) onSelectTeacherClass(id);
    setSelectedClassId(id);
  }, [admin, deletingProject, onSelectTeacherClass]);
  const returnToCatalog = useCallback(() => {
    if (deletingProject) return;
    setOpenedClassId(null);
    setProgressOpen(false);
  }, [deletingProject]);
  const showWorkspace = openedClassId !== null;
  const workspaceReady = openedClassId === classId && liveProjectReady !== false;
  useEffect(() => {
    if (openedClassId && !catalogClasses.some((item) => item.id === openedClassId)) setOpenedClassId(null);
  }, [catalogClasses, classId, openedClassId]);
  const [progressOpen, setProgressOpen] = useState(false);
  const closeProgress = useCallback(() => setProgressOpen(false), []);
  useEffect(() => { setProgressOpen(false); }, [classId, displayedProject?.id, admin]);
  const closeClassChange = useCallback(() => setChangingClass(false), []);
  const joinClass = useCallback(async (code) => {
    const joined = await onJoinClass(code);
    if (joined) setOpenedClassId(null);
    return joined;
  }, [onJoinClass]);

  useEffect(() => {
    setStepSelection((current) => {
      if (current.scope === stepScope && (
        (!admin && current.id === null) || stepTabs.some((step) => step.id === current.id)
      )) return current;
      const id = stepTabs[0]?.id;
      return current.scope === stepScope && current.id === id ? current : { scope: stepScope, id };
    });
  }, [admin, stepScope, stepTabs]);
  const activeStepId = stepSelection.scope === stepScope && !admin && stepSelection.id === null
    ? null
    : stepSelection.scope === stepScope && stepTabs.some((step) => step.id === stepSelection.id)
      ? stepSelection.id
      : stepTabs[0]?.id ?? null;
  const classroomTools = (
    <BookClassroomTools user={user} isTeacher={admin} classId={classId} currentClass={currentClass}
      classes={myClassesAll} allClasses={allTeacherClasses ?? myClassesAll} classPurpose={classPurpose}
      roster={roster} onSelectClass={openClass} onToast={onToast}
      onOpenProgress={showWorkspace ? () => setProgressOpen(true) : undefined} />
  );

  return (
    <main className={showWorkspace
      ? `books-main books-main--split classroom-workspace${admin ? "" : " books-main--student"}`
      : "books-main classroom-catalog"}>
      {!showWorkspace ? <>
        {topNav}
        <ClassroomCatalog classes={catalogClasses} currentClass={currentClass} isTeacher={admin}
          classPurpose={classPurpose} disabled={deletingProject} tools={classroomTools}
          onOpen={openClass} onJoin={onJoinClass ? () => setChangingClass(true) : null} />
      </> : <BookWorkspace
        key={openedClassId}
        liveProjectReady={workspaceReady}
        header={(portfolioAction) => (
          <>
            {topNav}
            <div className="classroom-workspace-head">
              <button type="button" className="btn-outline" disabled={deletingProject} aria-label="클래스 목록" onClick={returnToCatalog}>← 클래스 목록</button>
              <div className="classroom-workspace-title">
                <h1>{workspaceReady ? currentClass?.name : "클래스 불러오는 중..."}</h1>
                <p>{workspaceReady ? displayedProject?.title || "활동과 자료" : "선택한 클래스의 내용을 준비하고 있어요."}</p>
              </div>
              <div className="classroom-workspace-actions">
                {workspaceReady && classroomTools}
                {!admin && onJoinClass && <button type="button" className="btn-outline books-class-change" onClick={() => setChangingClass(true)}>반 변경</button>}
                {admin && classId && <button type="button" className="btn-primary books-project-create"
                  disabled={savingProject || !workspaceReady} onClick={() => onEditProject(false)}>
                  {project ? "프로젝트 편집" : "프로젝트 만들기"}
                </button>}
                {workspaceReady && portfolioAction}
              </div>
            </div>
          </>
        )}
        activities={workspaceReady ? visibleActivities : []}
        participants={workspaceReady ? participants : []}
        progressOpen={progressOpen}
        onCloseProgress={closeProgress}
        className={workspaceReady ? currentClass?.name ?? "" : ""}
        user={user}
        isTeacher={admin}
        hasClass={!!classId && openedClassId === classId}
        activeClassId={openedClassId === classId ? classId : null}
        classPurpose={currentClass ? getClassPurpose(currentClass) : classPurpose}
        project={workspaceReady ? displayedProject : null}
        editingProject={editingProject}
        projectEditorKey={projectEditorKey}
        appendProjectStep={appendProjectStep}
        projectEditorStepId={projectEditorStepId}
        savingProject={savingProject}
        exportingProject={exportingProject}
        exportTargets={exportTargets}
        onSaveProject={onSaveProject}
        onEditProject={onEditProject}
        onToggleActivityLock={onToggleActivityLock}
        onToggleProjectItemLock={onToggleProjectItemLock}
        onDelete={onDelete}
        onExportProjectItem={onExportProjectItem}
        loadProject={loadProject}
        selectedStepId={activeStepId}
        onSelectStep={setSelectedStepId}
        onToast={onToast}
        onProjectDeleted={onProjectDeleted}
        onProjectDeletionPending={onProjectDeletionPending}
      />}
      {!admin && changingClass && <ClassChangeModal joining={joiningClass} onJoin={joinClass} onClose={closeClassChange} />}
    </main>
  );
}
