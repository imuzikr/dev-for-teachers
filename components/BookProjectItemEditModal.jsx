"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { backdropClose } from "@/lib/modal";
import BasicFormatEditor from "./BasicFormatEditor";

const EXPORT_SCOPE_LABELS = {
  project: "전체 Step",
  step: "현재 Step",
  item: "현재 항목",
};

function targetLabel(classItem, currentClassId) {
  return `${classItem.name ?? "이름 없는 반"}${classItem.id === currentClassId ? " (현재)" : ""}`;
}

function ExportPanel({
  itemLabel,
  project,
  step,
  currentClassId,
  exportTargets,
  exporting,
  loadProject,
  onExport,
}) {
  const [scope, setScope] = useState("item");
  const [targetClassId, setTargetClassId] = useState("");
  const [targetProject, setTargetProject] = useState(null);
  const [targetStepId, setTargetStepId] = useState("");
  const [loadingProject, setLoadingProject] = useState(false);
  const [failed, setFailed] = useState(false);
  const targets = useMemo(
    () => exportTargets.filter((classItem) => !classItem.archived),
    [exportTargets]
  );
  const targetSteps = targetProject?.steps ?? [];
  const showTargetStep = scope === "item" && targetSteps.length > 0;

  useEffect(() => {
    setTargetClassId((current) => (
      targets.some((classItem) => classItem.id === current)
        ? current
        : targets.find((classItem) => classItem.id !== currentClassId)?.id ?? targets[0]?.id ?? ""
    ));
  }, [currentClassId, targets]);

  useEffect(() => {
    if (!targetClassId || !loadProject) {
      setTargetProject(null);
      return;
    }
    let active = true;
    setFailed(false);
    setLoadingProject(true);
    loadProject(targetClassId)
      .then((loadedProject) => {
        if (active) setTargetProject(loadedProject);
      })
      .catch(() => {
        if (active) {
          setTargetProject(null);
          setFailed(true);
        }
      })
      .finally(() => {
        if (active) setLoadingProject(false);
      });
    return () => {
      active = false;
    };
  }, [loadProject, targetClassId]);

  useEffect(() => {
    setTargetStepId((current) => (
      targetSteps.some((targetStep) => targetStep.id === current)
        ? current
        : targetSteps[targetSteps.length - 1]?.id ?? ""
    ));
  }, [targetSteps]);

  if (!project || !step || !onExport || targets.length === 0) return null;

  async function exportSelection() {
    setFailed(false);
    try {
      const exported = await onExport({ scope, targetClassId, targetStepId });
      if (exported === false) setFailed(true);
    } catch {
      setFailed(true);
    }
  }

  return (
    <section className="book-item-export-panel" aria-label={`${itemLabel} 내보내기`}>
      <header>
        <div>
          <span>내보내기</span>
          <strong>다른 반이나 차시로 복사</strong>
        </div>
      </header>
      <div className="book-item-export-grid">
        <label>
          <span>범위</span>
          <select value={scope} onChange={(event) => setScope(event.target.value)}>
            <option value="item">{EXPORT_SCOPE_LABELS.item}</option>
            <option value="step">{EXPORT_SCOPE_LABELS.step}</option>
            <option value="project">{EXPORT_SCOPE_LABELS.project}</option>
          </select>
        </label>
        <label>
          <span>목적 클래스</span>
          <select value={targetClassId} onChange={(event) => setTargetClassId(event.target.value)}>
            {targets.map((classItem) => (
              <option key={classItem.id} value={classItem.id}>{targetLabel(classItem, currentClassId)}</option>
            ))}
          </select>
        </label>
        {showTargetStep && (
          <label>
            <span>목적 Step</span>
            <select value={targetStepId} onChange={(event) => setTargetStepId(event.target.value)}>
              {targetSteps.map((targetStep, index) => (
                <option key={targetStep.id} value={targetStep.id}>Step {index + 1} · {targetStep.title || `Step ${index + 1}`}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p>{scope === "item" && targetSteps.length === 0 ? "목적 클래스에 Step이 없으면 새 Step을 만들고 그 안에 넣습니다." : "복사본은 목적 위치의 가장 아래에 추가됩니다."}</p>
      {failed && <p className="book-item-export-error">내보내지 못했어요. 목적 클래스를 다시 확인해 주세요.</p>}
      <button type="button" className="btn-outline book-item-export-submit" disabled={!targetClassId || loadingProject || exporting} onClick={exportSelection}>
        {exporting ? "내보내는 중..." : loadingProject ? "목적지 확인 중..." : "내보내기"}
      </button>
    </section>
  );
}

export default function BookProjectItemEditModal({
  project,
  step,
  item,
  kind,
  saving,
  exporting = false,
  currentClassId = "",
  exportTargets = [],
  loadProject,
  onSave,
  onExport,
  onClose,
}) {
  const itemLabel = kind === "resource" ? "자료" : "활동";
  const isCreating = !item?.id;
  const [mounted, setMounted] = useState(false);
  const [title, setTitle] = useState(item?.title ?? "");
  const [content, setContent] = useState(item?.content ?? "");
  const [url, setUrl] = useState(kind === "resource" ? item?.url ?? "" : item?.bookUrl || item?.url || "");
  const [requiresAnswer, setRequiresAnswer] = useState(item?.requiresAnswer !== false && !isCreating);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setTitle(item?.title ?? "");
    setContent(item?.content ?? "");
    setUrl(kind === "resource" ? item?.url ?? "" : item?.bookUrl || item?.url || "");
    setRequiresAnswer(item?.requiresAnswer !== false && !isCreating);
  }, [isCreating, item?.id, item?.title, item?.content, item?.url, item?.bookUrl, item?.requiresAnswer, kind]);

  if (!mounted) return null;

  async function save() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    const trimmedUrl = url.trim();
    await onSave({
      title: trimmedTitle,
      content,
      ...(kind === "resource"
        ? { url: trimmedUrl }
        : { url: trimmedUrl, bookUrl: trimmedUrl, requiresAnswer }),
    });
  }

  return createPortal(
    <div className="modal-backdrop book-item-edit-backdrop" {...backdropClose(onClose)}>
      <section className="modal book-item-edit-modal" role="dialog" aria-modal="true" aria-labelledby="book-item-edit-title" onClick={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div>
            <span>{step?.title ?? "Step"} · {isCreating ? `${itemLabel} 추가` : `${itemLabel} 크게 편집`}</span>
            <h3 id="book-item-edit-title">{title.trim() || `${itemLabel} 제목`}</h3>
          </div>
          <button type="button" className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </header>
        <div className="book-item-edit-body">
          <div className="book-item-edit-top-grid">
            <div className="book-item-edit-controls">
              <label className="book-item-edit-field">
                <span>{itemLabel} 제목</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={`${itemLabel} 제목`}
                  aria-label={`${itemLabel} 제목`}
                />
              </label>
              <label className="book-item-edit-field">
                <span>링크 URL</span>
                <input
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder={`${itemLabel} 링크 URL (선택)`}
                  aria-label={`${itemLabel} 링크 URL`}
                  type="url"
                />
              </label>
              {kind === "activity" && (
                <div className="book-answer-setting book-answer-setting--modal" role="group" aria-label="학생 답변 설정">
                  <div className="book-answer-setting-copy">
                    <strong>학생 답변</strong>
                    <span>{requiresAnswer ? "입력 칸을 보여줍니다" : "확인 버튼만 보여줍니다"}</span>
                  </div>
                  <div className="book-answer-segment">
                    <button type="button" className={requiresAnswer ? "is-selected" : ""} aria-pressed={requiresAnswer} onClick={() => setRequiresAnswer(true)}>
                      답변 받기
                    </button>
                    <button type="button" className={!requiresAnswer ? "is-selected" : ""} aria-pressed={!requiresAnswer} onClick={() => setRequiresAnswer(false)}>
                      확인만
                    </button>
                  </div>
                </div>
              )}
            </div>
            {!isCreating && (
              <ExportPanel
                itemLabel={itemLabel}
                project={project}
                step={step}
                currentClassId={currentClassId}
                exportTargets={exportTargets}
                exporting={exporting}
                loadProject={loadProject}
                onExport={onExport}
              />
            )}
          </div>
          <BasicFormatEditor
            value={content}
            onChange={setContent}
            placeholder={kind === "activity" ? "활동 안내사항" : ""}
            ariaLabel={`${itemLabel} 내용`}
          />
        </div>
        <footer className="book-item-edit-footer">
          <button type="button" className="btn-outline" onClick={onClose}>닫기</button>
          <button type="button" className="btn-primary" disabled={saving || !title.trim()} onClick={save}>
            {saving ? "저장 중..." : isCreating ? `${itemLabel} 추가` : `${itemLabel} 저장`}
          </button>
        </footer>
      </section>
    </div>,
    document.body
  );
}
