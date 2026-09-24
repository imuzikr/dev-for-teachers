"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { checklistComplete, checklistSnapshot, checklistVersion } from "@/lib/activityChecklist";
import { safeDisplayHtml, stripHtml } from "@/lib/html";
import BookPersonalItemViewModal from "./BookPersonalItemViewModal";
import useClipboardCopy from "./useClipboardCopy";
import Toast from "./Toast";

const DemoContext = createContext(null);
const empty = { answer: "", templateValues: {}, checklistValues: {}, confirmed: false };

export function TeacherActivityDemoProvider({ scope, children }) {
  const storageKey = `book-teacher-demo:v1:${scope}`;
  const [drafts, setDrafts] = useState({});
  const saved = useRef({});
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(storageKey) || "{}");
      if (cached && typeof cached === "object" && !Array.isArray(cached)) {
        saved.current = cached;
        setDrafts(cached);
      }
    } catch { /* Saving reports unavailable browser storage to the teacher. */ }
    setLoaded(true);
  }, [storageKey]);

  function change(key, patch) {
    setDrafts(current => ({ ...current, [key]: { ...empty, ...current[key], ...patch, confirmed: false } }));
  }

  function save(key) {
    if (!loaded) return false;
    const value = { ...empty, ...drafts[key], confirmed: true };
    try {
      const next = { ...saved.current, [key]: value };
      localStorage.setItem(storageKey, JSON.stringify(next));
      saved.current = next;
      setDrafts(current => ({ ...current, [key]: value }));
      setNotice("시연 내용을 이 브라우저에 저장했습니다.");
      return true;
    } catch {
      setNotice("저장하지 못했어요. 브라우저 저장 공간을 확인하고 다시 시도해 주세요.");
      return false;
    }
  }

  return <DemoContext.Provider value={{ drafts, loaded, change, save }}>
    {children}
    <Toast message={notice} onDone={() => setNotice("")} />
  </DemoContext.Provider>;
}

export default function TeacherActivityDemoView({ detailItem, ...props }) {
  const demo = useContext(DemoContext);
  const clipboard = useClipboardCopy();
  const [defaults, setDefaults] = useState([]);
  const [loadedVersion, setLoadedVersion] = useState(null);
  const item = detailItem.source;
  const version = checklistVersion(item.content || "");
  const key = `${detailItem.kind}:${detailItem.id}:${version}`;
  const draft = demo?.drafts[key] ?? empty;
  useEffect(() => {
    const root = document.createElement("div");
    root.innerHTML = safeDisplayHtml(item.content || "");
    setDefaults([...root.querySelectorAll('input[type="checkbox"]')].map(input => input.checked));
    setLoadedVersion(version);
  }, [item.content, version]);
  const checklist = checklistSnapshot(defaults, draft.checklistValues || {});
  const change = patch => demo?.change(key, patch);
  return <>
    {clipboard.notice}
    <BookPersonalItemViewModal {...props} detailItem={detailItem} isTeacher allowInteraction
      answerDraft={typeof draft.answer === "string" ? draft.answer : ""}
      onAnswerChange={answer => change({ answer })}
      templateValues={draft.templateValues || {}}
      onTemplateChange={templateValues => change({ templateValues })}
      checklistValues={checklist} onChecklistChange={checklistValues => change({ checklistValues })}
      hasChecklist={defaults.length > 0} checklistComplete={checklistComplete(checklist)}
      checklistStatus={demo?.loaded && loadedVersion === version ? "" : "loading"}
      onCheckAll={() => change({ checklistValues: defaults.map(() => true) })}
      onUncheckAll={() => change({ checklistValues: defaults.map(() => false) })}
      confirmed={draft.confirmed === true} saveLabel="저장"
      onSave={() => demo?.save(key) ?? false}
      onCopy={detailItem.kind === "resource" ? () => clipboard.copy([item.title, stripHtml(item.content || ""), item.url].filter(Boolean).join("\n"), item.id) : undefined}
      copied={clipboard.copiedId === item.id}
    />
  </>;
}
