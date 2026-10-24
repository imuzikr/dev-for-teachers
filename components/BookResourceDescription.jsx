"use client";

import { stripHtml } from "@/lib/html";
import RichTextDisplay from "./RichTextDisplay";

export default function BookResourceDescription({ description = "" }) {
  if (!stripHtml(description)) return null;
  return <section className="book-resource-description" aria-label="교사 설명">
    <h4>교사 설명</h4>
    <RichTextDisplay className="book-resource-description-content" html={description} readOnly />
  </section>;
}
