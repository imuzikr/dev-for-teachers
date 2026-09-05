"use client";

import { useEffect, useState } from "react";
import { IconLock, IconUnlock } from "./StatusIcons";

function OverviewHeader({ project, sections, itemCount, activityCount, resourceCount }) {
  return (
    <header>
      <div>
        <span>전체 프로젝트 구성</span>
        <strong>{project?.title || "프로젝트 흐름"}</strong>
      </div>
      <div className="book-project-flow-summary" aria-label={`${sections.length}개 Step, 전체 ${itemCount}개 항목, ${activityCount}개 활동, ${resourceCount}개 자료`}>
        <span>{sections.length} Steps</span>
        <span>{itemCount} 항목</span>
        <span>{activityCount} 활동</span>
        <span>{resourceCount} 자료</span>
      </div>
    </header>
  );
}

export default function BookProjectFlowOverview({
  project,
  sections,
  itemCount,
  isTeacher,
  onToggleItemLock,
  selectedStepId,
}) {
  const selectedIndex = sections.findIndex((section) => section.id === selectedStepId);
  const visibleEntries = selectedIndex >= 0
    ? [{ section: sections[selectedIndex], stepIndex: selectedIndex }]
    : sections.map((section, stepIndex) => ({ section, stepIndex }));
  const visibleSections = visibleEntries.map((entry) => entry.section);
  const visibleItemCount = visibleSections.reduce((total, section) => total + section.items.length, 0);
  const activityCount = visibleSections.reduce((total, section) => total + section.activities.length, 0);
  const resourceCount = visibleSections.reduce((total, section) => total + section.resources.length, 0);
  const sectionIdentity = visibleSections.map((section) => section.id).join("|");
  const [openStepId, setOpenStepId] = useState(null);

  useEffect(() => {
    setOpenStepId((current) => {
      const ids = sectionIdentity ? sectionIdentity.split("|") : [];
      if (selectedStepId && ids.includes(selectedStepId)) return selectedStepId;
      return current && ids.includes(current) ? current : null;
    });
  }, [sectionIdentity, selectedStepId]);

  function setStepOpen(stepId, open) {
    setOpenStepId((current) => (open ? stepId : current === stepId ? null : current));
  }

  if (visibleSections.length === 0) return null;

  return (
    <section className="book-project-flow-overview" aria-label="전체 프로젝트 구성">
      <OverviewHeader
        project={project}
        sections={visibleSections}
        itemCount={selectedIndex >= 0 ? visibleItemCount : itemCount}
        activityCount={activityCount}
        resourceCount={resourceCount}
      />
      <div className="book-project-flow-track">
        {visibleEntries.map(({ section, stepIndex }) => (
          <details
            className="book-project-flow-step"
            key={section.id}
            open={openStepId === section.id}
            onToggle={(event) => setStepOpen(section.id, event.currentTarget.open)}
          >
            <summary className="book-project-flow-step-head">
              <span>
                <small>STEP {stepIndex + 1}</small>
                <strong>{section.title}</strong>
              </span>
              <em>{section.activities.length} 활동 · {section.resources.length} 자료</em>
              <b aria-hidden="true">+</b>
            </summary>
            <div className="book-project-flow-items">
              {section.items.map((item, itemIndex) => {
                const isActivity = item.kind === "activity";
                const locked = isActivity && item.source?.locked === true;
                const Tag = isActivity && isTeacher && onToggleItemLock ? "button" : "span";

                return (
                  <Tag
                    type={Tag === "button" ? "button" : undefined}
                    className={`book-project-flow-pill book-project-flow-pill--${item.kind}${locked ? " is-locked" : ""}`}
                    key={`${item.kind}:${item.id}`}
                    title={item.title}
                    aria-label={Tag === "button" ? `${item.title} ${locked ? "잠금 해제" : "잠그기"}` : undefined}
                    onClick={Tag === "button" ? () => onToggleItemLock(item, !locked) : undefined}
                  >
                    <b>{isActivity ? "A" : "R"}{itemIndex + 1}</b>
                    <em>{item.title}</em>
                    {isActivity && (
                      <i aria-label={locked ? "잠김" : "열림"}>
                        {locked ? <IconLock size={15} /> : <IconUnlock size={15} />}
                      </i>
                    )}
                  </Tag>
                );
              })}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
