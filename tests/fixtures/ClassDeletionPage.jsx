"use client";
import { useState } from "react";
import ClassManagerModal from "@/components/ClassManagerModal";

export default function ClassDeletionPage() {
  const [open, setOpen] = useState(true);
  const [fail, setFail] = useState(true);
  const [calls, setCalls] = useState(0);
  const [toast, setToast] = useState("");
  const activeClass = { id: "qa-active", name: "운영 반", archived: false, accessVersion: 2 };
  const archivedClass = { id: "qa-archived", name: "삭제 대상 반", archived: true, accessVersion: 2 };
  if (typeof window !== "undefined") {
    window.__CLASS_DELETION_RESULT__ = { status: "completed", retainedFiles: 2 };
    window.__CLASS_DELETION_DELETE__ = async () => {
      setCalls((value) => value + 1);
      await new Promise((resolve) => {
        window.__CLASS_DELETION_RELEASE__ = resolve;
      });
      window.__CLASS_DELETION_RELEASE__ = null;
      if (fail) {
        setFail(false);
        throw new Error("삭제를 완료하지 못했어요. 같은 반 삭제를 다시 실행하면 이어서 점검합니다.");
      }
      return window.__CLASS_DELETION_RESULT__;
    };
  }
  return (
    <main style={{ padding: 24 }}>
      <label>
        <input aria-label="실패 모드" type="checkbox" checked={fail} onChange={(event) => setFail(event.target.checked)} />
        실패 모드
      </label>
      <output data-testid="calls">{calls}</output>
      <output
        data-testid="toast"
        style={{
          background: "#fbfaf3",
          border: "1px solid #d8e2d8",
          borderRadius: 8,
          left: 24,
          maxWidth: "calc(100vw - 48px)",
          padding: "8px 12px",
          position: "fixed",
          top: 12,
          wordBreak: "keep-all",
          zIndex: 5000,
        }}
      >
        {toast || "no-toast"}
      </output>
      <button type="button" onClick={() => setOpen(true)}>관리 열기</button>
      {open && (
        <ClassManagerModal
          user={{ uid: "admin", role: "admin" }}
          classes={[activeClass, archivedClass]}
          allClasses={[activeClass, archivedClass]}
          deleteClassAction={(classId) => {
            if (typeof window === "undefined") throw new Error("테스트 삭제 함수가 준비되지 않았어요.");
            return window.__CLASS_DELETION_DELETE__(classId);
          }}
          onClose={() => setOpen(false)}
          onToast={setToast}
        />
      )}
    </main>
  );
}
