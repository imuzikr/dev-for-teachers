"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ClassChangeModal from "./ClassChangeModal";
import { setSelectedClassId } from "@/lib/classroom";
import BookClassroomTools from "./BookClassroomTools";
import BookWorkspace from "./BookWorkspace";
import { IconDeveloperRoom } from "./IconDeveloperRoom";

export default function BooksHome(props) {
  const {
    topNav, admin, user, classId, classes, currentClass, classPurpose,
    myClasses, myClassesAll, allTeacherClasses, membershipIds, roster,
    project, displayedProject, visibleActivities, participants, editingProject, projectEditorKey,
    appendProjectStep, projectEditorStepId, savingProject, onSelectTeacherClass, onToast,
    exportingProject, onEditProject, onSaveProject, onToggleActivityLock, onToggleProjectItemLock, onDelete,
    onExportProjectItem, loadProject, joiningClass, onJoinClass, liveProjectReady,
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
  const [selectedStepId, setSelectedStepId] = useState(null);
  const [changingClass, setChangingClass] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const closeProgress = useCallback(() => setProgressOpen(false), []);
  useEffect(() => { setProgressOpen(false); }, [classId, displayedProject?.id, admin]);
  const closeClassChange = useCallback(() => setChangingClass(false), []);

  useEffect(() => {
    if (stepTabs.length === 0) {
      setSelectedStepId(null);
      return;
    }

    if (admin) {
      setSelectedStepId((current) => (
        current && stepTabs.some((step) => step.id === current) ? current : stepTabs[0].id
      ));
      return;
    }

    setSelectedStepId((current) => (
      current && stepTabs.some((step) => step.id === current) ? current : null
    ));
  }, [admin, stepTabs]);
  const activeStepId = admin && !selectedStepId
    ? stepTabs[0]?.id ?? null
    : selectedStepId;

  return (
    <main className={`books-main books-main--split${admin ? "" : " books-main--student"}`}>
      <BookWorkspace
        liveProjectReady={liveProjectReady}
        header={(
          <>
            {topNav}
            <div className="books-content-head">
              <div className="books-head">
                <div className="books-head-main">
                  <h1><IconDeveloperRoom size={26} /> 개발자실</h1>
                  {admin && myClasses.length > 0 && (
                    <select className="class-select" value={classId ?? ""} onChange={(event) => {
                      onSelectTeacherClass(event.target.value);
                      setSelectedClassId(event.target.value);
                    }}>
                      {myClasses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  )}
                  {!admin && membershipIds.length > 1 ? (
                    <select className="class-select" value={classId ?? ""} onChange={(event) => setSelectedClassId(event.target.value)}>
                      {membershipIds.map((id) => <option key={id} value={id}>{classes.find((item) => item.id === id)?.name ?? "우리 반"}</option>)}
                    </select>
                  ) : !admin && currentClass && <span className="books-class-name">{currentClass.name}</span>}
                  {!admin && onJoinClass && <button type="button" className="btn-outline books-class-change" onClick={() => setChangingClass(true)}>반 변경</button>}
                  {!admin && stepTabs.length > 0 && (
                    <div className="books-step-tabs" aria-label="프로젝트 Step 선택">
                      {stepTabs.map((step) => {
                        const stepId = step.id;
                        return (
                          <button
                            type="button"
                            className={activeStepId === stepId ? "is-active" : ""}
                            key={stepId}
                            aria-pressed={activeStepId === stepId}
                            onClick={() => setSelectedStepId(stepId)}
                          >
                            STEP {step.index + 1}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <BookClassroomTools
                    user={user}
                    isTeacher={admin}
                    classId={classId}
                    currentClass={currentClass}
                    classes={myClassesAll}
                    allClasses={allTeacherClasses ?? myClassesAll}
                    classPurpose={classPurpose}
                    roster={roster}
                    onSelectClass={onSelectTeacherClass}
                    onToast={onToast}
                    onOpenProgress={() => setProgressOpen(true)}
                  />
                </div>
                {admin && classId && (
                  <button type="button" className="btn-primary books-project-create" onClick={() => onEditProject(false)}>
                    {project ? "프로젝트 편집" : "프로젝트 만들기"}
                  </button>
                )}
              </div>
              {admin && stepTabs.length > 0 && (
                <div className="books-step-switcher-row">
                  <div className="books-step-tabs books-step-tabs--teacher" aria-label="프로젝트 Step 선택">
                    {stepTabs.map((step) => {
                      const stepId = step.id;
                      return (
                        <button
                          type="button"
                          className={activeStepId === stepId ? "is-active" : ""}
                          key={stepId}
                          aria-pressed={activeStepId === stepId}
                          onClick={() => setSelectedStepId(stepId)}
                        >
                          STEP {step.index + 1}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {!admin && <p className="books-intro">개발 활동에서 떠올린 생각을 활동과 자료로 정리하고{" "}<span className="keep-together">함께 살펴볼 수 있어요.</span></p>}
            </div>
          </>
        )}
        activities={visibleActivities}
        participants={participants}
        progressOpen={progressOpen}
        onCloseProgress={closeProgress}
        className={currentClass?.name ?? ""}
        user={user}
        isTeacher={admin}
        hasClass={!!classId}
        activeClassId={classId}
        project={displayedProject}
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
      />
      {!admin && changingClass && <ClassChangeModal joining={joiningClass} onJoin={onJoinClass} onClose={closeClassChange} />}
    </main>
  );
}
