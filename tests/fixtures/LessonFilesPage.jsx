"use client";
import { useState } from "react";
import LessonManagerModal from "@/components/LessonManagerModal";
const user = { uid: "qa-teacher", role: "teacher", realName: "테스트 교사" };
export default function LessonFilesPage() {
  const [open, setOpen] = useState(true);
  return <main><button onClick={() => setOpen(true)}>수업 준비 열기</button>{open && <LessonManagerModal user={user} onClose={() => setOpen(false)} />}</main>;
}
