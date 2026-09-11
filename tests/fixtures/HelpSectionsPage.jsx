"use client";

import { useEffect, useState } from "react";
import BookHelpDrawer from "@/components/BookHelpDrawer";
import { addBookHelpNote } from "@/lib/bookHelpNotes";

let seed;
export default function Page() {
  const [ready, setReady] = useState(false);
  const [teacher, setTeacher] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [toast, setToast] = useState("");
  useEffect(() => {
    seed ??= addBookHelpNote({ uid: "qa-teacher" }, "qa-help", { title: "Vercel", content: "<p>시간·빌드·실행 제한</p><p>배포당 빌드 시간: 최대 45분</p>", url: "https://vercel.com", sections: [{ id: "quota", title: "배포 제한", content: "<p>하루 배포 수: 100회</p>", url: "" }] });
    seed.then(() => setReady(true));
  }, []);
  return <main style={{ padding: 12 }}>
    <button onClick={() => setTeacher(!teacher)}>{teacher ? "학생 화면" : "교사 화면"}</button>
    <output role="status">{toast}</output>
    {ready && <div style={{ width: "min(340px, 100%)", height: "calc(100dvh - 60px)" }}><BookHelpDrawer key={teacher ? "teacher" : "student"} classId="qa-help" user={{ uid: "qa-teacher" }} isTeacher={teacher} collapsed={collapsed} onToggleCollapsed={() => setCollapsed(!collapsed)} onToast={setToast} /></div>}
  </main>;
}
