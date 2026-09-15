"use client";

import { useState } from "react";
import BookClassroomTools from "@/components/BookClassroomTools";

const classes = [
  { id: "qa-class-a", name: "1학년 1반" },
  { id: "qa-class-b", name: "2학년 2반" },
  { id: "qa-class-empty", name: "배포 없는 반" },
];
const teacher = { uid: "qa-distribution-teacher", role: "teacher", realName: "테스트 교사" };
const student = { uid: "qa-distribution-student", role: "student", realName: "테스트 학생" };

export default function LessonDistributionPage() {
  const [role, setRole] = useState("student");
  const [classId, setClassId] = useState(classes[0].id);
  return <main>
    <label>테스트 역할 <select aria-label="테스트 역할" value={role} onChange={event => setRole(event.target.value)}>
      <option value="student">학생</option><option value="teacher">교사</option>
    </select></label>
    <label>테스트 반 <select aria-label="테스트 반" value={classId} onChange={event => setClassId(event.target.value)}>
      {classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select></label>
    <BookClassroomTools user={role === "teacher" ? teacher : student} isTeacher={role === "teacher"}
      classId={classId} currentClass={classes.find(item => item.id === classId)} classes={classes}
      onSelectClass={setClassId} onToast={() => {}} />
  </main>;
}
