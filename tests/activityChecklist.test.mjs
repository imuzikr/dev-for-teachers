import assert from "node:assert/strict";
import test from "node:test";
import { checklistComplete, checklistSnapshot, checklistVersion, currentChecklistConfirmation } from "../lib/activityChecklist.js";

test("partial and empty selections do not complete a checklist", () => {
  assert.equal(checklistComplete([false, false]), false);
  assert.equal(checklistComplete([true, false]), false);
  assert.equal(checklistComplete([true, true]), true);
  assert.equal(checklistComplete([]), true);
});

test("explicit unchecks override checked template defaults", () => {
  assert.deepEqual(checklistSnapshot([true, false], { 0: false, 1: true }), [false, true]);
  assert.deepEqual(checklistSnapshot([true, false], {}), [true, false]);
});

test("changed instructions invalidate previous checkbox positions", () => {
  assert.equal(checklistVersion("설명"), checklistVersion("설명"));
  assert.notEqual(checklistVersion("설명"), checklistVersion("새 설명"));
});

test("teacher progress excludes outdated and incomplete checklist confirmations", () => {
  const record = { confirmed: true, checklistVersion: checklistVersion("original"), checklistValues: [true, true] };
  assert.equal(currentChecklistConfirmation(record, "original", 2), true);
  assert.equal(currentChecklistConfirmation(record, "edited", 2), false);
  assert.equal(currentChecklistConfirmation({ ...record, checklistValues: [true, false] }, "original", 2), false);
  assert.equal(currentChecklistConfirmation({ ...record, confirmed: false }, "original", 2), false);
  assert.equal(currentChecklistConfirmation({ confirmed: true }, "legacy plain text", 0), true);
  assert.equal(currentChecklistConfirmation({ confirmed: true }, '<ul class="rte-checklist"><li>Check</li></ul>', 2), false);
  assert.equal(currentChecklistConfirmation({ ...record, checklistValues: [] }, "original", 2), false);
  assert.equal(currentChecklistConfirmation({ ...record, checklistValues: [true] }, "original", 2), false);
  assert.equal(currentChecklistConfirmation({ ...record, checklistValues: [] }, "original", 0), true);
});
