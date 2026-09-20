"use client";

import { useMemo, useState } from "react";
import BookWorkspace from "@/components/BookWorkspace";

const student = { uid: "demo-student", realName: "학생 하나", schoolName: "테스트학교" };
const teacher = { uid: "demo-teacher", realName: "시연 교사", role: "teacher", schoolName: "테스트학교" };
const steps = [{ id: "step-1", title: "시연 단계", activities: [
  { id: "answer", title: "답변 활동", content: "<p>한 문장으로 정리하세요.</p>", requiresAnswer: true },
  { id: "template", title: "템플릿 활동", content: "<p>{{학교}}에서 {{이름}}과 활동합니다.</p>", templateEnabled: true },
], resources: [
  { id: "plain", title: "복사 자료", content: "<p>학생에게 보여줄 내용</p>" },
  { id: "resource-template", title: "템플릿 자료", templateEnabled: true, content: '<p>{{주제}}에 대해 설명해 주세요.</p><ul class="rte-checklist"><li><label><input type="checkbox"><span class="rte-checklist-text">내용 확인</span></label></li></ul>' },
] }];

export default function TeacherActivityDemoPage() {
  const [mode, setMode] = useState("teacher");
  const [classId, setClassId] = useState("demo-class-a");
  const [teacherId, setTeacherId] = useState(teacher.uid);
  const [selectedStepId, setSelectedStepId] = useState("step-1");
  const [activeItemByStep, setActiveItemByStep] = useState({});
  const project = useMemo(() => ({ id: classId, classId, version: "demo-v1", title: "교사용 시연", steps, activeItemByStep }), [classId, activeItemByStep]);
  const activities = useMemo(() => steps.flatMap(step => step.activities.map(activity => ({ ...activity, classId }))), [classId]);
  const isTeacher = mode === "teacher";
  const user = isTeacher ? { ...teacher, uid: teacherId } : student;
  return <main>
    <nav className="qa-demo-controls">
      <button onClick={() => setMode("teacher")}>교사 보기</button>
      <button onClick={() => setMode("student")}>학생 보기</button>
      <button onClick={() => setTeacherId(id => id === teacher.uid ? "other-teacher" : teacher.uid)}>교사 계정 전환</button>
      <button onClick={() => { setClassId(id => id === "demo-class-a" ? "demo-class-b" : "demo-class-a"); setActiveItemByStep({}); }}>반 전환</button>
    </nav>
    <div className={`books-main books-main--split${isTeacher ? "" : " books-main--student"}`}>
      <BookWorkspace user={user} isTeacher={isTeacher} hasClass activeClassId={classId}
        project={project} activities={activities} participants={[student]} className="테스트반"
        selectedStepId={selectedStepId} onSelectStep={setSelectedStepId}
        setActiveItem={async (_, stepId, kind, id) => { setActiveItemByStep({ [stepId]: `${kind}:${id}` }); }} />
    </div>
  </main>;
}
