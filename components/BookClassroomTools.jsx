"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import {
  markStudyAttendance,
  subscribeClassStudyAttendance,
  subscribeMyStudyAttendance,
  todayDateKey,
  updateLesson,
} from "@/lib/store";
import { getCurrentUser } from "@/lib/user";
import { setSelectedClassId } from "@/lib/classroom";
import ClassManagerModal from "./ClassManagerModal";
import LessonManagerModal from "./LessonManagerModal";
import LessonMode from "./LessonMode";
import StudyAttendanceModal from "./StudyAttendanceModal";

const PythonRunner = dynamic(() => import("./PythonRunner"), { ssr: false });

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const pyOpen = searchParams.get("python") === "1";
  const [classManagerOpen, setClassManagerOpen] = useState(false);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [attending, setAttending] = useState(false);
  const [lessonPicker, setLessonPicker] = useState(false);
  const [editingLesson, setEditingLesson] = useState(null);
  const [teaching, setTeaching] = useState(null);

  const today = todayDateKey();
  const attendedToday = !isTeacher && attendanceRecords.some((record) => record.date === today);

  useEffect(() => {
    if (!classId || !user?.uid) {
      setAttendanceRecords([]);
      return;
    }
    if (isTeacher) return subscribeClassStudyAttendance(classId, setAttendanceRecords);
    return subscribeMyStudyAttendance(classId, user.uid, setAttendanceRecords);
  }, [classId, isTeacher, user?.uid]);

  function selectClass(id) {
    onSelectClass(id);
    setSelectedClassId(id);
    setClassManagerOpen(false);
  }

  async function markAttendance() {
    if (!classId || !user || isTeacher || attending) return;
    setAttending(true);
    try {
      await markStudyAttendance(classId, user, today);
      onToast(attendedToday ? "오늘 출석은 이미 기록되어 있어요." : "오늘 출석을 기록했어요.");
    } finally {
      setAttending(false);
    }
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
        {!isTeacher && currentClass && (
          <>
            <button
              className={`btn-ghost attendance-mark-btn${attendedToday ? " done" : ""}`}
              onClick={markAttendance}
              disabled={attending || attendedToday}
            >
              {attendedToday ? "출석 완료" : "출석하기"}
            </button>
            <button className="btn-ghost" onClick={() => setAttendanceOpen(true)}>
              내 출석부
            </button>
          </>
        )}
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

      {attendanceOpen && currentClass && (
        <StudyAttendanceModal
          isTeacher={isTeacher}
          records={attendanceRecords}
          roster={isTeacher ? roster : []}
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

      <PythonRunner
        open={pyOpen}
        onClose={() => router.replace("/books")}
        hasModalOpen={classManagerOpen || attendanceOpen || lessonPicker || !!editingLesson || !!teaching}
      />
    </>
  );
}
