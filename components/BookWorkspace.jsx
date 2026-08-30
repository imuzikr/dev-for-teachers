"use client";

import { useEffect, useMemo, useState } from "react";
import { subscribeBookEntries, subscribeMyBookEntry } from "@/lib/store";
import BookPersonalDashboard from "./BookPersonalDashboard";
import BookProjectPanel from "./BookProjectPanel";

const LIBRARY_COLLAPSED_KEY = "book_library_panel_collapsed";

export default function BookWorkspace({
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
  onDelete,
}) {
  const [entriesByActivity, setEntriesByActivity] = useState({});
  const [libraryCollapsed, setLibraryCollapsed] = useState(false);

  useEffect(() => {
    setLibraryCollapsed(window.localStorage.getItem(LIBRARY_COLLAPSED_KEY) === "1");
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

  const progressByUser = useMemo(() => {
    const progress = new Map(participants.map((participant) => [participant.uid, new Set()]));
    activities.forEach((activity) => {
      (entriesByActivity[activity.id] ?? []).forEach((entry) => {
        if (progress.has(entry.authorId)) progress.get(entry.authorId).add(activity.id);
      });
    });
    return progress;
  }, [activities, entriesByActivity, participants]);

  function toggleLibraryPanel() {
    setLibraryCollapsed((current) => {
      const next = !current;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LIBRARY_COLLAPSED_KEY, next ? "1" : "0");
      }
      return next;
    });
  }

  return (
    <div className={`book-library-layout${libraryCollapsed ? " is-library-collapsed" : ""}`}>
      <aside className={`book-library-side${libraryCollapsed ? " is-collapsed" : ""}`} aria-label="선생님이 준비한 활동과 자료">
        <button
          type="button"
          className="book-library-collapse"
          onClick={toggleLibraryPanel}
          aria-expanded={!libraryCollapsed}
          title={libraryCollapsed ? "책방 패널 펼치기" : "책방 패널 접기"}
        >
          <span aria-hidden="true">{libraryCollapsed ? "»" : "«"}</span>
          <strong>{libraryCollapsed ? "책방 흐름" : "패널 접기"}</strong>
        </button>

        <div className="book-library-content" aria-hidden={libraryCollapsed ? "true" : undefined}>
          <div className="book-library-title">
            <div>
              <h2>{editingProject ? "프로젝트 구성" : "프로젝트"}</h2>
              <p>{editingProject ? "Step별 활동과 자료를 준비하세요." : "선생님이 준비한 책방 흐름"}</p>
            </div>
          </div>

          {!hasClass && !isTeacher ? (
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
              onEdit={isTeacher ? onEditProject : null}
              onOpen={onOpen}
              onDelete={isTeacher ? onDelete : null}
            />
          )}
        </div>
      </aside>

      <BookPersonalDashboard
        participants={participants}
        activities={activities}
        progressByUser={progressByUser}
        user={user}
        isTeacher={isTeacher}
        onOpen={onOpen}
      />
    </div>
  );
}
