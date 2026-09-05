"use client";

import { useEffect, useState } from "react";
import { ProjectDisplayItem, StepContentModal } from "./BookProjectPreview";
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
  studentActiveStepId,
}) {
  const activityCount = sections.reduce((total, section) => total + section.activities.length, 0);
  const resourceCount = sections.reduce((total, section) => total + section.resources.length, 0);
  const sectionIdentity = sections.map((section) => section.id).join("|");
  const [openStepId, setOpenStepId] = useState(null);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    setOpenStepId((current) => {
      const ids = sectionIdentity ? sectionIdentity.split("|") : [];
      return current && ids.includes(current) ? current : null;
    });
  }, [sectionIdentity]);

  function setStepOpen(stepId, open) {
    setOpenStepId((current) => (open ? stepId : current === stepId ? null : current));
  }

  function openPreview(section, index) {
    setPreview({ section, index });
  }

  if (sections.length === 0) return null;

  const activeStudentSection = !isTeacher
    ? sections.find((section) => section.id === studentActiveStepId) ?? sections[0]
    : null;
  const previewItems = preview?.section.items ?? [];
  const previewItem = previewItems[preview?.index] ?? null;

  if (activeStudentSection) {
    const activeStepIndex = sections.findIndex((section) => section.id === activeStudentSection.id);

    return (
      <>
        <section className="book-project-flow-overview book-project-flow-overview--student" aria-label="전체 프로젝트 구성">
          <OverviewHeader
            project={project}
            sections={sections}
            itemCount={itemCount}
            activityCount={activityCount}
            resourceCount={resourceCount}
          />
          <section className="book-project-active-step">
            <header className="book-personal-step-head">
              <span>STEP {activeStepIndex + 1}</span>
              <strong>{activeStudentSection.title}</strong>
              <small>{activeStudentSection.activities.length} 활동 · {activeStudentSection.resources.length} 자료</small>
            </header>
            {activeStudentSection.items.length > 0 ? (
              <div className="book-personal-detail-list book-project-active-step-list" aria-label={`${activeStudentSection.title} 활동과 자료`}>
                {activeStudentSection.items.map((entry, index) => (
                  <ProjectDisplayItem
                    key={`${entry.kind}:${entry.id ?? `${activeStudentSection.id}-${index}`}`}
                    item={entry.source}
                    kind={entry.kind}
                    onPreview={() => openPreview(activeStudentSection, index)}
                  />
                ))}
              </div>
            ) : (
              <p className="book-dashboard-empty">이 Step에는 아직 활동과 자료가 없습니다.</p>
            )}
          </section>
        </section>
        {previewItem && (
          <StepContentModal
            step={preview.section}
            item={previewItem}
            index={preview.index}
            total={previewItems.length}
            onMove={(offset) => setPreview((current) => ({
              ...current,
              index: (current.index + offset + previewItems.length) % previewItems.length,
            }))}
            onClose={() => setPreview(null)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <section className="book-project-flow-overview" aria-label="전체 프로젝트 구성">
        <OverviewHeader
          project={project}
          sections={sections}
          itemCount={itemCount}
          activityCount={activityCount}
          resourceCount={resourceCount}
        />
        <div className="book-project-flow-track">
          {sections.map((section, stepIndex) => (
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
      {previewItem && (
        <StepContentModal
          step={preview.section}
          item={previewItem}
          index={preview.index}
          total={previewItems.length}
          onMove={(offset) => setPreview((current) => ({
            ...current,
            index: (current.index + offset + previewItems.length) % previewItems.length,
          }))}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}
