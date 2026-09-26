import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

async function loadApi(firebase = false, options = {}) {
  const context = vm.createContext({ console, Date, Map, Set, TextEncoder, URL, crypto: { randomUUID } });
  const documents = new Map();
  let id = 0;
  const source = (name) => readFileSync(new URL(`../lib/${name}.js`, import.meta.url), "utf8");
  const stub = (values) => new vm.SyntheticModule(Object.keys(values), function defineExports() {
    Object.entries(values).forEach(([key, value]) => this.setExport(key, value));
  }, { context });
  const ref = (...parts) => {
    if (parts.length === 1 && parts[0]?.path) {
      const path = `${parts[0].path}/auto${++id}`;
      return { path, id: path.split("/").at(-1) };
    }
    const path = parts.map((part) => typeof part === "string" ? part : part?.path).filter(Boolean).join("/");
    return { path, id: path.split("/").at(-1) };
  };
  const snap = (reference, data = documents.get(reference.path)) => ({
    id: reference.id,
    ref: reference,
    exists: () => data !== undefined,
    data: () => data,
  });
  const storeSource = source("store");
  const names = storeSource.match(/import \{([^}]+)\} from "firebase\/firestore"/)[1].split(",").map((name) => name.trim()).filter(Boolean);
  const firestore = Object.fromEntries(names.map((name) => [name, () => { throw new Error(`Unexpected ${name}`); }]));
  const applyWrite = ([kind, reference, data]) => {
    if (kind === "delete") documents.delete(reference.path);
    else documents.set(reference.path, data);
  };
  Object.assign(firestore, {
    collection: ref,
    doc: ref,
    getDoc: async (reference) => snap(reference),
    where: (field, _operator, value) => ({ field, value }),
    query: (reference, ...filters) => ({ ...reference, filters }),
    getDocs: async (reference) => ({ docs: [...documents.keys()].filter((path) => path.startsWith(`${reference.path}/`)
      && path.split("/").length === reference.path.split("/").length + 1
      && (reference.filters ?? []).every(({ field, value }) => documents.get(path)[field] === value)).map((path) => snap(ref(path))) }),
    onSnapshot: () => () => {},
    serverTimestamp: () => new Date(0),
    deleteField: () => null,
    writeBatch: () => {
      const writes = [];
      return {
        set: (reference, data) => writes.push(["set", reference, data]),
        delete: (reference) => writes.push(["delete", reference]),
        commit: async () => {
          assert(writes.length <= 500);
          writes.forEach(applyWrite);
        },
      };
    },
    runTransaction: async (_db, callback) => {
      const writes = [];
      let wrote = false;
      await callback({
        get: async (reference) => {
          assert.equal(wrote, false, "transaction read after write");
          if (options.staleProjectInTransaction && reference.path === "bookProjects/classA") {
            return snap(reference, { ...documents.get(reference.path), title: "다른 저장" });
          }
          return snap(reference);
        },
        set: (reference, data) => {
          wrote = true;
          writes.push(["set", reference, data]);
        },
        delete: (reference) => {
          wrote = true;
          writes.push(["delete", reference]);
        },
      });
      assert(writes.length <= 500);
      writes.forEach(applyWrite);
    },
  });
  const imageModule = new vm.SourceTextModule(source("bookProjectImages"), { context });
  await imageModule.link(() => {});
  await imageModule.evaluate();
  const urlModule = new vm.SourceTextModule(source("bookItemUrls"), { context });
  await urlModule.link(() => {});
  await urlModule.evaluate();
  const trashModule = new vm.SourceTextModule(source("bookProjectTrash"), { context });
  await trashModule.link(() => {});
  await trashModule.evaluate();
  const deps = {
    "firebase/firestore": stub(firestore),
    "./firebase": stub({ db: {}, isFirebaseConfigured: firebase }),
    "./classPurpose": stub({ CLASS_PURPOSE_INTERNAL: "internal", normalizeClassPurpose: () => "internal" }),
    "./user": stub({ getCurrentUser: () => null, isAdmin: (user) => user?.role === "admin" }),
    "./storageUpload": stub({ deleteAttachedFiles: async () => {} }),
    "./classDeletionClient": stub({ deleteClassInBrowser: async () => { throw new Error("Unexpected class delete"); } }),
    "./bookProjectStorage": stub({ uploadBookProjectImages: async (_user, { steps }) => steps }),
    "./bookProjectImages": imageModule,
    "./bookItemUrls": urlModule,
    "./bookProjectTrash": trashModule,
  };
  for (const name of ["bookProjectExport", "bookConfirmations", "store"]) {
    const module = new vm.SourceTextModule(source(name) + (name === "store" ? "\nexport const testMock = mock;" : ""), { context });
    await module.link((specifier) => deps[specifier]);
    await module.evaluate();
    deps[`./${name}`] = module;
  }
  return {
    ...trashModule.namespace,
    ...deps["./store"].namespace,
    ...deps["./bookConfirmations"].namespace,
    documents,
  };
}

const teacher = { uid: "teacher", role: "admin" };
const plain = (value) => JSON.parse(JSON.stringify(value));
const projectDraft = (classId) => ({
  classId,
  title: "원본",
  steps: [{
    id: "step-a",
    title: "단계 A",
    description: "안내",
    activities: [{ id: "activity-a", title: "활동 A", content: "쓰기" }],
    resources: [{ id: "resource-a", title: "자료 A", url: "https://example.test/a" }],
    itemOrder: [{ kind: "activity", id: "activity-a" }, { kind: "resource", id: "resource-a" }],
  }, {
    id: "step-b",
    title: "단계 B",
    activities: [],
    resources: [{ id: "resource-b", title: "자료 B" }],
    itemOrder: [{ kind: "resource", id: "resource-b" }],
  }],
});

async function createClass(api) {
  return api.addClass(teacher, "1반");
}

test("central save archives removed items and steps while preserving records", async () => {
  const api = await loadApi();
  const classItem = await createClass(api);
  await api.saveBookProject(teacher, projectDraft(classItem.id));
  const saved = await api.getBookProject(classItem.id);
  await api.saveBookEntry(saved.steps[0].activities[0].id, { uid: "student" }, { answer: "keep" });
  await api.saveBookConfirmation({ classId: classItem.id, projectId: classItem.id, itemKind: "resource", itemId: "resource-a", user: { uid: "student" } });
  let confirmations = [];
  api.subscribeBookConfirmations({ classId: classItem.id, callback: (items) => { confirmations = items; } });
  await api.saveBookProject(teacher, {
    ...saved,
    steps: [{
      ...saved.steps[0],
      activities: [],
      resources: [],
      itemOrder: [],
    }],
  });
  const trash = [];
  api.subscribeBookTrash(classItem.id, (items) => trash.splice(0, trash.length, ...items));
  assert.deepEqual(trash.map((item) => item.kind).sort(), ["activity", "resource", "step"]);
  assert(api.testMock.bookActivities.some((item) => item.id === saved.steps[0].activities[0].id));
  assert(api.testMock.bookResources.some((item) => item.id === "resource-a"));
  assert.equal(api.testMock.bookEntries.length, 1);
  assert.equal(confirmations.length, 1);
});

test("project archive and restore preserve child records, version and original IDs", async () => {
  const api = await loadApi();
  const classItem = await createClass(api);
  await api.saveBookProject(teacher, projectDraft(classItem.id));
  const saved = await api.getBookProject(classItem.id);
  await api.setBookActiveItem(classItem.id, "step-a", "activity", saved.steps[0].activities[0].id);
  await api.saveBookEntry(saved.steps[0].activities[0].id, { uid: "student" }, { answer: "keep" });
  await api.archiveBookProject(teacher, { classId: classItem.id, version: saved.version });
  const trash = [];
  api.subscribeBookTrash(classItem.id, (items) => trash.splice(0, trash.length, ...items));
  const originalTrashId = trash[0].id;
  assert.equal(await api.getBookProject(classItem.id), null);
  assert.equal(api.testMock.bookEntries.length, 1);
  await api.saveBookProject(teacher, { classId: classItem.id, title: "대체", steps: [] });
  await assert.rejects(api.restoreBookTrash(teacher, { classId: classItem.id, trashId: originalTrashId }), { code: "book-trash/conflict" });
  await api.archiveBookProject(teacher, { classId: classItem.id, version: (await api.getBookProject(classItem.id)).version });
  await api.restoreBookTrash(teacher, { classId: classItem.id, trashId: originalTrashId });
  const restored = await api.getBookProject(classItem.id);
  assert.equal(restored.version, saved.version);
  assert.equal(restored.steps[0].id, "step-a");
  assert.deepEqual(plain(restored.activeItemByStep), {});
  assert.equal(api.testMock.bookEntries[0].activityId, saved.steps[0].activities[0].id);
});

test("item restore recreates a missing step and later step restore merges without overwriting", async () => {
  const api = await loadApi();
  const classItem = await createClass(api);
  await api.saveBookProject(teacher, projectDraft(classItem.id));
  const saved = await api.getBookProject(classItem.id);
  await api.saveBookProject(teacher, { ...saved, steps: [{ ...saved.steps[0], activities: [], itemOrder: [{ kind: "resource", id: "resource-a" }] }] });
  await api.saveBookProject(teacher, { ...(await api.getBookProject(classItem.id)), steps: [] });
  const trash = [];
  api.subscribeBookTrash(classItem.id, (items) => trash.splice(0, trash.length, ...items));
  const itemTrash = trash.find((item) => item.kind === "activity");
  const stepTrash = trash.find((item) => item.kind === "step");
  await api.restoreBookTrash(teacher, { classId: classItem.id, trashId: itemTrash.id });
  await api.restoreBookTrash(teacher, { classId: classItem.id, trashId: stepTrash.id });
  const restored = await api.getBookProject(classItem.id);
  assert.deepEqual(Array.from(restored.steps.map((step) => step.id)), ["step-a"]);
  assert.equal(restored.steps[0].activities.length, 1);
  assert.equal(restored.steps[0].resources.length, 1);
});

test("trash helper distinguishes same-id different-kind deletion from conversion", async () => {
  const api = await loadApi();
  const base = {
    classId: "classA",
    version: "v1",
    title: "원본",
    steps: [{ id: "s", activities: [{ id: "same", title: "활동" }], resources: [{ id: "same", title: "자료" }], itemOrder: [] }],
  };
  const removedActivity = api.removedBookProjectTrashDocs(base, [{ ...base.steps[0], activities: [], resources: [{ id: "same", title: "자료" }] }], { deletedBy: "t", deletedAt: new Date(0) });
  assert.deepEqual(Array.from(removedActivity.map((item) => item.kind)), ["activity"]);
  const converted = api.removedBookProjectTrashDocs({ ...base, steps: [{ id: "s", activities: [{ id: "convert", title: "활동" }], resources: [], itemOrder: [] }] },
    [{ id: "s", activities: [], resources: [{ id: "convert", title: "자료" }], itemOrder: [] }], { deletedBy: "t", deletedAt: new Date(0) });
  assert.equal(converted.length, 0);
});

test("Firestore removal save rejects stale live project before writing trash", async () => {
  const api = await loadApi(true, { staleProjectInTransaction: true });
  api.documents.set("classes/classA", { createdBy: "teacher", archived: false });
  api.documents.set("bookProjects/classA", projectDraft("classA"));
  api.documents.set("bookProjects/classA", { ...api.documents.get("bookProjects/classA"), version: "v1" });
  await assert.rejects(api.saveBookProject(teacher, {
    classId: "classA",
    title: "원본",
    steps: [],
  }), { code: "book-project/stale" });
  assert.equal([...api.documents.keys()].some((path) => path.startsWith("bookProjectTrash/")), false);
});

test("Firestore archive and restore read before writes and strip synthetic project id", async () => {
  const api = await loadApi(true);
  const project = { ...projectDraft("classA"), version: "v1", activeItemByStep: { "step-a": "activity:activity-a" }, createdBy: "teacher" };
  api.documents.set("classes/classA", { createdBy: "teacher", archived: false });
  api.documents.set("bookProjects/classA", project);
  api.documents.set("broadcasts/classA", { mode: "bookItem", projectId: "classA" });
  api.documents.set("bookActivities/activity-a", { classId: "classA", projectId: "classA" });
  api.documents.set("bookActivities/activity-a/entries/student", { answer: "keep" });
  await api.archiveBookProject(teacher, { classId: "classA", version: "v1" });
  const trashPath = [...api.documents.keys()].find((path) => path.startsWith("bookProjectTrash/"));
  assert(trashPath);
  assert.equal(api.documents.has("bookProjects/classA"), false);
  assert.equal(api.documents.has("broadcasts/classA"), false);
  assert.equal(api.documents.has("bookActivities/activity-a/entries/student"), true);
  await api.restoreBookTrash(teacher, { classId: "classA", trashId: trashPath.split("/").at(-1) });
  const restored = api.documents.get("bookProjects/classA");
  assert.equal("id" in restored, false);
  assert.equal(restored.classId, "classA");
  assert.equal(restored.version, "v1");
  assert.deepEqual(plain(restored.activeItemByStep), {});
  assert.equal(restored.createdBy, "teacher");
  assert.equal(api.documents.has(trashPath), false);
});

test("archive refuses versionless legacy projects before creating un-restorable trash", async () => {
  const api = await loadApi();
  const classItem = await createClass(api);
  await api.getBookProject(classItem.id);
  api.testMock.bookProjects.push({ id: classItem.id, classId: classItem.id, title: "예전", steps: [] });
  await assert.rejects(api.archiveBookProject(teacher, { classId: classItem.id, version: undefined }), { code: "book-trash/unsupported" });
  assert.equal(api.testMock.bookProjects.length, 1);
  assert.equal(api.testMock.bookProjectTrash.length, 0);
});
