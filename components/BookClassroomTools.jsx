"use client";

import { useState } from "react";
import { getCurrentUser } from "@/lib/user";
import { setSelectedClassId } from "@/lib/classroom";
import { CLASS_PURPOSE_INTERNAL, normalizeClassPurpose } from "@/lib/classPurpose";
import ClassManagerModal from "./ClassManagerModal";
import LessonManagerModal from "./LessonManagerModal";

export default function BookClassroomTools({
  user, isTeacher, classId, currentClass, classes, allClasses,
  classPurpose, onSelectClass, onToast, onOpenProgress,
}) {
  const [classManagerOpen, setClassManagerOpen] = useState(false);
  const [lessonPicker, setLessonPicker] = useState(false);
  const unitLabel = normalizeClassPurpose(classPurpose) === CLASS_PURPOSE_INTERNAL ? "차시" : "반";

  function selectClass(id) {
    onSelectClass(id);
    setSelectedClassId(id);
    setClassManagerOpen(false);
  }

  return <>
    <div className="books-classroom-tools">
      {isTeacher && currentClass && !currentClass.archived && <button className="btn-ghost" onClick={() => setLessonPicker(true)}>수업 준비</button>}
      {isTeacher && <button className="btn-ghost" onClick={() => setClassManagerOpen(true)}>{unitLabel} 관리하기</button>}
      {isTeacher && onOpenProgress && <button type="button" className="btn-ghost" disabled={!classId} onClick={onOpenProgress}>전체 진행률</button>}
    </div>
    {classManagerOpen && <ClassManagerModal classes={classes} allClasses={allClasses ?? classes}
      classPurpose={classPurpose} user={user ?? getCurrentUser()} onClose={() => setClassManagerOpen(false)}
      onCreated={selectClass} onViewClass={selectClass} onToast={onToast} />}
    {lessonPicker && <LessonManagerModal user={user} onClose={() => setLessonPicker(false)} />}
  </>;
}
