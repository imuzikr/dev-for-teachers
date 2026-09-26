import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

async function loadStore(firebase = false, { initialActiveItemByStep = { step2: "activity:act2" } } = {}) {
  const context = vm.createContext({ console, Date, Map, Set, TextEncoder, URL, crypto: { randomUUID } });
  const source = (file) => readFileSync(new URL(`../lib/${file}.js`, import.meta.url), "utf8");
  const stub = (exports) => new vm.SyntheticModule(Object.keys(exports), function defineExports() {
    Object.entries(exports).forEach(([name, value]) => this.setExport(name, value));
  }, { context });
  const imageModule = new vm.SourceTextModule(source("bookProjectImages"), { context });
  await imageModule.link(() => {});
  await imageModule.evaluate();
  const urlModule = new vm.SourceTextModule(source("bookItemUrls"), { context });
  await urlModule.link(() => {});
  await urlModule.evaluate();
  const trashModule = new vm.SourceTextModule(source("bookProjectTrash"), { context });
  await trashModule.link(() => {});
  await trashModule.evaluate();
  const storeSource = source("store");
  const firestoreNames = storeSource.match(/import \{([^}]+)\} from "firebase\/firestore"/)[1]
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  let transactions = 0;
  const firestore = Object.fromEntries(firestoreNames.map((name) => [name, () => { throw new Error(`Unexpected Firestore call: ${name}`); }]));
  Object.assign(firestore, {
    collection: (_db, name) => ({ path: name }),
    doc: (dbOrCollection, collectionOrId, explicitId) => ({ id: explicitId ?? collectionOrId, path: explicitId ? `${collectionOrId}/${explicitId}` : collectionOrId }),
    getDoc: async () => ({ exists: () => false }),
    serverTimestamp: () => new Date(0),
    deleteField: () => null,
    writeBatch: () => ({ set: () => {}, delete: () => {}, commit: async () => {} }),
    runTransaction: async (_db, callback) => {
      transactions += 1;
      const project = twoStepProject();
      await callback({
        get: async () => ({ exists: () => true, data: () => ({ ...project, activeItemByStep: initialActiveItemByStep }) }),
        update: (_ref, patch) => { projectPatch = patch; },
      });
    },
  });
  let projectPatch = null;
  const dependencies = {
    "firebase/firestore": stub(firestore),
    "./firebase": stub({ db: {}, isFirebaseConfigured: firebase }),
    "./classPurpose": stub({ CLASS_PURPOSE_INTERNAL: "internal", getClassPurpose: () => "internal", normalizeClassPurpose: () => "internal" }),
    "./user": stub({ getCurrentUser: () => null, isAdmin: () => false }),
    "./storageUpload": stub({ deleteAttachedFiles: async () => {} }),
    "./classDeletionClient": stub({ deleteClassInBrowser: async () => { throw new Error("Unexpected class deletion during active item test"); } }),
    "./bookProjectStorage": stub({ uploadBookProjectImages: async (_user, { steps }) => steps }),
    "./bookProjectImages": imageModule,
    "./bookItemUrls": urlModule,
    "./bookProjectTrash": trashModule,
  };
  const store = new vm.SourceTextModule(storeSource, { context });
  await store.link((specifier) => {
    if (!dependencies[specifier]) throw new Error(`Unexpected store dependency: ${specifier}`);
    return dependencies[specifier];
  });
  await store.evaluate();
  return { ...store.namespace, transactions: () => transactions, projectPatch: () => projectPatch };
}

const user = { uid: "teacherA" };

test("scroll updates reject old slides, out-of-order writes and ended broadcasts", async () => {
  const api = await loadStore();
  let broadcast;
  const unsubscribe = api.subscribeBroadcast("classA", value => { broadcast = value; });
  await api.startBroadcast(user, "classA", { mode: "bookItem", scrollSessionId: "new" });
  await api.updateBookBroadcastScroll("classA", "old", { ratio: 0.5, sequence: 1 });
  assert.equal(broadcast.scrollPosition, undefined);
  await api.updateBookBroadcastScroll("classA", "new", { ratio: 0.7, sequence: 3 });
  await api.updateBookBroadcastScroll("classA", "new", { ratio: 0.2, sequence: 2 });
  assert.equal(broadcast.scrollPosition.ratio, 0.7);
  await api.stopBroadcast("classA");
  await api.updateBookBroadcastScroll("classA", "new", { ratio: 1, sequence: 4 });
  assert.equal(broadcast, null);
  unsubscribe();
});

const plain = (value) => JSON.parse(JSON.stringify(value));

function twoStepProject() {
  return {
    classId: "classA",
    title: "프로젝트",
    steps: [
      {
        id: "step1",
        title: "첫 단계",
        activities: [{ id: "act1", title: "활동 1" }],
        resources: [{ id: "res1", title: "자료 1" }],
      },
      {
        id: "step2",
        title: "둘째 단계",
        activities: [{ id: "act2", title: "활동 2" }],
        resources: [{ id: "res2", title: "자료 2" }],
      },
    ],
  };
}

test("setBookActiveItem replaces selections across the entire project", async () => {
  const api = await loadStore();
  await api.saveBookProject(user, twoStepProject());
  let project = await api.getBookProject("classA");
  const act1 = project.steps[0].activities[0].id;

  await api.setBookActiveItem("classA", "step1", "activity", act1);
  await api.setBookActiveItem("classA", "step2", "resource", "res2");
  await api.setBookActiveItem("classA", "step1", "resource", "res1");

  project = await api.getBookProject("classA");
  assert.deepEqual(plain(project.activeItemByStep), {
    step1: "resource:res1",
  });
});

test("setBookActiveItem rejects a target from a different persisted step", async () => {
  const api = await loadStore();
  await api.saveBookProject(user, twoStepProject());

  await assert.rejects(
    api.setBookActiveItem("classA", "step1", "resource", "res2"),
    { code: "book-project/invalid-active-item" }
  );
  assert.deepEqual(plain((await api.getBookProject("classA")).activeItemByStep), {});
});

test("mock setBookActiveItem notifies subscribers with a new project object reference", async () => {
  const api = await loadStore();
  await api.saveBookProject(user, twoStepProject());
  const emissions = [];
  const unsubscribe = api.subscribeBookProject("classA", (project) => emissions.push(project));
  const before = emissions.at(-1);

  await api.setBookActiveItem("classA", "step1", "resource", "res1");
  unsubscribe();

  const after = emissions.at(-1);
  assert.notEqual(after, before);
  assert.deepEqual(plain(after.activeItemByStep), { step1: "resource:res1" });
});

test("setBookActiveItem can clear a matching active item without changing other steps", async () => {
  const api = await loadStore();
  await api.saveBookProject(user, twoStepProject());
  await api.setBookActiveItem("classA", "step1", "resource", "res1");
  await api.setBookActiveItem("classA", "step2", "resource", "res2");

  await api.setBookActiveItem("classA", "step1", "resource", "res1", false);

  assert.deepEqual(plain((await api.getBookProject("classA")).activeItemByStep), {
    step2: "resource:res2",
  });
});

test("setBookActiveItem allows off then on for the same step", async () => {
  const api = await loadStore();
  await api.saveBookProject(user, twoStepProject());
  await api.setBookActiveItem("classA", "step1", "resource", "res1");
  await api.setBookActiveItem("classA", "step1", "resource", "res1", false);
  await api.setBookActiveItem("classA", "step1", "activity", (await api.getBookProject("classA")).steps[0].activities[0].id);

  const project = await api.getBookProject("classA");
  assert.match(project.activeItemByStep.step1, /^activity:/);
});

test("stale inactive commands do not clear a newer active target", async () => {
  const api = await loadStore();
  await api.saveBookProject(user, twoStepProject());
  const act1 = (await api.getBookProject("classA")).steps[0].activities[0].id;
  await api.setBookActiveItem("classA", "step1", "activity", act1);
  await api.setBookActiveItem("classA", "step1", "resource", "res1");

  await api.setBookActiveItem("classA", "step1", "activity", act1, false);

  assert.deepEqual(plain((await api.getBookProject("classA")).activeItemByStep), {
    step1: "resource:res1",
  });
});

test("old projects default to no active item and saveBookProject preserves active selections", async () => {
  const api = await loadStore();
  await api.saveBookProject(user, twoStepProject());
  assert.deepEqual(plain((await api.getBookProject("classA")).activeItemByStep), {});

  const edited = await api.getBookProject("classA");
  const act1 = edited.steps[0].activities[0].id;
  await api.setBookActiveItem("classA", "step1", "activity", act1);
  const activeProject = await api.getBookProject("classA");
  assert.deepEqual(plain(activeProject.activeItemByStep), {
    step1: `activity:${act1}`,
  });
  edited.steps = edited.steps.toReversed();
  await api.saveBookProject(user, edited);

  assert.deepEqual(plain((await api.getBookProject("classA")).activeItemByStep), {
    step1: `activity:${act1}`,
  });
});

test("Firestore setBookActiveItem transaction replaces all previous step selections", async () => {
  const api = await loadStore(true);

  await api.setBookActiveItem("classA", "step1", "resource", "res1");

  assert.equal(api.transactions(), 1);
  assert.deepEqual(plain(api.projectPatch().activeItemByStep), {
    step1: "resource:res1",
  });
});

test("Firestore setBookActiveItem clears a matching active item transactionally", async () => {
  const api = await loadStore(true, {
    initialActiveItemByStep: {
      step1: "resource:res1",
      step2: "activity:act2",
    },
  });

  await api.setBookActiveItem("classA", "step1", "resource", "res1", false);

  assert.equal(api.transactions(), 1);
  assert.deepEqual(plain(api.projectPatch().activeItemByStep), {
    step2: "activity:act2",
  });
});

test("Firestore stale inactive commands preserve newer transaction state", async () => {
  const api = await loadStore(true, {
    initialActiveItemByStep: {
      step1: "resource:res1",
      step2: "activity:act2",
    },
  });

  await api.setBookActiveItem("classA", "step1", "activity", "act1", false);

  assert.deepEqual(plain(api.projectPatch().activeItemByStep), {
    step1: "resource:res1",
    step2: "activity:act2",
  });
});
