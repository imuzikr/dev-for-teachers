"use client";

import { useEffect, useState } from "react";
import { useBookPresentationMode } from "@/components/BookPresentationMode";
import PresentationOverlay from "@/components/PresentationOverlay";
import { subscribeBroadcast } from "@/lib/store";

const item = { id: "scroll-item", kind: "resource", stepId: "step", title: "스크롤 발표", source: {
  title: "스크롤 발표", content: Array.from({ length: 50 }, (_, index) => `<p>문단 ${index + 1}. 함께 읽으며 내용을 확인합니다. 화면 크기가 달라도 같은 문단을 봅니다.</p>`).join(""),
} };
const sections = [{ id: "step", items: [item] }];

export default function BookScrollPage() {
  const [teacher, setTeacher] = useState(false);
  const [broadcast, setBroadcast] = useState(null);
  useEffect(() => {
    const isTeacher = new URLSearchParams(location.search).get("teacher") === "1";
    setTeacher(isTeacher);
    const channel = new BroadcastChannel("scroll-qa");
    const unsubscribe = isTeacher ? subscribeBroadcast("scroll-class", value => {
      channel.postMessage(value);
      localStorage.setItem("scroll-qa", JSON.stringify(value));
    }) : () => {};
    if (!isTeacher) {
      setBroadcast(JSON.parse(localStorage.getItem("scroll-qa") || "null"));
      channel.onmessage = event => setBroadcast(event.data);
    }
    return () => { unsubscribe(); channel.close(); };
  }, []);
  const presentation = useBookPresentationMode({ isTeacher: teacher, classId: "scroll-class", user: { uid: "teacher" }, projectId: "scroll-class", projectTitle: "QA", sections });
  return <main>
    {teacher && <button onClick={() => presentation.presentItem(item)}>스크롤 방송 시작</button>}
    {teacher ? presentation.modal : broadcast && <PresentationOverlay broadcast={broadcast} />}
  </main>;
}
