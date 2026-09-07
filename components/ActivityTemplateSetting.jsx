"use client";

import { useEffect, useState } from "react";
import { templateFields, templatePlainText } from "@/lib/activityTemplate.mjs";

export default function ActivityTemplateSetting({ enabled, content, onChange }) {
  const [fields, setFields] = useState([]);
  useEffect(() => setFields(templateFields(templatePlainText(content || ""))), [content]);
  return <div className="activity-template-setting">
    <label><input type="checkbox" checked={enabled} onChange={(event) => onChange(event.target.checked)} /><span>템플릿 사용</span></label>
    {enabled && <div className="activity-template-variables">{fields.length ? fields.map((field) => <code key={field}>{`{{${field}}}`}</code>) : <span>변수 없음</span>}</div>}
  </div>;
}
