"use client";

import { useMemo, useState } from "react";
import StudentActivityPanel, { useStudentActivityPanel } from "@/components/StudentActivityPanel";
import { useStudentPanelAutoOpenRequest } from "@/components/studentPanelAutoOpen";
import BookPersonalItemViewModal from "@/components/BookPersonalItemViewModal";

function AutoOpenContent({ activeStep, unlockResource, unlockActivity, renameItem, switchScope, returnScope, scope }) {
  const panel = useStudentActivityPanel();
  const [answerDraft, setAnswerDraft] = useState("");
  const [checklistValues, setChecklistValues] = useState({});
  const selectedKind = panel?.selectedKey === "activity:a2" ? "activity" : "resource";
  const detailItem = {
    kind: selectedKind,
    id: selectedKind === "activity" ? "a2" : "r1",
    source: selectedKind === "activity"
      ? {
        id: "a2",
        title: "자동 열린 활동",
        requiresAnswer: true,
        locked: false,
        content: '<ul class="rte-checklist"><li><label><input type="checkbox"><span class="rte-checklist-text">활동 체크</span></label></li></ul>',
      }
      : {
        id: "r1",
        title: "자동 열린 자료",
        locked: false,
        content: "자료 안내사항",
      },
  };

  return (
    <main>
      <button type="button" onClick={unlockResource}>자료 잠금 해제</button>
      <button type="button" onClick={unlockActivity}>활동 잠금 해제</button>
      <button type="button" onClick={renameItem}>자료 제목 수정</button>
      <button type="button" onClick={switchScope}>다른 학습자 보기</button>
      <button type="button" onClick={returnScope}>원래 학습자 보기</button>
      <output aria-label="현재 스코프">{scope}</output>
      <output aria-label="현재 스텝">{activeStep}</output>
      <output aria-label="선택된 패널 항목">{panel?.selectedKey ?? "none"}</output>
      {panel?.selectedKey && panel.target && (
        <BookPersonalItemViewModal
          detailItem={detailItem}
          index={0}
          isTeacher={false}
          panelTarget={panel.target}
          onExpand={() => {}}
          answerDraft={answerDraft}
          onAnswerChange={setAnswerDraft}
          checklistValues={checklistValues}
          onChecklistChange={setChecklistValues}
          checklistStatus=""
          hasChecklist={selectedKind === "activity"}
          checklistComplete={checklistValues[0] === true}
          onSave={async () => true}
        />
      )}
    </main>
  );
}

export default function StudentPanelAutoOpenPage() {
  const [activeStep, setActiveStep] = useState("step-1");
  const [scope, setScope] = useState("auto-open-fixture");
  const [ready, setReady] = useState(false);
  const [initialResourceLocked, setInitialResourceLocked] = useState(true);
  const [resourceLocked, setResourceLocked] = useState(true);
  const [activityLocked, setActivityLocked] = useState(true);
  const [titleVersion, setTitleVersion] = useState(0);
  const sections = useMemo(() => [
    {
      id: "step-0",
      items: [{ kind: "resource", id: "initial", stepId: "step-0", source: { id: "initial", locked: initialResourceLocked } }],
    },
    {
      id: "step-1",
      items: [{ kind: "activity", id: "a1", stepId: "step-1", source: { id: "a1", locked: false } }],
    },
    {
      id: "step-2",
      items: [{ kind: "resource", id: "r1", stepId: "step-2", source: { id: "r1", locked: resourceLocked, titleVersion } }],
    },
    {
      id: "step-3",
      items: [{ kind: "activity", id: "a2", stepId: "step-3", source: { id: "a2", locked: activityLocked } }],
    },
  ], [activityLocked, initialResourceLocked, resourceLocked, titleVersion]);
  const itemKeys = useMemo(() => {
    if (activeStep === "step-2") return new Set(["resource:r1"]);
    if (activeStep === "step-3") return new Set(["activity:a2"]);
    return new Set(["activity:a1"]);
  }, [activeStep, titleVersion]);
  const autoOpenRequest = useStudentPanelAutoOpenRequest({
    sections,
    isTeacher: false,
    onSelectStep: setActiveStep,
    ready,
    scope,
  });

  function unlockResource() {
    setResourceLocked(false);
  }

  function unlockActivity() {
    setActivityLocked(false);
  }

  function renameItem() {
    setTitleVersion((current) => current + 1);
  }

  function switchScope() {
    setScope("other-scope");
    setActiveStep("step-2");
    setTitleVersion((current) => current + 1);
  }

  function returnScope() {
    setScope("auto-open-fixture");
    setActiveStep("step-2");
    setTitleVersion((current) => current + 1);
  }

  return (
    <div className="books-main--split">
      <StudentActivityPanel key={scope} enabled itemKeys={itemKeys} scope={scope} autoOpenRequest={autoOpenRequest}>
        {({ collapsed, sidebar }) => (
          <div className={`book-library-layout is-student-main has-student-panel${collapsed ? " is-library-collapsed" : ""}`}>
            {sidebar}
            <button type="button" onClick={() => setInitialResourceLocked(false)}>초기 스냅샷 반영</button>
            <button type="button" onClick={() => setReady(true)}>초기 로딩 완료</button>
            <output aria-label="초기 준비">{ready ? "ready" : "pending"}</output>
            <AutoOpenContent
              activeStep={activeStep}
              unlockResource={unlockResource}
              unlockActivity={unlockActivity}
              renameItem={renameItem}
              switchScope={switchScope}
              returnScope={returnScope}
              scope={scope}
            />
          </div>
        )}
      </StudentActivityPanel>
    </div>
  );
}
