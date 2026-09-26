const DEFAULT_CHUNK_BYTES = 720 * 1024;
const MAX_CHUNKS = 40;

const encoder = new TextEncoder();

function encodedBytes(value) {
  return encoder.encode(value).byteLength;
}

function isHighSurrogate(value) {
  return value >= 0xd800 && value <= 0xdbff;
}

function isLowSurrogate(value) {
  return value >= 0xdc00 && value <= 0xdfff;
}

function safeSliceEnd(value, end) {
  if (end > 0 && end < value.length && isHighSurrogate(value.charCodeAt(end - 1)) && isLowSurrogate(value.charCodeAt(end))) {
    return end - 1;
  }
  return end;
}

function boundedSliceEnd(value, start, chunkBytes) {
  let low = start + 1;
  let high = Math.min(value.length, start + chunkBytes);
  let best = start;
  while (low <= high) {
    const rawMiddle = Math.floor((low + high) / 2);
    const middle = safeSliceEnd(value, rawMiddle);
    if (middle <= start) {
      low = rawMiddle + 1;
      continue;
    }
    const bytes = encodedBytes(value.slice(start, middle));
    if (bytes <= chunkBytes) {
      best = middle;
      low = rawMiddle + 1;
    } else {
      high = rawMiddle - 1;
    }
  }
  return best;
}

export function portfolioChunkDocId(sessionId, index) {
  return `${sessionId}_${index}`;
}

export function chunkPortfolioHtml(html, { sessionId, chunkBytes = DEFAULT_CHUNK_BYTES } = {}) {
  if (typeof html !== "string" || html.length === 0) {
    throw Object.assign(new Error("발표할 포트폴리오 HTML이 비어 있어요."), { code: "book-portfolio/empty-html" });
  }
  if (typeof sessionId !== "string" || !sessionId) {
    throw Object.assign(new Error("포트폴리오 발표 세션을 확인할 수 없어요."), { code: "book-portfolio/missing-session" });
  }
  const chunks = [];
  let start = 0;
  while (start < html.length) {
    const end = boundedSliceEnd(html, start, chunkBytes);
    if (end <= start) {
      throw Object.assign(new Error("포트폴리오 HTML을 안전한 크기로 나눌 수 없어요."), { code: "book-portfolio/chunk-too-small" });
    }
    const value = html.slice(start, end);
    chunks.push({ id: portfolioChunkDocId(sessionId, chunks.length), index: chunks.length, html: value, bytes: encodedBytes(value) });
    start = end;
  }
  if (chunks.length > MAX_CHUNKS) {
    throw Object.assign(new Error("포트폴리오 HTML이 너무 커요. 이미지를 줄인 뒤 다시 시도해 주세요."), { code: "book-portfolio/html-too-large" });
  }
  return chunks;
}

export function bookPortfolioBroadcastPayload({
  classId,
  projectId,
  participantUid,
  studentName,
  className,
  sessionId,
  startedBy,
  chunks,
}) {
  const totalBytes = chunks.reduce((sum, chunk) => sum + chunk.bytes, 0);
  return {
    classId,
    mode: "bookPortfolio",
    projectId,
    participantUid,
    studentName: studentName || "학생",
    className: className || "",
    startedBy,
    scrollSessionId: sessionId,
    portfolioSessionId: sessionId,
    portfolioChunkCount: chunks.length,
    portfolioChunkBytes: chunks.map((chunk) => chunk.bytes),
    portfolioChunkIds: chunks.map((chunk) => chunk.id),
    portfolioTotalBytes: totalBytes,
    scrollPosition: { ratio: 0, anchor: -1, offset: 0, sequence: 0 },
  };
}

export function reconstructPortfolioHtml(broadcast, chunks) {
  if (broadcast?.mode !== "bookPortfolio") {
    throw Object.assign(new Error("포트폴리오 발표가 아닙니다."), { code: "book-portfolio/not-active" });
  }
  const sessionId = broadcast.portfolioSessionId || broadcast.scrollSessionId;
  const expectedCount = Number(broadcast.portfolioChunkCount);
  if (!sessionId || !Number.isInteger(expectedCount) || expectedCount < 1) {
    throw Object.assign(new Error("포트폴리오 발표 정보가 올바르지 않아요."), { code: "book-portfolio/invalid-manifest" });
  }
  const byIndex = new Map();
  for (const chunk of chunks) {
    if (chunk?.sessionId !== sessionId || !Number.isInteger(chunk.index) || typeof chunk.html !== "string") continue;
    byIndex.set(chunk.index, chunk.html);
  }
  const ordered = [];
  for (let index = 0; index < expectedCount; index += 1) {
    if (!byIndex.has(index)) {
      throw Object.assign(new Error("포트폴리오 발표 자료 일부를 불러오지 못했어요."), { code: "book-portfolio/missing-chunk" });
    }
    ordered.push(byIndex.get(index));
  }
  return ordered.join("");
}
