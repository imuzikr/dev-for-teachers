import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../lib/lessonDownloads.js", import.meta.url), "utf8");
const { downloadLessonSelection } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

test("opens original URLs without fetching bytes or changing shared blob URLs", async context => {
  const clicks = [], progress = [];
  let removed = 0;
  context.mock.method(globalThis, "fetch", () => { throw new Error("Downloads must not require CORS"); });
  context.mock.method(URL, "createObjectURL", () => { throw new Error("Must use the original URL"); });
  context.mock.method(URL, "revokeObjectURL", () => { throw new Error("Shared URLs belong to the distribution layer"); });
  globalThis.document = { body: { append() {} }, createElement: () => ({
    click() { clicks.push({ href: this.href, name: this.download, target: this.target, rel: this.rel }); },
    remove() { removed++; },
  }) };
  const files = [
    { name: "학습 자료.zip", downloadUrl: "https://example.test/o/lesson-files%2Fsample.zip?alt=media&token=test-token" },
    { name: "example.html", downloadUrl: "blob:https://example.test/shared-file" },
  ];
  try {
    for (const file of files) await downloadLessonSelection([file], { onProgress: value => progress.push(value) });
    assert.deepEqual(clicks, files.map(file => ({ href: file.downloadUrl, name: file.name, target: "_blank", rel: "noopener noreferrer" })));
    assert.equal(removed, files.length);
    assert.equal(progress.length, files.length);
  } finally { delete globalThis.document; }
});

test("rejects unsafe URLs and cancelled downloads before opening a link", async () => {
  for (const downloadUrl of ["javascript:alert(1)", "data:text/html,unsafe", "file:///sample.zip"]) {
    await assert.rejects(downloadLessonSelection([{ downloadUrl }]), /올바르지/);
  }
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(downloadLessonSelection([{ downloadUrl: "https://example.test/file" }], { signal: controller.signal }), { name: "AbortError" });
});

test("multiple remote files use separate sandboxed navigations without popups or CORS", async context => {
  const frames = [], cleanup = [];
  context.mock.method(globalThis, "fetch", () => { throw new Error("Must not fetch"); });
  context.mock.method(globalThis, "setTimeout", callback => cleanup.push(callback));
  globalThis.document = {
    body: { append(frame) { frames.push(frame); } },
    createElement(tag) { return { tag, setAttribute(name, value) { this[name] = value; }, remove() { this.removed = true; } }; },
  };
  context.after(() => { delete globalThis.document; });
  const files = [1, 2].map(id => ({ name: `file${id}.zip`, downloadUrl: `https://example.test/${id}` }));
  await downloadLessonSelection(files);
  assert.deepEqual(frames.map(frame => frame.src), files.map(file => file.downloadUrl));
  assert(frames.every(frame => frame.tag === "iframe" && frame.hidden && frame.sandbox === "allow-downloads"));
  cleanup.forEach(callback => callback());
  assert(frames.every(frame => frame.removed));
});

test("removes the temporary anchor even when starting a download fails", async context => {
  let removed = false;
  globalThis.document = { body: { append() {} }, createElement: () => ({
    click() { throw new Error("navigation failed"); }, remove() { removed = true; },
  }) };
  context.after(() => { delete globalThis.document; });
  await assert.rejects(downloadLessonSelection([{ downloadUrl: "https://example.test/file" }]), /navigation failed/);
  assert.equal(removed, true);
});
