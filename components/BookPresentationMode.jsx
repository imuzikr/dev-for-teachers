"use client";

import { createContext, useEffect, useMemo, useRef, useState } from "react";
import { startBroadcast, stopBroadcast, subscribeBroadcast, updateBookBroadcastScroll } from "@/lib/store";
import { safeDisplayHtml } from "@/lib/html";
import BookPresentationModal, { bookPresentationPayload } from "./BookPresentationModal";
import { safeBookImageUrl } from "./BookItemImages";

const defaultBroadcastClient = { startBroadcast, stopBroadcast, subscribeBroadcast, updateBookBroadcastScroll };

export const BookImagePresentationContext = createContext(null);

function itemKey(item) {
  return `${item?.kind}:${item?.id}`;
}

function itemImages(item) {
  const source = item?.source ?? item ?? {};
  const doc = new DOMParser().parseFromString(safeDisplayHtml(source.content ?? ""), "text/html");
  const inline = [...doc.querySelectorAll("img")].map((img) => ({ src: safeBookImageUrl(img.getAttribute("src")), alt: img.getAttribute("alt") || "첨부 이미지" })).filter((img) => img.src);
  const attached = (Array.isArray(source.images) ? source.images : []).map((src, index) => ({
    src: safeBookImageUrl(src), alt: `첨부 이미지 ${index + 1}`,
    size: ["large", "medium", "small"].includes(source.imageSizes?.[index]) ? source.imageSizes[index] : "medium",
  })).filter((image) => image.src);
  doc.querySelectorAll("img").forEach((image) => image.remove());
  return { images: [...inline, ...attached], inlineCount: inline.length, textHtml: doc.body.innerHTML };
}

export function useBookPresentationMode({ isTeacher, classId, user, projectId, projectTitle, sections, broadcastClient = defaultBroadcastClient }) {
  const [target, setTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const retryRef = useRef(null);
  const openRef = useRef(false);
  const scrollTimer = useRef(null);
  const latestScroll = useRef(null);
  const scrollGeneration = useRef(0);
  useEffect(() => () => {
    clearTimeout(scrollTimer.current);
    scrollTimer.current = null;
    scrollGeneration.current += 1;
  }, [classId]);
  const items = useMemo(() => sections.flatMap((section) => section.items), [sections]);
  const activeItem = target ? items.find((item) => itemKey(item) === target.key) ?? null : null;
  const image = target?.images?.[target.slideIndex - 1];

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
    clearTimeout(scrollTimer.current);
    scrollTimer.current = null;
    scrollGeneration.current += 1;
    setBusy(true);
    setError("");
    if (!target) setTarget(nextTarget);
    const payload = bookPresentationPayload(item, { projectId, projectTitle, itemIndex: nextTarget.slideIndex, itemTotal: nextTarget.images.length + 1 });
    const scrollSessionId = crypto.randomUUID();
    Object.assign(payload, { content: nextTarget.textHtml, images: [], slideIndex: nextTarget.slideIndex, slideTotal: nextTarget.images.length + 1, scrollSessionId, scrollPosition: { ratio: 0, anchor: -1, offset: 0 } });
    const selectedImage = nextTarget.images[nextTarget.slideIndex - 1];
    if (selectedImage) {
      Object.assign(payload, { imageUrl: selectedImage.src, imageAlt: selectedImage.alt, imageSize: selectedImage.size ?? "medium", imageIndex: nextTarget.slideIndex - 1, imageTotal: nextTarget.images.length, content: "" });
    }
    try {
      await broadcastClient.startBroadcast(user, classId, payload);
      setTarget({ ...nextTarget, scrollSessionId });
    } catch {
      retryRef.current = () => present(item, nextTarget);
      setError("화면을 방송하지 못했어요. 다시 시도해 주세요.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function presentItem(item) {
    const { images, textHtml } = itemImages(item);
    return present(item, { key: itemKey(item), images, textHtml, slideIndex: 0 });
  }
  function presentImage(item, index, inline = false) {
    const { images, inlineCount, textHtml } = itemImages(item);
    const imageIndex = index + (inline ? 0 : inlineCount);
    if (!images[imageIndex]) return;
    return present(item, { key: itemKey(item), images, textHtml, slideIndex: imageIndex + 1 });
  }
  function move(delta) {
    if (!activeItem) return;
    const slideIndex = target.slideIndex + delta;
    if (slideIndex < 0 || slideIndex > target.images.length) return;
    return present(activeItem, { ...target, slideIndex });
  }
  async function close() {
    if (pending.current) return;
    pending.current = true;
    clearTimeout(scrollTimer.current);
    scrollTimer.current = null;
    scrollGeneration.current += 1;
    setBusy(true);
    try {
      await broadcastClient.stopBroadcast(classId);
      setTarget(null);
      setError("");
    } catch { retryRef.current = close; setError("발표를 종료하지 못했어요. 다시 시도해 주세요."); }
    finally { pending.current = false; setBusy(false); }
  }

  function broadcastScroll(position) {
    if (pending.current || !target?.scrollSessionId || !broadcastClient.updateBookBroadcastScroll) return;
    latestScroll.current = { ...position, sequence: Date.now() };
    if (scrollTimer.current !== null) return;
    const generation = scrollGeneration.current;
    const write = async () => {
      scrollTimer.current = null;
      if (generation !== scrollGeneration.current) return;
      try {
        await broadcastClient.updateBookBroadcastScroll(classId, target.scrollSessionId, latestScroll.current);
        if (generation === scrollGeneration.current) {
          setError("");
          retryRef.current = null;
        }
      } catch {
        if (generation !== scrollGeneration.current) return;
        retryRef.current = write;
        setError("스크롤 위치를 방송하지 못했어요. 다시 시도해 주세요.");
      }
    };
    scrollTimer.current = setTimeout(write, 180);
  }

  return {
    presentItem,
    presentImage,
    modal: activeItem ? (
      <BookPresentationModal
        item={{ ...activeItem, source: { ...(activeItem.source ?? activeItem), content: target.textHtml, images: [] } }}
        image={image}
        positionLabel={`${image ? "이미지" : "텍스트"} · ${target.slideIndex + 1} / ${target.images.length + 1}`}
        onPrevious={() => move(-1)}
        onNext={() => move(1)}
        previousDisabled={target.slideIndex === 0}
        nextDisabled={target.slideIndex === target.images.length}
        onClose={close}
        busy={busy}
        error={error}
        onRetry={() => retryRef.current?.()}
        audienceLabel="발표 모드"
        onScrollPosition={broadcastScroll}
        scrollSessionId={target.scrollSessionId}
      />
    ) : null,
  };
}
