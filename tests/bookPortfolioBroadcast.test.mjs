import assert from "node:assert/strict";
import test from "node:test";
import {
  bookPortfolioBroadcastPayload,
  chunkPortfolioHtml,
  reconstructPortfolioHtml,
} from "../lib/bookPortfolioBroadcastCore.js";

function manifest(sessionId, chunks) {
  return bookPortfolioBroadcastPayload({
    classId: "classA",
    projectId: "classA",
    participantUid: "studentA",
    studentName: "김학생",
    className: "1차시",
    sessionId,
    startedBy: "teacherA",
    chunks,
  });
}

test("portfolio chunks round-trip Korean and emoji without splitting characters", () => {
  const html = "<main>문제 정의🙂 해결 방안🚀 프롬프트</main>".repeat(8);
  const chunks = chunkPortfolioHtml(html, { sessionId: "s1", chunkBytes: 37 });

  assert.ok(chunks.length > 1);
  assert.equal(reconstructPortfolioHtml(manifest("s1", chunks), chunks.map((chunk) => ({ ...chunk, sessionId: "s1" }))), html);
});

test("portfolio chunks reconstruct reports larger than one MiB", () => {
  const html = `<article>${"가나다🙂prompt".repeat(90000)}</article>`;
  const chunks = chunkPortfolioHtml(html, { sessionId: "large" });

  assert.ok(chunks.reduce((sum, chunk) => sum + chunk.bytes, 0) > 1024 * 1024);
  assert.equal(reconstructPortfolioHtml(manifest("large", chunks), chunks.map((chunk) => ({ ...chunk, sessionId: "large" }))), html);
});

test("portfolio chunking rejects reports that exceed the bounded manifest", () => {
  assert.throws(
    () => chunkPortfolioHtml("x".repeat(41), { sessionId: "too-many", chunkBytes: 1 }),
    { code: "book-portfolio/html-too-large" }
  );
});

test("portfolio reconstruction fails when a published chunk is missing", () => {
  const chunks = chunkPortfolioHtml("abcdef", { sessionId: "missing", chunkBytes: 2 });

  assert.throws(
    () => reconstructPortfolioHtml(manifest("missing", chunks), chunks.slice(0, -1).map((chunk) => ({ ...chunk, sessionId: "missing" }))),
    { code: "book-portfolio/missing-chunk" }
  );
});
