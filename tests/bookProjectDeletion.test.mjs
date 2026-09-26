import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const teacher = { uid: "teacher-1", role: "admin" };
const initialProject = () => ({
  id: "class-1", classId: "class-1", version: "v1", title: "우리 프로젝트",
  steps: [{
    id: "step-1", title: "Step 1", description: "안내 유지",
    activities: [{ id: "a1", title: "활동 1" }, { id: "a2", title: "활동 2" }],
    resources: [{ id: "r1", title: "자료 1" }, { id: "r2", title: "자료 2" }],
    itemOrder: [
      { kind: "activity", id: "a1" }, { kind: "resource", id: "r1" },
      { kind: "activity", id: "a2" }, { kind: "resource", id: "r2" },
    ],
  }, { id: "step-2", activities: [], resources: [{ id: "r3", title: "다음 자료" }] }],
});
const request = (kind = "activity", overrides = {}) => ({
  classId: "class-1", projectId: "class-1", stepId: "step-1", kind,
  item: { id: kind === "activity" ? "a1" : "r1", title: "호출자가 제공한 제목" },
  ...overrides,
});

async function harness(overrides = {}) {
  let cursor = 0;
  let queuedEffects = [];
  const slots = [];
  const calls = [];
  const props = {
    user: teacher, classId: "class-1", project: initialProject(), ready: true,
    saveProject: async (user, draft) => calls.push({ type: "save", user, draft }),
    onToast: (message) => calls.push({ type: "toast", message }),
    ...overrides,
  };
  const context = vm.createContext({ console: { error() {} }, JSON, Boolean });
  const react = new vm.SyntheticModule(["useRef", "useState", "useEffect"], function exports() {
    this.setExport("useRef", (value) => {
      const index = cursor++;
      slots[index] ??= { current: value };
      return slots[index];
    });
    this.setExport("useState", (value) => {
      const index = cursor++;
      slots[index] ??= { value };
      return [slots[index].value, (next) => { slots[index].value = next; }];
    });
    this.setExport("useEffect", (callback, dependencies) => {
      const index = cursor++;
      if (!slots[index] || dependencies.some((value, i) => value !== slots[index][i])) {
        slots[index] = dependencies;
        queuedEffects.push(callback);
      }
    });
  }, { context });
  const firebase = new vm.SyntheticModule(["isFirebaseConfigured"], function exports() {
    this.setExport("isFirebaseConfigured", false);
  }, { context });
  const userModule = new vm.SourceTextModule(await readFile(new URL("../lib/user.js", import.meta.url), "utf8"), { context });
  await userModule.link((specifier) => {
    assert.equal(specifier, "./firebase");
    return firebase;
  });
  const module = new vm.SourceTextModule(await readFile(new URL("../components/useBookProjectDeletion.js", import.meta.url), "utf8"), { context });
  await module.link((specifier) => {
    if (specifier === "react") return react;
    assert.equal(specifier, "@/lib/user");
    return userModule;
  });
  await module.evaluate();
  function render(patch = {}) {
    Object.assign(props, patch);
    cursor = 0;
    queuedEffects = [];
    const result = module.namespace.useBookProjectDeletion(props);
    queuedEffects.forEach((effect) => effect());
    return result;
  }
  return { props, calls, render, initial: render() };
}

test("only the actual protected teacher role can request deletion", async () => {
  for (const user of [null, { uid: "student", role: "student" }, { uid: "teacher", role: "teacher" }, { role: "admin" }]) {
    const h = await harness({ user });
    assert.equal(h.initial.requestDelete(request()), false);
    assert.equal(await h.initial.confirmDelete(), false);
    assert.equal(h.render().target, null);
    assert.equal(h.calls.length, 0);
  }
});

test("loading, mismatched class/project, kind and missing items reject without writes", async () => {
  const h = await harness();
  const invalid = [null, request("resource", { classId: "class-2" }), request("resource", { projectId: "class-2" }),
    request("resource", { stepId: "step-2" }), request("other"), request("activity", { item: { id: "unknown" } })];
  for (const target of invalid) assert.equal(h.render().requestDelete(target), false);
  assert.equal(h.render({ ready: false }).requestDelete(request()), false);
  assert.equal(h.render({ ready: true, project: { ...initialProject(), classId: "class-2" } }).requestDelete(request()), false);
  assert.equal(h.calls.length, 0);
});

test("resource deletion uses project item, preserves sibling content, and removes its ordering entry", async () => {
  const h = await harness();
  const original = JSON.stringify(h.props.project);
  assert.equal(h.initial.requestDelete(request("resource")), true);
  const dialog = h.render();
  assert.equal(dialog.target.item.title, "자료 1");
  assert.equal(await dialog.confirmDelete(), true);
  const save = h.calls.find((call) => call.type === "save");
  assert.equal(save.user.uid, teacher.uid);
  assert.equal(save.draft.classId, "class-1");
  assert.deepEqual(Array.from(save.draft.steps[0].resources, (item) => item.id), ["r2"]);
  assert.deepEqual(Array.from(save.draft.steps[0].activities, (item) => item.id), ["a1", "a2"]);
  assert.equal(save.draft.steps[0].description, "안내 유지");
  assert.deepEqual(Array.from(save.draft.steps[0].itemOrder, (item) => item.id), ["a1", "a2", "r2"]);
  assert.equal(save.draft.steps[1], h.props.project.steps[1]);
  assert.equal(JSON.stringify(h.props.project), original);
  assert.deepEqual(h.calls.map((call) => call.type), ["save", "toast"]);
  assert.equal(h.render().target, null);
});

test("activity removal saves the latest project and preserves student records", async () => {
  const h = await harness();
  h.initial.requestDelete(request());
  const latest = initialProject();
  latest.steps[0].resources.push({ id: "r-added", title: "새 자료" });
  const dialog = h.render({ project: latest });
  assert.equal(await dialog.confirmDelete(), true);
  assert.deepEqual(h.calls.map((call) => call.type), ["save", "toast"]);
  assert.deepEqual(Array.from(h.calls[0].draft.steps[0].resources, (item) => item.id), ["r1", "r2", "r-added"]);
});

test("failed project save preserves student records and permits a visible retry", async () => {
  let fail = true;
  const saves = [];
  const h = await harness({
    saveProject: async (user, draft) => {
      saves.push({ user, draft });
      if (fail) throw new Error("offline");
    },
  });
  h.initial.requestDelete(request());
  assert.equal(await h.render().confirmDelete(), false);
  const retry = h.render();
  assert.ok(retry.target);
  assert.match(retry.error, /휴지통으로 옮기지 못했어요/);
  assert.equal(retry.pending, false);
  assert.equal(retry.cleanupPending, false);
  assert.equal(h.calls.length, 0);
  assert.equal(saves.length, 1);
  fail = false;
  assert.equal(await retry.confirmDelete(), true);
  assert.equal(saves.length, 2);
  assert.deepEqual(h.calls.map((call) => call.type), ["toast"]);
});

test("duplicate retry after a save failure resaves once per explicit confirmation", async () => {
  let release;
  let saves = 0;
  const h = await harness({
    saveProject: () => {
      saves++;
      return new Promise((_, reject) => { release = () => reject(new Error("offline")); });
    },
  });
  h.initial.requestDelete(request());
  const dialog = h.render();
  const first = dialog.confirmDelete();
  assert.equal(await dialog.confirmDelete(), false);
  release();
  assert.equal(await first, false);
  assert.equal(saves, 1);
  const retry = h.render();
  assert.ok(retry.target);
  assert.match(retry.error, /휴지통으로 옮기지 못했어요/);
});

test("cancelled confirmation never invokes mutation handlers", async () => {
  const h = await harness();
  h.initial.requestDelete(request());
  h.render().closeDelete();
  assert.equal(await h.render().confirmDelete(), false);
  assert.equal(h.render().target, null);
  assert.equal(h.calls.length, 0);
});

test("synchronous double confirm runs only once and pending cannot be closed", async () => {
  let release;
  let saves = 0;
  const h = await harness({ saveProject: () => { saves++; return new Promise((resolve) => { release = resolve; }); } });
  h.initial.requestDelete(request());
  const dialog = h.render();
  const result = dialog.confirmDelete();
  assert.equal(await dialog.confirmDelete(), false);
  const waiting = h.render();
  assert.equal(waiting.pending, true);
  waiting.closeDelete();
  assert.ok(h.render().target);
  release();
  assert.equal(await result, true);
  assert.equal(saves, 1);
  assert.equal(h.calls.filter((call) => call.type === "delete").length, 0);
});

test("class, user, role and project replacement invalidate captured deletion callbacks", async () => {
  const patches = [
    { classId: "class-2" }, { user: { uid: "teacher-2", role: "admin" } },
    { user: { uid: teacher.uid, role: "student" } },
    { project: { ...initialProject(), version: "v2" } }, { ready: false },
  ];
  for (const patch of patches) {
    const h = await harness();
    const capturedRequest = h.initial.requestDelete;
    capturedRequest(request());
    const capturedConfirm = h.render().confirmDelete;
    assert.equal(h.render(patch).target, null);
    assert.equal(await capturedConfirm(), false);
    assert.equal(capturedRequest(request()), false);
    assert.equal(h.calls.length, 0);
  }
});

test("role switch while project save is pending prevents stale success toast", async () => {
  let release;
  const h = await harness({ saveProject: () => new Promise((resolve) => { release = resolve; }) });
  h.initial.requestDelete(request());
  const result = h.render().confirmDelete();
  assert.equal(h.render({ user: { uid: teacher.uid, role: "student" } }).target, null);
  release();
  assert.equal(await result, false);
  assert.equal(h.calls.length, 0);
  assert.equal(h.render().pending, false);
});

test("an item removed by a newer project snapshot cannot be deleted through an old modal", async () => {
  const h = await harness();
  h.initial.requestDelete(request());
  const removed = initialProject();
  removed.steps[0].activities = [];
  assert.equal(await h.render({ project: removed }).confirmDelete(), false);
  assert.match(h.render().error, /이미 삭제됐어요/);
  assert.equal(h.calls.length, 0);
});

test("class switch during save keeps the saved removal but skips a stale toast", async () => {
  let release;
  let saves = 0;
  const h = await harness({ saveProject: () => { saves++; return new Promise((resolve) => { release = resolve; }); } });
  h.initial.requestDelete(request());
  const result = h.render().confirmDelete();
  const otherClass = { ...initialProject(), id: "class-2", classId: "class-2" };
  assert.equal(h.render({ classId: "class-2", project: otherClass }).target, null);
  release();
  assert.equal(await result, true);
  assert.equal(saves, 1);
  assert.deepEqual(h.calls, []);
  assert.equal(h.render({ classId: "class-1", project: initialProject() }).target, null);
});

test("save failure after class switch can be retried on return", async () => {
  let release;
  let saves = 0;
  const h = await harness({
    saveProject: () => { saves++; return new Promise((resolve, reject) => { release = reject; }); },
  });
  h.initial.requestDelete(request());
  const result = h.render().confirmDelete();
  h.render({ classId: "class-2", project: { ...initialProject(), id: "class-2", classId: "class-2" } });
  release(new Error("offline"));
  assert.equal(await result, false);
  assert.equal(h.render().target, null);
  const retry = h.render({ classId: "class-1", project: initialProject() });
  assert.equal(retry.target.item.id, "a1");
  assert.match(retry.error, /휴지통으로 옮기지 못했어요/);
  h.props.saveProject = async () => { saves++; };
  assert.equal(await h.render().confirmDelete(), true);
  assert.equal(saves, 2);
  assert.deepEqual(h.calls.map((call) => call.type), ["toast"]);
});
