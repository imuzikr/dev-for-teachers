"use client";

import { useEffect, useState } from "react";
import BooksHome from "@/components/BooksHome";
import { addBookHelpNote } from "@/lib/bookHelpNotes";
import { isFirebaseConfigured } from "@/lib/firebase";

const student = { uid: "scroll-student", displayName: "Scroll student", realName: "Scroll student" };
const classroom = { id: "scroll-class", name: "Scroll classroom" };
const project = {
  id: "scroll-project", classId: classroom.id, title: "Scroll project",
  steps: Array.from({ length: 24 }, (_, index) => ({
    id: `step-${index + 1}`, title: `Step ${index + 1}`,
    activities: Array.from({ length: 18 }, (_, card) => ({
      id: `activity-${index}-${card}`, kind: "activity", title: `Activity ${card + 1}`,
      content: Array.from({ length: 50 }, (_, line) => `<p>Observation ${line + 1}: read the activity and record your result.</p>`).join(""), requiresAnswer: false,
    })), resources: [],
  })),
};
const noop = () => {};
let helpSeed;

function seedHelp() {
  if (isFirebaseConfigured) throw new Error("Scroll fixture requires the Firebase stub");
  return Promise.all(Array.from({ length: 32 }, (_, index) => addBookHelpNote(
    { uid: "scroll-teacher" }, classroom.id, { title: `Help note ${index + 1}`, sections: [] }
  )));
}

export default function MobilePageScrollPage() {
  const [role, setRole] = useState(null);
  useEffect(() => {
    helpSeed ??= seedHelp();
    helpSeed.then(() => setRole(new URLSearchParams(location.search).get("role") || "student"));
  }, []);
  if (!role) return null;
  const admin = role === "teacher";
  return <div className="board-shell books-board-shell">
    <BooksHome
      topNav={<header className="topbar"><div className="topbar-left"><strong className="logo">Scroll classroom</strong></div></header>}
      admin={admin} user={admin ? { uid: "scroll-teacher", displayName: "Teacher" } : student}
      classId={classroom.id} classes={[classroom]} currentClass={classroom}
      myClasses={[classroom]} myClassesAll={[classroom]} allTeacherClasses={[classroom]}
      membershipIds={[classroom.id]} roster={[student]} participants={[student]}
      project={project} displayedProject={project} visibleActivities={project.steps.flatMap(step => step.activities)}
      liveProjectReady onSelectTeacherClass={noop} onToast={noop} onEditProject={noop}
      onSaveProject={async () => true} onToggleActivityLock={noop} onToggleProjectItemLock={noop}
    />
  </div>;
}
