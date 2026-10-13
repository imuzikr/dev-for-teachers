"use client";

import { useState } from "react";
import BookProjectPanel from "@/components/BookProjectPanel";

export default function InternalProjectTemplatePage() {
  const [purpose, setPurpose] = useState("internal");
  const [project, setProject] = useState(null);
  const [editing, setEditing] = useState(true);
  const [version, setVersion] = useState(0);
  function reset(nextPurpose, existing = null) {
    setPurpose(nextPurpose);
    setProject(existing);
    setEditing(true);
    setVersion(current => current + 1);
  }
  return <main>
    <button onClick={() => reset("internal")}>New internal</button>
    <button onClick={() => reset("training")}>New training</button>
    <button onClick={() => reset("internal", { title: "기존 교내용 프로젝트", steps: [
      { id: "s1", title: "나의 고민은?", activities: ["나의 고민은?", "나의 아이디어", "기능 설명"].map((title, index) => ({ id: "a" + index, title, content: "<p>기존 안내</p>", requiresAnswer: true })), resources: [] },
      { id: "s2", title: "프롬프트", activities: [{ id: "prompt", title: "프롬프트", content: "<p>프롬프트 안내</p>" }], resources: [] },
      { id: "s3", title: "첫 딸깍!", activities: [{ id: "mvp", title: "첫 딸깍!", content: "<p>MVP 안내</p>" }, { id: "product", title: "짜잔!", content: "<p>완성 안내</p>" }], resources: [] },
    ] })}>Existing internal</button>
    <BookProjectPanel key={version} project={project} classPurpose={purpose} editing={editing}
      onSave={async value => { setProject(value); setEditing(false); return true; }}
      onEdit={() => setEditing(true)} />
    <output data-testid="saved">{JSON.stringify(project)}</output>
  </main>;
}
