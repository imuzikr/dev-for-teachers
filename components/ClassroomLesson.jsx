"use client";

import { useEffect, useRef, useState } from "react";
import { useStudentActivityPanel } from "./StudentActivityPanel";
import TeacherActivityDemoView from "./TeacherActivityDemo";
import ClassroomOutline from "./ClassroomOutline";
import { lessonPositions, lessonSelection } from "./classroomLessonNavigation.mjs";
import ClassroomLessonOverview from "./ClassroomLessonOverview";

export default function ClassroomLesson({ sections, selectedStepId, onSelectStep, isTeacher, user, progressByUser, sidebar, renderAddItem, renderDashboard, portfolio, autoOpenRequest }) {
  const panel = useStudentActivityPanel();
  const [selection, setSelection] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mode, setMode] = useState(panel?.readOnly ? "participants" : "lesson");
  const consumedRequest = useRef("");
  const [demoTarget, setDemoTarget] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const { section, item, itemKey } = lessonSelection(sections, selectedStepId, selection);
  const sectionIndex = sections.indexOf(section);
  const itemIndex = item ? section.items.indexOf(item) : -1;
  const completed = progressByUser.get(user?.uid) ?? new Set();
  const positions = lessonPositions(sections);
  const position = positions.findIndex(row => row.stepId === section?.id && row.key === (item ? itemKey : null));
  useEffect(() => { setExpanded(false); }, [selectedStepId, itemKey]);
  function select(stepId, key) {
    setSelection({ stepId, key });
    onSelectStep?.(stepId);
    setMode("lesson");
    setMobileOpen(false);
    if (key && panel) panel.open(key);
  }
  useEffect(() => {
    if (mode === "lesson" && itemKey && item && panel) panel.open(itemKey);
  }, [itemKey, selectedStepId, mode]);
  const requestIdentity = autoOpenRequest ? `${autoOpenRequest.scope}:${autoOpenRequest.generation}:${autoOpenRequest.requestId}:${autoOpenRequest.key}` : "";
  useEffect(() => {
    if (!requestIdentity || consumedRequest.current === requestIdentity || panel?.readOnly) return;
    const remoteSection = sections.find(row => row.items.some(entry => `${entry.kind}:${entry.id}` === autoOpenRequest.key));
    if (!remoteSection) return;
    consumedRequest.current = requestIdentity;
    setSelection({ stepId: remoteSection.id, key: autoOpenRequest.key });
    setMode("lesson");
    setMobileOpen(false);
    onSelectStep?.(remoteSection.id);
  }, [requestIdentity, sections, panel?.readOnly, onSelectStep]);
  const showPanel = Boolean(item && panel);
  const teacherDemo = isTeacher && !panel?.readOnly;
  return <div className="classroom-lesson">
    <button type="button" className="classroom-outline-toggle btn-outline" aria-expanded={mobileOpen} aria-controls="classroom-outline-region" onClick={() => setMobileOpen(!mobileOpen)}>수업 차례 {mobileOpen ? "접기" : "펼치기"}</button>
    <aside id="classroom-outline-region" className={`classroom-outline-region${mobileOpen ? " is-open" : ""}`}>
      <ClassroomOutline sections={sections} stepId={section?.id} itemKey={itemKey} completed={completed} onSelect={select} onOverview={id => select(id, null)} />
      <div className="classroom-outline-footer"><button type="button" className="btn-outline" aria-pressed={mode === "participants"} onClick={() => setMode(mode === "participants" ? "lesson" : "participants")}>{isTeacher ? "참여자 활동 보기" : "나의 STEP 카드"}</button>{portfolio}</div>
    </aside>
    <section className="classroom-detail-region" aria-label="선택한 STEP 상세">
      <div className="classroom-detail-content">
        {mode === "lesson" && !item && <ClassroomLessonOverview section={section} index={sectionIndex} onSelect={select} renderAddItem={renderAddItem} />}
        <div className={mode === "participants" ? "classroom-participants-view" : teacherDemo && item ? "classroom-item-tools" : "classroom-source-cards"} hidden={mode === "lesson" && (!teacherDemo || !item)}>
          {renderDashboard({ itemKey: mode === "lesson" ? itemKey : null, participantsOnly: mode === "participants", selectStep: stepId => select(stepId, null) })}
        </div>
        {teacherDemo && mode === "lesson" && item && <>
          <div className="classroom-teacher-detail" ref={setDemoTarget} />
          {demoTarget && <TeacherActivityDemoView detailItem={item} index={itemIndex} panelTarget={demoTarget} onExpand={() => setExpanded(true)} />}
          {expanded && <TeacherActivityDemoView detailItem={item} index={itemIndex} onClose={() => setExpanded(false)} />}
        </>}
        <div className="classroom-student-detail" hidden={mode === "lesson" ? !showPanel : !panel?.readOnly}>{sidebar}</div>
      </div>
      {mode === "lesson" && section && <footer className="classroom-lesson-navigation" aria-label="수업 순서 이동">
        <button type="button" className="btn-outline" disabled={position <= 0} onClick={() => { const row = positions[position - 1]; if (row) select(row.stepId, row.key); }}>← 이전</button>
        <span>{position + 1} / {positions.length}</span>
        <button type="button" className="btn-primary" disabled={position < 0 || position >= positions.length - 1} onClick={() => { const row = positions[position + 1]; if (row) select(row.stepId, row.key); }}>다음 →</button>
      </footer>}
    </section>
  </div>;
}
