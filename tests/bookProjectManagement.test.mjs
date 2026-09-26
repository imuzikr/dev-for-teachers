import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

async function loadApi(firebase = false) {
  const context = vm.createContext({ console, Date, Map, Set, TextEncoder, crypto: { randomUUID } });
  const documents = new Map();
  const deleted = [];
  let failDelete = "";
  const source = name => readFileSync(new URL(`../lib/${name}.js`, import.meta.url), "utf8");
  const stub = values => new vm.SyntheticModule(Object.keys(values), function () {
    for (const [key, value] of Object.entries(values)) this.setExport(key, value);
  }, { context });
  const ref = (...parts) => {
    const path = parts.map(part => typeof part === "string" ? part : part?.path).filter(Boolean).join("/");
    return { path, id: path.split("/").at(-1) };
  };
  const snap = reference => ({ id: reference.id, ref: reference, exists: () => documents.has(reference.path), data: () => documents.get(reference.path) });
  const names = source("store").match(/import \{([^}]+)\} from "firebase\/firestore"/)[1].split(",").map(name => name.trim()).filter(Boolean);
  const firestore = Object.fromEntries(names.map(name => [name, () => { throw new Error(`Unexpected ${name}`); }]));
  const remove = reference => {
    if (reference.path === failDelete) { failDelete = ""; throw new Error("Simulated deletion failure"); }
    deleted.push(reference.path);
    documents.delete(reference.path);
  };
  Object.assign(firestore, {
    collection: ref, doc: ref, getDoc: async reference => snap(reference),
    where: (field, _operator, value) => ({ field, value }),
    query: (reference, ...filters) => ({ ...reference, filters }),
    getDocs: async reference => ({ docs: [...documents.keys()].filter(path => path.startsWith(`${reference.path}/`)
      && path.split("/").length === reference.path.split("/").length + 1
      && (reference.filters ?? []).every(({ field, value }) => documents.get(path)[field] === value)).map(path => snap(ref(path))) }),
    deleteDoc: async reference => remove(reference),
    writeBatch: () => {
      const writes = [];
      return {
        delete: reference => writes.push(["delete", reference]),
        set: (reference, data) => writes.push(["set", reference, data]),
        commit: async () => {
          assert(writes.length <= 500);
          writes.forEach(([kind, reference, data]) => kind === "delete" ? remove(reference) : documents.set(reference.path, data));
      } };
    },
    runTransaction: async (_db, callback) => {
      const writes = [];
      let wrote = false;
      await callback({
        get: async reference => {
          assert.equal(wrote, false, "transaction read after write");
          return snap(reference);
        },
        set: (reference, data) => {
          wrote = true;
          writes.push(["set", reference, data]);
        },
        delete: reference => {
          wrote = true;
          writes.push(["delete", reference]);
        },
      });
      writes.forEach(([kind, reference, data]) => kind === "delete" ? remove(reference) : documents.set(reference.path, data));
    },
  });
  const deps = {
    "firebase/firestore": stub(firestore),
    "./firebase": stub({ db: {}, isFirebaseConfigured: firebase }),
    "./classPurpose": stub({ CLASS_PURPOSE_INTERNAL: "internal", normalizeClassPurpose: () => "internal" }),
    "./user": stub({ getCurrentUser: () => null, isAdmin: user => user?.role === "admin" }),
    "./storageUpload": stub({ deleteAttachedFiles: async () => {} }),
    "./classDeletionClient": stub({ deleteClassInBrowser: async () => { throw new Error("Must not delete a class"); } }),
    "./bookProjectStorage": stub({ uploadBookProjectImages: async (_user, { steps }) => steps }),
  };
  for (const name of ["bookProjectImages", "bookProjectExport", "bookConfirmations", "bookItemUrls", "bookProjectTrash", "bookPortfolioBroadcastCore", "store"]) {
    const module = new vm.SourceTextModule(source(name) + (name === "store" ? "\nexport const testMock = mock;" : ""), { context });
    await module.link(specifier => {
      assert(deps[specifier], `Unknown dependency ${specifier}`);
      return deps[specifier];
    });
    await module.evaluate();
    deps[`./${name}`] = module;
  }
  return { ...deps["./store"].namespace, ...deps["./bookProjectExport"].namespace, ...deps["./bookConfirmations"].namespace,
    documents, deleted, failNextDelete: path => { failDelete = path; } };
}

const teacher = { uid: "teacher", role: "admin" };
const plain = value => JSON.parse(JSON.stringify(value));
const draft = classId => ({ classId, title: "원본 프로젝트", steps: [{ id: "step", title: "준비", description: "안내",
  activities: [{ id: "activity", title: "만들기", content: "<p>활동</p>", images: ["https://example.test/image.jpg"], imageSizes: ["large"], locked: false, requiresAnswer: false, templateEnabled: true }],
  resources: [{ id: `${classId}-resource`, title: "자료", url: "https://example.test", locked: true }],
  itemOrder: [{ kind: "resource", id: `${classId}-resource` }, { kind: "activity", id: "activity" }],
}] });

test("copy creates independent IDs, preserves content/order/current locks, and leaves student records behind", async () => {
  const api = await loadApi();
  await api.saveBookProject(teacher, draft("source"));
  const project = await api.getBookProject("source");
  const activity = project.steps[0].activities[0];
  await api.updateBookActivity(activity.id, { locked: true });
  await api.saveBookEntry(activity.id, { uid: "student" }, { answer: "private" });
  await api.setBookActiveItem("source", "step", "activity", activity.id);
  const before = plain(await api.getBookProject("source"));
  const copied = api.appendClonedBookProjectSteps(null, await api.getBookProjectForCopy("source"));
  await api.saveBookProject(teacher, { classId: "target", ...copied });
  const target = await api.getBookProject("target");
  assert.notEqual(target.version, project.version);
  assert.notEqual(target.steps[0].id, "step");
  assert.notEqual(target.steps[0].activities[0].id, activity.id);
  assert.notEqual(target.steps[0].resources[0].id, "source-resource");
  assert.equal(target.steps[0].activities[0].locked, true);
  assert.equal(target.steps[0].activities[0].requiresAnswer, false);
  assert.equal(target.steps[0].activities[0].templateEnabled, true);
  assert.deepEqual(plain(target.steps[0].activities[0].images), ["https://example.test/image.jpg"]);
  assert.deepEqual(plain(target.steps[0].itemOrder), [
    { kind: "resource", id: target.steps[0].resources[0].id },
    { kind: "activity", id: target.steps[0].activities[0].id },
  ]);
  assert.deepEqual(plain(target.activeItemByStep), {});
  assert.deepEqual(plain(await api.getBookProject("source")), before);
  assert.equal(api.testMock.bookEntries.length, 1);
  await api.deleteBookProject(teacher, { classId: "source", version: project.version }, api.deleteBookProjectConfirmations);
  assert.equal((await api.getBookProject("target")).steps[0].activities[0].images[0], "https://example.test/image.jpg");
});

test("mock deletion clears dependent records, not the class, members, standalone activities or another project", async () => {
  const api = await loadApi();
  const classItem = await api.addClass(teacher, "1반");
  await api.saveBookProject(teacher, draft(classItem.id));
  await api.saveBookProject(teacher, draft("other"));
  const project = await api.getBookProject(classItem.id);
  api.testMock.broadcasts = { [classItem.id]: { mode: "bookItem", projectId: classItem.id } };
  const standalone = await api.addBookActivity(teacher, { classId: classItem.id, title: "별도 활동" });
  await api.saveBookEntry(project.steps[0].activities[0].id, { uid: "student" }, { answer: "response" });
  for (const classId of [classItem.id, "other"]) await api.saveBookConfirmation({ classId, projectId: classId, itemKind: "resource", itemId: `${classId}-resource`, user: { uid: "student" } });
  let confirmations;
  api.subscribeBookConfirmations({ classId: classItem.id, callback: value => { confirmations = value; } });
  let emittedProject;
  api.subscribeBookProject(classItem.id, value => { emittedProject = value; });
  await api.deleteBookProject(teacher, { classId: classItem.id, version: project.version }, api.deleteBookProjectConfirmations);
  assert.equal(emittedProject, null);
  assert.equal(api.testMock.broadcasts[classItem.id], undefined);
  assert.equal(confirmations.length, 0);
  assert.equal(api.testMock.bookEntries.length, 0);
  assert(api.testMock.classes.some(item => item.id === classItem.id));
  assert(api.testMock.bookActivities.some(item => item.id === standalone));
  assert(api.testMock.bookResources.every(item => item.classId !== classItem.id));
  assert(await api.getBookProject("other"));
  let otherConfirmations;
  api.subscribeBookConfirmations({ classId: "other", callback: value => { otherConfirmations = value; } });
  assert.equal(otherConfirmations.length, 1);
  await api.saveBookProject(teacher, draft(classItem.id));
  assert.notEqual((await api.getBookProject(classItem.id)).version, project.version);
  await assert.rejects(api.deleteBookProject(teacher, { classId: classItem.id, version: project.version }, api.deleteBookProjectConfirmations), { code: "book-project/stale" });
});

function seedFirestore(api) {
  const put = (path, data) => api.documents.set(path, data);
  put("classes/source", { createdBy: "teacher", archived: false });
  put("bookProjects/source", { ...draft("source"), version: "version-1" });
  put("broadcasts/source", { mode: "bookItem", projectId: "source" });
  put("bookActivities/a", { classId: "source", projectId: "source" });
  put("bookActivities/a/entries/student", { answers: "private" });
  put("bookActivities/a/groups/g", {});
  put("bookActivities/a/groups/g/words/w", { text: "word" });
  put("bookResources/r", { classId: "source", projectId: "source" });
  put("bookResources/keep", { classId: "source", projectId: "different" });
  put("bookActivities/keep", { classId: "other", projectId: "other" });
  put("bookProjects/other", { classId: "other" });
  for (let index = 0; index < 405; index++) put(`bookConfirmations/c${index}`, { classId: "source", projectId: "source" });
  put("bookConfirmations/keep", { classId: "other", projectId: "other" });
}

test("Firestore cleanup removes nested records before parents, chunks writes and can retry a partial failure", async () => {
  const api = await loadApi(true);
  seedFirestore(api);
  api.failNextDelete("bookActivities/a/entries/student");
  const remove = () => api.deleteBookProject(teacher, { classId: "source", version: "version-1" }, api.deleteBookProjectConfirmations);
  await assert.rejects(remove(), /Simulated deletion failure/);
  assert(api.documents.has("bookProjects/source"));
  assert(api.documents.has("bookActivities/a"));
  await remove();
  assert.deepEqual([...api.documents.keys()].sort(), ["bookActivities/keep", "bookConfirmations/keep", "bookProjects/other", "bookResources/keep", "classes/source"]);
  assert(api.deleted.indexOf("bookActivities/a/groups/g/words/w") < api.deleted.indexOf("bookActivities/a/groups/g"));
  assert(api.deleted.indexOf("bookActivities/a/entries/student") < api.deleted.indexOf("bookActivities/a"));
  assert.equal(api.deleted.at(-1), "bookProjects/source");
  await remove(); // Already deleted is harmless.
});

test("deletion rejects unauthorized users and stale versions before writing", async () => {
  const api = await loadApi(true);
  seedFirestore(api);
  await assert.rejects(api.deleteBookProject({ uid: "outsider", role: "teacher" }, { classId: "source", version: "version-1" }, api.deleteBookProjectConfirmations), { code: "permission-denied" });
  await assert.rejects(api.deleteBookProject(teacher, { classId: "source", version: "old" }, api.deleteBookProjectConfirmations), { code: "book-project/stale" });
  assert.equal(api.deleted.length, 0);
});
