"use client";

import { useRef, useState } from "react";
import { setLessonFileDistribution } from "@/lib/lessonFiles";
import { lessonFileError } from "@/lib/lessonFilePolicy";

export function useLessonFileSelection({ user, classId, className, files, sharedFiles, onError, onNotice }) {
  const [changes, setChanges] = useState(new Map());
  const [saving, setSaving] = useState(false);
  const running = useRef(false);
  const published = new Set(sharedFiles.filter(file => file.ownerId === user?.uid).map(file => file.id));
  function selected(id) { return changes.has(id) ? changes.get(id) : published.has(id); }
  function toggle(id, value) {
    setChanges(current => { const next = new Map(current); next.set(id, value); return next; });
  }
  const pending = files.filter(file => changes.has(file.id) && changes.get(file.id) !== published.has(file.id));
  async function save() {
    if (running.current || !classId) return;
    running.current = true;
    setSaving(true); onError(""); onNotice("");
    try {
      for (const file of pending) {
        await setLessonFileDistribution(user, { classId, className, file, published: changes.get(file.id) });
      }
      setChanges(new Map());
      onNotice("배포 목록을 저장했습니다.");
    } catch (error) { onError(lessonFileError(error)); }
    finally { running.current = false; setSaving(false); }
  }
  return { selected, toggle, save, saving, dirty: pending.length > 0, count: files.filter(file => selected(file.id)).length };
}

export function LessonFileDistributionToolbar({ className, selection, disabled }) {
  return <div className="lesson-distribution-toolbar">
    <strong>{className} <span>{selection.count}개 선택</span></strong>
    <button type="button" className="btn-primary" disabled={disabled || selection.saving || !selection.dirty} onClick={selection.save}>
      {selection.saving ? "배포 저장 중" : "배포 목록 저장"}
    </button>
  </div>;
}
