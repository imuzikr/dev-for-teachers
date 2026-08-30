"use client";

function countItems(steps, key) {
  return steps.reduce((total, step) => total + (step[key]?.length ?? 0), 0);
}

function stepLabel(index) {
  return `Step ${index + 1}`;
}

export default function BookProjectSidebarTools({
  project,
  participantCount,
  activeStepId,
  editing,
  onPickStep,
}) {
  const steps = project?.steps ?? [];
  if (!project || steps.length === 0) return null;

  const activityCount = countItems(steps, "activities");
  const resourceCount = countItems(steps, "resources");

  return (
    <div className="book-side-tools" aria-label="책방 프로젝트 빠른 이동">
      <div className="book-side-summary">
        <span>
          <strong>{steps.length}</strong>
          <small>Steps</small>
        </span>
        <span>
          <strong>{activityCount}</strong>
          <small>활동</small>
        </span>
        <span>
          <strong>{resourceCount}</strong>
          <small>자료</small>
        </span>
        <span>
          <strong>{participantCount}</strong>
          <small>참여자</small>
        </span>
      </div>

      <nav className="book-step-nav" aria-label={editing ? "편집 중인 Step 바로가기" : "프로젝트 Step 바로가기"}>
        <div className="book-step-nav-head">
          <strong>Step 바로가기</strong>
          <small>{editing ? "편집 위치" : "수업 흐름"}</small>
        </div>
        {steps.map((step, index) => {
          const active = activeStepId === step.id || (!activeStepId && index === 0);
          return (
            <button
              type="button"
              className={`book-step-nav-item${active ? " is-active" : ""}`}
              key={step.id}
              onClick={() => onPickStep(step.id)}
              aria-current={active ? "step" : undefined}
            >
              <span>{stepLabel(index)}</span>
              <strong>{step.title || stepLabel(index)}</strong>
              <small>{step.activities?.length ?? 0} 활동 · {step.resources?.length ?? 0} 자료</small>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
