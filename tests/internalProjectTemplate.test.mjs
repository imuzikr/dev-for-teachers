import assert from "node:assert/strict";
import test from "node:test";
import { createInternalProjectTemplate, initialBookProject } from "../lib/internalProjectTemplate.mjs";

test("internal projects contain five steps and six ordered, open answer activities", () => {
  const project = createInternalProjectTemplate();
  assert.deepEqual(project.steps.map(step => step.title), ["나의 고민은?", "한 번 들어보세요.", "프롬프트", "시제품", "짜잔!"]);
  assert.deepEqual(project.steps.map(step => step.activities.length), [1, 2, 1, 1, 1]);
  assert.deepEqual(project.steps[1].activities.map(item => item.title), ["나의 아이디어", "기능 설명"]);
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
