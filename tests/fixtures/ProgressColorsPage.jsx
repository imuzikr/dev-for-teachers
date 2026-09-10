"use client";
import { useState } from "react";
import BookClassProgressModal from "@/components/BookClassProgressModal";

const participants = Array.from({ length: 100 }, (_, index) => ({ uid: `student-${index}`, realName: `학생 ${index + 1}` }));
const sections = [{ id: "step", title: "프로젝트 준비", items: [
  { id: "a1", kind: "activity", title: "프로젝트 만들기", source: {} },
  { id: "r1", kind: "resource", title: "참고 자료", source: {} },
  { id: "a2", kind: "activity", title: "프로젝트 배포", source: { locked: true } },
] }];
const progress = new Map(participants.map((p, i) => [p.uid, new Set(i % 3 === 0 ? ["activity:a1", "resource:r1"] : i % 3 === 1 ? ["activity:a1"] : [])]));
export default function ProgressColorsPage() {
  const [open, setOpen] = useState(true);
  return <main><button onClick={() => setOpen(true)}>전체 진행률</button>{open && <BookClassProgressModal className="연수반" participants={participants} sections={sections} progressByUser={progress} onClose={() => setOpen(false)} />}</main>;
}
