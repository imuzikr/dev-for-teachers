import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const { transform } = require("next/dist/build/swc");
async function loadComponent(file, imports) {
  const source = await readFile(new URL(`../components/${file}`, import.meta.url), "utf8");
  const result = await transform(source, { filename: file, jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } });
  const module = { exports: {} };
  vm.runInNewContext(result.code, { module, exports: module.exports, require: (name) => name in imports ? imports[name] : require(name) });
  return module.exports.default;
}
const purpose = { getClassPurpose: (item) => item?.purpose ?? "training", getClassPurposeLabel: (value) => value === "internal" ? "교내용" : "연수용" };
const ClassroomCatalog = await loadComponent("ClassroomCatalog.jsx", { "@/lib/classPurpose": purpose, "./IconDeveloperRoom": { IconDeveloperRoom: () => null } });
const BooksHome = await loadComponent("BooksHome.jsx", {
  "@/lib/classPurpose": purpose, "@/lib/classroom": { setSelectedClassId: () => {} },
  "./ClassroomCatalog": { __esModule: true, default: ClassroomCatalog },
  "./BookClassroomTools": { __esModule: true, default: () => React.createElement("button", null, "클래스 관리") },
  "./BookWorkspace": { __esModule: true, default: () => React.createElement("div", null, "WORKSPACE") },
  "./ClassChangeModal": { __esModule: true, default: () => null }, "@/app/classroom-catalog.css": {},
});
const classrooms = [{ id: "mine", name: "내 클래스" }, { id: "other", name: "접근 불가 클래스" }, { id: "old", name: "보관된 클래스", archived: true }];
const base = { user: { uid: "student" }, classId: "mine", classes: classrooms, myClasses: [classrooms[0]], myClassesAll: classrooms, membershipIds: ["mine", "old"], displayedProject: null, currentClass: classrooms[0], classPurpose: "training", onJoinClass: () => {}, onSelectTeacherClass: () => {} };

test("student catalog only renders active membership classes and starts before workspace", () => {
  const html = renderToStaticMarkup(React.createElement(BooksHome, { ...base, admin: false }));
  assert.match(html, /내 클래스 클래스 열기/);
  assert.doesNotMatch(html, /접근 불가 클래스|보관된 클래스|WORKSPACE/);
  assert.match(html, /참여 코드로 클래스 참여/);
});
test("teacher catalog only renders the provided owned classes", () => {
  const html = renderToStaticMarkup(React.createElement(BooksHome, { ...base, admin: true }));
  assert.match(html, /내 클래스 클래스 열기/);
  assert.doesNotMatch(html, /접근 불가 클래스|보관된 클래스|WORKSPACE/);
  assert.match(html, /클래스 관리/);
});
test("empty student catalog retains join action and long class names are intact", () => {
  const empty = renderToStaticMarkup(React.createElement(ClassroomCatalog, { classes: [], onJoin: () => {}, classPurpose: "internal" }));
  assert.match(empty, /참여한 클래스가 없어요/);
  assert.match(empty, /클래스 참여하기/);
  assert.match(empty, /교내용/);
  const title = "아주 긴 클래스 이름 ".repeat(12);
  const html = renderToStaticMarkup(React.createElement(ClassroomCatalog, { classes: [{ id: "long", name: title }], disabled: true }));
  assert.ok(html.includes(title));
  assert.match(html, /disabled=""/);
});
