import assert from "node:assert/strict";
import test from "node:test";
import { lessonPositions, lessonSelection } from "../components/classroomLessonNavigation.mjs";

const sections = [
  { id: "one", items: [{ id: "same", kind: "activity" }, { id: "same", kind: "resource" }] },
  { id: "empty", items: [] },
  { id: "three", items: [{ id: "last", kind: "activity" }] },
];

test("lesson navigation crosses STEP boundaries and includes empty STEP overview", () => {
  assert.deepEqual(lessonPositions(sections), [
    { stepId: "one", key: null },
    { stepId: "one", key: "activity:same" },
    { stepId: "one", key: "resource:same" },
    { stepId: "empty", key: null },
    { stepId: "three", key: null },
    { stepId: "three", key: "activity:last" },
  ]);
});

test("same item IDs in different kinds select distinct content", () => {
  const selected = lessonSelection(sections, "one", { stepId: "one", key: "resource:same" });
  assert.equal(selected.item.kind, "resource");
  assert.equal(selected.itemKey, "resource:same");
});

test("changing STEP does not leak previously selected content", () => {
  assert.equal(lessonSelection(sections, "three", { stepId: "one", key: "activity:same" }).item, null);
});

test("deleted items and empty projects fall back safely", () => {
  assert.equal(lessonSelection(sections, "one", { stepId: "one", key: "activity:deleted" }).itemKey, null);
  assert.equal(lessonSelection(sections, "deleted-step", null).section.id, "one");
  assert.deepEqual(lessonSelection([], null, null), { section: null, item: null, itemKey: null });
  assert.deepEqual(lessonPositions([]), []);
});
