"use client";

import { useState } from "react";
import BookProjectPanel from "@/components/BookProjectPanel";

export default function InternalProjectTemplatePage() {
  const [purpose, setPurpose] = useState("internal");
  const [project, setProject] = useState(null);
  const [editing, setEditing] = useState(true);
  const [version, setVersion] = useState(0);
  function reset(nextPurpose) {
    setPurpose(nextPurpose);
    setProject(null);
    setEditing(true);
    setVersion(current => current + 1);
  }
  return <main>
    <button onClick={() => reset("internal")}>New internal</button>
    <button onClick={() => reset("training")}>New training</button>
    <BookProjectPanel key={version} project={project} classPurpose={purpose} editing={editing}
      onSave={async value => { setProject(value); setEditing(false); return true; }}
      onEdit={() => setEditing(true)} />
    <output data-testid="saved">{JSON.stringify(project)}</output>
  </main>;
}
