"use client";

import { useEffect, useRef, useState } from "react";

export default function BookProjectCopyPicker({ classes = [], currentClassId, loadProject, disabled, onCopy }) {
  const [classId, setClassId] = useState("");
  const [source, setSource] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  const candidates = classes.filter((item) => item.id !== currentClassId && !item.archived);
  const selectedClass = candidates.find((item) => item.id === classId);

  useEffect(() => {
    const token = ++request.current;
    setSource(null);
    setError("");
    if (!selectedClass || !loadProject) { setLoading(false); return; }
    setLoading(true);
    Promise.resolve().then(() => loadProject(selectedClass.id)).then((project) => {
      if (request.current !== token) return;
      setSource(project);
      if (!project) setError("이 반에는 저장된 프로젝트가 없어요.");
    }).catch(() => {
      if (request.current === token) setError("프로젝트를 불러오지 못했어요. 다른 반을 선택하거나 다시 시도해 주세요.");
    }).finally(() => { if (request.current === token) setLoading(false); });
    return () => { request.current += 1; };
  }, [selectedClass?.id, loadProject]);

  return <section className="book-project-copy" aria-label="다른 반 프로젝트 복사">
    <label>
      <strong>다른 반 프로젝트 복사</strong>
      <select value={classId} disabled={disabled || !candidates.length} onChange={(event) => setClassId(event.target.value)}>
        <option value="">복사할 반 선택</option>
        {candidates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>
    <p>Step·활동·자료 구성을 가져옵니다. 학생 기록은 복사하지 않습니다. 불러오면 작성 중인 구성이 바뀌며, 저장 전까지 현재 반에 반영되지 않습니다.</p>
    {!candidates.length && <p>복사할 수 있는 다른 반이 없습니다.</p>}
    {loading && <p role="status">프로젝트를 불러오는 중...</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {source && !loading && <p>{source.title} · {source.steps?.length ?? 0} Steps</p>}
    <button type="button" className="btn-outline" disabled={disabled || loading || !source || !selectedClass} onClick={() => {
      try { onCopy(source); setError(""); }
      catch (failure) { setError(failure.message || "프로젝트를 복사하지 못했어요."); }
    }}>이 프로젝트 불러오기</button>
  </section>;
}
