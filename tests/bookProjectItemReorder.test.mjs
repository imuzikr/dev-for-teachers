import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

async function loadHelper(name = "reorderBookProjectStepItem") {
  const context = vm.createContext({ console });
  const source = readFileSync(new URL("../components/bookProjectItems.js", import.meta.url), "utf8");
  const preview = new vm.SyntheticModule(["orderedStepItems"], function defineExports() {
    this.setExport("orderedStepItems", (step) => {
      const baseItems = [
        ...(step.activities ?? []).map((source) => ({ id: source.id, kind: "activity", title: source.title, source })),
        ...(step.resources ?? []).map((source) => ({ id: source.id, kind: "resource", title: source.title, source })),
      ];
      const byKey = new Map(baseItems.map((item) => [`${item.kind}:${item.id}`, item]));
      const seen = new Set();
      const ordered = (step.itemOrder ?? [])
        .map((entry) => {
          const key = `${entry?.kind}:${entry?.id}`;
          const item = byKey.get(key);
          if (!item || seen.has(key)) return null;
          seen.add(key);
          return item;
        })
        .filter(Boolean);
      return [...ordered, ...baseItems.filter((item) => !seen.has(`${item.kind}:${item.id}`))];
    });
  }, { context });
  const module = new vm.SourceTextModule(source, { context });
  await module.link((specifier) => {
    if (specifier !== "./BookProjectPreview") throw new Error(`Unexpected dependency: ${specifier}`);
    return preview;
  });
  await module.evaluate();
  return module.namespace[name];
}

test("conversion preserves content, images, URL and mixed ordering in both directions", async () => {
  const update = await loadHelper("updateBookProjectItem");
  const source = { id: "a", title: "Title", content: "<p>Content</p>", bookUrl: "https://example.com", images: ["image.png"], imageSizes: { "image.png": 50 } };
  const step = { activities: [source], resources: [{ id: "r", title: "Resource" }], itemOrder: [{kind: "activity", id: "a"}, {kind: "resource", id: "r"}] };
  const resourceStep = update(step, "activity", "a", { title: "Edited" }, "resource");
  assert.equal(resourceStep.activities.length, 0);
  assert.equal(resourceStep.resources[1].url, source.bookUrl);
  assert.equal(resourceStep.resources[1].content, source.content);
  assert.deepEqual(plain(resourceStep.resources[1].images), source.images);
  assert.deepEqual(plain(resourceStep.itemOrder), [{kind: "resource", id: "a"}, {kind: "resource", id: "r"}]);
  const activityStep = update(resourceStep, "resource", "a", {}, "activity");
  assert.equal(activityStep.activities[0].title, "Edited");
  assert.equal(activityStep.activities[0].bookUrl, source.bookUrl);
  assert.deepEqual(plain(activityStep.itemOrder), step.itemOrder);
  assert.equal(step.activities[0].title, "Title");
});

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test("converting a legacy locked activity opens the resulting resource", async () => {
  const update = await loadHelper("updateBookProjectItem");
  const step = { activities: [{ id: "locked", title: "Legacy", locked: true }], resources: [] };
  const converted = update(step, "activity", "locked", {}, "resource");
  assert.equal(converted.resources[0].locked, false);
  assert.equal(step.activities[0].locked, true);
  const reversed = update({ activities: [], resources: [{ id: "locked", title: "Legacy", locked: true }] }, "resource", "locked", {}, "activity");
  assert.equal(reversed.activities[0].locked, false);
});

function sampleStep() {
  return {
    id: "step-1",
    title: "첫 단계",
    activities: [
      { id: "shared", title: "같은 id 활동", content: "활동 본문" },
      { id: "a2", title: "두 번째 활동", locked: true },
    ],
    resources: [
      { id: "shared", title: "같은 id 자료", url: "https://example.com" },
    ],
    itemOrder: [
      { kind: "activity", id: "shared" },
      { kind: "resource", id: "shared" },
      { kind: "activity", id: "a2" },
    ],
  };
}

test("reorderBookProjectStepItem treats activity and resource with same id as distinct keys", async () => {
  const reorderBookProjectStepItem = await loadHelper();
  const step = sampleStep();
  const next = reorderBookProjectStepItem(step, { kind: "resource", id: "shared" }, -1);

  assert.notEqual(next, step);
  assert.deepEqual(plain(next.itemOrder), [
    { kind: "resource", id: "shared" },
    { kind: "activity", id: "shared" },
    { kind: "activity", id: "a2" },
  ]);
});

test("reorderBookProjectStepItem only changes itemOrder and preserves source arrays", async () => {
  const reorderBookProjectStepItem = await loadHelper();
  const step = sampleStep();
  const next = reorderBookProjectStepItem(step, { kind: "activity", id: "shared" }, 2);

  assert.equal(next.activities, step.activities);
  assert.equal(next.resources, step.resources);
  assert.deepEqual(next.activities, step.activities);
  assert.deepEqual(next.resources, step.resources);
  assert.deepEqual(plain(next.itemOrder), [
    { kind: "resource", id: "shared" },
    { kind: "activity", id: "a2" },
    { kind: "activity", id: "shared" },
  ]);
});

test("reorderBookProjectStepItem returns the same step for invalid or out-of-range moves", async () => {
  const reorderBookProjectStepItem = await loadHelper();
  const step = sampleStep();

  assert.equal(reorderBookProjectStepItem(step, { kind: "activity", id: "missing" }, 1), step);
  assert.equal(reorderBookProjectStepItem(step, { kind: "activity", id: "shared" }, -1), step);
  assert.equal(reorderBookProjectStepItem(step, { kind: "activity", id: "a2" }, 1), step);
  assert.equal(reorderBookProjectStepItem(step, { kind: "activity", id: "shared" }, { kind: "resource", id: "missing" }), step);
  assert.equal(reorderBookProjectStepItem(step, { kind: "activity", id: "shared" }, { kind: "activity", id: "shared" }), step);
});
