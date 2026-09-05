"use client";

import { useEffect, useMemo, useState } from "react";
import { setSelectedClassId } from "@/lib/classroom";
import BookClassroomTools from "./BookClassroomTools";
import BookWorkspace from "./BookWorkspace";
import { IconDeveloperRoom } from "./IconDeveloperRoom";

export default function BooksHome(props) {
  const {
    topNav, admin, user, classId, classes, currentClass, myClasses, myClassesAll, membershipIds, roster,
    project, displayedProject, visibleActivities, participants, editingProject, projectEditorKey,
    appendProjectStep, projectEditorStepId, savingProject, onSelectTeacherClass, onToast,
    onEditProject, onSaveProject, onOpenActivity, onToggleActivityLock, onToggleProjectItemLock, onDelete,
  } = props;
  const studentSteps = useMemo(() => (
    !admin
      ? (displayedProject?.steps ?? []).slice(0, 3).map((step, index) => ({
        id: step.id ?? `step-${index + 1}`,
        index,
      }))
      : []
  ), [admin, displayedProject]);
  const [studentActiveStepId, setStudentActiveStepId] = useState(null);

  useEffect(() => {
    if (admin || studentSteps.length === 0) {
      setStudentActiveStepId(null);
      return;
    }

    setStudentActiveStepId((current) => (
      current && studentSteps.some((step) => step.id === current) ? current : studentSteps[0].id
    ));
  }, [admin, studentSteps]);

  return (
    <main className={`books-main books-main--split${admin ? "" : " books-main--student"}`}>
      <BookWorkspace
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
                  {!admin && studentSteps.length > 0 && (
                    <div className="books-step-tabs" aria-label="프로젝트 Step 선택">
                      {studentSteps.map((step) => {
                        const stepId = step.id;
                        return (
                          <button
                            type="button"
                            className={studentActiveStepId === stepId ? "is-active" : ""}
                            key={stepId}
                            aria-pressed={studentActiveStepId === stepId}
                            onClick={() => setStudentActiveStepId(stepId)}
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
                    roster={roster}
                    onSelectClass={onSelectTeacherClass}
                    onToast={onToast}
                  />
                </div>
                {admin && classId && (
                  <button type="button" className="btn-primary books-project-create" onClick={() => onEditProject(false)}>
                    {project ? "프로젝트 편집" : "프로젝트 만들기"}
                  </button>
                )}
              </div>

              <p className="books-intro">개발 활동에서 떠올린 생각을 활동과 자료로 정리하고{" "}<span className="keep-together">함께 살펴볼 수 있어요.</span></p>
            </div>
          </>
        )}
        activities={visibleActivities}
        participants={participants}
        user={user}
        isTeacher={admin}
        hasClass={!!classId}
        project={displayedProject}
        editingProject={editingProject}
        projectEditorKey={projectEditorKey}
        appendProjectStep={appendProjectStep}
        projectEditorStepId={projectEditorStepId}
        savingProject={savingProject}
        onSaveProject={onSaveProject}
        onEditProject={onEditProject}
        onOpen={onOpenActivity}
        onToggleActivityLock={onToggleActivityLock}
        onToggleProjectItemLock={onToggleProjectItemLock}
        onDelete={onDelete}
        studentActiveStepId={studentActiveStepId}
      />
    </main>
  );
}
