import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../lib/lessonDownloads.js", import.meta.url), "utf8");
const { downloadLessonSelection } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

test("downloads selected originals without executing active content", async context => {
  const clicks = [], blobs = [], progress = [];
  context.mock.method(globalThis, "fetch", async url => new Response(url.endsWith("1") ? "<script>unsafe()</script>" : "second"));
  context.mock.method(URL, "createObjectURL", blob => { blobs.push(blob); return "blob:download"; });
  context.mock.method(globalThis, "setTimeout", () => 0);
  globalThis.document = { body: { append() {} }, createElement: () => ({ click() { clicks.push(this.download); }, remove() {} }) };
  try {
    await downloadLessonSelection([{ name: "example.html", downloadUrl: "https://example.test/1" }, { name: "example.txt", downloadUrl: "https://example.test/2" }], { onProgress: value => progress.push(value) });
    assert.deepEqual(clicks, ["example.html", "example.txt"]);
    assert.equal(blobs[0].type, "application/octet-stream");
    assert.equal(await blobs[0].text(), "<script>unsafe()</script>");
    assert.equal(await blobs[1].text(), "second");
    assert.equal(progress.length, 2);
  } finally { delete globalThis.document; }
});

test("rejects unsafe URLs, unavailable files, and cancelled downloads", async context => {
  await assert.rejects(downloadLessonSelection([{ downloadUrl: "javascript:alert(1)" }]), /올바르지/);
  context.mock.method(globalThis, "fetch", async () => new Response("missing", { status: 404 }));
  await assert.rejects(downloadLessonSelection([{ name: "missing.txt", downloadUrl: "https://example.test/missing" }]), /내려받지/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(downloadLessonSelection([{ downloadUrl: "https://example.test/file" }], { signal: controller.signal }), { name: "AbortError" });
});
