"use client";

import { useEffect, useMemo, useState } from "react";
import { subscribeBookEntries, subscribeMyBookEntry } from "@/lib/store";
import { bookConfirmationKey, saveBookConfirmation, subscribeBookConfirmations } from "@/lib/bookConfirmations";
import BookPersonalDashboard from "./BookPersonalDashboard";
import BookProgressDrawer from "./BookProgressDrawer";
import BookProjectPanel from "./BookProjectPanel";
import { bookDetailSections } from "./bookProjectItems";

const LIBRARY_COLLAPSED_KEY = "book_library_panel_collapsed";
const PROGRESS_COLLAPSED_KEY = "book_progress_drawer_collapsed";

export default function BookWorkspace({
  header,
  activities,
  participants,
  user,
  isTeacher,
  hasClass,
  project,
  editingProject,
  projectEditorKey,
  appendProjectStep,
  projectEditorStepId,
  savingProject,
  onSaveProject,
  onEditProject,
  onOpen,
  onToggleActivityLock,
  onToggleProjectItemLock,
  onDelete,
}) {
  const [entriesByActivity, setEntriesByActivity] = useState({});
  const [confirmations, setConfirmations] = useState([]);
  const [libraryCollapsed, setLibraryCollapsed] = useState(false);
  const [progressCollapsed, setProgressCollapsed] = useState(false);
  const showLibraryPanel = isTeacher;
  const showProgressDrawer = isTeacher && hasClass;
  const classId = project?.classId || activities[0]?.classId || null;
  const projectId = project?.id || project?.classId || classId || "";
  const sections = useMemo(() => bookDetailSections(project, activities), [activities, project]);

  useEffect(() => {
    setLibraryCollapsed(window.localStorage.getItem(LIBRARY_COLLAPSED_KEY) === "1");
    setProgressCollapsed(window.localStorage.getItem(PROGRESS_COLLAPSED_KEY) === "1");
  }, []);

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
      callback: setConfirmations,
    });
  }, [classId, isTeacher, user?.uid]);

  const confirmedItemsByUser = useMemo(() => {
    const progress = new Map(participants.map((participant) => [participant.uid, new Set()]));
    confirmations.forEach((confirmation) => {
      if (progress.has(confirmation.authorId)) {
        progress.get(confirmation.authorId).add(bookConfirmationKey(confirmation.itemKind, confirmation.itemId));
      }
    });
    return progress;
  }, [confirmations, participants]);

  function toggleLibraryPanel() {
    setLibraryCollapsed((current) => {
      const next = !current;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LIBRARY_COLLAPSED_KEY, next ? "1" : "0");
      }
      return next;
    });
  }

  function toggleProgressDrawer() {
    setProgressCollapsed((current) => {
      const next = !current;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(PROGRESS_COLLAPSED_KEY, next ? "1" : "0");
      }
      return next;
    });
  }

  function rememberConfirmedItem(item) {
    if (!user?.uid || !item?.id) return;
    const confirmationKey = bookConfirmationKey(item.kind, item.id);
    setConfirmations((current) => {
      if (current.some((confirmation) => (
        confirmation.authorId === user.uid
        && bookConfirmationKey(confirmation.itemKind, confirmation.itemId) === confirmationKey
      ))) {
        return current;
      }

      return [
        ...current,
        {
          classId,
          projectId,
          itemKind: item.kind,
          itemId: item.id,
          itemTitle: item.title || "",
          stepId: item.stepId || "",
          authorId: user.uid,
          authorName: user.realName || user.displayName || "이름 미설정",
          confirmed: true,
        },
      ];
    });
  }

  async function confirmBookItem(item) {
    await saveBookConfirmation({
      classId,
      projectId,
      itemKind: item.kind,
      itemId: item.id,
      itemTitle: item.title,
      stepId: item.stepId,
      user,
    });
    rememberConfirmedItem(item);
  }

  return (
    <div className={`book-library-layout${showLibraryPanel && libraryCollapsed ? " is-library-collapsed" : ""}${showProgressDrawer ? " has-progress-drawer" : ""}${showProgressDrawer && progressCollapsed ? " is-progress-collapsed" : ""}${showLibraryPanel ? "" : " is-student-main"}`}>
      {showLibraryPanel && (
      <aside className={`book-library-side${libraryCollapsed ? " is-collapsed" : ""}`} aria-label="선생님이 준비한 활동과 자료">
        <button
          type="button"
          className="book-library-collapse"
          onClick={toggleLibraryPanel}
          aria-expanded={!libraryCollapsed}
          aria-label={libraryCollapsed ? "책방 패널 펼치기" : "책방 패널 접기"}
          title={libraryCollapsed ? "책방 패널 펼치기" : "책방 패널 접기"}
        >
          <span aria-hidden="true">»</span>
        </button>

        <div className="book-library-content" aria-hidden={libraryCollapsed ? "true" : undefined}>
          <div className="book-library-title">
            <div>
              <h2>{editingProject ? "프로젝트 구성" : "프로젝트"}</h2>
              <p>{editingProject ? "Step별 활동과 자료를 준비하세요." : "선생님이 준비한 책방 흐름"}</p>
            </div>
          </div>

          {!hasClass ? (
            <div className="book-library-empty">관리자가 반을 만들면 활동이 여기에 표시됩니다.</div>
          ) : (
            <BookProjectPanel
              key={projectEditorKey}
              project={project}
              editing={editingProject}
              appendStep={appendProjectStep}
              initialOpenStepId={projectEditorStepId}
              saving={savingProject}
              participantCount={participants.length}
              onSave={onSaveProject}
              onEdit={onEditProject}
              onOpen={onOpen}
              onToggleActivityLock={onToggleActivityLock}
              onToggleProjectItemLock={onToggleProjectItemLock}
              onDelete={onDelete}
            />
          )}
        </div>
      </aside>
      )}

      <section className="book-library-main" aria-label="책방 메인 화면">
        {header}
        <BookPersonalDashboard
          participants={participants}
          activities={activities}
          sections={sections}
          project={project}
          entriesByActivity={entriesByActivity}
          progressByUser={confirmedItemsByUser}
          user={user}
          isTeacher={isTeacher}
          onToggleActivityLock={onToggleActivityLock}
          onToggleProjectItemLock={onToggleProjectItemLock}
          onConfirmItem={confirmBookItem}
        />
      </section>
      {showProgressDrawer && (
        <BookProgressDrawer
          sections={sections}
          participants={participants}
          confirmationsByUser={confirmedItemsByUser}
          collapsed={progressCollapsed}
          onToggle={toggleProgressDrawer}
        />
      )}
    </div>
  );
}
