import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source = await readFile(new URL("../lib/lessonFilePolicy.js", import.meta.url), "utf8");
const { validateLessonFile, lessonFileDisposition, LESSON_FILE_EXTENSIONS, LESSON_FILE_MAX_BYTES } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

test("all distribution formats accept uppercase extensions and absent MIME types", () => {
  for (const extension of LESSON_FILE_EXTENSIONS) assert.equal(validateLessonFile({ name: `수업 자료.${extension.toUpperCase()}`, size: 16, type: "" }), extension);
});
test("rejects unsupported, empty, excessive and malformed files", () => {
  for (const file of [{ name: "bad.exe", size: 10 }, { name: "empty.txt", size: 0 }, { name: "large.zip", size: LESSON_FILE_MAX_BYTES + 1 }, { name: "a\r\nb.txt", size: 10 }]) assert.throws(() => validateLessonFile(file));
  assert.equal(validateLessonFile({ name: "limit.zip", size: LESSON_FILE_MAX_BYTES }), "zip");
});
test("download disposition encodes Korean and header delimiters", () => {
  assert.match(lessonFileDisposition("한글 자료.html"), /^attachment; filename\*=UTF-8''%/);
  assert(!lessonFileDisposition("'a;\r\nb.html").includes("\r"));
});
