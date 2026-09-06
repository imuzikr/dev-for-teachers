"use client";

import { resourceHref, resourceLinkLabel } from "./BookProjectPreview";

function presentationKindLabel(kind) {
  return kind === "resource" ? "자료" : "활동";
}

function presentationUrl(item) {
  const source = item?.source ?? item ?? {};
  if (item?.kind === "resource" || item?.itemKind === "resource") return source.url ?? item?.url ?? "";
  return source.bookUrl ?? source.url ?? item?.url ?? "";
}

function presentationContent(item) {
  const source = item?.source ?? item ?? {};
  const content = source.content ?? item?.content ?? "";
  if (item?.kind === "resource" || item?.itemKind === "resource") {
    return content || "등록된 자료 내용이 없습니다.";
  }
  return content || "활동 안내사항";
}

function presentationTitle(item) {
  const source = item?.source ?? item ?? {};
  return source.title ?? item?.title ?? "제목 없는 항목";
}

export function bookPresentationPayload(item, position) {
  const source = item?.source ?? item ?? {};
  const kind = item?.kind === "resource" ? "resource" : "activity";
  const url = presentationUrl({ ...item, kind });

  return {
    mode: "bookItem",
    projectId: position.projectId,
    projectTitle: position.projectTitle,
    stepId: item?.stepId ?? "",
    stepTitle: item?.stepTitle ?? "",
    itemKind: kind,
    itemId: item?.id ?? "",
    itemIndex: position.itemIndex,
    itemTotal: position.itemTotal,
    title: presentationTitle({ ...item, kind }),
    content: presentationContent({ ...item, kind }),
    url,
    locked: source.locked === true,
  };
}

export function bookPresentationItemFromBroadcast(broadcast) {
  const kind = broadcast?.itemKind === "resource" ? "resource" : "activity";
  return {
    id: broadcast?.itemId ?? "",
    kind,
    title: broadcast?.title ?? "",
    content: broadcast?.content ?? "",
    url: broadcast?.url ?? "",
    stepId: broadcast?.stepId ?? "",
    stepTitle: broadcast?.stepTitle ?? "",
    source: {
      id: broadcast?.itemId ?? "",
      title: broadcast?.title ?? "",
      content: broadcast?.content ?? "",
      url: broadcast?.url ?? "",
      bookUrl: kind === "activity" ? broadcast?.url ?? "" : "",
      locked: broadcast?.locked === true,
    },
  };
}

export default function BookPresentationModal({
  item,
  positionLabel,
  onPrevious,
  onNext,
  onClose,
  audienceLabel = "선생님이 화면을 보여주고 있어요",
  fullScreen = false,
}) {
  const kind = item?.kind === "resource" || item?.itemKind === "resource" ? "resource" : "activity";
  const title = presentationTitle({ ...item, kind });
  const content = presentationContent({ ...item, kind });
  const href = resourceHref(presentationUrl({ ...item, kind }));
  const linkLabel = resourceLinkLabel(href);
  const canNavigate = Boolean(onPrevious && onNext);

  return (
    <div className={`book-presentation-backdrop${fullScreen ? " is-fullscreen" : ""}`} role="alertdialog" aria-modal="true" aria-label={`${title} 발표 모드`}>
      <section className="book-presentation-modal">
        <header className="book-presentation-head">
          <div>
            <span>{audienceLabel}</span>
            <h2>{title}</h2>
          </div>
          <div className="book-presentation-meta">
            {item?.stepTitle && <em>{item.stepTitle}</em>}
            <b>{presentationKindLabel(kind)}</b>
            {positionLabel && <strong>{positionLabel}</strong>}
          </div>
          {onClose && (
            <button type="button" className="btn-ghost book-presentation-close" onClick={onClose} aria-label="발표 모드 닫기">
              닫기
            </button>
          )}
        </header>

        <div className="book-presentation-body">
          {href ? (
            <a className="book-presentation-url" href={href} target="_blank" rel="noopener noreferrer">
              {linkLabel || href}
            </a>
          ) : (
            <div className="book-presentation-url is-empty">제공 URL 없음</div>
          )}
          <article className={`book-presentation-content book-presentation-content--${kind}`}>
            <span>{kind === "resource" ? "자료 내용" : "활동 안내사항"}</span>
            <p>{content}</p>
          </article>
        </div>

        {canNavigate && (
          <footer className="book-presentation-foot">
            <button type="button" className="btn-outline" onClick={onPrevious}>이전</button>
            <button type="button" className="btn-primary" onClick={onNext}>다음</button>
          </footer>
        )}
      </section>
    </div>
  );
}
