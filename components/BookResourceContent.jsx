"use client";

import { templatePlainText } from "@/lib/activityTemplate.mjs";
import useClipboardCopy from "./useClipboardCopy";

export default function BookResourceContent({ resource, children, templateInteractive = false }) {
  const clipboard = useClipboardCopy();
  const description = resource.teacherDescription || "";
  return <div className="book-resource-sections">
    {clipboard.notice}
    {description.trim() && <section className="book-resource-description" aria-label="교사 설명">
      <h4>교사 설명</h4>
      <p>{description}</p>
    </section>}
    <section className="book-resource-copy-section" aria-label="복사할 내용">
      <header>
        <h4>복사할 내용</h4>
        {!templateInteractive && <button type="button" className="btn-outline" onClick={() => clipboard.copy(templatePlainText(resource.content || ""), resource.id || "resource")}>{clipboard.copiedId === (resource.id || "resource") ? "복사됨" : "복사"}</button>}
      </header>
      {children}
    </section>
  </div>;
}
