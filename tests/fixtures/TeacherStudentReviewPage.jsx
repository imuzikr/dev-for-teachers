"use client";

import { useEffect, useMemo, useState } from "react";
import BookWorkspace from "@/components/BookWorkspace";
import { isFirebaseConfigured } from "@/lib/firebase";
import { saveBookDashboardText } from "@/lib/store";
import { saveBookConfirmation } from "@/lib/bookConfirmations";
import { checklistVersion } from "@/lib/activityChecklist";

const participants = [
  { uid: "review-student-one", realName: "학생 하나", schoolName: "검토학교" },
  { uid: "review-student-two", realName: "학생 둘", schoolName: "검토학교" },
];
const teacher = { uid: "review-teacher", realName: "검토 교사", role: "teacher", schoolName: "검토학교" };
const checklist = '<ul class="rte-checklist"><li><label><input type="checkbox"><span class="rte-checklist-text">읽기 확인</span></label></li></ul>';
const makeSteps = classId => [{
  id: "step-1", title: "생각 정리", description: "학생이 남긴 답변과 링크를 살펴보세요.",
  activities: [
    { id: `${classId}-first`, title: "첫 번째 답변 활동", content: `<p>첫 번째 생각을 정리하세요.</p>${checklist}`, requiresAnswer: true },
    { id: `${classId}-second`, title: "두 번째 답변 활동", content: "<p>비교한 내용을 정리하세요.</p>", requiresAnswer: true },
  ],
  resources: [{ id: `${classId}-resource`, title: "검토 참고 자료", content: `<p>답변을 살펴볼 때 참고하세요.</p>${checklist}`, url: "https://example.org/resource" }],
  itemOrder: [{ kind: "resource", id: `${classId}-resource` }, { kind: "activity", id: `${classId}-first` }, { kind: "activity", id: `${classId}-second` }],
}, {
  id: "step-2", title: "마무리", description: "마무리 답변을 살펴보세요.",
  activities: [
    { id: `${classId}-final`, title: "마무리 답변 활동", content: "<p>배운 점을 정리하세요.</p>", requiresAnswer: true },
    { id: `${classId}-empty`, title: "아직 작성하지 않은 활동", content: "<p>다음 수업에서 작성합니다.</p>", requiresAnswer: true },
  ], resources: [],
}];
let seedPromise;
function seedEntries() {
  if (isFirebaseConfigured) throw new Error("Student review fixture requires mock Firebase");
  if (!seedPromise) seedPromise = (async () => {
    window.reviewSeeding = true;
    try {
      for (const [studentIndex, student] of participants.entries()) {
        for (const [activity, label] of [["first", "첫 번째"], ["second", "두 번째"], ["final", "마무리"]]) {
          const slug = `${studentIndex + 1}/${activity}`;
          await saveBookDashboardText(`review-class-a-${activity}`, student, `${student.realName}의 ${label} 답변`, [
            `https://example.org/student/${slug}`,
            `https://example.org/research/${slug}/${"long-saved-address-".repeat(6)}`,
          ]);
        }
        const firstStep = makeSteps("review-class-a")[0];
        for (const [itemKind, item] of [["activity", firstStep.activities[0]], ["resource", firstStep.resources[0]]]) {
          await saveBookConfirmation({
            classId: "review-class-a", projectId: "review-class-a", stepId: "step-1",
            itemKind, itemId: item.id, itemTitle: item.title, user: student,
            checklistValues: [studentIndex === 0], checklistVersion: checklistVersion(item.content), confirmed: studentIndex === 0,
          });
        }
      }
    } finally { window.reviewSeeding = false; }
  })();
  return seedPromise;
}

export default function TeacherStudentReviewPage() {
  const [ready, setReady] = useState(false);
  const [classId, setClassId] = useState("review-class-a");
  const [selectedStepId, setSelectedStepId] = useState("step-1");
  const [activeItemByStep, setActiveItemByStep] = useState({ "step-1": "activity:review-class-a-second" });
  useEffect(() => { let live = true; seedEntries().then(() => { if (live) setReady(true); }); return () => { live = false; }; }, []);
  const steps = useMemo(() => makeSteps(classId), [classId]);
  const project = useMemo(() => ({ id: classId, classId, version: "review-v1", title: "학생 답변 검토", steps, activeItemByStep }), [classId, steps, activeItemByStep]);
  const activities = useMemo(() => steps.flatMap(step => step.activities.map(activity => ({ ...activity, classId }))), [classId, steps]);
  if (!ready) return <p role="status">검토 기록 준비 중</p>;
  return <main>
    <nav aria-label="검증 제어">
      <button className="btn-outline" onClick={() => {
        const nextClass = classId === "review-class-a" ? "review-class-b" : "review-class-a";
        setClassId(nextClass);
        setSelectedStepId("step-1");
        setActiveItemByStep({ "step-1": `activity:${nextClass}-second` });
      }}>반 전환</button>
      <button className="btn-outline" onClick={() => setActiveItemByStep({ "step-1": `activity:${classId}-first` })}>외부 방송 변경</button>
    </nav>
    <div className="books-main books-main--split">
      <BookWorkspace user={teacher} isTeacher hasClass activeClassId={classId}
        project={project} activities={activities} participants={participants} className="검토반"
        header={<div className="books-step-tabs" aria-label="프로젝트 Step 선택">{steps.map((step, index) => <button key={step.id} type="button" aria-pressed={selectedStepId === step.id} className={selectedStepId === step.id ? "is-active" : ""} onClick={() => setSelectedStepId(step.id)}>STEP {index + 1}</button>)}</div>}
        selectedStepId={selectedStepId} onSelectStep={setSelectedStepId}
        setActiveItem={async (_, stepId, kind, id, active) => {
          window.reviewActivations = (window.reviewActivations || 0) + 1;
          setActiveItemByStep(active ? { [stepId]: `${kind}:${id}` } : {});
        }} />
    </div>
  </main>;
}
