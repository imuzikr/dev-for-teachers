"use client";

import { useEffect, useState } from "react";
import {
  subscribeClassStudyAttendance,
  updateLesson,
} from "@/lib/store";
import { getCurrentUser } from "@/lib/user";
import { setSelectedClassId } from "@/lib/classroom";
import ClassManagerModal from "./ClassManagerModal";
import LessonManagerModal from "./LessonManagerModal";
import LessonMode from "./LessonMode";
import StudyAttendanceModal from "./StudyAttendanceModal";

export default function BookClassroomTools({
  user,
  isTeacher,
  classId,
  currentClass,
  classes,
  roster,
  onSelectClass,
  onToast,
}) {
  const [classManagerOpen, setClassManagerOpen] = useState(false);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [lessonPicker, setLessonPicker] = useState(false);
  const [editingLesson, setEditingLesson] = useState(null);
  const [teaching, setTeaching] = useState(null);

  useEffect(() => {
    if (!isTeacher || !classId || !user?.uid) {
      setAttendanceRecords([]);
      return;
    }
    return subscribeClassStudyAttendance(classId, setAttendanceRecords);
  }, [classId, isTeacher, user?.uid]);

  function selectClass(id) {
    onSelectClass(id);
    setSelectedClassId(id);
    setClassManagerOpen(false);
  }

  async function saveLessonSlides(index, text) {
    const slides = (editingLesson.slides ?? []).map((slide, i) =>
      i === index ? { ...slide, note: text } : slide
    );
    await updateLesson(editingLesson.id, { slides });
    setEditingLesson({ ...editingLesson, slides });
  }

  async function saveLessonActivities(activities) {
    await updateLesson(editingLesson.id, { activities });
    setEditingLesson({ ...editingLesson, activities });
  }

  function startLesson(lesson) {
    if ((lesson.slides ?? []).length === 0) {
      onToast("슬라이드가 없는 자료예요.");
      return;
    }
    setLessonPicker(false);
    setTeaching(lesson);
  }

  return (
    <>
      <div className="books-classroom-tools">
        {isTeacher && currentClass && !currentClass.archived && (
          <>
            <button className="btn-ghost" onClick={() => setLessonPicker(true)}>
              수업 준비
            </button>
            <button className="btn-ghost" onClick={() => setAttendanceOpen(true)}>
              출석부 보기
            </button>
          </>
        )}
        {isTeacher && (
          <button className="btn-ghost" onClick={() => setClassManagerOpen(true)}>
            반 관리하기
          </button>
        )}
      </div>

      {isTeacher && attendanceOpen && currentClass && (
        <StudyAttendanceModal
          isTeacher
          records={attendanceRecords}
          roster={roster}
          onClose={() => setAttendanceOpen(false)}
        />
      )}

      {classManagerOpen && (
        <ClassManagerModal
          classes={classes}
          user={getCurrentUser()}
          onClose={() => setClassManagerOpen(false)}
          onCreated={selectClass}
          onViewClass={selectClass}
          onToast={onToast}
        />
      )}

      {lessonPicker && (
        <LessonManagerModal
          onClose={() => setLessonPicker(false)}
          onEdit={(lesson) => {
            setLessonPicker(false);
            setEditingLesson(lesson);
          }}
          onStart={startLesson}
        />
      )}

      {editingLesson && (
        <LessonMode
          lesson={editingLesson}
          mode="edit"
          classId={classId}
          roster={roster}
          onSaveNote={saveLessonSlides}
          onSaveActivities={saveLessonActivities}
          onClose={() => setEditingLesson(null)}
        />
      )}

      {teaching && (
        <LessonMode
          lesson={teaching}
          mode="teach"
          classId={classId}
          className={currentClass?.name ?? ""}
          roster={roster}
          attendanceRecords={attendanceRecords}
          onClose={() => setTeaching(null)}
        />
      )}

    </>
  );
}
