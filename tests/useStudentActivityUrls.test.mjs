import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const plain = value => JSON.parse(JSON.stringify(value));
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};

async function harness(overrides = {}) {
  let cursor = 0;
  let effects = [];
  let changed = false;
  const slots = [];
  const calls = [];
  const props = { urls: ["https://saved.test"], scope: "student-1:class-1:activity-1", enabled: true, ready: true,
    onSave: async urls => { calls.push(plain(urls)); }, ...overrides };
  const context = vm.createContext({ URL });
  const react = new vm.SyntheticModule(["useState", "useRef", "useEffect"], function exports() {
    this.setExport("useRef", initial => {
      const index = cursor++;
      slots[index] ??= { current: initial };
      return slots[index];
    });
    this.setExport("useState", initial => {
      const index = cursor++;
      slots[index] ??= { value: typeof initial === "function" ? initial() : initial };
      return [slots[index].value, value => {
        slots[index].value = typeof value === "function" ? value(slots[index].value) : value;
        changed = true;
      }];
    });
    this.setExport("useEffect", (effect, deps) => {
      const index = cursor++;
      if (!slots[index] || deps.some((dep, i) => dep !== slots[index][i])) {
        slots[index] = deps;
        effects.push(effect);
      }
    });
  }, { context });
  const urls = new vm.SourceTextModule(await readFile(new URL("../lib/bookItemUrls.js", import.meta.url), "utf8"), { context });
  await urls.link(() => { throw new Error("URL helper unexpectedly imports another module"); });
  const hook = new vm.SourceTextModule(await readFile(new URL("../components/useStudentActivityUrls.js", import.meta.url), "utf8"), { context });
  await hook.link(specifier => {
    if (specifier === "react") return react;
    assert.equal(specifier, "@/lib/bookItemUrls");
    return urls;
  });
  await hook.evaluate();
  function render(patch = {}) {
    Object.assign(props, patch);
    let result;
    let renders = 0;
    do {
      assert.ok(++renders < 10, "hook did not settle");
      cursor = 0;
      effects = [];
      changed = false;
      result = hook.namespace.default(props);
      effects.forEach(effect => effect());
    } while (changed);
    return result;
  }
  return { props, calls, render, initial: render() };
}

test("read-only and loading scopes cannot edit or write", async () => {
  for (const patch of [{ enabled: false }, { ready: false }]) {
    const h = await harness(patch);
    assert.equal(h.initial.change(["https://changed.test"]), false);
    assert.equal(await h.initial.save(), false);
    assert.deepEqual(plain(h.render().draft), ["https://saved.test"]);
    assert.deepEqual(h.calls, []);
  }
});

test("add, remove and clear preserve order and normalize blanks on successful save", async () => {
  const h = await harness();
  h.initial.change([" example.test/repo ", "", "https://example.test/app"]);
  assert.equal(h.render().dirty, true);
  assert.equal(await h.render().save(), true);
  assert.deepEqual(h.calls, [["example.test/repo", "https://example.test/app"]]);
  assert.deepEqual(plain(h.render().draft), h.calls[0]);
  assert.equal(h.render().dirty, false);
  h.render().change(["https://example.test/app"]);
  assert.equal(await h.render().save(), true);
  h.render().change([""]);
  assert.equal(await h.render().save(), true);
  assert.deepEqual(h.calls.at(-1), []);
  assert.deepEqual(plain(h.render().draft), []);
  assert.equal(h.render().dirty, false);
});

test("invalid URLs and malformed entries keep the draft with a Korean error and no write", async () => {
  for (const value of [["javascript:alert(1)"], ["https://invalid host"], [null]]) {
    const h = await harness();
    h.initial.change(value);
    assert.equal(await h.render().save(), false);
    assert.deepEqual(plain(h.render().draft), value);
    assert.match(h.render().error, /URL|주소/);
    assert.equal(h.render().saving, false);
    assert.deepEqual(h.calls, []);
    h.render().change(["https://fixed.test"]);
    assert.equal(h.render().error, "");
    assert.equal(await h.render().save(), true);
  }
});

test("false results and rejected writes retain the editable draft for retry", async () => {
  for (const fails of [() => false, () => { throw new Error("offline"); }]) {
    let fail = true;
    const h = await harness({ onSave: async () => fail ? fails() : true });
    h.initial.change(["https://draft.test"]);
    assert.equal(await h.render().save(), false);
    assert.deepEqual(plain(h.render().draft), ["https://draft.test"]);
    assert.match(h.render().error, /저장하지 못했어요/);
    assert.equal(h.render().dirty, true);
    assert.equal(h.render().saving, false);
    fail = false;
    assert.equal(await h.render().save(), true);
    assert.equal(h.render().error, "");
    assert.equal(h.render().dirty, false);
  }
});

test("synchronous duplicate saves invoke the writer once", async () => {
  const request = deferred();
  let count = 0;
  const h = await harness({ onSave: () => { count++; return request.promise; } });
  const save = h.initial.save;
  const pending = save();
  assert.equal(await save(), false);
  assert.equal(h.render().saving, true);
  assert.equal(await h.render().save(), false);
  request.resolve(true);
  assert.equal(await pending, true);
  assert.equal(count, 1);
  assert.equal(h.render().saving, false);
});

test("saved-prop reemissions never erase dirty edits but update clean drafts", async () => {
  const h = await harness();
  h.initial.change(["https://draft.test"]);
  assert.deepEqual(plain(h.render({ urls: ["https://saved.test"] }).draft), ["https://draft.test"]);
  assert.deepEqual(plain(h.render({ urls: ["https://other-device.test"] }).draft), ["https://draft.test"]);
  assert.equal(h.render().dirty, true);
  assert.equal(await h.render().save(), true);
  assert.deepEqual(plain(h.render({ urls: ["https://external.test"] }).draft), ["https://external.test"]);
  assert.equal(h.render().dirty, false);
});

test("a delayed snapshot of our save cannot overwrite newer local input", async () => {
  const h = await harness();
  h.initial.change(["https://first.test"]);
  assert.equal(await h.render().save(), true);
  h.render().change(["https://newer.test"]);
  const updated = h.render({ urls: ["https://first.test"] });
  assert.deepEqual(plain(updated.draft), ["https://newer.test"]);
  assert.equal(updated.dirty, true);
});

test("edits made during an outstanding write survive its normalization and success", async () => {
  const request = deferred();
  const h = await harness({ onSave: () => request.promise });
  h.initial.change([" first.test ", ""]);
  const pending = h.render().save();
  h.render().change(["https://newer.test"]);
  h.render({ urls: ["first.test"] });
  request.resolve(true);
  assert.equal(await pending, true);
  assert.deepEqual(plain(h.render().draft), ["https://newer.test"]);
  assert.equal(h.render().dirty, true);
});

test("changing student, class or activity scope resets draft/error and rejects captured callbacks", async () => {
  for (const scope of ["student-2:class-1:activity-1", "student-1:class-2:activity-1", "student-1:class-1:activity-2"]) {
    const h = await harness();
    h.initial.change(["javascript:alert(1)"]);
    const old = h.render();
    await old.save();
    const next = h.render({ scope, urls: ["https://next.test"] });
    assert.deepEqual(plain(next.draft), ["https://next.test"]);
    assert.equal(next.error, "");
    assert.equal(next.dirty, false);
    assert.equal(next.saving, false);
    assert.equal(old.change(["https://stale.test"]), false);
    assert.equal(await old.save(), false);
    assert.deepEqual(h.calls, []);
  }
});

test("returning to a prior scope does not revive an earlier callback", async () => {
  const h = await harness();
  const old = h.initial;
  h.render({ scope: "student-2:class-1:activity-1" });
  h.render({ scope: "student-1:class-1:activity-1" });
  assert.equal(old.change(["https://stale.test"]), false);
  assert.equal(await old.save(), false);
  assert.deepEqual(h.calls, []);
});

test("stale write success or failure cannot alter the next scope or its pending request", async () => {
  for (const failOld of [false, true]) {
    const oldRequest = deferred();
    const newRequest = deferred();
    const h = await harness({ onSave: () => oldRequest.promise });
    const oldPending = h.initial.save();
    const next = h.render({ scope: "student-2:class-1:activity-1", urls: ["https://next.test"], onSave: () => newRequest.promise });
    next.change(["https://next-draft.test"]);
    const newPending = h.render().save();
    if (failOld) oldRequest.reject(new Error("offline"));
    else oldRequest.resolve(true);
    assert.equal(await oldPending, false);
    assert.equal(h.render().saving, true);
    assert.equal(h.render().error, "");
    assert.deepEqual(plain(h.render().draft), ["https://next-draft.test"]);
    newRequest.resolve(true);
    assert.equal(await newPending, true);
    assert.equal(h.render().saving, false);
  }
});

test("revoking editing while a write is pending invalidates its result and old callbacks", async () => {
  const request = deferred();
  const h = await harness({ onSave: () => request.promise });
  const old = h.initial;
  old.change(["https://draft.test"]);
  const pending = h.render().save();
  assert.equal(h.render({ enabled: false }).saving, false);
  request.resolve(true);
  assert.equal(await pending, false);
  h.render({ enabled: true });
  assert.equal(await old.save(), false);
  assert.equal(old.change(["https://stale.test"]), false);
  assert.deepEqual(plain(h.render().draft), ["https://saved.test"]);
});

test("readiness guards existing callbacks and later data initializes a clean draft", async () => {
  const h = await harness({ ready: false, urls: undefined });
  const blocked = h.initial;
  assert.equal(await blocked.save(), false);
  const ready = h.render({ ready: true, urls: ["https://loaded.test"] });
  assert.deepEqual(plain(ready.draft), ["https://loaded.test"]);
  h.render({ ready: false });
  assert.equal(await ready.save(), false);
  assert.equal(ready.change(["https://stale.test"]), false);
  assert.deepEqual(h.calls, []);
});

test("the optional save callback receives normalized URLs instead of the default writer", async () => {
  const h = await harness();
  const combinedWrites = [];
  h.initial.change([" example.test/repo ", "", "https://example.test/app"]);
  assert.equal(await h.render().save(async urls => { combinedWrites.push(plain(urls)); }), true);
  assert.deepEqual(combinedWrites, [["example.test/repo", "https://example.test/app"]]);
  assert.deepEqual(h.calls, []);
  assert.equal(h.render().dirty, false);
});
