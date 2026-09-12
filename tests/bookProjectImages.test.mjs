import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import test from "node:test";
import vm from "node:vm";

async function loadModules(firebase = false, { uploadFails = false } = {}) {
  const context = vm.createContext({ console, Date, Map, Set, TextEncoder, crypto: { randomUUID } });
  const source = (file) => readFileSync(new URL(`../lib/${file}.js`, import.meta.url), "utf8");
  const imageModule = new vm.SourceTextModule(source("bookProjectImages"), { context });
  await imageModule.link(() => {});
  await imageModule.evaluate();
  const writes = [];
  let commits = 0;
  let id = 0;
  let uploads = 0;
  const stub = (exports) => new vm.SyntheticModule(Object.keys(exports), function defineExports() {
    Object.entries(exports).forEach(([name, value]) => this.setExport(name, value));
  }, { context });
  const storeSource = source("store");
  const firestoreNames = storeSource.match(/import \{([^}]+)\} from "firebase\/firestore"/)[1].split(",").map((name) => name.trim()).filter(Boolean);
  const firestore = Object.fromEntries(firestoreNames.map((name) => [name, () => { throw new Error(`Unexpected Firestore call: ${name}`); }]));
  Object.assign(firestore, {
    collection: (_db, name) => ({ path: name }),
    doc: (dbOrCollection, collectionOrId, explicitId) => ({ id: explicitId ?? collectionOrId ?? `id${++id}`, path: `${dbOrCollection?.path ?? collectionOrId}/${explicitId ?? ""}` }),
    getDoc: async () => ({ exists: () => false }),
    serverTimestamp: () => new Date(0),
    deleteField: () => null,
    writeBatch: () => ({ set: (...args) => writes.push(args), delete: () => {}, commit: async () => { commits += 1; } }),
  });
  const dependencies = {
    "firebase/firestore": stub(firestore),
    "./firebase": stub({ db: {}, isFirebaseConfigured: firebase }),
    "./classPurpose": stub({ CLASS_PURPOSE_INTERNAL: "internal", getClassPurpose: () => "internal", normalizeClassPurpose: () => "internal" }),
    "./user": stub({ getCurrentUser: () => null, isAdmin: () => false }),
    "./storageUpload": stub({ deleteAttachedFiles: async () => {} }),
    "./classDeletionClient": stub({ deleteClassInBrowser: async () => { throw new Error("Unexpected class deletion during image test"); } }),
    "./bookProjectStorage": stub({ uploadBookProjectImages: async (_user, { steps }) => steps }),
    "./bookProjectImages": imageModule,
    "./bookProjectStorage": stub({ uploadBookProjectImages: async (_user, { steps }) => {
      uploads += 1;
      if (uploadFails) throw new Error("Image upload failed");
      const uploadItem = (item) => ({ ...item, images: item.images.map((url, index) => url.startsWith("data:") ? `https://example.com/storage/${item.id}/${index}.jpg` : url) });
      return steps.map((step) => ({ ...step, activities: step.activities.map(uploadItem), resources: step.resources.map(uploadItem) }));
    } }),
  };
  const store = new vm.SourceTextModule(storeSource, { context });
  await store.link((specifier) => {
    if (!dependencies[specifier]) throw new Error(`Unexpected store dependency: ${specifier}`);
    return dependencies[specifier];
  });
  await store.evaluate();
  const exports = new vm.SourceTextModule(source("bookProjectExport"), { context });
  await exports.link((specifier) => dependencies[specifier]);
  await exports.evaluate();
  return { ...imageModule.namespace, ...store.namespace, ...exports.namespace, writes, commits: () => commits, uploads: () => uploads };
}

const image = "data:image/jpeg;base64,YWJj";
const draft = () => ({ classId: "image-class", title: "이미지 프로젝트", steps: [{ id: "step1", title: "첫 단계", activities: [{ id: "act1", title: "활동", images: [image, "https://example.com/two.jpg"], imageSizes: ["large", "small"] }], resources: [{ id: "res1", title: "자료", images: [image], imageSizes: ["medium"] }] }] });
const user = { uid: "teacher" };

test("image validation preserves order and duplicates, supports absent legacy field, and rejects unsafe or oversized attachments", async () => {
  const { normalizeBookItemImages } = await loadModules();
  assert.deepEqual(Array.from(normalizeBookItemImages(undefined)), []);
  assert.deepEqual(Array.from(normalizeBookItemImages([image, image])), [image, image]);
  for (const images of [null, {}, ["javascript:alert(1)"], ["data:image/svg+xml;base64,YWJj"], Array(9).fill(image), ["https://example.com/" + "a".repeat(600000)]]) {
    assert.throws(() => normalizeBookItemImages(images), { code: "book-project/image-limit" });
  }
});

test("project size guard measures UTF8 bytes, including multilingual content", async () => {
  const { assertBookProjectSize } = await loadModules();
  assert.doesNotThrow(() => assertBookProjectSize({ content: "a".repeat(300000) }));
  assert.throws(() => assertBookProjectSize({ content: "한".repeat(300000) }), { code: "book-project/size-limit" });
});

test("mock save, reload, edit and export retain separate activity and resource image order", async () => {
  const api = await loadModules();
  await api.saveBookProject(user, draft());
  let project = await api.getBookProject("image-class");
  assert.deepEqual(Array.from(project.steps[0].activities[0].images), draft().steps[0].activities[0].images);
  assert.deepEqual(Array.from(project.steps[0].resources[0].images), [image]);
  assert.deepEqual(Array.from(project.steps[0].activities[0].imageSizes), ["large", "small"]);
  assert.deepEqual(Array.from(project.steps[0].resources[0].imageSizes), ["medium"]);
  assert.equal(project.steps[0].activities[0].locked, false);
  assert.equal(project.steps[0].resources[0].locked, false);
  const cloned = api.cloneBookProjectStep(project.steps[0]);
  assert.deepEqual(Array.from(cloned.activities[0].images), draft().steps[0].activities[0].images);
  assert.deepEqual(Array.from(cloned.resources[0].images), [image]);
  assert.deepEqual(Array.from(cloned.activities[0].imageSizes), ["large", "small"]);
  assert.deepEqual(Array.from(cloned.resources[0].imageSizes), ["medium"]);
  assert.equal(cloned.activities[0].locked, false);
  assert.equal(cloned.resources[0].locked, false);
  assert.notEqual(cloned.activities[0].imageSizes, project.steps[0].activities[0].imageSizes);
  assert.notEqual(cloned.activities[0].images, project.steps[0].activities[0].images);
  project.steps[0].activities[0].title = "다른 제목";
  await api.saveBookProject(user, { ...project, classId: "image-class" });
  project = await api.getBookProject("image-class");
  assert.equal(project.steps[0].activities[0].images.length, 2);
});

test("existing explicit activity and resource locks survive saves that omit lock fields", async () => {
  const api = await loadModules();
  const project = draft();
  project.steps[0].activities[0].locked = true;
  project.steps[0].resources[0].locked = true;
  await api.saveBookProject(user, project);
  const edited = JSON.parse(JSON.stringify(await api.getBookProject("image-class")));
  delete edited.steps[0].activities[0].locked;
  delete edited.steps[0].resources[0].locked;
  await api.saveBookProject(user, { ...edited, classId: "image-class" });
  const reloaded = await api.getBookProject("image-class");
  assert.equal(reloaded.steps[0].activities[0].locked, true);
  assert.equal(reloaded.steps[0].resources[0].locked, true);

  const defaultClone = api.cloneBookProjectStep({
    id: "step-unlocked",
    title: "복사본",
    activities: [{ id: "act-open", title: "활동" }],
    resources: [{ id: "res-open", title: "자료" }],
  });
  assert.equal(defaultClone.activities[0].locked, false);
  assert.equal(defaultClone.resources[0].locked, false);

  const lockedClone = api.cloneBookProjectStep({
    id: "step-locked",
    title: "잠금 복사본",
    activities: [{ id: "act-locked", title: "활동", locked: true }],
    resources: [{ id: "res-locked", title: "자료", locked: true }],
  });
  assert.equal(lockedClone.activities[0].locked, true);
  assert.equal(lockedClone.resources[0].locked, true);
});

test("standalone book activity creation defaults unlocked", async () => {
  const api = await loadModules();
  const emissions = [];
  const unsubscribe = api.subscribeBookActivities("image-class", (items) => emissions.push(items));
  const id = await api.addBookActivity(user, { classId: "image-class", title: "새 활동" });
  const activity = emissions.at(-1).find((item) => item.id === id);
  unsubscribe();
  assert.equal(activity.locked, false);
});

test("aggregate oversized project is rejected without replacing existing mock data", async () => {
  const api = await loadModules();
  await api.saveBookProject(user, draft());
  const oversized = draft();
  oversized.steps[0].activities[0].images = ["data:image/jpeg;base64," + "a".repeat(450000)];
  oversized.steps[0].resources[0].images = ["data:image/jpeg;base64," + "a".repeat(450000)];
  await assert.rejects(api.saveBookProject(user, oversized), { code: "book-project/size-limit" });
  assert.equal((await api.getBookProject("image-class")).steps[0].resources[0].images[0], image);
});

test("Firestore batch writes images to project and flattened documents and never commits oversize projects", async () => {
  const api = await loadModules(true);
  await api.saveBookProject(user, draft());
  assert.equal(api.commits(), 1);
  const activity = api.writes.find(([ref]) => ref.path.startsWith("bookActivities"))[1];
  const resource = api.writes.find(([ref]) => ref.path.startsWith("bookResources"))[1];
  const project = api.writes.find(([ref]) => ref.path.startsWith("bookProjects"))[1];
  assert.deepEqual(Array.from(activity.images), ["https://example.com/storage/act1/0.jpg", "https://example.com/two.jpg"]);
  assert.deepEqual(Array.from(resource.images), ["https://example.com/storage/res1/0.jpg"]);
  assert.deepEqual(Array.from(activity.imageSizes), ["large", "small"]);
  assert.deepEqual(Array.from(resource.imageSizes), ["medium"]);
  assert.equal(activity.locked, false);
  assert.equal(resource.locked, false);
  assert.deepEqual(Array.from(project.steps[0].activities[0].imageSizes), ["large", "small"]);
  assert.equal(project.steps[0].activities[0].images.length, 2);
  assert.equal(project.steps[0].activities[0].locked, false);
  assert.equal(project.steps[0].resources[0].locked, false);
  const oversized = draft();
  oversized.steps[0].activities[0].content = "한".repeat(300000);
  await assert.rejects(api.saveBookProject(user, oversized), { code: "book-project/size-limit" });
  assert.equal(api.commits(), 1);
  assert.equal(api.uploads(), 1);
});

test("Firestore saves a project whose inline images together exceed one document", async () => {
  const api = await loadModules(true);
  const project = draft();
  project.steps[0].activities[0].images = ["data:image/jpeg;base64," + "a".repeat(450000)];
  project.steps[0].resources[0].images = ["data:image/jpeg;base64," + "b".repeat(450000)];
  assert.throws(() => api.assertBookProjectSize(project), { code: "book-project/size-limit" });
  assert.doesNotThrow(() => api.assertBookProjectSize(project, { pendingImageUploads: true }));
  await api.saveBookProject(user, project);
  assert.equal(api.commits(), 1);
  const saved = api.writes.find(([ref]) => ref.path.startsWith("bookProjects"))[1];
  assert.ok(!JSON.stringify(saved).includes("data:image"));
  assert.equal(saved.steps[0].activities[0].images.length, 1);
  assert.equal(saved.steps[0].resources[0].images.length, 1);
});

test("an upload failure never commits partial project edits", async () => {
  const api = await loadModules(true, { uploadFails: true });
  await assert.rejects(api.saveBookProject(user, draft()), /Image upload failed/);
  assert.equal(api.commits(), 0);
  assert.equal(api.writes.length, 0);
});


test("legacy and malformed size metadata default to medium without changing image count", async () => {
  const api = await loadModules();
  assert.deepEqual(Array.from(api.normalizeBookImageSizes(undefined, [image, image])), ["medium", "medium"]);
  assert.deepEqual(Array.from(api.normalizeBookImageSizes(["small", "invalid", "large"], [image, image])), ["small", "medium"]);
  const legacy = draft();
  delete legacy.steps[0].activities[0].imageSizes;
  await api.saveBookProject(user, legacy);
  const reloaded = await api.getBookProject("image-class");
  assert.deepEqual(Array.from(reloaded.steps[0].activities[0].imageSizes), ["medium", "medium"]);
});

test("reordered and removed image-size pairs survive save and export", async () => {
  const api = await loadModules();
  const edited = draft();
  edited.steps[0].activities[0].images.reverse();
  edited.steps[0].activities[0].imageSizes.reverse();
  await api.saveBookProject(user, edited);
  const saved = await api.getBookProject("image-class");
  const cloned = api.cloneBookProjectStep(saved.steps[0]);
  assert.equal(cloned.activities[0].images[0], "https://example.com/two.jpg");
  assert.deepEqual(Array.from(cloned.activities[0].imageSizes), ["small", "large"]);
  saved.steps[0].activities[0].images.splice(0, 1);
  saved.steps[0].activities[0].imageSizes.splice(0, 1);
  await api.saveBookProject(user, saved);
  const reloaded = await api.getBookProject("image-class");
  assert.deepEqual(Array.from(reloaded.steps[0].activities[0].images), [image]);
  assert.deepEqual(Array.from(reloaded.steps[0].activities[0].imageSizes), ["large"]);
});
