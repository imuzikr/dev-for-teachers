"use client";

import { fillTemplate, templatePlainText, templateStringValues } from "@/lib/activityTemplate.mjs";
import { normalizeBookItemUrls } from "@/lib/bookItemUrls";
import useStudentAutosave from "./useStudentAutosave";

export function combineAutosaves(...saves) {
  const status = ["failed", "saving", "pending", "saved", "idle"].find((state) => saves.some((save) => save.status === state)) || "idle";
  return {
    status,
    error: saves.find((save) => save.error)?.error || "",
    async flush() {
      const results = await Promise.all(saves.map((save) => save.flush()));
      return results.every((result) => result !== false);
    },
  };
}

export default function useBookActivityDraft({ scope, detailItem, response, savedImages, savedUrls, savedTemplateValues, enabled, ready, imagesBusy, onSave }) {
  const content = useStudentAutosave({
    scope: `${scope}:content`, enabled, ready, paused: imagesBusy,
    value: { text: response || "", images: Array.isArray(savedImages) ? savedImages : [], templateValues: templateStringValues(savedTemplateValues) },
    onSave: (patch) => {
      const next = { ...patch };
      if (Object.hasOwn(patch, "templateValues")) {
        next.text = fillTemplate(templatePlainText(detailItem.source.content || ""), patch.templateValues);
      }
      return onSave(detailItem, next);
    },
  });
  const urls = useStudentAutosave({
    scope: `${scope}:urls`, enabled, ready,
    value: { urls: Array.isArray(savedUrls) && savedUrls.length ? savedUrls : [""] },
    onSave: (patch) => onSave(detailItem, { urls: normalizeBookItemUrls(patch.urls) }),
  });
  return {
    content,
    urls: { draft: urls.draft.urls, change: (value) => urls.change({ urls: value }), dirty: urls.dirty, error: urls.error, saving: false },
    autosave: combineAutosaves(content, urls),
  };
}
