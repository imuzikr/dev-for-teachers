import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

// Exercise the page's real initialization hooks, before its data subscriptions
// and JSX, with deliberately delayed class snapshots and browser storage.
const page = await readFile(new URL("../app/books/page.js", import.meta.url), "utf8");
const selectionHooks = page.slice(page.indexOf("function BooksPageInner()"), page.indexOf("  const currentClass ="))
  + "return { classId, select: setTeacherClassId }; }";

function harness(remembered = "second") {
  let stored = remembered, user = { uid: "teacher", role: "teacher" };
  let cursor = 0, changed = true, queued = [], output;
  const slots = [], writes = [], rendered = [], listeners = new Set();
  const subscriptions = [];
  function useState(initial) {
    const index = cursor++;
    slots[index] ??= { value: typeof initial === "function" ? initial() : initial };
    return [slots[index].value, value => {
      const next = typeof value === "function" ? value(slots[index].value) : value;
      if (!Object.is(next, slots[index].value)) { slots[index].value = next; changed = true; }
    }];
  }
  function useMemo(create, deps) {
    const index = cursor++;
    if (!slots[index] || deps.some((dep, i) => !Object.is(dep, slots[index].deps[i]))) slots[index] = { deps, value: create() };
    return slots[index].value;
  }
  function useEffect(effect, deps) {
    const index = cursor++;
    if (!slots[index] || deps.some((dep, i) => !Object.is(dep, slots[index].deps[i]))) {
      const previous = slots[index];
      slots[index] = { deps };
      queued.push(() => { previous?.cleanup?.(); slots[index].cleanup = effect(); });
    }
  }
  const context = vm.createContext({
    useState, useMemo, useEffect,
    useCurrentUser: () => user, useRequireAuth() {},
    isTeacher: value => value.role === "teacher", isAdmin: () => false,
    getSelectedClassId: () => stored, getSelectedClassPurpose: () => "training",
    setSelectedClassId: value => { stored = value; writes.push(value); listeners.forEach(sync => sync()); },
    getClassPurpose: value => value.purpose || "training",
    window: { addEventListener: (name, callback) => { if (name === "class-change") listeners.add(callback); }, removeEventListener: (_, callback) => listeners.delete(callback) },
    subscribeClasses: callback => { const subscription = { callback, active: true }; subscriptions.push(subscription); return () => { subscription.active = false; }; },
    subscribeUserDirectory: () => () => {},
    useVisibleClassMemberships: () => ({ memberships: [], resolvedClassIds: [], ready: true }),
    useAutomaticClassMembership() {},
  });
  vm.runInContext(selectionHooks, context);
  function flush() {
    for (let i = 0; changed; i++) {
      assert(i < 30, "Selection hooks must settle");
      changed = false; cursor = 0; queued = [];
      output = context.BooksPageInner(); rendered.push(output.classId);
      queued.forEach(run => run());
    }
  }
  flush();
  return {
    writes, rendered, get stored() { return stored; }, get selected() { return output.classId; },
    receive(items) { subscriptions.at(-1).callback(items); flush(); },
    switchUser() { user = { uid: "another-teacher", role: "teacher" }; changed = true; flush(); },
    select(id) { output.select(id); context.setSelectedClassId(id); flush(); },
  };
}

const classes = ["first", "second"].map(id => ({ id, createdBy: "teacher", archived: false, accessVersion: 2 }));

test("keeps remembered selection while classes load and restores it without showing the first class", () => {
  const state = harness();
  assert.equal(state.stored, "second");
  assert.equal(state.selected, null);
  assert.deepEqual(state.writes, []);
  state.receive(classes);
  assert.equal(state.selected, "second");
  assert(!state.rendered.includes("first"));
  assert.deepEqual(state.writes, []);
});

test("teacher selection survives a new page mount (refresh)", () => {
  const state = harness("first"); state.receive(classes); state.select("second");
  const refreshed = harness(state.stored); refreshed.receive(classes);
  assert.equal(refreshed.selected, "second");
});

test("missing, archived and inaccessible remembered classes fall back only after loading", () => {
  for (const remembered of [null, "removed", "archived", "other-owner"]) {
    const state = harness(remembered);
    assert.deepEqual(state.writes, []);
    state.receive([...classes, { id: "archived", createdBy: "teacher", archived: true }, { id: "other-owner", createdBy: "another-teacher" }]);
    assert.equal(state.selected, "first"); assert.equal(state.stored, "first");
  }
});

test("an actually empty class snapshot clears a stale selection", () => {
  const state = harness(); assert.equal(state.stored, "second");
  state.receive([]); assert.equal(state.selected, null); assert.equal(state.stored, null);
});

test("account switch waits for the new user's classes", () => {
  const state = harness(); state.receive(classes); state.switchUser();
  assert.equal(state.selected, null); assert.equal(state.stored, "second");
  state.receive([{ id: "new-class", createdBy: "another-teacher", archived: false }]);
  assert.equal(state.selected, "new-class"); assert.equal(state.stored, "new-class");
});
