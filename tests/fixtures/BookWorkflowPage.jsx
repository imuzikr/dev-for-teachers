"use client";

import { useMemo, useState } from "react";
import BookWorkspace from "@/components/BookWorkspace";

const student = {
  uid: "student-1",
  displayName: "학생 하나",
  realName: "학생 하나",
  schoolName: "테스트중",
  emoji: "ㅎ",
};

const teacher = {
  uid: "teacher-1",
  displayName: "선생님",
  realName: "선생님",
  schoolName: "테스트중",
  emoji: "T",
};

const checklistHtml = `
  <p>자료를 읽고 체크하세요.</p>
  <ul class="rte-checklist">
    <li><label><input type="checkbox"><span class="rte-checklist-text">핵심 개념 확인</span></label></li>
    <li><label><input type="checkbox"><span class="rte-checklist-text">친구에게 설명 준비</span></label></li>
  </ul>
`;

const project = {
  id: "qa-book-project",
  classId: "qa-class",
  title: "책방 QA 프로젝트",
  steps: [{
    id: "step-1",
    title: "최종 행동 확인",
    activities: [{
      id: "activity-1",
      kind: "activity",
      title: "생각 정리 활동",
      content: "<p>읽은 내용을 한 문장으로 정리하세요.</p>",
      url: "https://example.com/activity",
      requiresAnswer: false,
    }],
    resources: [{
      id: "resource-1",
      kind: "resource",
      title: "체크리스트 자료",
      content: checklistHtml,
      url: "https://example.com/resource",
    }],
  }],
};

export default function BookWorkflowPage() {
  const [mode, setMode] = useState("student");
  const [selectedStepId, setSelectedStepId] = useState("step-1");
  const [toast, setToast] = useState("");
  const [locks, setLocks] = useState({});
  const user = mode === "teacher" ? teacher : student;
  const participants = useMemo(() => [student], []);
  const liveProject = useMemo(() => ({
    ...project,
    steps: project.steps.map((step) => ({
      ...step,
      activities: step.activities.map((activity) => ({ ...activity, locked: locks[activity.id] === true })),
      resources: step.resources.map((resource) => ({ ...resource, locked: locks[resource.id] === true })),
    })),
  }), [locks]);
  const activities = useMemo(() => liveProject.steps.flatMap((step) => step.activities.map((activity) => ({
    ...activity,
    classId: liveProject.classId,
  }))), [liveProject]);
  const toggleLock = (item, locked) => {
    const id = item?.id || item?.source?.id;
    if (!id) return;
    setLocks((current) => ({ ...current, [id]: locked === true }));
  };

  return (
    <main style={{ minHeight: "100vh" }}>
      <div className="qa-workflow-toolbar" style={{ display: "flex", gap: 8, padding: 12, position: "sticky", top: 0, zIndex: 20, background: "#fbfaf3", borderBottom: "1px solid #ded8bf" }}>
        <button type="button" onClick={() => setMode("student")}>학생 보기</button>
        <button type="button" onClick={() => setMode("teacher")}>교사 보기</button>
        <button type="button" onClick={() => setSelectedStepId("step-1")}>Step 열기</button>
        <output data-testid="mode">{mode}</output>
        <output data-testid="toast">{toast || "no-toast"}</output>
      </div>
      <main className={`books-main books-main--split${mode === "teacher" ? "" : " books-main--student"}`}>
        <BookWorkspace
          header={<header className="page-hero"><span>QA</span><h1>책방 최종 행동</h1></header>}
          activities={activities}
          participants={participants}
          progressOpen={false}
          onCloseProgress={() => {}}
          className="QA반"
          user={user}
          isTeacher={mode === "teacher"}
          hasClass
          activeClassId={liveProject.classId}
          project={liveProject}
          liveProjectReady
          onToggleActivityLock={toggleLock}
          onToggleProjectItemLock={toggleLock}
          onToast={setToast}
          selectedStepId={selectedStepId}
          onSelectStep={setSelectedStepId}
        />
      </main>
    </main>
  );
}
