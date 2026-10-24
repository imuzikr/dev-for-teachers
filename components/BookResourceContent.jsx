"use client";

import { templatePlainText } from "@/lib/activityTemplate.mjs";
import useClipboardCopy from "./useClipboardCopy";
import BookResourceDescription from "./BookResourceDescription";

export default function BookResourceContent({ resource, children, templateInteractive = false }) {
  const clipboard = useClipboardCopy();
  const description = resource.teacherDescription || "";
  return <div className="book-resource-sections">
    {clipboard.notice}
    <BookResourceDescription description={description} />
    <section className="book-resource-copy-section" aria-label="복사할 내용">
      <header>
        <h4>복사할 내용</h4>
        {!templateInteractive && !/<pre(?:\s|>)/i.test(resource.content || "") && <button type="button" className="btn-outline" onClick={() => clipboard.copy(templatePlainText(resource.content || ""), resource.id || "resource")}>{clipboard.copiedId === (resource.id || "resource") ? "복사됨" : "복사"}</button>}
      </header>
      {children}
    </section>
  </div>;
}
