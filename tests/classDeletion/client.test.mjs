import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../../lib/classDeletionClient.js", import.meta.url), "utf8");

function makeHarness(initial = {}, objects = [], options = {}) {
  const state = { ...options };
  const data = new Map(Object.entries(initial));
  const deletedFiles = [];
  const commits = [];
  const events = [];
  const auth = options.auth ?? { currentUser: { uid: "admin", getIdToken: async () => "token" } };
  const ref = (path) => ({ path, id: path.split("/").at(-1) });
  const snap = (path, value = data.get(path)) => ({
    id: path.split("/").at(-1),
    ref: ref(path),
    exists: () => value !== undefined,
    data: () => value,
  });
  const childDocs = (base) => [...data]
    .filter(([path]) => path.startsWith(`${base}/`) && path.slice(base.length + 1).split("/").length === 1)
    .map(([path, value]) => snap(path, value));
  const groupDocs = (name) => [...data]
    .filter(([path]) => {
      const parts = path.split("/");
      return parts.at(-2) === name;
    })
    .map(([path, value]) => snap(path, value));
  const firestore = {
    collection: (base, ...parts) => ref([base?.path, ...parts].filter(Boolean).join("/")),
    collectionGroup: (_db, name) => ({ path: `collectionGroup:${name}`, group: name }),
    doc: (base, ...parts) => ref([base?.path, ...parts].filter(Boolean).join("/")),
    where: (...args) => args,
    query: (target, ...filters) => ({ ...target, filters }),
    getDocFromServer: async (target) => snap(target.path),
    getDocsFromServer: async (target) => {
      const source = target.group ? groupDocs(target.group) : childDocs(target.path);
      const docs = source.filter((snapshot) => (target.filters ?? [])
        .every(([field, op, expected]) => op === "==" && snapshot.data()?.[field] === expected));
      return { docs };
    },
    writeBatch: () => {
      const refs = [];
      return {
        delete: (target) => refs.push(target),
        commit: async () => {
          if (state.failCommitContaining && refs.some((target) => target.path.includes(state.failCommitContaining))) {
            const error = new Error("commit failed");
            error.code = "permission-denied";
            throw error;
          }
          commits.push(refs.map((target) => target.path));
          events.push(`commit:${refs.map((target) => target.path).join(",")}`);
          refs.forEach((target) => data.delete(target.path));
        },
      };
    },
  };
  const storage = {
    ref: (_storage, path) => ({ fullPath: path }),
    list: async (prefix, request = {}) => {
      const start = Number(request.pageToken ?? 0);
      const direct = objects
        .filter((path) => path.startsWith(prefix.fullPath))
        .map((path) => path.slice(prefix.fullPath.length))
        .filter((tail) => tail.length > 0);
      const prefixes = [...new Set(direct.filter((tail) => tail.includes("/")).map((tail) => `${prefix.fullPath}${tail.split("/")[0]}/`))];
      const items = direct.filter((tail) => !tail.includes("/")).map((tail) => `${prefix.fullPath}${tail}`);
      const page = [...items.map((path) => ({ kind: "item", path })), ...prefixes.map((path) => ({ kind: "prefix", path }))].slice(start, start + 100);
      return {
        items: page.filter((item) => item.kind === "item").map((item) => ({ fullPath: item.path })),
        prefixes: page.filter((item) => item.kind === "prefix").map((item) => ({ fullPath: item.path })),
        nextPageToken: start + 100 < items.length + prefixes.length ? String(start + 100) : undefined,
      };
    },
    deleteObject: async (target) => {
      if (state.failFile === target.fullPath) {
        const error = new Error("failed");
        error.code = "storage/retry-limit-exceeded";
        throw error;
      }
      if (!objects.includes(target.fullPath)) {
        const error = new Error("missing");
        error.code = "storage/object-not-found";
        throw error;
      }
      deletedFiles.push(target.fullPath);
      events.push(`file:${target.fullPath}`);
    },
  };
  return { auth, data, deletedFiles, commits, events, firestore, storage, state };
}

async function loadClient(harness) {
  const context = vm.createContext({ Error, Promise, RegExp, Set, Object, Array, console });
  const module = new vm.SourceTextModule(source, { context });
  const stub = (exports) => new vm.SyntheticModule(Object.keys(exports), function () {
    Object.entries(exports).forEach(([name, value]) => this.setExport(name, value));
  }, { context });
  await module.link((specifier) => {
    if (specifier === "./firebase") return stub({ auth: harness.auth, db: {}, storage: {} });
    if (specifier === "firebase/firestore") return stub(harness.firestore);
    if (specifier === "firebase/storage") {
      return stub({ ref: harness.storage.ref, list: harness.storage.list, deleteObject: harness.storage.deleteObject });
    }
    throw new Error(`Unexpected import ${specifier}`);
  });
  await module.evaluate();
  return module.namespace;
}

const hash = "a".repeat(64);
const classData = { archived: true, title: `https://firebasestorage.googleapis.com/v0/b/app/o/book-project-images%2Fclass-a%2Fintro%2F${hash}.jpg?alt=media` };

test("rejects missing auth, non-admin users, and active classes before mutations", async () => {
  for (const harness of [
    makeHarness({}, [], { auth: { currentUser: null } }),
    makeHarness({ "system/admin": { uid: "admin" }, "classes/class-a": classData }, [], { auth: { currentUser: { uid: "student", getIdToken: async () => "token" } } }),
    makeHarness({ "system/admin": { uid: "admin" }, "classes/class-a": { archived: false } }),
  ]) {
    const client = await loadClient(harness);
    await assert.rejects(() => client.deleteClassInBrowser("class-a", { db: {}, auth: harness.auth, storage: {} }), /관리자|보관된 반/);
    assert.deepEqual(harness.commits, []);
    assert.deepEqual(harness.deletedFiles, []);
  }
});

test("rejects invalid class ids before any document or storage access", async () => {
  const harness = makeHarness({ "system/admin": { uid: "admin" }, "classes/class-a": classData });
  const client = await loadClient(harness);
  await assert.rejects(() => client.deleteClassInBrowser("../class-a", { db: {}, auth: harness.auth, storage: {} }), { code: "class-deletion/invalid-class-id" });
  assert.deepEqual(harness.commits, []);
  assert.deepEqual(harness.deletedFiles, []);
});

test("deletes child records before owned files, preserves shared or unknown files, and deletes class root last", async () => {
  const owned = `book-project-images/class-a/one/${hash}.jpg`;
  const shared = `book-project-images/class-a/two/${"b".repeat(64)}.jpg`;
  const orphanShared = `book-project-images/class-a/orphan/${"c".repeat(64)}.jpg`;
  const unknown = "book-project-images/class-a/notes/raw.txt";
  const png = `book-project-images/class-a/png/${"d".repeat(64)}.png`;
  const harness = makeHarness({
    "system/admin": { uid: "admin" },
    "classes/class-a": classData,
    "studyBoards/board-a": { classId: "class-a" },
    "studyBoards/board-a/cards/card-a": { image: owned },
    "bookActivities/activity-a": { classId: "class-a" },
    "bookActivities/activity-a/entries/entry-a": { image: owned },
    "bookActivities/activity-a/groups/group-a": { title: "group" },
    "bookActivities/activity-a/groups/group-a/words/word-a": { value: "word" },
    "bookActivities/activity-a/groups/missing-parent/words/word-b": { value: "orphan-owned" },
    "broadcasts/class-a": { title: "legacy" },
    "broadcasts/other": { classId: "other" },
    "bookProjects/class-a": { classId: "other" },
    "memberships/student_class-a": { classId: "class-a" },
    "classJoinSecrets/class-a": { joinCode: "123456" },
    "classJoinLookup/123456": { classId: "class-a" },
    "rewards/reward-a": { classId: "class-a" },
    "kwl/kwl-a": { classId: "class-a" },
    "lessons/lesson-b": { hero: `https://x/o/${encodeURIComponent(shared)}?alt=media` },
    "questions/q/answers/a": { body: encodeURIComponent(encodeURIComponent(orphanShared)) },
  }, [owned, shared, orphanShared, unknown, png]);
  const client = await loadClient(harness);
  const result = await client.deleteClassInBrowser("class-a", { db: {}, auth: harness.auth, storage: {} });
  assert.equal(result.status, "completed");
  assert.deepEqual(harness.deletedFiles, [owned]);
  assert.equal(result.retainedFiles, 4);
  assert.equal(harness.data.has("classes/class-a"), false);
  assert.equal(harness.data.has("broadcasts/class-a"), false);
  assert.equal(harness.data.has("broadcasts/other"), true);
  assert.equal(harness.data.has("bookProjects/class-a"), true);
  assert.equal(harness.data.has("bookActivities/activity-a/groups/missing-parent/words/word-b"), false);
  assert.equal(harness.commits.at(-1).at(-1), "classes/class-a");
  assert.ok(harness.commits.every((batch) => batch.length <= 100));
  assert.ok(harness.events.at(-2).startsWith("file:"));
  assert.equal(harness.events.at(-1), "commit:classes/class-a");
});

test("chunks document deletion to at most one hundred writes before root deletion", async () => {
  const initial = { "system/admin": { uid: "admin" }, "classes/class-a": classData };
  for (let index = 0; index < 205; index += 1) {
    initial[`memberships/student${index}_class-a`] = { classId: "class-a" };
  }
  const harness = makeHarness(initial);
  const client = await loadClient(harness);
  const result = await client.deleteClassInBrowser("class-a", { db: {}, auth: harness.auth, storage: {} });
  assert.equal(result.deletedDocuments, 206);
  assert.deepEqual(harness.commits.map((batch) => batch.length), [100, 100, 5, 1]);
  assert.deepEqual(harness.commits.at(-1), ["classes/class-a"]);
});

test("document deletion failures keep storage images for retry", async () => {
  const owned = `book-project-images/class-a/one/${hash}.jpg`;
  const harness = makeHarness({
    "system/admin": { uid: "admin" },
    "classes/class-a": classData,
    "memberships/student_class-a": { classId: "class-a" },
  }, [owned], { failCommitContaining: "memberships/" });
  const client = await loadClient(harness);
  await assert.rejects(() => client.deleteClassInBrowser("class-a", { db: {}, auth: harness.auth, storage: {} }), /반 기록 삭제에 실패/);
  assert.equal(harness.data.has("classes/class-a"), true);
  assert.deepEqual(harness.deletedFiles, []);
  harness.state.failCommitContaining = null;
  const result = await client.deleteClassInBrowser("class-a", { db: {}, auth: harness.auth, storage: {} });
  assert.equal(result.status, "completed");
  assert.equal(harness.data.has("classes/class-a"), false);
  assert.deepEqual(harness.deletedFiles, [owned]);
});

test("file deletion failures retain the root after child records may be removed", async () => {
  const owned = `book-project-images/class-a/one/${hash}.jpg`;
  const harness = makeHarness({
    "system/admin": { uid: "admin" },
    "classes/class-a": classData,
    "memberships/student_class-a": { classId: "class-a" },
  }, [owned], { failFile: owned });
  const client = await loadClient(harness);
  await assert.rejects(() => client.deleteClassInBrowser("class-a", { db: {}, auth: harness.auth, storage: {} }), /일부 반 기록은 이미 삭제/);
  assert.equal(harness.data.has("classes/class-a"), true);
  assert.equal(harness.data.has("memberships/student_class-a"), false);
  assert.deepEqual(harness.deletedFiles, []);
  harness.state.failFile = null;
  const result = await client.deleteClassInBrowser("class-a", { db: {}, auth: harness.auth, storage: {} });
  assert.equal(result.status, "completed");
  assert.equal(harness.data.has("classes/class-a"), false);
  assert.deepEqual(harness.deletedFiles, [owned]);
});

test("descendant ordering preserves parents when a later child batch fails", async () => {
  const initial = { "system/admin": { uid: "admin" }, "classes/class-a": classData };
  for (let index = 0; index < 101; index += 1) {
    initial[`bookActivities/activity-${index}`] = { classId: "class-a" };
  }
  initial["bookActivities/activity-100/groups/missing/words/orphan"] = { value: "word" };
  const harness = makeHarness(initial, [], { failCommitContaining: "bookActivities/activity-100/groups/missing/words/orphan" });
  const client = await loadClient(harness);
  await assert.rejects(() => client.deleteClassInBrowser("class-a", { db: {}, auth: harness.auth, storage: {} }), /반 기록 삭제에 실패/);
  assert.equal(harness.data.has("bookActivities/activity-100"), true);
  assert.equal(harness.data.has("bookActivities/activity-100/groups/missing/words/orphan"), true);
  assert.deepEqual(harness.commits, []);
});
