import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function createTimers() {
  let id = 0;
  let now = 0;
  const timers = new Map();
  return {
    setTimeout(fn, delay) {
      id += 1;
      timers.set(id, { fn, at: now + delay });
      return id;
    },
    clearTimeout(timerId) {
      timers.delete(timerId);
    },
    async tick(ms) {
      now += ms;
      let ran = true;
      while (ran) {
        ran = false;
        for (const [timerId, timer] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
          if (timer.at <= now) {
            timers.delete(timerId);
            timer.fn();
            ran = true;
          }
        }
        await Promise.resolve();
      }
    },
    count() {
      return timers.size;
    },
  };
}

function createStorage() {
  const store = new Map();
  return {
    getItem: (key) => store.has(key) ? store.get(key) : null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    snapshot: () => Object.fromEntries(store),
  };
}

function sameDeps(a, b) {
  return Boolean(a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index])));
}

function createHookRunner(hook, initialProps, setDispatcher, contextWindow = { listeners: new Map() }) {
  const slots = [];
  let props = initialProps;
  let hookIndex = 0;
  let effectIndex = 0;
  let pendingEffects = [];
  let output;
  const cleanups = [];

  const dispatcher = {
    useCallback: (fn, deps) => dispatcher.useMemo(() => fn, deps),
    useMemo: (factory, deps) => {
      const index = hookIndex++;
      const slot = slots[index];
      if (slot && sameDeps(slot.deps, deps)) return slot.value;
      const value = factory();
      slots[index] = { deps, value };
      return value;
    },
    useRef: (initial) => {
      const index = hookIndex++;
      if (!slots[index]) slots[index] = { current: initial };
      return slots[index];
    },
    useState: (initial) => {
      const index = hookIndex++;
      if (!slots[index]) slots[index] = { value: typeof initial === "function" ? initial() : initial };
      const setState = (next) => {
        const value = typeof next === "function" ? next(slots[index].value) : next;
        slots[index].value = value;
      };
      return [slots[index].value, setState];
    },
    useEffect: (effect, deps) => {
      const index = effectIndex++;
      const slot = cleanups[index];
      if (slot && sameDeps(slot.deps, deps)) return;
      pendingEffects.push({ index, effect, deps });
    },
  };

  function render(nextProps = props) {
    setDispatcher(dispatcher);
    props = nextProps;
    hookIndex = 0;
    effectIndex = 0;
    pendingEffects = [];
    output = hook(props);
    for (const pending of pendingEffects) {
      const previous = cleanups[pending.index];
      if (typeof previous?.cleanup === "function") previous.cleanup();
      const cleanup = pending.effect();
      cleanups[pending.index] = { deps: pending.deps, cleanup };
    }
    return output;
  }

  function unmount() {
    for (const slot of cleanups) {
      if (typeof slot?.cleanup === "function") slot.cleanup();
    }
    contextWindow.listeners.clear();
  }

  render();
  return { render, unmount, get output() { return output; } };
}

async function loadHook(storage = createStorage()) {
  const timers = createTimers();
  const listeners = new Map();
  const contextWindow = {
    localStorage: storage,
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type, handler) {
      if (listeners.get(type) === handler) listeners.delete(type);
    },
    listeners,
  };
  const registered = new Map();
  const context = vm.createContext({
    console,
    Date,
    Error,
    JSON,
    Math,
    Promise,
    Set,
    window: contextWindow,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  });
  let currentDispatcher = null;
  context.__setDispatcher = (dispatcher) => { currentDispatcher = dispatcher; };
  const reactExports = {
    useCallback: (...args) => currentDispatcher.useCallback(...args),
    useEffect: (...args) => currentDispatcher.useEffect(...args),
    useMemo: (...args) => currentDispatcher.useMemo(...args),
    useRef: (...args) => currentDispatcher.useRef(...args),
    useState: (...args) => currentDispatcher.useState(...args),
  };
  const reactModule = new vm.SyntheticModule(Object.keys(reactExports), function () {
    for (const [name, value] of Object.entries(reactExports)) this.setExport(name, value);
  }, { context });
  const libModule = new vm.SyntheticModule(["registerStudentAutosaveFlush"], function () {
    this.setExport("registerStudentAutosaveFlush", (id, flush) => {
      registered.set(id, flush);
      return () => {
        if (registered.get(id) === flush) registered.delete(id);
      };
    });
  }, { context });
  const source = readFileSync(new URL("../components/useStudentAutosave.js", import.meta.url), "utf8");
  const module = new vm.SourceTextModule(source, { context });
  await module.link((specifier) => {
    if (specifier === "react") return reactModule;
    if (specifier === "@/lib/studentAutosave") return libModule;
    throw new Error(`Unexpected import: ${specifier}`);
  });
  await reactModule.evaluate();
  await libModule.evaluate();
  await module.evaluate();
  return { hook: module.namespace.default, timers, storage, window: contextWindow, registered, setDispatcher: context.__setDispatcher };
}

async function loadRegistry() {
  const context = vm.createContext({ Promise });
  const source = readFileSync(new URL("../lib/studentAutosave.js", import.meta.url), "utf8");
  const module = new vm.SourceTextModule(source, { context });
  await module.link(() => {});
  await module.evaluate();
  return module.namespace;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test("debounces a dirty patch and never saves the initial value", async () => {
  const { hook, timers, setDispatcher } = await loadHook();
  const saves = [];
  const runner = createHookRunner(hook, {
    scope: "class-a/student-a/activity-a",
    value: { text: "", urls: [] },
    enabled: true,
    onSave: async (patch) => saves.push(patch),
  }, setDispatcher);

  assert.equal(runner.output.status, "idle");
  await timers.tick(1000);
  assert.deepEqual(saves, []);

  runner.output.change({ text: "초안" });
  runner.render();
  assert.equal(runner.output.status, "pending");
  await timers.tick(699);
  assert.deepEqual(saves, []);
  await timers.tick(1);
  await Promise.resolve();
  runner.render();

  assert.deepEqual(plain(saves), [{ text: "초안" }]);
  assert.equal(runner.output.status, "saved");
  assert.equal(runner.output.dirty, false);
});

test("keeps newer typing dirty while an older save is still pending", async () => {
  const { hook, timers, setDispatcher } = await loadHook();
  const first = deferred();
  const saves = [];
  const runner = createHookRunner(hook, {
    scope: "class-a/student-a/activity-a",
    value: { text: "" },
    enabled: true,
    onSave: (patch) => {
      saves.push(patch);
      return saves.length === 1 ? first.promise : Promise.resolve(true);
    },
  }, setDispatcher);

  runner.output.change({ text: "첫 입력" });
  runner.render();
  await timers.tick(700);
  runner.output.change({ text: "최신 입력" });
  runner.render();
  first.resolve(true);
  await first.promise;
  await Promise.resolve();
  runner.render();

  assert.equal(runner.output.draft.text, "최신 입력");
  assert.equal(runner.output.status, "saving");

  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  runner.render();
  runner.render();
  assert.deepEqual(plain(saves), [{ text: "첫 입력" }, { text: "최신 입력" }]);
  assert.equal(runner.output.dirty, false);
});

test("manual flush drains edits typed during the first save before reporting success", async () => {
  const { hook, setDispatcher } = await loadHook();
  const first = deferred();
  const saves = [];
  const runner = createHookRunner(hook, {
    scope: "class-a/student-a/activity-a",
    value: { text: "" },
    enabled: true,
    onSave: (patch) => {
      saves.push(patch);
      return saves.length === 1 ? first.promise : Promise.resolve(true);
    },
  }, setDispatcher);

  runner.output.change({ text: "첫 입력" });
  runner.render();
  const flushed = runner.output.flush();
  await Promise.resolve();
  runner.output.change({ text: "flush 중 최신 입력" });
  runner.render();
  first.resolve(true);

  assert.equal(await flushed, true);
  runner.render();
  assert.deepEqual(plain(saves), [{ text: "첫 입력" }, { text: "flush 중 최신 입력" }]);
  assert.equal(runner.output.dirty, false);
});

test("source echo updates clean fields without replacing local dirty fields", async () => {
  const { hook, setDispatcher } = await loadHook();
  const runner = createHookRunner(hook, {
    scope: "scope-a",
    value: { text: "서버", urls: ["one"] },
    enabled: true,
    onSave: async () => true,
  }, setDispatcher);

  runner.output.change({ text: "로컬" });
  runner.render({
    scope: "scope-a",
    value: { text: "서버 반영", urls: ["two"] },
    enabled: true,
    onSave: async () => true,
  });
  runner.render();

  assert.deepEqual(plain(runner.output.draft), { text: "로컬", urls: ["two"] });
  assert.equal(runner.output.dirty, true);
});

test("failure is cached and flush retries the same dirty patch", async () => {
  const storage = createStorage();
  const { hook, timers, setDispatcher } = await loadHook(storage);
  let attempts = 0;
  const runner = createHookRunner(hook, {
    scope: "scope-a",
    value: { text: "" },
    enabled: true,
    onSave: async (patch) => {
      attempts += 1;
      if (attempts === 1) throw new Error("network");
      assert.deepEqual(plain(patch), { text: "다시" });
      return true;
    },
  }, setDispatcher);

  runner.output.change({ text: "다시" });
  runner.render();
  await timers.tick(700);
  await Promise.resolve();
  runner.render();
  assert.equal(runner.output.status, "failed");
  assert.equal(runner.output.error, "network");
  assert.match(Object.keys(storage.snapshot())[0], /^student-autosave:/);

  await Promise.resolve();
  await runner.output.flush();
  runner.render();
  runner.render();
  assert.equal(attempts, 2);
  assert.equal(runner.output.status, "saved");
  assert.deepEqual(storage.snapshot(), {});
});

test("cached drafts restore only for their own scope", async () => {
  const storage = createStorage();
  const first = await loadHook(storage);
  const runner = createHookRunner(first.hook, {
    scope: "scope-a",
    value: { text: "server-a", urls: ["server"] },
    enabled: true,
    paused: true,
    onSave: async () => true,
  }, first.setDispatcher);
  runner.output.change({ text: "cached-a" });
  runner.render();
  runner.unmount();

  const second = await loadHook(storage);
  const restored = createHookRunner(second.hook, {
    scope: "scope-a",
    value: { text: "server-a2", urls: ["fresh"] },
    enabled: true,
    onSave: async () => true,
  }, second.setDispatcher);
  assert.deepEqual(plain(restored.output.draft), { text: "cached-a", urls: ["fresh"] });

  const other = createHookRunner(second.hook, {
    scope: "scope-b",
    value: { text: "server-b" },
    enabled: true,
    onSave: async () => true,
  }, second.setDispatcher);
  assert.deepEqual(plain(other.output.draft), { text: "server-b" });
});

test("ready=false preserves pending cache until the hook can load that scope", async () => {
  const storage = createStorage();
  const first = await loadHook(storage);
  const runner = createHookRunner(first.hook, {
    scope: "scope-a",
    value: { text: "server-a" },
    enabled: true,
    paused: true,
    onSave: async () => true,
  }, first.setDispatcher);
  runner.output.change({ text: "cached-a" });
  runner.render();
  runner.unmount();

  const second = await loadHook(storage);
  const waiting = createHookRunner(second.hook, {
    scope: "scope-a",
    value: { text: "" },
    enabled: true,
    ready: false,
    onSave: async () => true,
  }, second.setDispatcher);
  assert.notDeepEqual(storage.snapshot(), {});

  waiting.render({
    scope: "scope-a",
    value: { text: "server-loaded" },
    enabled: true,
    ready: true,
    onSave: async () => true,
  });
  waiting.render();
  assert.equal(waiting.output.draft.text, "cached-a");
});

test("old scope acknowledgements do not mutate the new scope draft or cache", async () => {
  const storage = createStorage();
  const { hook, setDispatcher } = await loadHook(storage);
  const oldSave = deferred();
  const saves = [];
  const runner = createHookRunner(hook, {
    scope: "scope-old",
    value: { text: "" },
    enabled: true,
    onSave: (patch) => {
      saves.push(["old", patch]);
      return oldSave.promise;
    },
  }, setDispatcher);

  runner.output.change({ text: "old draft" });
  runner.render();
  const flushed = runner.output.flush();
  runner.render({
    scope: "scope-new",
    value: { text: "new server" },
    enabled: true,
    onSave: async (patch) => {
      saves.push(["new", patch]);
      return true;
    },
  });
  runner.output.change({ text: "new draft" });
  runner.render();
  oldSave.resolve(true);

  assert.equal(await flushed, true);
  runner.render();
  assert.equal(runner.output.draft.text, "new draft");
  assert.equal(runner.output.dirty, true);
  assert.deepEqual(plain(saves), [["old", { text: "old draft" }]]);
  assert.equal(Object.keys(storage.snapshot()).some((key) => key.includes("scope-new")), true);
});

test("disabled hooks do not save and unmount flushes the captured dirty scope", async () => {
  const { hook, timers, setDispatcher } = await loadHook();
  const saves = [];
  const disabled = createHookRunner(hook, {
    scope: "scope-disabled",
    value: { text: "" },
    enabled: false,
    onSave: async (patch) => saves.push(["disabled", patch]),
  }, setDispatcher);
  disabled.output.change({ text: "nope" });
  disabled.render();
  await timers.tick(1000);
  assert.deepEqual(saves, []);

  const runner = createHookRunner(hook, {
    scope: "scope-live",
    value: { text: "" },
    enabled: true,
    onSave: async (patch) => saves.push(["live", patch]),
  }, setDispatcher);
  runner.output.change({ text: "before close" });
  runner.render();
  runner.unmount();
  await Promise.resolve();
  assert.deepEqual(plain(saves), [["live", { text: "before close" }]]);
});

test("registered flushers all run even if one throws synchronously", async () => {
  const { registerStudentAutosaveFlush, flushStudentAutosaves } = await loadRegistry();
  const calls = [];
  registerStudentAutosaveFlush("throws", () => {
    calls.push("throws");
    throw new Error("boom");
  });
  registerStudentAutosaveFlush("runs", async () => {
    calls.push("runs");
    return true;
  });

  assert.equal(await flushStudentAutosaves(), false);
  assert.deepEqual(calls, ["throws", "runs"]);
});

test("success snapshots cannot remove a second template field edited during the first save", async () => {
  const { hook, setDispatcher } = await loadHook();
  let release;
  const sent = [];
  const props = { scope: "template-race", value: { templateValues: {} }, enabled: true,
    onSave: async patch => { sent.push(plain(patch)); if (sent.length === 1) await new Promise(resolve => { release = resolve; }); } };
  const runner = createHookRunner(hook, props, setDispatcher);
  runner.output.change({ templateValues: { problem: "문제" } });
  runner.render();
  const pending = runner.output.flush();
  await Promise.resolve();
  runner.output.change({ templateValues: { problem: "문제", solution: "해결" } });
  runner.render({ ...props, value: { templateValues: { problem: "문제" } } });
  release();
  assert.equal(await pending, true);
  assert.deepEqual(sent.at(-1), { templateValues: { problem: "문제", solution: "해결" } });
  runner.render({ ...props, value: { templateValues: { problem: "문제" } } });
  assert.deepEqual(plain(runner.output.draft.templateValues), { problem: "문제", solution: "해결" });
});

test("synchronous URL validation failure can retry after correction without blocking other fields", async () => {
  const { hook, setDispatcher } = await loadHook();
  const sent = [];
  const props = { scope: "sync-retry", value: { urls: [""] }, enabled: true,
    onSave: patch => { if (patch.urls[0] === "invalid") throw new Error("URL 확인"); sent.push(plain(patch)); return true; } };
  const runner = createHookRunner(hook, props, setDispatcher);
  runner.output.change({ urls: ["invalid"] });
  assert.equal(await runner.output.flush(), false);
  runner.output.change({ urls: ["https://example.com"] });
  assert.equal(await runner.output.flush(), true);
  assert.deepEqual(sent, [{ urls: ["https://example.com"] }]);
});

test("paused image work resumes autosave after processing ends", async () => {
  const { hook, setDispatcher, timers } = await loadHook();
  const sent = [];
  const props = { scope: "image-pause", value: { images: [] }, enabled: true, paused: true, onSave: async patch => sent.push(plain(patch)) };
  const runner = createHookRunner(hook, props, setDispatcher);
  runner.output.change({ images: ["image"] });
  await timers.tick(800);
  assert.equal(sent.length, 0);
  assert.equal(await runner.output.flush(), false);
  runner.render({ ...props, paused: false });
  await timers.tick(800);
  assert.deepEqual(sent, [{ images: ["image"] }]);
});

test("reopening the same scope drains its old request before saving the newest draft", async () => {
  const { hook, setDispatcher, storage } = await loadHook();
  let release;
  const sent = [];
  const props = { scope: "reopen-race", value: { text: "" }, enabled: true, onSave: async patch => {
    sent.push(plain(patch));
    if (sent.length === 1) await new Promise(resolve => { release = resolve; });
  } };
  const first = createHookRunner(hook, props, setDispatcher);
  first.output.change({ text: "old send" });
  const sending = first.output.flush();
  await Promise.resolve();
  first.output.change({ text: "before leaving" });
  first.unmount();
  const second = createHookRunner(hook, props, setDispatcher);
  second.output.change({ text: "newest after returning" });
  release();
  await sending;
  assert.equal(await second.output.flush(), true);
  assert.deepEqual(sent, [{ text: "old send" }, { text: "newest after returning" }]);
  second.render();
  assert.equal(second.output.draft.text, "newest after returning");
  assert.equal(Object.keys(storage.snapshot()).length, 0);
});

test("portfolio flush cannot finish while an image is still being prepared", async () => {
  const { hook, setDispatcher } = await loadHook();
  const runner = createHookRunner(hook, { scope: "image-preparation", value: { images: [] }, enabled: true, paused: true, onSave: async () => {} }, setDispatcher);
  assert.equal(await runner.output.flush(), false);
});

test("browser storage denial does not prevent editing or server autosave", async () => {
  const { hook, setDispatcher, window } = await loadHook();
  Object.defineProperty(window, "localStorage", { get() { throw new Error("Storage unavailable"); } });
  const sent = [];
  const runner = createHookRunner(hook, { scope: "storage-denied", value: { text: "" }, enabled: true, onSave: async patch => sent.push(plain(patch)) }, setDispatcher);
  runner.output.change({ text: "서버에 저장" });
  assert.equal(await runner.output.flush(), true);
  assert.deepEqual(sent, [{ text: "서버에 저장" }]);
});
