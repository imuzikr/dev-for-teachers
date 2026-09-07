"use client";

import { useEffect, useId, useState } from "react";
import { fillTemplate, templateFields, templatePlainText } from "@/lib/activityTemplate.mjs";
import { IconCopy } from "./BookProjectPreview";
import { safeDisplayHtml } from "@/lib/html";
import RichTextDisplay from "./RichTextDisplay";

export default function ActivityTemplate({ content, values, onChange, hasChecklist, checklistValues, onChecklistChange }) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [formattedResult, setFormattedResult] = useState("");
  const id = useId();
  useEffect(() => { setText(templatePlainText(content || "")); }, [content]);
  useEffect(() => setStatus(""), [content, values]);
  useEffect(() => {
    if (!hasChecklist) return;
    const root = document.createElement("div");
    root.innerHTML = safeDisplayHtml(content || "");
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) walker.currentNode.textContent = fillTemplate(walker.currentNode.textContent, values);
    setFormattedResult(root.innerHTML);
  }, [content, values, hasChecklist]);
  const fields = templateFields(text);
  const result = fillTemplate(text, values);
  const complete = fields.length > 0 && fields.every((field) => Object.hasOwn(values, field) && values[field].trim());

  async function copy() {
    try {
      await navigator.clipboard.writeText(result);
      setStatus("복사했습니다.");
    } catch {
      setStatus("복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요.");
    }
  }

  return <section className="activity-template" aria-label="나의 프롬프트">
    <div className="activity-template-fields">
      {fields.map((field, index) => <label key={field} htmlFor={`${id}-${index}`}>
        <span>{field}</span>
        <input id={`${id}-${index}`} value={Object.hasOwn(values, field) ? values[field] : ""} onChange={(event) => onChange({ ...values, [field]: event.target.value })} autoComplete="off" />
      </label>)}
    </div>
    {fields.length === 0 && <p className="form-error">등록된 템플릿 변수가 없습니다.</p>}
    {hasChecklist ? <RichTextDisplay className="activity-template-result" html={formattedResult} checklistValues={checklistValues} onChecklistChange={onChecklistChange} /> : <div className="activity-template-result" aria-label="완성된 프롬프트">{result}</div>}
    <button type="button" className="btn-outline" disabled={!complete} onClick={copy}><IconCopy /> 복사하기</button>
    <span className="activity-template-status" role="status">{status}</span>
  </section>;
}
