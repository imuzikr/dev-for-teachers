"use client";

import { useEffect, useState } from "react";
import BooksHome from "@/components/BooksHome";
import { addBookHelpNote } from "@/lib/bookHelpNotes";
import { isFirebaseConfigured } from "@/lib/firebase";
import { addLessonFile, setLessonFileDistribution, subscribeLessonFiles } from "@/lib/lessonFiles";

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

async function seedHelp() {
  if (isFirebaseConfigured) throw new Error("Scroll fixture requires the Firebase stub");
  await Promise.all(Array.from({ length: 32 }, (_, index) => addBookHelpNote(
    { uid: "scroll-teacher" }, classroom.id, { title: `Help note ${index + 1}`, sections: [] }
  )));
  if (new URLSearchParams(location.search).has("published")) {
    const owner = { uid: "scroll-teacher" };
    await addLessonFile(owner, new File(["Local classroom worksheet"], "학습 자료.txt", { type: "text/plain" }));
    let files = [];
    const stop = subscribeLessonFiles(owner.uid, value => { files = value; });
    stop();
    await setLessonFileDistribution(owner, { classId: classroom.id, className: classroom.name, file: files[0], published: true });
  }
}

export default function MobilePageScrollPage() {
  const [role, setRole] = useState(null);
  const [activeClass, setActiveClass] = useState(classroom);
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
      classId={activeClass.id} classes={[activeClass]} currentClass={activeClass}
      myClasses={[classroom]} myClassesAll={[classroom]} allTeacherClasses={[classroom]}
      membershipIds={[activeClass.id]} roster={[student]} participants={[student]}
      project={{ ...project, classId: activeClass.id }} displayedProject={{ ...project, classId: activeClass.id }} visibleActivities={project.steps.flatMap(step => step.activities)}
      onJoinClass={async code => {
        if (code !== "123456") return false;
        setActiveClass({ id: "scroll-next-class", name: "Next classroom" });
        return true;
      }}
      liveProjectReady onSelectTeacherClass={noop} onToast={noop} onEditProject={noop}
      onSaveProject={async () => true} onToggleActivityLock={noop} onToggleProjectItemLock={noop}
    />
  </div>;
}
