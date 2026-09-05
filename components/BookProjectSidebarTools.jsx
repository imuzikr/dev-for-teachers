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
  openStepIds,
  onPickStep,
  renderStepContent,
}) {
  const steps = project?.steps ?? [];
  if (!project || steps.length === 0) return null;

  const activityCount = countItems(steps, "activities");
  const resourceCount = countItems(steps, "resources");
  const expandable = typeof renderStepContent === "function";

  return (
    <div className="book-side-tools" aria-label="개발자실 프로젝트 흐름">
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

      <nav className="book-step-nav" aria-label={editing ? "프로젝트 Step 편집" : "프로젝트 Step 흐름"}>
        <div className="book-step-nav-head">
          <strong>{editing ? "Step 편집" : "수업 흐름"}</strong>
          <small>{editing ? "펼쳐 수정" : "펼쳐 보기"}</small>
        </div>
        {steps.map((step, index) => {
          const open = openStepIds?.has(step.id) ?? false;
          const active = activeStepId === step.id;
          const panelId = `book-step-flow-${step.id}`;
          const trigger = (
            <button
              type="button"
              className={`book-step-nav-item${active ? " is-active" : ""}${expandable ? " book-step-flow-trigger" : ""}`}
              onClick={() => onPickStep(step.id)}
              aria-current={active ? "step" : undefined}
              aria-expanded={expandable ? open : undefined}
              aria-controls={expandable ? panelId : undefined}
            >
              <span>{stepLabel(index)}</span>
              <strong>{step.title || stepLabel(index)}</strong>
              <small>{step.activities?.length ?? 0} 활동 · {step.resources?.length ?? 0} 자료</small>
              {expandable && <i aria-hidden="true">{open ? "−" : "+"}</i>}
            </button>
          );

          if (!expandable) {
            return <div className="book-step-flow-item" key={step.id}>{trigger}</div>;
          }

          return (
            <article className={`book-step-flow-item${open ? " is-open" : ""}`} key={step.id}>
              {trigger}
              {open && (
                <div className="book-step-flow-body" id={panelId}>
                  {renderStepContent(step)}
                </div>
              )}
            </article>
          );
        })}
      </nav>
    </div>
  );
}
