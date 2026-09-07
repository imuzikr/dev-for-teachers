import assert from "node:assert/strict";
import test from "node:test";
import { fillTemplate, templateFields, templatePlainText } from "../lib/activityTemplate.mjs";

test("named fields retain order and deduplicate trimmed names", () => {
  assert.deepEqual(templateFields("{{이름}} {{ 이메일 }} {{이름}} {{깃허브 링크}}"), ["이름", "이메일", "깃허브 링크"]);
});

test("empty and multiline fields do not produce inputs", () => {
  assert.deepEqual(templateFields("{{}} {{ }} {{two\nlines}}"), []);
});

test("values replace every occurrence without recursive interpolation", () => {
  assert.equal(fillTemplate("{{이름}} / {{ 이름 }} / {{메일}}", { 이름: "$& <b>학생</b> {{메일}}", 메일: "a@b.c" }), "$& <b>학생</b> {{메일}} / $& <b>학생</b> {{메일}} / a@b.c");
});

test("missing values and inherited properties remain placeholders", () => {
  assert.equal(fillTemplate("{{이름}} {{constructor}} {{메일}}", { 이름: " ", 메일: "a@b.c" }), "{{이름}} {{constructor}} a@b.c");
});

test("plain text retains line breaks and literal angle brackets", () => {
  assert.equal(templatePlainText("a < b\n{{이름}}"), "a < b\n{{이름}}");
});
