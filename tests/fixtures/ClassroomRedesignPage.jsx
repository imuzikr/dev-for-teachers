"use client";

import { useEffect, useState } from "react";
import { addBookHelpNote } from "@/lib/bookHelpNotes";
import BooksPage from "@/app/books/page";
import { setSelectedClassId } from "@/lib/classroom";
import { isFirebaseConfigured } from "@/lib/firebase";
import { getBookProject, joinClassByCode, saveBookProject, subscribeBookEntries } from "@/lib/store";

const teacher = { uid: "user_01", role: "admin", displayName: "선생님" };
const longTitle = "우리 교실에서 함께 해결할 문제를 발견하고 안전한 AI 수업 도구의 사용 규칙을 구체적으로 설계하기";
let seeded;
const activityIds = new Map();

function demoImage() {
  const canvas = document.createElement("canvas");
  canvas.width = 640; canvas.height = 320;
  const context = canvas.getContext("2d");
  context.fillStyle = "#edf3ff"; context.fillRect(0, 0, 640, 320);
  context.fillStyle = "#244a96"; context.font = "bold 36px sans-serif";
  context.fillText("안전한 AI 수업", 52, 140);
  context.font = "24px sans-serif"; context.fillText("문제 정의 → 동료 점검 → 발표", 52, 205);
  return canvas.toDataURL("image/jpeg", 0.8);
}

function project(classId, ordinal) {
  return {
    classId,
    title: `${ordinal}반 · 함께 만드는 AI 수업 도구`,
    steps: [1, 2].map((index) => ({
      id: `${classId}-step-${index}`,
      title: index === 1 ? longTitle : "서로 점검하고 발표하기",
      description: "실제 수업 장면을 떠올리고, 동료와 의견을 나누며 한 장의 도구 기획서를 완성합니다.",
      activities: [{
        id: `${classId}-activity-${index}`,
        title: index === 1 ? "우리 수업의 문제 정의 작성" : "동료 피드백을 반영한 최종 기획서",
        content: "<h2>어떤 문제를 해결하고 싶나요?</h2><p>누가 어떤 상황에서 어려움을 겪는지 적고, 도구가 도와줄 수 있는 일을 한 문장으로 정리해 주세요.</p>",
        requiresAnswer: true,
        images: [demoImage()],
      }],
      resources: [{
        id: `${classId}-resource-${index}`,
        title: index === 1 ? "안전한 도구 설계 체크리스트" : "발표와 상호 점검 안내",
        teacherDescription: "자료를 읽고 두 가지 항목을 모두 확인한 다음 완료해 주세요.",
        content: '<p>사용자와 교실 상황을 먼저 생각합니다.</p><ul class="rte-checklist"><li><label><input type="checkbox"><span class="rte-checklist-text">개인정보를 입력하지 않는지 확인</span></label></li><li><label><input type="checkbox"><span class="rte-checklist-text">동료에게 도움을 요청할 방법 정리</span></label></li></ul>',
      }],
    })),
  };
}

async function seed() {
  if (isFirebaseConfigured) throw new Error("Classroom QA requires an isolated Firebase stub.");
  sessionStorage.setItem("anon_profile", JSON.stringify({ uid: "user_01", name: "테스트 참여자", emoji: "🙂" }));
  for (const [id, ordinal] of [["cl1", "1"], ["cl2", "2"]]) await saveBookProject(teacher, project(id, ordinal));
  for (const id of ["cl1", "cl2"]) {
    const saved = await getBookProject(id);
    saved.steps.forEach((step, index) => activityIds.set(`${id}-activity-${index + 1}`, step.activities[0].id));
  }
  await joinClassByCode("111111", { ...teacher, role: "student" });
  await addBookHelpNote(teacher, "cl1", { title: "자주 나오는 질문", url: "https://example.com/classroom-guide", sections: [
    { id: "qa-help-1", title: "정답이 없는 활동은 어떻게 평가하나요?", content: "<p>문제 정의와 설명 과정, 동료 피드백 반영을 함께 살펴봅니다.</p>", url: "" },
    { id: "qa-help-2", title: "도움이 필요하면 어떻게 하나요?", content: "<p>현재 STEP의 안내를 다시 읽고 선생님에게 질문합니다.</p>", url: "" },
  ] });
  setSelectedClassId("cl1");
}

export default function ClassroomRedesignPage() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    seeded ??= seed();
    seeded.then(() => setReady(true));
    window.__classroomQA = {
      entries(itemId) {
        let result = [];
        const stop = subscribeBookEntries(activityIds.get(itemId) ?? itemId, (items) => { result = items; });
        stop();
        return result;
      },
    };
    return () => { delete window.__classroomQA; };
  }, []);
  return ready ? <BooksPage /> : <p role="status">검증용 클래스를 준비하고 있습니다.</p>;
}
