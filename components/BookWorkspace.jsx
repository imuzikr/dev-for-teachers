"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { subscribeBookEntries, subscribeMyBookEntry } from "@/lib/store";
import { bookConfirmationKey, saveBookConfirmation, subscribeBookConfirmations } from "@/lib/bookConfirmations";
import { currentChecklistConfirmation } from "@/lib/activityChecklist";
import { safeDisplayHtml } from "@/lib/html";
import BookHelpDrawer from "./BookHelpDrawer";
import BookClassProgressModal from "./BookClassProgressModal";
import BookPersonalDashboard from "./BookPersonalDashboard";
import { BookImagePresentationContext, useBookPresentationMode } from "./BookPresentationMode";
import BookProjectPanel from "./BookProjectPanel";
import StudentActivityPanel from "./StudentActivityPanel";
import { bookDetailSections } from "./bookProjectItems";

const LIBRARY_COLLAPSED_KEY = "book_library_panel_collapsed";
const HELP_DRAWER_COLLAPSED_KEY = "book_help_drawer_collapsed";

function projectStepActivities(project) {
  return (project?.steps ?? []).flatMap((step) => step.activities ?? []);
}

export default function BookWorkspace({
  header,
  activities,
  participants,
  progressOpen,
  onCloseProgress,
  className,
  user,
  isTeacher,
  hasClass,
  activeClassId,
  project,
  editingProject,
  projectEditorKey,
  appendProjectStep,
  projectEditorStepId,
  savingProject,
  exportingProject,
  exportTargets = [],
  onSaveProject,
  onEditProject,
  onToggleActivityLock,
  onToggleProjectItemLock,
  onDelete,
  onExportProjectItem,
  loadProject,
  selectedStepId,
  onSelectStep,
  onToast,
}) {
  const [entriesByActivity, setEntriesByActivity] = useState({});
  const [confirmations, setConfirmations] = useState([]);
  const saveQueues = useRef(new Map());
  const [libraryCollapsed, setLibraryCollapsed] = useState(false);
  const [helpCollapsed, setHelpCollapsed] = useState(false);
  const [draftProject, setDraftProject] = useState(null);
  const showLibraryPanel = isTeacher;
  const classId = project?.classId || activeClassId || activities[0]?.classId || null;
  const projectId = project?.id || project?.classId || classId || "";
  const scope = `${classId}:${projectId}:${user?.uid}`;
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const previewProject = editingProject && draftProject ? draftProject : project;
  const previewActivities = useMemo(() => {
    const projectActivities = projectStepActivities(previewProject);
    if (projectActivities.length === 0) return activities;
    const projectActivityIds = new Set(projectActivities.map((activity) => activity.id));
    return [
      ...activities.filter((activity) => !projectActivityIds.has(activity.id)),
      ...projectActivities,
    ];
  }, [activities, previewProject]);
  const sections = useMemo(() => bookDetailSections(previewProject, previewActivities), [previewActivities, previewProject]);
  const studentPanelItemKeys = useMemo(() => new Set(
    (sections.find((section) => section.id === selectedStepId)?.items ?? [])
      .map((item) => `${item.kind}:${item.id}`),
  ), [sections, selectedStepId]);
  const bookPresentation = useBookPresentationMode({
    isTeacher,
    classId,
    user,
    projectId,
    projectTitle: previewProject?.title ?? "",
    sections,
  });

  useEffect(() => {
    setLibraryCollapsed(window.localStorage.getItem(LIBRARY_COLLAPSED_KEY) === "1");
    setHelpCollapsed(window.localStorage.getItem(HELP_DRAWER_COLLAPSED_KEY) === "1");
  }, []);

  useEffect(() => {
    if (!editingProject) setDraftProject(null);
    else setLibraryCollapsed(false);
  }, [editingProject, projectEditorKey]);

  useEffect(() => {
    if (!user?.uid || activities.length === 0) {
      setEntriesByActivity({});
      return;
    }
    const unsubscribers = activities.map((activity) => {
      const update = (entries) => {
        const list = Array.isArray(entries) ? entries : entries ? [entries] : [];
        setEntriesByActivity((current) => ({ ...current, [activity.id]: list }));
      };
      return isTeacher
        ? subscribeBookEntries(activity.id, update)
        : subscribeMyBookEntry(activity.id, user.uid, update);
    });
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [activities, isTeacher, user?.uid]);

  useEffect(() => {
    if (!classId || !user?.uid) {
      setConfirmations([]);
      return;
    }
    return subscribeBookConfirmations({
      classId,
      authorId: isTeacher ? "" : user.uid,
      callback: (records) => setConfirmations(records.filter((record) => record.projectId === projectId)),
    });
  }, [classId, projectId, isTeacher, user?.uid]);

  const confirmedItemsByUser = useMemo(() => {
    const progress = new Map(participants.map((participant) => [participant.uid, new Set()]));
    if (!isTeacher && user?.uid && !progress.has(user.uid)) progress.set(user.uid, new Set());
    const items = new Map(sections.flatMap((section) => section.items.map((item) => [bookConfirmationKey(item.kind, item.id), item])));
    const counts = new Map();
    confirmations.forEach((confirmation) => {
      const key = bookConfirmationKey(confirmation.itemKind, confirmation.itemId);
      const item = items.get(key);
      if (!item || typeof document === "undefined") return;
      if (!counts.has(key)) {
        const root = document.createElement("div");
        root.innerHTML = safeDisplayHtml(item.source.content || "");
        counts.set(key, root.querySelectorAll('input[type="checkbox"]').length);
      }
      if (currentChecklistConfirmation(confirmation, item.source.content, counts.get(key)) && progress.has(confirmation.authorId)) {
        progress.get(confirmation.authorId).add(key);
      }
    });
    return progress;
  }, [confirmations, participants, sections, isTeacher, user?.uid]);

  function toggleLibraryPanel() {
    setLibraryCollapsed((current) => {
      const next = !current;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LIBRARY_COLLAPSED_KEY, next ? "1" : "0");
      }
      return next;
    });
  }

  function toggleHelpDrawer() {
    setHelpCollapsed((current) => {
      const next = !current;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(HELP_DRAWER_COLLAPSED_KEY, next ? "1" : "0");
      }
      return next;
    });
  }

  function rememberConfirmedItem(item, state) {
    if (!user?.uid || !item?.id) return;
    const confirmationKey = bookConfirmationKey(item.kind, item.id);
    setConfirmations((current) => {
      return [
        ...current.filter((confirmation) => !(confirmation.authorId === user.uid && bookConfirmationKey(confirmation.itemKind, confirmation.itemId) === confirmationKey)),
        {
          classId,
          projectId,
          itemKind: item.kind,
          itemId: item.id,
          itemTitle: item.title || "",
          stepId: item.stepId || "",
          authorId: user.uid,
          authorName: user.realName || user.displayName || "이름 미설정",
          ...state,
        },
      ];
    });
  }

  async function confirmBookItem(item, state = { confirmed: true }) {
    const key = `${scope}:${item.kind}:${item.id}`;
    const previous = saveQueues.current.get(key) ?? Promise.resolve();
    const write = previous.catch(() => {}).then(() => saveBookConfirmation({
      classId,
      projectId,
      itemKind: item.kind,
      itemId: item.id,
      itemTitle: item.title,
      stepId: item.stepId,
      user,
      ...state,
    }));
    saveQueues.current.set(key, write);
    try {
      await write;
      if (activeScope.current === scope) rememberConfirmedItem(item, state);
    } finally {
      if (saveQueues.current.get(key) === write) saveQueues.current.delete(key);
    }
  }

  return (
    <BookImagePresentationContext.Provider value={isTeacher ? bookPresentation.presentImage : null}>
    <StudentActivityPanel key={`${scope}:${isTeacher}`} enabled={!isTeacher} itemKeys={studentPanelItemKeys} scope={scope} records={confirmations} saveChecklist={confirmBookItem}>
    {({ collapsed, sidebar }) => (
    <div className={`book-library-layout${(showLibraryPanel ? libraryCollapsed : collapsed) ? " is-library-collapsed" : ""}${helpCollapsed ? " is-help-collapsed" : ""}${showLibraryPanel ? "" : " is-student-main has-student-panel"}`}>
      {sidebar}
      {showLibraryPanel && (
      <aside className={`book-library-side${libraryCollapsed ? " is-collapsed" : ""}`} aria-label="선생님이 준비한 활동과 자료">
        <button
          type="button"
          className="book-library-collapse"
          onClick={toggleLibraryPanel}
          aria-expanded={!libraryCollapsed}
          aria-label={libraryCollapsed ? "개발자실 패널 펼치기" : "개발자실 패널 접기"}
          title={libraryCollapsed ? "개발자실 패널 펼치기" : "개발자실 패널 접기"}
        >
          <span aria-hidden="true">{libraryCollapsed ? "»" : "«"}</span>
        </button>

        <div className="book-library-content" aria-hidden={libraryCollapsed ? "true" : undefined}>
          <div className="book-library-title">
            <div>
              <h2>{editingProject ? "프로젝트 구성" : "프로젝트"}</h2>
              <p>{editingProject ? "Step별 활동과 자료를 준비하세요." : "선생님이 준비한 개발자실 흐름"}</p>
            </div>
          </div>

          {!hasClass ? (
            <div className="book-library-empty">관리자가 반을 만들면 활동이 여기에 표시됩니다.</div>
          ) : (
            <BookProjectPanel
              key={classId}
              expandRequest={projectEditorKey}
              project={project}
              editing={editingProject}
              appendStep={appendProjectStep}
              initialOpenStepId={projectEditorStepId}
              saving={savingProject}
              exporting={exportingProject}
              participantCount={participants.length}
              currentClassId={classId}
              exportTargets={exportTargets}
              loadProject={loadProject}
              onSave={onSaveProject}
              onEdit={onEditProject}
              onToggleActivityLock={onToggleActivityLock}
              onToggleProjectItemLock={onToggleProjectItemLock}
              onDelete={onDelete}
              onDraftChange={setDraftProject}
              onExportProjectItem={onExportProjectItem}
            />
          )}
        </div>
      </aside>
      )}

      <section className="book-library-main" aria-label="개발자실 메인 화면">
        {header}
        <BookPersonalDashboard
          participants={participants}
          activities={previewActivities}
          sections={sections}
          project={previewProject}
          entriesByActivity={entriesByActivity}
          progressByUser={confirmedItemsByUser}
          user={user}
          isTeacher={isTeacher}
          onToggleActivityLock={onToggleActivityLock}
          onToggleProjectItemLock={onToggleProjectItemLock}
          onConfirmItem={confirmBookItem}
          onPresentItem={isTeacher ? bookPresentation.presentItem : null}
          selectedStepId={selectedStepId}
          onSelectStep={onSelectStep}
        />
        {bookPresentation.modal}
        {isTeacher && progressOpen && <BookClassProgressModal
          className={className}
          participants={participants}
          sections={sections}
          progressByUser={confirmedItemsByUser}
          onClose={onCloseProgress}
        />}
      </section>
      <BookHelpDrawer
        classId={classId}
        participants={participants}
        progressByUser={confirmedItemsByUser}
        progressSections={sections}
        user={user}
        isTeacher={isTeacher}
        collapsed={helpCollapsed}
        onToggleCollapsed={toggleHelpDrawer}
        onToast={onToast}
      />
    </div>
    )}
    </StudentActivityPanel>
    </BookImagePresentationContext.Provider>
  );
}
