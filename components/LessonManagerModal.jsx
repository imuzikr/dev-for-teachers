"use client";

import { useEffect, useRef, useState } from "react";
import { backdropClose } from "@/lib/modal";
import { getCurrentUser } from "@/lib/user";
import { subscribeMyLessons } from "@/lib/store";
import { isFirebaseConfigured } from "@/lib/firebase";
import { addLessonFile, subscribeLessonFiles, lessonFileUrl, deleteLessonFile } from "@/lib/lessonFiles";
import { LESSON_FILE_ACCEPT, validateLessonFile, lessonFileError } from "@/lib/lessonFilePolicy";
import ConfirmModal from "./ConfirmModal";
import { IconAddFeature, IconDuplicate, IconTrash } from "./StatusIcons";
import { LessonFileDistributionToolbar, useLessonFileSelection } from "./LessonFileDistribution";

export default function LessonManagerModal({ user, classId, className, sharedFiles = [], distributionLoading = false, onClose }) {
  const me = user ?? getCurrentUser();
  const [files, setFiles] = useState([]);
  const [legacy, setLegacy] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deleting, setDeleting] = useState(null);
  const [discarding, setDiscarding] = useState(false);
  const input = useRef(null);
  const modal = useRef(null);
  const processing = useRef(false);
  const selection = useLessonFileSelection({ user: me, classId, className, files, sharedFiles, onError: setError, onNotice: setNotice });
  const working = !!busy || selection.saving;

  useEffect(() => {
    setFiles([]);
    setLoading(true);
    return subscribeLessonFiles(me?.uid, items => { setFiles(items); setLoading(false); },
      reason => { setError(lessonFileError(reason)); setLoading(false); });
  }, [me?.uid]);
  useEffect(() => subscribeMyLessons(me?.uid, setLegacy), [me?.uid]);
  useEffect(() => {
    const previous = document.activeElement;
    modal.current?.querySelector("button")?.focus();
    return () => previous?.focus?.();
  }, []);

  function close() {
    if (processing.current || selection.saving || deleting || discarding) return;
    if (selection.dirty) setDiscarding(true);
    else onClose();
  }
  function cancelConfirmation() {
    if (working) return;
    setDeleting(null);
    setDiscarding(false);
    modal.current?.querySelector("button")?.focus();
  }
  function keyboard(event) {
    if (event.key === "Escape") {
      event.stopPropagation();
      if (deleting || discarding) cancelConfirmation();
      else close();
    }
    if (event.key !== "Tab") return;
    const container = deleting || discarding ? modal.current.parentElement.querySelector(".confirm-modal") : modal.current;
    const controls = [...container.querySelectorAll('button:not(:disabled), input:not([hidden]):not(:disabled), a[href], summary')]
      .filter(element => element.getClientRects().length);
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  async function upload(event) {
    const selected = [...(event.target.files ?? [])];
    event.target.value = "";
    if (!selected.length || processing.current) return;
    setError(""); setNotice("");
    try { selected.forEach(validateLessonFile); }
    catch (reason) { setError(lessonFileError(reason)); return; }
    processing.current = true;
    let completed = 0;
    try {
      for (const file of selected) {
        setBusy(file.name); setProgress(0);
        await addLessonFile(me, file, setProgress);
        completed++;
      }
      setNotice(completed + "개 파일을 저장했습니다.");
    } catch (reason) {
      setError((completed ? completed + "개 파일은 저장되었습니다. " : "") + lessonFileError(reason));
    } finally { processing.current = false; setBusy(""); }
  }

  async function fileAction(file, copy) {
    if (processing.current) return;
    processing.current = true;
    setBusy(file.name); setError(""); setNotice("");
    try {
      if (copy && !isFirebaseConfigured) throw new Error("데모 모드에서는 배포 링크를 만들 수 없습니다.");
      const url = await lessonFileUrl(file);
      if (copy) {
        await navigator.clipboard.writeText(url);
        setNotice("배포 링크를 복사했습니다. 링크를 받은 사람은 파일을 다운로드할 수 있습니다.");
      } else {
        const anchor = document.createElement("a");
        anchor.href = url; anchor.download = file.name;
        anchor.rel = "noopener"; anchor.click();
        if (url.startsWith("blob:")) setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    } catch (reason) { setError(lessonFileError(reason)); }
    finally { processing.current = false; setBusy(""); }
  }

  async function remove() {
    if (processing.current || !deleting) return;
    processing.current = true;
    setBusy(deleting.name); setError("");
    try { await deleteLessonFile(me, deleting); setDeleting(null); }
    catch (reason) { setError(lessonFileError(reason)); setDeleting(null); }
    finally { processing.current = false; setBusy(""); }
  }

  const visible = files.filter(file => file.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <div className="modal-backdrop" {...backdropClose(close)} onKeyDown={keyboard}>
    <section ref={modal} className="modal modal-lesson lesson-file-manager" role="dialog" aria-modal="true" aria-labelledby="lesson-files-title">
      <div className="modal-head">
        <h3 id="lesson-files-title">수업 준비</h3>
        <button type="button" className="btn-close" onClick={close} disabled={working} aria-label="닫기">×</button>
      </div>
      <div className="lesson-file-toolbar">
        <input type="search" aria-label="자료 검색" placeholder="파일명 검색" value={query} onChange={event => setQuery(event.target.value)} />
        <button type="button" className="btn-primary" disabled={working || loading || !me?.uid} onClick={() => input.current?.click()}>
          <IconAddFeature size={18} /> 파일 올리기
        </button>
        <input ref={input} type="file" aria-label="자료 파일" accept={LESSON_FILE_ACCEPT} multiple hidden onChange={upload} disabled={working} />
      </div>
      <p className="lesson-file-formats">이미지 · TXT · PDF · PPTX · XLSX · CSV · ZIP · HTML · JSON · DOC/DOCX · HWP/HWPX <span>파일당 최대 50MB</span></p>
      {classId && <LessonFileDistributionToolbar className={className} selection={selection} disabled={working || loading || distributionLoading} />}
      {busy && <div role="status" className="lesson-file-progress"><span>{busy}</span><progress max="1" value={progress} aria-label="업로드 진행률" /></div>}
      {error && <p role="alert" className="lesson-error">{error}</p>}
      {notice && <p role="status" className="lesson-file-notice">{notice}</p>}
      <div className="lesson-list">
        {loading ? <p className="empty-note">자료를 불러오는 중입니다.</p> : visible.length === 0 ? <p className="empty-note">{query ? "검색 결과가 없습니다." : "저장된 파일이 없습니다."}</p> :
          visible.map(file => <div className="lesson-row lesson-file-row" key={file.id}>
            <div className="lesson-file-identity">
              {classId && <input type="checkbox" aria-label={file.name + " 배포 선택"} checked={selection.selected(file.id)} disabled={working || distributionLoading || file.deleting === true} onChange={event => selection.toggle(file.id, event.target.checked)} />}
              <div className="lesson-row-main"><strong>{file.name}</strong><span>{file.extension.toUpperCase()} · {file.size < 1024 * 1024 ? Math.max(1, Math.ceil(file.size / 1024)) + " KB" : (file.size / 1024 / 1024).toFixed(1) + " MB"}</span>
                {!!Object.keys(file.sharedClasses ?? {}).length && <span title={Object.values(file.sharedClasses).join(", ")}>{Object.keys(file.sharedClasses).length}곳에서 사용 중{file.sharedClasses?.[classId] ? " · 현재 배포 중" : ""}</span>}
              </div>
            </div>
            <div className="lesson-row-actions">
              <button type="button" className="btn-outline" disabled={working} onClick={() => fileAction(file, false)}>다운로드</button>
              <button type="button" className="btn-ghost" title="배포 링크 복사" aria-label={file.name + " 배포 링크 복사"} disabled={working} onClick={() => fileAction(file, true)}><IconDuplicate size={18} /></button>
              <button type="button" className="btn-ghost qa-delete" title={Object.keys(file.sharedClasses ?? {}).length ? "배포 해제 후 삭제할 수 있습니다" : "삭제"} aria-label={file.name + " 삭제"} disabled={working || Object.keys(file.sharedClasses ?? {}).length > 0} onClick={() => setDeleting(file)}><IconTrash size={18} /></button>
            </div>
          </div>)}
      </div>
      {legacy.length > 0 && <details className="lesson-file-legacy"><summary>기존 슬라이드 자료 ({legacy.length})</summary>
        {legacy.map(lesson => <details key={lesson.id}><summary>{lesson.title} · {(lesson.slides ?? []).length}장</summary>
          <div className="lesson-row-actions">{(lesson.slides ?? []).map((slide, index) =>
            /^(data:image\/jpeg;base64,|https:\/\/)/.test(slide.imageUrl ?? "") && <a key={index} className="btn-ghost" href={slide.imageUrl} download={lesson.title + "-" + (index + 1) + ".jpg"} rel="noopener">{index + 1}장 다운로드</a>)}</div>
        </details>)}
      </details>}
    </section>
    {deleting && <ConfirmModal title="자료 삭제" preview={deleting.name} description="원본 파일과 배포 링크가 삭제됩니다. 되돌릴 수 없습니다." confirmLabel="삭제" danger confirmDisabled={!!busy} cancelDisabled={!!busy} onConfirm={remove} onClose={cancelConfirmation} />}
    {discarding && <ConfirmModal title="배포 변경 취소" description="저장하지 않은 배포 선택을 취소하고 닫을까요?" confirmLabel="변경 취소하고 닫기" onConfirm={onClose} onClose={cancelConfirmation} />}
  </div>;
}
