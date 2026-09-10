import assert from "node:assert/strict";
import test from "node:test";
import { latestUnlockedPanelItem, studentPanelLockState } from "../components/studentPanelAutoOpen.js";

function item(kind, id, locked, stepId) {
  return { kind, id, stepId, source: { locked } };
}

function section(id, items) {
  return { id, items };
}

test("initial unlocked items do not request a student panel auto-open", () => {
  const sections = [section("step-1", [item("activity", "a1", false, "step-1")])];

  assert.equal(latestUnlockedPanelItem(null, sections), null);
});

test("a live locked to unlocked transition selects that item and step", () => {
  const before = [section("step-1", [item("activity", "a1", true, "step-1")])];
  const after = [section("step-1", [item("activity", "a1", false, "step-1")])];

  assert.deepEqual(latestUnlockedPanelItem(studentPanelLockState(before), after), {
    key: "activity:a1",
    stepId: "step-1",
  });
});

test("a live activity unlock is detected by activity key", () => {
  const before = [section("step-3", [item("activity", "a2", true, "step-3")])];
  const after = [section("step-3", [item("activity", "a2", false, "step-3")])];

  assert.deepEqual(latestUnlockedPanelItem(studentPanelLockState(before), after), {
    key: "activity:a2",
    stepId: "step-3",
  });
});

test("simultaneous unlocks choose the last item in deterministic project order", () => {
  const before = [
    section("step-1", [item("activity", "a1", true, "step-1")]),
    section("step-2", [item("resource", "r1", true, "step-2"), item("activity", "a2", true, "step-2")]),
  ];
  const after = [
    section("step-1", [item("activity", "a1", false, "step-1")]),
    section("step-2", [item("resource", "r1", false, "step-2"), item("activity", "a2", false, "step-2")]),
  ];

  assert.deepEqual(latestUnlockedPanelItem(studentPanelLockState(before), after), {
    key: "activity:a2",
    stepId: "step-2",
  });
});

test("items that stay unlocked or become locked do not request an auto-open", () => {
  const before = [
    section("step-1", [item("activity", "a1", false, "step-1"), item("resource", "r1", false, "step-1")]),
  ];
  const after = [
    section("step-1", [item("activity", "a1", false, "step-1"), item("resource", "r1", true, "step-1")]),
  ];

  assert.equal(latestUnlockedPanelItem(studentPanelLockState(before), after), null);
});
