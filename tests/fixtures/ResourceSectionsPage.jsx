"use client";
import { useState } from "react";
import BookProjectItemEditModal from "@/components/BookProjectItemEditModal";
import BookPersonalItemViewModal from "@/components/BookPersonalItemViewModal";
import BookPresentationModal, { bookPresentationPayload, bookPresentationItemFromBroadcast } from "@/components/BookPresentationModal";
import { ProjectDisplayItem } from "@/components/BookProjectPreview";

const initial = { id: "resource", title: "Clasp 설치하기", teacherDescription: "설치 전에 안내를 읽고 아래 명령을 복사해 주세요.", content: "<p>첫 번째 줄 &amp; 설명</p><pre>npm install clasp\n  clasp login</pre>" };
export default function ResourceSectionsPage() {
  const [resource, setResource] = useState(initial);
  const [view, setView] = useState("panel");
  const [target, setTarget] = useState(null);
  const [values, setValues] = useState({});
  const detail = { id: resource.id, kind: "resource", source: resource };
  const broadcast = bookPresentationItemFromBroadcast(bookPresentationPayload(detail, { projectId: "qa", projectTitle: "자료", itemIndex: 0, itemTotal: 1 }));
  return <main style={{ padding: 16 }}>
    <nav style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {["panel", "edit", "presentation", "broadcast"].map(v => <button className="btn-outline" key={v} onClick={() => setView(v)}>{v}</button>)}
      <button onClick={() => { setResource({ ...initial, teacherDescription: "" }); setView("panel"); }}>legacy</button>
      <button onClick={() => { setResource({ ...initial, templateEnabled: true, content: "<p>{{이름}}의 결과입니다.</p>" }); setView("panel"); }}>template</button>
      <button onClick={() => { setResource({ ...initial, content: "" }); setView("broadcast"); }}>empty</button>
    </nav>
    <ProjectDisplayItem item={resource} kind="resource" />
    <aside aria-label="자료 패널" ref={setTarget} style={{ width: "min(100%, 340px)", marginTop: 16 }} />
    {(view === "panel" || view === "modal") && target && <BookPersonalItemViewModal detailItem={detail} index={0} isTeacher={false} panelTarget={view === "panel" ? target : null} onExpand={() => setView("modal")} onClose={() => setView("panel")} templateValues={values} onTemplateChange={setValues} />}
    {view === "edit" && <BookProjectItemEditModal step={{ id: "step", title: "사전 프로그램 설치" }} kind="resource" item={resource} onSave={patch => { setResource({ ...resource, ...patch }); setView("panel"); return true; }} onClose={() => setView("panel")} />}
    {(view === "presentation" || view === "broadcast") && <BookPresentationModal item={view === "broadcast" ? broadcast : detail} onClose={() => setView("panel")} />}
  </main>;
}
