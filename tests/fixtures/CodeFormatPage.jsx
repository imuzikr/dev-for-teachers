"use client";
import { useState } from "react";
import BasicFormatEditor from "@/components/BasicFormatEditor";
import RichTextDisplay from "@/components/RichTextDisplay";
import ActivityTemplate from "@/components/ActivityTemplate";

export default function CodeFormatPage() {
  const [html, setHtml] = useState('<p>Firestore Rules</p><pre><code>rules_version = \'2\';\n  allow read: if x &lt; 10 &amp;&amp; y &gt; 0;</code></pre><ul class="rte-checklist"><li><label><input type="checkbox"><span class="rte-checklist-text">확인하기</span></label></li></ul>');
  const [values, setValues] = useState({ Rules: "const value = 1;\n  console.log(value);" });
  return <main style={{ padding: 20, maxWidth: 960, margin: "auto" }}>
    <BasicFormatEditor value={html} onChange={setHtml} templateEnabled />
    <section data-testid="display"><RichTextDisplay html={html} /></section>
    <section data-testid="template"><ActivityTemplate content={'<pre><code>{{Rules}}</code></pre>'} values={values} onChange={setValues} /></section>
  </main>;
}
