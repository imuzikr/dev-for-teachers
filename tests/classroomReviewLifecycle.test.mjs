import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as navigation from "../components/classroomLessonNavigation.mjs";

const require = createRequire(import.meta.url);
const { transform } = require("next/dist/build/swc");
const source = await readFile(new URL("../components/ClassroomLesson.jsx", import.meta.url), "utf8");
const compiled = await transform(source, {
  filename: "ClassroomLesson.jsx",
  jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } },
  module: { type: "commonjs" },
});
let currentPanel = null;
const emptyComponent = { __esModule: true, default: () => null };
const imports = {
  "./StudentActivityPanel": { useStudentActivityPanel: () => currentPanel },
  "./TeacherActivityDemo": emptyComponent,
  "./ClassroomOutline": emptyComponent,
  "./ClassroomLessonOverview": emptyComponent,
  "./classroomLessonNavigation.mjs": navigation,
};
const module = { exports: {} };
vm.runInNewContext(compiled.code, {
  module, exports: module.exports,
  require: name => name in imports ? imports[name] : require(name),
});
const ClassroomLesson = module.exports.default;
const base = {
  sections: [{ id: "current-step", title: "현재 STEP", items: [] }],
  selectedStepId: "current-step", isTeacher: true,
  user: { uid: "teacher" }, progressByUser: new Map(),
  renderDashboard: ({ participantsOnly }) => React.createElement("div", null, participantsOnly ? "참여자 기록" : "수업 도구"),
  sidebar: React.createElement("div", null, "읽기 전용 상세"),
};

test("entering teacher participant review immediately reveals the remounted review dashboard", () => {
  currentPanel = { readOnly: true };
  const html = renderToStaticMarkup(React.createElement(ClassroomLesson, base));
  assert.match(html, /class="classroom-participants-view"><div>참여자 기록/);
  assert.match(html, /class="classroom-student-detail"><div>읽기 전용 상세/);
});

test("ordinary teacher entry remains in lesson overview", () => {
  currentPanel = null;
  const html = renderToStaticMarkup(React.createElement(ClassroomLesson, base));
  assert.match(html, /class="classroom-source-cards" hidden=""/);
  assert.match(html, /aria-label="수업 순서 이동"/);
});
