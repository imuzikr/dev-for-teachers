"use client";

import { useEffect, useMemo, useState } from "react";
import BooksHome from "@/components/BooksHome";
import { saveBookDashboardText, subscribeBookEntries } from "@/lib/store";
import { saveBookConfirmation } from "@/lib/bookConfirmations";

const teacher = { uid: "portfolio-teacher", role: "admin", realName: "담임 선생님", displayName: "담임 선생님" };
const student = { uid: "portfolio-student", role: "student", realName: "김학생", displayName: "김학생", schoolName: "코덱스초등학교", emoji: "김" };
const otherStudent = { uid: "portfolio-other", role: "student", realName: "이학생", displayName: "이학생", schoolName: "다른학교", emoji: "이" };
const lessonOneClass = { id: "portfolio-lesson-one", name: "1차시 문제 발견", purpose: "internal" };
const lessonTwoClass = { id: "portfolio-lesson-two", name: "2차시 해결 방안", purpose: "internal" };
const currentClass = lessonOneClass;
const trainingClass = { id: "portfolio-training", name: "연수용 반", purpose: "training" };
function activity(id, title, text) {
  return { id, title, content: `<p>${text}</p>`, requiresAnswer: true, locked: false };
}

function makeProject(extraFinal = false, reorderFinal = false, classItem = lessonOneClass) {
  const isLessonTwo = classItem.id === lessonTwoClass.id;
  const suffix = isLessonTwo ? "-lesson-two" : "";
  const dynamicId = `dynamic-final${suffix}`;
  const dynamicStep = {
    id: "step-dynamic",
    title: "동적으로 추가한 STEP",
    description: "나중에 추가한 STEP입니다.",
    activities: [activity(dynamicId, "동적으로 추가한 마지막 활동", "추가한 STEP의 활동입니다.")],
    resources: [],
    itemOrder: [{ kind: "activity", id: dynamicId }],
  };
  const planId = isLessonTwo ? "lesson-two-plan" : "plan";
  const hostileId = isLessonTwo ? "lesson-two-hostile" : "hostile";
  const promptId = isLessonTwo ? "lesson-two-prompt" : "prompt";
  const captureId = isLessonTwo ? "lesson-two-capture" : "capture";
  const finalTitle = isLessonTwo ? "2차시 정리 활동" : "최종 캡처 활동";
  const baseSteps = [
    {
      id: "step-start",
      title: "기획 STEP",
      description: "문제를 고르고 해결 방향을 정합니다.",
      activities: [activity(planId, isLessonTwo ? "해결 방안 활동" : "긴 한글 계획 활동", "긴 문장과 URL을 저장합니다.")],
      resources: [],
      itemOrder: [{ kind: "activity", id: planId }],
    },
    {
      id: "step-middle",
      title: "제작 STEP",
      description: "코드를 만들고 실험합니다.",
      activities: [
        activity(hostileId, "마크업 안전성 <script>alert(1)</script>", "HTML처럼 보이는 원문을 보존합니다."),
        activity(promptId, "프롬프트 점검 prompt", "긴 프롬프트를 저장합니다."),
      ],
      resources: [],
      itemOrder: [{ kind: "activity", id: hostileId }, { kind: "activity", id: promptId }],
    },
    {
      id: "step-final",
      title: "최종 공유 STEP",
      description: "완성 기록을 묶어 포트폴리오를 만듭니다.",
      activities: [activity(captureId, finalTitle, "이미지를 저장합니다.")],
      resources: [],
      itemOrder: [{ kind: "activity", id: captureId }],
    },
  ];
  const steps = extraFinal
    ? reorderFinal ? [baseSteps[0], baseSteps[1], dynamicStep, baseSteps[2]] : [...baseSteps, dynamicStep]
    : baseSteps;
  return { id: classItem.id, classId: classItem.id, version: `${classItem.id}-${extraFinal ? 2 : 1}-${reorderFinal ? "reordered" : "ordered"}`, title: "학교 포트폴리오 프로젝트", steps };
}

function seedEntries() {
  const longKorean = "이 기록은 매우 긴 한글 문장을 포함합니다. ".repeat(18) + "끝에서 의미가 잘리지 않아야 합니다.";
  const longPrompt = "system: 안전하게 설명하기\nuser: " + "긴 프롬프트 원문을 그대로 보존합니다. ".repeat(22);
  return Promise.all([
    saveBookDashboardText("plan", student, longKorean, ["example.org/student-safe"]),
    saveBookDashboardText("hostile", student, "<img src=x onerror=alert(1)> & <strong>원문</strong>", ["https://safe.example.org/path?q=<unsafe>"]),
    saveBookDashboardText("prompt", student, longPrompt, ["https://example.org/prompt"]),
    saveBookDashboardText("capture", student, "초기 캡처 설명", ["https://example.org/capture"]),
    saveBookDashboardText("lesson-two-plan", student, "2차시에서만 작성한 해결 방안입니다.", ["https://example.org/lesson-two"]),
    saveBookDashboardText("lesson-two-hostile", student, "2차시 마크업 안전성 확인", ["https://safe.example.org/lesson-two"]),
    saveBookDashboardText("lesson-two-prompt", student, "2차시 프롬프트 원문입니다.", ["https://example.org/lesson-two-prompt"]),
    saveBookDashboardText("lesson-two-capture", student, "2차시 캡처 설명입니다.", ["https://example.org/lesson-two-capture"]),
    saveBookDashboardText("plan", otherStudent, "다른 학생 기록은 섞이면 안 됩니다.", ["https://example.org/other"]),
    saveBookConfirmation({ classId: currentClass.id, projectId: currentClass.id, itemKind: "activity", itemId: "plan", stepId: "step-start", user: student, confirmed: true }),
  ]);
}

let seeded;
function ensureSeeded() {
  if (!seeded) seeded = (async () => {
    const saved = window.localStorage.getItem("portfolio-entry-backend");
    if (saved) {
      await seedEntries();
      const rows = Object.values(JSON.parse(saved)).flat();
      await Promise.all(rows.map(entry => saveBookDashboardText(entry.activityId, entry.authorId === student.uid ? student : otherStudent, entry.dashboardText, entry.urls, entry.images)));
      return;
    }
    await seedEntries();
    window.localStorage.setItem("portfolio-seeded", "1");
  })();
  return seeded;
}

export default function BookPortfolioPage() {
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState("student");
  const [classItem, setClassItem] = useState(currentClass);
  const [project, setProject] = useState(makeProject());
  const [entries, setEntries] = useState({});
  const user = mode === "teacher" ? teacher : student;
  const admin = mode === "teacher";
  const roster = [student, otherStudent];
  const visibleActivities = useMemo(() => project.steps.flatMap((step) => step.activities), [project]);

  useEffect(() => { void ensureSeeded().then(() => setReady(true)); }, []);
  useEffect(() => {
    let active = true;
    const unsubscribers = visibleActivities.map((item) => subscribeBookEntries(item.id, (rows) => {
      if (!active) return;
      setEntries((current) => ({ ...current, [item.id]: rows }));
    }));
    return () => {
      active = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [visibleActivities]);
  useEffect(() => {
    window.portfolioQA = { mode, classItem, project, entries };
    if (ready && Object.keys(entries).length) window.localStorage.setItem("portfolio-entry-backend", JSON.stringify(entries));
  }, [ready, mode, classItem, project, entries]);
  if (!ready) return <p>검증 자료 준비 중</p>;

  return (
    <>
      <nav aria-label="포트폴리오 검증 제어" style={{ position: "fixed", top: 0, right: 0, zIndex: 5000, display: "flex", gap: 6, padding: 6, background: "white" }}>
        <button type="button" onClick={() => setMode(mode === "teacher" ? "student" : "teacher")}>역할 전환</button>
        <button type="button" onClick={() => setClassItem(classItem.id === currentClass.id ? trainingClass : currentClass)}>목적 전환</button>
        <button type="button" onClick={() => setClassItem(lessonTwoClass)}>2차시 선택</button>
        <button type="button" onClick={() => { setClassItem(lessonTwoClass); setProject(makeProject(false, false, lessonTwoClass)); }}>2차시 전환</button>
        <button type="button" onClick={() => { setClassItem(lessonOneClass); setProject(makeProject(false, false, lessonOneClass)); }}>1차시 전환</button>
        <button type="button" onClick={() => setProject(makeProject(true, false, classItem))}>마지막 Step 추가</button>
        <button type="button" onClick={() => setProject(makeProject(true, true, classItem))}>마지막 Step 재정렬</button>
        <button type="button" onClick={() => setProject({ ...makeProject(), steps: [] })}>빈 프로젝트</button>
      </nav>
      <BooksHome
        topNav={null}
        admin={admin}
        user={user}
        classId={classItem.id}
        classes={[currentClass, trainingClass]}
        currentClass={classItem}
        classPurpose="training"
        myClasses={[classItem]}
        myClassesAll={[currentClass, trainingClass]}
        allTeacherClasses={[currentClass, trainingClass]}
        membershipIds={[classItem.id]}
        roster={roster}
        participants={roster}
        project={project}
        displayedProject={project}
        visibleActivities={visibleActivities}
        editingProject={false}
        projectEditorKey={0}
        savingProject={false}
        exportingProject={false}
        liveProjectReady
        joiningClass={false}
        onSelectTeacherClass={() => {}}
        onToast={() => {}}
        onJoinClass={() => {}}
        onEditProject={() => {}}
        onSaveProject={async (patch) => {
          setProject((current) => ({ ...current, ...patch, version: `saved-${Date.now()}` }));
          return true;
        }}
        onToggleActivityLock={() => {}}
        onToggleProjectItemLock={() => {}}
        onDelete={() => {}}
        onExportProjectItem={() => {}}
        loadProject={() => {}}
        onProjectDeleted={() => {}}
        onProjectDeletionPending={() => {}}
        deletingProject={false}
      />
    </>
  );
}
