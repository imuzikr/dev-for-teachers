"use client";

import { useEffect, useRef } from "react";
import { resourceHref, resourceLinkLabel } from "./BookProjectPreview";
import RichTextDisplay from "./RichTextDisplay";

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
    return content || "등록된 내용이 없습니다.";
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
  const bodyRef = useRef(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0, left: 0 });
  }, [item?.id, kind]);

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
        </header>

        <div className="book-presentation-body" ref={bodyRef}>
          {href ? (
            <a className="book-presentation-url" href={href} target="_blank" rel="noopener noreferrer">
              {linkLabel || href}
            </a>
          ) : (
            <div className="book-presentation-url is-empty">제공 URL 없음</div>
          )}
          <article className={`book-presentation-content book-presentation-content--${kind}`}>
            {kind === "activity" && <span>활동 안내사항</span>}
            <RichTextDisplay className="book-presentation-rich" html={content} />
          </article>
        </div>

        {(canNavigate || onClose) && (
          <footer className={`book-presentation-foot${onClose ? " has-exit" : ""}${!canNavigate ? " is-exit-only" : ""}`}>
            {canNavigate && (
              <>
                <button type="button" className="btn-outline" onClick={onPrevious}>이전</button>
                <button type="button" className="btn-primary" onClick={onNext}>다음</button>
              </>
            )}
            {onClose && (
              <button type="button" className="btn-ghost book-presentation-close" onClick={onClose} aria-label="발표 종료">
                <span className="book-presentation-close-mark" aria-hidden="true" />
                <span>발표 종료</span>
              </button>
            )}
          </footer>
        )}
      </section>
    </div>
  );
}
