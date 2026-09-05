"use client";

import { bookConfirmationKey } from "@/lib/bookConfirmations";

export const STUDENT_PROGRESS_COLORS = [
  "#bb6d52",
  "#b89a2d",
  "#9ca83a",
  "#5f9e64",
  "#279779",
  "#2c96a5",
  "#347fa8",
  "#6d62af",
  "#9b65aa",
  "#b75c7c",
];

export function progressItems(sections) {
  return sections.flatMap((section, sectionIndex) => (
    section.items.map((item, itemIndex) => ({
      ...item,
      sectionId: section.id,
      sectionTitle: section.title,
      sectionIndex,
      itemIndex,
      key: bookConfirmationKey(item.kind, item.id),
    }))
  ));
}
