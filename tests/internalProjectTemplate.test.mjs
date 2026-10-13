import assert from "node:assert/strict";
import test from "node:test";
import { createInternalProjectTemplate, initialBookProject, normalizeInternalProject, normalizeInternalActivity } from "../lib/internalProjectTemplate.mjs";

test("internal projects contain five steps and six ordered, open answer activities", () => {
  const project = createInternalProjectTemplate();
  assert.deepEqual(project.steps.map(step => step.title), ["내가 찾은 문제", "한 번 들어보세요.", "프롬프트", "MVP", "My Product"]);
  assert.deepEqual(project.steps.map(step => step.activities.length), [1, 2, 1, 1, 1]);
  assert.deepEqual(project.steps.flatMap(step => step.activities.map(item => item.title)), ["내가 찾은 문제", "이렇게 해결해요", "주요 기능 및 디자인", "프롬프트", "MVP", "My Product"]);
  for (const step of project.steps) {
    assert.deepEqual(step.resources, []);
    assert.deepEqual(step.itemOrder, step.activities.map(({ id }) => ({ kind: "activity", id })));
    for (const activity of step.activities) {
      assert.equal(activity.locked, false);
      assert.equal(activity.requiresAnswer, true);
    }
  }
  const final = project.steps[4].activities[0];
  assert.match(final.content, /캡처 이미지/);
  assert.match(final.content, /GitHub/);
  assert.match(final.content, /배포 URL/);
});

test("separate creations get independent IDs and mutable collections", () => {
  const first = createInternalProjectTemplate();
  const second = createInternalProjectTemplate();
  const ids = projects => projects.flatMap(project => project.steps.flatMap(step => [step.id, ...step.activities.map(item => item.id)]));
  assert.equal(new Set(ids([first, second])).size, 22);
  first.steps[0].activities[0].images.push("test");
  assert.deepEqual(second.steps[0].activities[0].images, []);
});

test("only new internal projects receive a template; existing projects are unchanged", () => {
  assert.equal(initialBookProject(null, "training"), null);
  assert.equal(initialBookProject(null, undefined), null);
  assert.equal(initialBookProject(null, "internal").steps.length, 5);
  const existing = { title: "Existing", steps: [] };
  assert.equal(initialBookProject(existing, "internal"), existing);
});

test("existing three-step internal projects receive requested titles without losing saved work", () => {
  const activity = (id, title) => ({ id, title, content: "<p>학생 안내</p>", urls: ["https://example.com"], images: ["image"], locked: true });
  const existing = { id: "saved-project", version: "saved-version", steps: [
    { id: "s1", title: "나의 고민은?", activities: [activity("a1", "나의 고민은?"), activity("a2", "나의 아이디어"), activity("a3", "기능 설명")], resources: [{ id: "r1", title: "기능 설명" }], itemOrder: [{ kind: "activity", id: "a1" }] },
    { id: "s2", title: "프롬프트", activities: [activity("a4", "프롬프트")], resources: [] },
    { id: "s3", title: "첫 딸깍", activities: [activity("a5", "첫 딸깍!"), activity("a6", "짜잔!")], resources: [] },
  ] };
  const before = structuredClone(existing);
  const updated = normalizeInternalProject(existing, "internal");
  assert.deepEqual(updated.steps.map(step => step.title), ["내가 찾은 문제", "프롬프트", "MVP"]);
  assert.deepEqual(updated.steps.flatMap(step => step.activities.map(item => item.title)), ["내가 찾은 문제", "이렇게 해결해요", "주요 기능 및 디자인", "프롬프트", "MVP", "My Product"]);
  assert.equal(updated.id, existing.id);
  assert.equal(updated.version, existing.version);
  assert.deepEqual(updated.steps.map(step => step.id), existing.steps.map(step => step.id));
  updated.steps.forEach((step, index) => {
    assert.equal(step.resources, existing.steps[index].resources);
    assert.equal(step.itemOrder, existing.steps[index].itemOrder);
    step.activities.forEach((item, itemIndex) => {
      const { title: oldTitle, ...oldData } = existing.steps[index].activities[itemIndex];
      const { title: newTitle, ...newData } = item;
      assert.deepEqual(newData, oldData);
    });
  });
  assert.deepEqual(existing, before);
  assert.equal(normalizeInternalProject(updated, "internal"), updated);
  assert.equal(normalizeInternalProject(existing, "training"), existing);
  assert.equal(normalizeInternalProject(null, "internal"), null);
  assert.equal(initialBookProject(existing, "internal").steps[0].title, "내가 찾은 문제");
});

test("live activity titles follow internal wording while custom titles and training stay intact", () => {
  const old = { id: "live", title: "기능 설명", dashboardText: "학생 답변" };
  assert.deepEqual(normalizeInternalActivity(old, "internal"), { ...old, title: "주요 기능 및 디자인" });
  assert.equal(normalizeInternalActivity(old, "training"), old);
  const custom = { id: "custom", title: "나의 아이디어 모음" };
  assert.equal(normalizeInternalActivity(custom, "internal"), custom);
});
