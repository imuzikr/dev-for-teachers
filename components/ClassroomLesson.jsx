"use client";

import { useEffect, useRef, useState } from "react";
import { useStudentActivityPanel } from "./StudentActivityPanel";
import TeacherActivityDemoView from "./TeacherActivityDemo";
import ClassroomOutline from "./ClassroomOutline";
import { lessonPositions, lessonSelection } from "./classroomLessonNavigation.mjs";
import ClassroomLessonOverview from "./ClassroomLessonOverview";

export default function ClassroomLesson({ sections, selectedStepId, onSelectStep, isTeacher, user, progressByUser, sidebar, renderAddItem, renderDashboard, portfolio, autoOpenRequest, onOpenItem }) {
  const panel = useStudentActivityPanel();
  const [selection, setSelection] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mode, setMode] = useState(panel?.readOnly ? "participants" : "lesson");
  const consumedRequest = useRef("");
  const [openError, setOpenError] = useState(null);
  const pendingConfirmations = useRef(new Set());
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
    const selectedItem = sections.find(row => row.id === stepId)?.items.find(row => `${row.kind}:${row.id}` === key);
    if (!isTeacher && !panel?.readOnly && selectedItem && onOpenItem && !completed.has(key) && !pendingConfirmations.current.has(key)) {
      pendingConfirmations.current.add(key);
      setOpenError(null);
      Promise.resolve().then(() => onOpenItem(selectedItem)).catch(() => {
        setOpenError({ stepId, key });
      }).finally(() => pendingConfirmations.current.delete(key));
    }
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
      <ClassroomOutline sections={sections} stepId={section?.id} itemKey={itemKey} completed={completed} showItems={!isTeacher} onSelect={select} onOverview={id => select(id, null)} />
      <div className="classroom-outline-footer"><button type="button" className="btn-outline" aria-pressed={mode === "participants"} onClick={() => setMode(mode === "participants" ? "lesson" : "participants")}>{isTeacher ? "참여자 활동 보기" : "나의 STEP 카드"}</button>{portfolio}</div>
    </aside>
    <section className="classroom-detail-region" aria-label="선택한 STEP 상세">
      <div className={`classroom-detail-content${mode === "lesson" && section ? ` is-lesson-split${isTeacher ? " is-teacher-split" : ""}` : ""}`}>
        {mode === "lesson" && <ClassroomLessonOverview section={section} index={sectionIndex} itemKey={itemKey} onSelect={select} renderAddItem={renderAddItem} completed={completed} />}
        <div className="classroom-item-detail" role={isTeacher && mode === "lesson" ? "region" : undefined} aria-label={isTeacher && mode === "lesson" ? "활동·자료 상세" : undefined}>
        {mode === "lesson" && section && !item && <p className="classroom-item-prompt">왼쪽 목록에서 활동이나 자료를 선택하면 상세 내용이 표시됩니다.</p>}
        {openError && mode === "lesson" && openError.stepId === section?.id && openError.key === itemKey && <p role="alert">확인 상태를 저장하지 못했어요. <button type="button" className="btn-outline" onClick={() => select(openError.stepId, openError.key)}>다시 시도</button></p>}
        {(!isTeacher || mode === "participants") && <div className={mode === "participants" ? "classroom-participants-view" : "classroom-source-cards"} hidden={mode === "lesson"}>
          {renderDashboard({ itemKey: mode === "lesson" ? itemKey : null, participantsOnly: mode === "participants", selectStep: stepId => select(stepId, null) })}
        </div>}
        {teacherDemo && mode === "lesson" && item && <>
          <div className="classroom-teacher-detail" ref={setDemoTarget} />
          {demoTarget && <TeacherActivityDemoView detailItem={item} index={itemIndex} panelTarget={demoTarget} onExpand={() => setExpanded(true)} />}
          {expanded && <TeacherActivityDemoView detailItem={item} index={itemIndex} onClose={() => setExpanded(false)} />}
        </>}
        <div className="classroom-student-detail" hidden={mode === "lesson" ? !showPanel : !panel?.readOnly}>{sidebar}</div>
        </div>
      </div>
      {mode === "lesson" && section && <footer className="classroom-lesson-navigation" aria-label="수업 순서 이동">
        <button type="button" className="btn-outline" disabled={position <= 0} onClick={() => { const row = positions[position - 1]; if (row) select(row.stepId, row.key); }}>← 이전</button>
        <span>{position + 1} / {positions.length}</span>
        <button type="button" className="btn-primary" disabled={position < 0 || position >= positions.length - 1} onClick={() => { const row = positions[position + 1]; if (row) select(row.stepId, row.key); }}>다음 →</button>
      </footer>}
    </section>
  </div>;
}
