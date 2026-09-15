"use client";
import { useState } from "react";
import { ActiveClassRow } from "@/components/ClassManagerClassRows";

export default function ClassManagerLayoutPage() {
  const [item, setItem] = useState({ id: "layout-test", name: "해커톤 성장형", joinCode: "975339", joinEnabled: true });
  const [action, setAction] = useState("");
  return <main className="modal modal-class-manager" style={{ margin: "20px auto", width: "calc(100% - 24px)" }}>
    <ul className="class-mgr-list"><ActiveClassRow classItem={item}
      onStartRename={() => setAction("rename")} onArchive={() => setAction("archive")} onDelete={() => setAction("delete")}
      onSaveJoinCode={(_, joinCode) => setItem(current => ({ ...current, joinCode }))}
      onToggleJoinAccess={() => setItem(current => ({ ...current, joinEnabled: !current.joinEnabled }))}
      onRefreshJoinCode={() => setItem(current => ({ ...current, joinCode: "123456" }))}
    /></ul><output>{action}</output>
  </main>;
}
