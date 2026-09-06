"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { startBroadcast, stopBroadcast, subscribeBroadcast } from "@/lib/store";
import BookPresentationModal, { bookPresentationPayload } from "./BookPresentationModal";

function itemKey(item) {
  return `${item?.kind}:${item?.id}`;
}

export function useBookPresentationMode({
  isTeacher,
  classId,
  user,
  projectId,
  projectTitle,
  sections,
}) {
  const [target, setTarget] = useState(null);
  const openRef = useRef(false);
  const items = useMemo(() => sections.flatMap((section) => section.items), [sections]);
  const activeItem = target ? items.find((item) => itemKey(item) === target.key) ?? null : null;
  const stepItems = activeItem
    ? sections.find((section) => section.id === activeItem.stepId)?.items ?? items
    : [];
  const activeIndex = activeItem
    ? stepItems.findIndex((item) => itemKey(item) === itemKey(activeItem))
    : -1;

  useEffect(() => {
    openRef.current = Boolean(activeItem);
  }, [activeItem]);

  useEffect(() => () => {
    if (openRef.current && classId) stopBroadcast(classId).catch(() => {});
  }, [classId]);

  useEffect(() => {
    if (!isTeacher || !classId) return undefined;
    return subscribeBroadcast(classId, (broadcast) => {
      if (broadcast?.mode !== "bookItem") setTarget(null);
    });
  }, [classId, isTeacher]);

  async function presentItem(item) {
    if (!isTeacher || !classId || !user?.uid || !item?.id) return;
    const currentStepItems = sections.find((section) => section.id === item.stepId)?.items ?? items;
    const itemIndex = Math.max(0, currentStepItems.findIndex((entry) => itemKey(entry) === itemKey(item)));
    setTarget({ key: itemKey(item) });
    await startBroadcast(user, classId, bookPresentationPayload(item, {
      projectId,
      projectTitle,
      itemIndex,
      itemTotal: currentStepItems.length,
    }));
  }

  async function move(delta) {
    if (!activeItem || stepItems.length === 0) return;
    const nextIndex = (activeIndex + delta + stepItems.length) % stepItems.length;
    await presentItem(stepItems[nextIndex]);
  }

  async function close() {
    setTarget(null);
    if (classId) await stopBroadcast(classId);
  }

  return {
    presentItem,
    modal: activeItem ? (
      <BookPresentationModal
        item={activeItem}
        positionLabel={activeIndex >= 0 ? `${activeIndex + 1} / ${stepItems.length}` : ""}
        onPrevious={() => move(-1)}
        onNext={() => move(1)}
        onClose={close}
        audienceLabel="발표 모드"
      />
    ) : null,
  };
}
