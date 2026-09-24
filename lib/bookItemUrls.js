export function bookItemUrlHref(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
}

export function normalizeBookItemUrls(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw Object.assign(new Error("추가 URL 입력 내용을 확인해 주세요."), { code: "book-project/url-invalid" });
  }
  return value.flatMap((entry, index) => {
    if (typeof entry !== "string" || (entry.trim() && !bookItemUrlHref(entry))) {
      throw Object.assign(new Error(`${index + 1}번째 추가 URL에 올바른 웹 주소를 입력해 주세요.`), { code: "book-project/url-invalid" });
    }
    const trimmed = entry.trim();
    return trimmed ? [trimmed] : [];
  });
}
