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
  const [mode, setMode] = useState("partial");
  const roster = mode === "empty" ? [] : participants;
  const activeProgress = mode === "complete" ? new Map(participants.map((p) => [p.uid, new Set(["activity:a1", "resource:r1"])])) : progress;
  return <main><button onClick={() => setOpen(true)}>전체 진행률</button><button onClick={() => { setMode("complete"); setOpen(true); }}>모두 확인</button><button onClick={() => { setMode("partial"); setOpen(true); }}>일부 확인</button><button onClick={() => { setMode("empty"); setOpen(true); }}>참여자 없음</button>{open && <BookClassProgressModal className="연수반" participants={roster} sections={sections} progressByUser={activeProgress} onClose={() => setOpen(false)} />}</main>;
}
