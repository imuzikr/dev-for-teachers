"use client";

import { useState } from "react";
import BookProjectEditor from "@/components/BookProjectEditor";
import BookProjectPanel from "@/components/BookProjectPanel";

const initialProject = {
  title: "왼쪽 사이드바 정렬 테스트",
  steps: [
    {
      id: "s1",
      title: "문제 발견",
      activities: [{ id: "a1", title: "관찰 기록", content: "교실에서 찾은 문제를 적습니다.", requiresAnswer: false }],
      resources: [{ id: "r1", title: "사례 자료", content: "참고 자료", url: "https://example.com/case" }],
      itemOrder: [
        { kind: "activity", id: "a1" },
        { kind: "resource", id: "r1" },
      ],
    },
    {
      id: "s2",
      title: "해결책 설계",
      activities: [{ id: "a2", title: "아이디어 스케치", content: "가능한 해결책을 스케치합니다.", requiresAnswer: true }],
      resources: [{ id: "r2", title: "도구 안내", content: "필요한 도구 안내", url: "https://example.com/tool" }],
      itemOrder: [
        { kind: "resource", id: "r2" },
        { kind: "activity", id: "a2" },
      ],
    },
    {
      id: "s3",
      title: "공유와 회고",
      activities: [{ id: "a3", title: "발표 준비", content: "친구에게 설명할 내용을 정리합니다.", requiresAnswer: false }],
      resources: [],
      itemOrder: [{ kind: "activity", id: "a3" }],
    },
  ],
};

export default function BookProjectOrderingPage() {
  const [project, setProject] = useState(initialProject);
  const [draft, setDraft] = useState(initialProject);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(true);
  const [expandRequest, setExpandRequest] = useState(0);
  const [initialOpenStepId, setInitialOpenStepId] = useState("s2");

  async function saveProject(nextProject) {
    setSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 25));
    setProject(nextProject);
    setSaving(false);
    return true;
  }

  function openProjectEditor() {
    setInitialOpenStepId(null);
    setExpandRequest((current) => current + 1);
    setEditing(true);
  }

  return (
    <main className="books-main--split">
      <div className="book-library-layout">
        <aside className="book-library-side" aria-label="선생님이 준비한 활동과 자료">
          <button type="button" className="book-library-collapse" aria-label="개발자실 패널 접기">
            <span aria-hidden="true">«</span>
          </button>
          <div className="book-library-content">
            <div className="book-library-title">
              <div>
                <h2>프로젝트 구성</h2>
                <p>Step별 활동과 자료 순서를 준비하세요.</p>
              </div>
            </div>
            {editing ? (
              <BookProjectEditor
                project={project}
                initialOpenStepId={initialOpenStepId}
                expandRequest={expandRequest}
                saving={saving}
                participantCount={7}
                onSave={saveProject}
                onDraftChange={setDraft}
              />
            ) : (
              <BookProjectPanel
                project={project}
                editing={false}
                saving={saving}
                participantCount={7}
                onSave={saveProject}
                onEdit={openProjectEditor}
              />
            )}
          </div>
        </aside>
        <section className="book-library-main" aria-label="개발자실 메인 화면">
          <button type="button" className="btn-outline" onClick={() => setEditing((current) => !current)}>
            {editing ? "저장된 사이드바 보기" : "편집 사이드바 보기"}
          </button>
          <div className="book-dashboard-empty">메인 활동 카드 영역</div>
        </section>
      </div>
      <script type="application/json" data-testid="draft-project">{JSON.stringify(draft)}</script>
      <script type="application/json" data-testid="saved-project">{JSON.stringify(project)}</script>
    </main>
  );
}
