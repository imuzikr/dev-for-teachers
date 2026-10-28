"use client";

import { useEffect, useMemo, useState } from "react";
import { subscribeBookProject, subscribeMyBookEntry } from "@/lib/store";
import { subscribeBookConfirmations } from "@/lib/bookConfirmations";
import { internalClassesForUser, internalWorkRecord } from "@/lib/adminInternalWork";
import { fillTemplate, templatePlainText } from "@/lib/activityTemplate.mjs";
import { orderedStepItems } from "./BookProjectPreview";
import BookItemImages from "./BookItemImages";
import BookItemUrlList from "./BookItemUrlList";
import RichTextDisplay from "./RichTextDisplay";
import "./AdminInternalWork.css";

function savedTime(value) {
  const date = value?.toDate ? value.toDate() : new Date(value);
  return value && !Number.isNaN(date.getTime()) ? date.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "";
}

export default function AdminInternalWork({ participant, classes, memberships }) {
  const courses = internalClassesForUser(classes, memberships, participant.uid);
  const [courseId, setCourseId] = useState("");
  const selected = courses.find(course => course.id === courseId) ?? courses[0];
  return <section className="admin-internal-work" aria-label="교내용 활동 기록">
    <header className="admin-work-heading"><div><p>교내용 학습 기록</p><h2>{participant.realName || "사용자"}의 활동·자료</h2><span>저장한 답변, 템플릿, URL과 첨부 이미지를 STEP별로 확인합니다.</span></div>
      {selected && <label>강좌 선택<select aria-label="강좌 선택" value={selected.id} onChange={event => setCourseId(event.target.value)}>{courses.map(course => <option key={course.id} value={course.id}>{course.name}{course.archived ? " (보관)" : ""}</option>)}</select></label>}
    </header>
    {memberships === null ? <p role="status" className="admin-work-empty">소속 정보를 불러오는 중...</p> : selected ? <WorkProject key={`${participant.uid}:${selected.id}`} uid={participant.uid} classId={selected.id} /> : <p className="admin-work-empty">이 사용자는 교내용 강좌에 등록되어 있지 않습니다.</p>}
  </section>;
}

function WorkProject({ uid, classId }) {
  const [project, setProject] = useState(undefined);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true; setProject(undefined); setError("");
    const stop = subscribeBookProject(classId, value => { if (live) setProject(value); }, () => { if (live) setError("프로젝트를 불러오지 못했습니다."); });
    return () => { live = false; stop(); };
  }, [classId, attempt]);
  if (error) return <div className="admin-work-empty"><p role="alert">{error}</p><button className="btn-outline" onClick={() => setAttempt(value => value + 1)}>다시 시도</button></div>;
  if (project === undefined) return <p className="admin-work-empty" role="status">프로젝트를 불러오는 중...</p>;
  if (!project?.steps?.length) return <p className="admin-work-empty">이 강좌에는 저장된 프로젝트가 없습니다.</p>;
  return <WorkRecords key={`${uid}:${classId}:${project.id}:${project.version ?? ""}`} uid={uid} classId={classId} project={project} />;
}

function WorkRecords({ uid, classId, project }) {
  const [entries, setEntries] = useState({});
  const [confirmations, setConfirmations] = useState(null);
  const [errors, setErrors] = useState({});
  const [attempt, setAttempt] = useState(0);
  const [stepId, setStepId] = useState("");
  const [onlySaved, setOnlySaved] = useState(false);
  const activityIds = [...new Set(project.steps.flatMap(step => (step.activities ?? []).map(item => item.id)))];
  const identity = JSON.stringify(activityIds);
  useEffect(() => {
    let live = true; setEntries({}); setConfirmations(null); setErrors({});
    const fail = key => () => { if (live) setErrors(current => ({ ...current, [key]: true })); };
    const stops = activityIds.map(id => subscribeMyBookEntry(id, uid, value => {
      if (live) setEntries(current => ({ ...current, [id]: value }));
    }, fail(id)));
    stops.push(subscribeBookConfirmations({ classId, authorId: uid, callback: value => { if (live) setConfirmations(value); }, onError: fail("confirmations") }));
    return () => { live = false; stops.forEach(stop => stop()); };
  }, [uid, classId, identity, attempt]);
  const sections = useMemo(() => project.steps.map(step => ({ ...step, items: orderedStepItems(step).map(item => ({ ...item,
    record: internalWorkRecord({ item, entry: entries[item.id], confirmations: confirmations ?? [], uid, classId, projectId: project.id || classId }),
  })) })), [project, entries, confirmations, uid, classId]);
  const selected = sections.find(step => step.id === stepId) ?? sections[0];
  const ready = confirmations !== null && activityIds.every(id => Object.hasOwn(entries, id));
  const failed = Object.keys(errors).length > 0;
  const allItems = sections.flatMap(step => step.items);
  const savedCount = allItems.filter(item => item.record.hasContent).length;
  return <>
    <div className="admin-work-toolbar"><div><strong>{project.title}</strong><span>{sections.length} STEPS · {ready ? `작성 ${savedCount} / ${allItems.length}개` : "기록 확인 중"}</span></div><label><input type="checkbox" checked={onlySaved} onChange={event => setOnlySaved(event.target.checked)} />작성한 항목만 보기</label></div>
    {failed && <div className="admin-work-error"><p role="alert">일부 기록을 불러오지 못했습니다. 로그인과 연결 상태를 확인해 주세요.</p><button className="btn-outline" onClick={() => setAttempt(value => value + 1)}>다시 시도</button></div>}
    <div className="admin-work-layout"><nav className="admin-work-steps" aria-label="작성 기록 STEP 선택">{sections.map((step, index) => <button type="button" key={step.id} aria-pressed={step.id === selected.id} onClick={() => setStepId(step.id)}><small>STEP {String(index + 1).padStart(2, "0")}</small><strong>{step.title}</strong><span>{ready ? `작성 ${step.items.filter(item => item.record.hasContent).length} / ` : ""}{step.items.length}개 항목</span></button>)}</nav>
      <section className="admin-work-items" aria-label={`${selected.title} 작성 내용`}><header><h3>{selected.title}</h3><p>활동과 자료의 진행 순서대로 표시합니다.</p></header>
        {!selected.items.length && <p className="admin-work-empty">등록된 활동이나 자료가 없습니다.</p>}
        {ready && onlySaved && selected.items.length > 0 && !selected.items.some(item => item.record.hasContent) && <p className="admin-work-empty">이 STEP에는 작성한 항목이 없습니다.</p>}
        {selected.items.filter(item => !onlySaved || !ready || item.record.hasContent).map((item, index) => {
          const loading = item.kind === "activity" ? !Object.hasOwn(entries, item.id) || confirmations === null : confirmations === null;
          return <WorkItem key={`${item.kind}:${item.id}`} item={item} index={index} loading={loading} failed={Boolean(errors[item.id] || errors.confirmations)} />;
        })}
      </section>
    </div>
  </>;
}

function WorkItem({ item, index, loading, failed }) {
  const record = item.record;
  const templateText = record.hasTemplate ? record.templateText || fillTemplate(templatePlainText(item.source.content || ""), record.templateValues) : "";
  return <article className={`admin-work-card is-${item.kind}`}>
    <header><div><small>{String(index + 1).padStart(2, "0")} · {item.kind === "resource" ? "자료" : "활동"}</small><h4>{item.title}</h4></div><span className={`admin-work-badge${record.hasContent ? " is-saved" : ""}`}>{failed ? "조회 실패" : loading ? "불러오는 중" : record.hasContent ? "작성됨" : record.viewed ? "확인함" : "미작성"}</span></header>
    {!loading && !failed && <>
      {record.answer.trim() && <section className="admin-work-answer" aria-label="저장한 답변"><h5>작성한 내용</h5><p>{record.answer}</p></section>}
      {record.answers.map(([key, value]) => <section className="admin-work-answer" key={key}><h5>{key}</h5><p>{value}</p></section>)}
      {record.hasTemplate && <section className="admin-work-answer" aria-label="저장한 템플릿"><h5>템플릿 입력 내용</h5><dl>{Object.entries(record.templateValues).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value || "미입력"}</dd></div>)}</dl>{templateText && <details><summary>완성된 내용 보기</summary><p>{templateText}</p></details>}</section>}
      <BookItemUrlList urls={record.urls} /><BookItemImages images={record.images} previewImages />
      {record.checklist && <p className="admin-work-checklist">체크리스트 {record.checklist.filter(Boolean).length} / {record.checklist.length} 완료</p>}
      {!record.hasContent && <p className="admin-work-no-answer">저장된 입력 내용이 없습니다.</p>}
      {savedTime(record.updatedAt) && <time className="admin-work-time">최근 저장 · {savedTime(record.updatedAt)}</time>}
    </>}
    <details className="admin-work-guide"><summary>활동·자료 안내 보기</summary>{item.kind === "resource" && item.source.teacherDescription && <RichTextDisplay html={item.source.teacherDescription} readOnly />}<RichTextDisplay html={item.source.content || "등록된 안내가 없습니다."} readOnly /></details>
  </article>;
}
