"use client";

import { createContext, useEffect, useMemo, useRef, useState } from "react";
import { startBroadcast, stopBroadcast, subscribeBroadcast } from "@/lib/store";
import { safeDisplayHtml } from "@/lib/html";
import BookPresentationModal, { bookPresentationPayload } from "./BookPresentationModal";
import { safeBookImageUrl } from "./BookItemImages";

const defaultBroadcastClient = { startBroadcast, stopBroadcast, subscribeBroadcast };

export const BookImagePresentationContext = createContext(null);

function itemKey(item) {
  return `${item?.kind}:${item?.id}`;
}

function itemImages(item) {
  const source = item?.source ?? item ?? {};
  const doc = new DOMParser().parseFromString(safeDisplayHtml(source.content ?? ""), "text/html");
  const inline = [...doc.querySelectorAll("img")].map((img) => ({ src: safeBookImageUrl(img.getAttribute("src")), alt: img.getAttribute("alt") || "첨부 이미지" })).filter((img) => img.src);
  const attached = (Array.isArray(source.images) ? source.images : []).map(safeBookImageUrl).filter(Boolean).map((src, index) => ({ src, alt: `첨부 이미지 ${index + 1}` }));
  return { images: [...inline, ...attached], inlineCount: inline.length };
}

export function useBookPresentationMode({ isTeacher, classId, user, projectId, projectTitle, sections, broadcastClient = defaultBroadcastClient }) {
  const [target, setTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const retryRef = useRef(null);
  const openRef = useRef(false);
  const items = useMemo(() => sections.flatMap((section) => section.items), [sections]);
  const activeItem = target ? items.find((item) => itemKey(item) === target.key) ?? null : null;
  const stepItems = activeItem ? sections.find((section) => section.id === activeItem.stepId)?.items ?? items : [];
  const activeIndex = activeItem ? stepItems.findIndex((item) => itemKey(item) === itemKey(activeItem)) : -1;
  const image = target?.images?.[target.imageIndex];

  useEffect(() => { openRef.current = Boolean(activeItem); }, [activeItem]);
  useEffect(() => () => {
    if (openRef.current && classId) broadcastClient.stopBroadcast(classId).catch(() => {});
  }, [classId, broadcastClient]);
  useEffect(() => {
    if (!isTeacher || !classId) return undefined;
    return broadcastClient.subscribeBroadcast(classId, (broadcast) => {
      if (broadcast?.mode !== "bookItem" && !pending.current) setTarget(null);
    });
  }, [classId, isTeacher, broadcastClient]);

  async function present(item, nextTarget) {
    if (!isTeacher || !classId || !user?.uid || !item?.id || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    if (!target) setTarget(nextTarget);
    const currentStepItems = sections.find((section) => section.id === item.stepId)?.items ?? items;
    const itemIndex = Math.max(0, currentStepItems.findIndex((entry) => itemKey(entry) === itemKey(item)));
    const payload = bookPresentationPayload(item, { projectId, projectTitle, itemIndex, itemTotal: currentStepItems.length });
    const selectedImage = nextTarget.images?.[nextTarget.imageIndex];
    if (selectedImage) {
      Object.assign(payload, { imageUrl: selectedImage.src, imageAlt: selectedImage.alt, imageIndex: nextTarget.imageIndex, imageTotal: nextTarget.images.length, content: "", images: [] });
    }
    try {
      await broadcastClient.startBroadcast(user, classId, payload);
      setTarget(nextTarget);
    } catch {
      retryRef.current = () => present(item, nextTarget);
      setError("화면을 방송하지 못했어요. 다시 시도해 주세요.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function presentItem(item) { return present(item, { key: itemKey(item) }); }
  function presentImage(item, index, inline = false) {
    const { images, inlineCount } = itemImages(item);
    const imageIndex = index + (inline ? 0 : inlineCount);
    if (!images[imageIndex]) return;
    return present(item, { key: itemKey(item), images, imageIndex });
  }
  function move(delta) {
    if (!activeItem) return;
    if (image) {
      const imageIndex = (target.imageIndex + delta + target.images.length) % target.images.length;
      return present(activeItem, { ...target, imageIndex });
    }
    if (!stepItems.length) return;
    return presentItem(stepItems[(activeIndex + delta + stepItems.length) % stepItems.length]);
  }
  async function close() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      await broadcastClient.stopBroadcast(classId);
      setTarget(null);
      setError("");
    } catch { retryRef.current = close; setError("발표를 종료하지 못했어요. 다시 시도해 주세요."); }
    finally { pending.current = false; setBusy(false); }
  }

  return {
    presentItem,
    presentImage,
    modal: activeItem ? (
      <BookPresentationModal
        item={activeItem}
        image={image}
        positionLabel={image ? `이미지 ${target.imageIndex + 1} / ${target.images.length}` : `${activeIndex + 1} / ${stepItems.length}`}
        onPrevious={!image || target.images.length > 1 ? () => move(-1) : undefined}
        onNext={!image || target.images.length > 1 ? () => move(1) : undefined}
        onClose={close}
        busy={busy}
        error={error}
        onRetry={() => retryRef.current?.()}
        audienceLabel="발표 모드"
      />
    ) : null,
  };
}
