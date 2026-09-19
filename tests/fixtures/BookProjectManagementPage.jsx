"use client";

import { useEffect, useState } from "react";
import BooksPage from "@/app/books/page";
import { getBookProject, saveBookProject, saveBookEntry } from "@/lib/store";
import { setSelectedClassId } from "@/lib/classroom";
import { isFirebaseConfigured } from "@/lib/firebase";

let seed;
async function seedProject() {
  if (isFirebaseConfigured) throw new Error("This fixture must run with mock Firebase");
  await saveBookProject({ uid: "user_01", role: "admin" }, { classId: "cl1", title: "우리 동네 생태 탐구", steps: [
    { id: "observe", title: "관찰하고 기록하기", description: "주변의 생물을 찾아봅니다.",
      activities: [{ id: "observe-activity", title: "생물 관찰 일지", content: "<p>관찰한 생물의 특징을 기록해요.</p>", requiresAnswer: true }],
      resources: [{ id: "observe-resource", title: "관찰 안내 자료", content: "<p>관찰 방법을 살펴보세요.</p>", url: "https://example.test/guide" }],
      itemOrder: [{ kind: "resource", id: "observe-resource" }, { kind: "activity", id: "observe-activity" }],
    },
  ] });
  const project = await getBookProject("cl1");
  await saveBookEntry(project.steps[0].activities[0].id, { uid: "student-1" }, { text: "1반 학생 기록" });
  setSelectedClassId("cl2");
}

export default function BookProjectManagementPage() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    seed ??= seedProject();
    seed.then(() => {
      window.__projectManagement = { getProject: getBookProject };
      setReady(true);
    });
  }, []);
  return ready ? <BooksPage /> : <p>테스트 준비 중...</p>;
}
