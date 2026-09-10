"use client";
import { useState } from "react";
import BasicFormatEditor from "@/components/BasicFormatEditor";
export default function Page() {
  const [html, setHtml] = useState("");
  const [key, setKey] = useState(0);
  return <main style={{ padding: 20, maxWidth: 760 }}><button onClick={() => { setHtml(""); setKey(key + 1); }}>초기화</button><BasicFormatEditor key={key} value={html} onChange={setHtml} /><output data-testid="html">{html}</output></main>;
}
