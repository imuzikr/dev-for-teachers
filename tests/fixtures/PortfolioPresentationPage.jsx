"use client";

import { useEffect, useMemo, useState } from "react";
import BookPortfolioModal from "@/components/BookPortfolioModal";
import PresentationOverlay from "@/components/PresentationOverlay";
import { isFirebaseConfigured } from "@/lib/firebase";
import { addClass, joinClass, saveBookDashboardText, subscribeBroadcast, startBroadcast } from "@/lib/store";

const teacher = { uid: "portfolio-teacher", role: "admin", realName: "담임 선생님", displayName: "담임 선생님" };
const student = { uid: "portfolio-student", role: "student", realName: "김학생", displayName: "김학생", schoolName: "코덱스초등학교", emoji: "김" };

function makeCapture() {
  const canvas = document.createElement("canvas");
  canvas.width = 400; canvas.height = 400;
  const ctx = canvas.getContext("2d");
  const pixels = ctx.createImageData(400, 400);
  for (let i = 0; i < pixels.data.length; i += 4) {
    pixels.data[i] = Math.random() * 256; pixels.data[i + 1] = Math.random() * 256;
    pixels.data[i + 2] = Math.random() * 256; pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas.toDataURL("image/png");
}

function projectFor(classId) {
  return {
    id: classId,
    classId,
    version: "portfolio-presentation-v1",
    title: "발표 공유 프로젝트",
    steps: [
      {
        id: "step-problem",
        title: "문제 정의",
        activities: [{ id: "problem", title: "나의 고민은?", content: "<p>문제를 정의합니다.</p>", requiresAnswer: true }],
        resources: [],
        itemOrder: [{ kind: "activity", id: "problem" }],
      },
      {
        id: "step-solution",
        title: "해결 방안",
        activities: [{ id: "solution", title: "Prompt", content: "<p>해결 방안을 정리합니다.</p>", requiresAnswer: true }],
        resources: [],
        itemOrder: [{ kind: "activity", id: "solution" }],
      },
    ],
  };
}

export default function PortfolioPresentationPage() {
  const [capture, setCapture] = useState("");
  const [role, setRole] = useState("teacher");
  const [audienceVisible, setAudienceVisible] = useState(false);
  const [classItem, setClassItem] = useState(null);
  const [open, setOpen] = useState(false);
  const [broadcast, setBroadcast] = useState(null);
  const [seedError, setSeedError] = useState("");
  const project = useMemo(() => classItem ? projectFor(classItem.id) : null, [classItem]);
  const entriesByActivity = useMemo(() => ({
    problem: [{ activityId: "problem", authorId: student.uid, dashboardText: "학교에서 해결하고 싶은 문제를 정의했습니다.", urls: ["https://example.com/problem"], images: capture ? [capture] : [] }],
    solution: [{ activityId: "solution", authorId: student.uid, dashboardText: "프롬프트와 해결 방안을 정리했습니다.", urls: ["https://example.com/solution"], images: capture ? [capture] : [] }],
  }), [capture]);

  useEffect(() => {
    let live = true;
    async function seed() {
      try {
        if (isFirebaseConfigured) throw new Error("Fixture requires mock Firebase");
        setCapture(makeCapture());
        const created = await addClass(teacher, "1차시", { purpose: "internal" });
        await joinClass(created.id, student, created.joinCode);
        await saveBookDashboardText("problem", student, "학교에서 해결하고 싶은 문제를 정의했습니다.", ["https://example.com/problem"], []);
        await saveBookDashboardText("solution", student, "프롬프트와 해결 방안을 정리했습니다.", ["https://example.com/solution"], []);
        if (live) setClassItem(created);
      } catch (error) {
        if (live) setSeedError(error?.message || "seed failed");
      }
    }
    void seed();
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!classItem?.id) return undefined;
    return subscribeBroadcast(classItem.id, setBroadcast);
  }, [classItem?.id]);

  useEffect(() => {
    window.portfolioPresentationQA = { classItem, broadcast, setRole, setAudienceVisible,
      replaceBroadcast: () => startBroadcast(teacher, classItem.id, {mode: "single", scrollSessionId: "replacement", title: "다른 발표", content: "다른 발표 내용"})
    };
  }, [classItem, broadcast]);

  if (seedError) return <main><p role="alert">fixture error: {seedError}</p></main>;
  if (!classItem || !project) return <main><p>검증 자료 준비 중</p></main>;

  return (
    <main style={{ minHeight: "100dvh", padding: 24, background: "var(--bg)", color: "var(--text)" }}>
      <h1>포트폴리오 발표 검증</h1>
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>교사 보고서 열기</button>
      <section aria-label="방송 상태" style={{ marginTop: 16 }}>
        <p data-testid="broadcast-state">{broadcast?.mode === "bookPortfolio" ? "broadcasting" : "idle"}</p>
      </section>
      {open && (
        <BookPortfolioModal
          project={project}
          participant={student}
          classId={classItem.id}
          className={classItem.name}
          user={role === "teacher" ? teacher : student}
          entriesByActivity={entriesByActivity}
          onClose={() => setOpen(false)}
        />
      )}
      {audienceVisible && broadcast && <PresentationOverlay broadcast={broadcast} />}
    </main>
  );
}
