import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

async function loadBookConfirmationsModule() {
  const context = vm.createContext({ console, Date, Map, Set });
  const firestoreModule = new vm.SyntheticModule(
    ["collection", "doc", "onSnapshot", "query", "serverTimestamp", "setDoc", "where"],
    function defineFirestoreExports() {
      this.setExport("collection", () => {});
      this.setExport("doc", () => {});
      this.setExport("onSnapshot", () => {});
      this.setExport("query", () => {});
      this.setExport("serverTimestamp", () => new Date(0));
      this.setExport("setDoc", async () => {});
      this.setExport("where", () => {});
    },
    { context }
  );
  const firebaseModule = new vm.SyntheticModule(
    ["db", "isFirebaseConfigured"],
    function defineFirebaseExports() {
      this.setExport("db", null);
      this.setExport("isFirebaseConfigured", false);
    },
    { context }
  );
  const source = readFileSync(new URL("../lib/bookConfirmations.js", import.meta.url), "utf8");
  const module = new vm.SourceTextModule(source, { context });

  await module.link((specifier) => {
    if (specifier === "firebase/firestore") return firestoreModule;
    if (specifier === "./firebase") return firebaseModule;
    throw new Error(`Unexpected import: ${specifier}`);
  });
  await module.evaluate();
  return module.namespace;
}

const validInput = (overrides = {}) => ({
  classId: "classA",
  projectId: "classA",
  itemKind: "resource",
  itemId: "res1",
  itemTitle: "Resource",
  stepId: "step1",
  user: { uid: "stu1", displayName: "Student One" },
  ...overrides,
});

test("saveBookConfirmation stores incomplete checklist drafts in the mock service", async () => {
  const { saveBookConfirmation, subscribeBookConfirmations } = await loadBookConfirmationsModule();
  const emissions = [];

  const unsubscribe = subscribeBookConfirmations({
    classId: "classA",
    authorId: "stu1",
    callback: (items) => emissions.push(items),
  });
  await saveBookConfirmation(validInput({
    confirmed: false,
    checklistValues: [true, false],
    checklistVersion: "v1:resource:res1",
  }));
  unsubscribe();

  assert.equal(emissions.length, 2);
  const [saved] = emissions.at(-1);
  assert.equal(saved.id, "classA|classA|resource|res1|stu1");
  assert.equal(saved.classId, "classA");
  assert.equal(saved.projectId, "classA");
  assert.equal(saved.itemKind, "resource");
  assert.equal(saved.itemId, "res1");
  assert.equal(saved.itemTitle, "Resource");
  assert.equal(saved.stepId, "step1");
  assert.equal(saved.authorId, "stu1");
  assert.equal(saved.authorName, "Student One");
  assert.equal(saved.confirmed, false);
  assert.deepEqual(Array.from(saved.checklistValues), [true, false]);
  assert.equal(saved.checklistVersion, "v1:resource:res1");
  assert.ok(saved.createdAt instanceof Date);
  assert.ok(saved.updatedAt instanceof Date);
});

test("saveBookConfirmation throws when supplied checklist values are invalid", async () => {
  const { saveBookConfirmation, subscribeBookConfirmations } = await loadBookConfirmationsModule();
  const emissions = [];

  subscribeBookConfirmations({
    classId: "classA",
    callback: (items) => emissions.push(items),
  });
  await assert.rejects(
    saveBookConfirmation(validInput({ checklistValues: Array(501).fill(true) })),
    /checklistValues must be a boolean array/
  );
  await assert.rejects(
    saveBookConfirmation(validInput({ checklistValues: [true, "false"] })),
    /checklistValues must be a boolean array/
  );

  assert.equal(emissions.length, 1);
  assert.equal(emissions[0].length, 0);
});

test("saveBookConfirmation rejects completed checklist records with unchecked items", async () => {
  const { saveBookConfirmation, subscribeBookConfirmations } = await loadBookConfirmationsModule();
  const emissions = [];

  subscribeBookConfirmations({
    classId: "classA",
    callback: (items) => emissions.push(items),
  });
  await assert.rejects(
    saveBookConfirmation(validInput({
      confirmed: true,
      checklistValues: [true, false],
      checklistVersion: "v1:resource:res1",
    })),
    /cannot be confirmed while checklistValues contains false/
  );

  assert.equal(emissions.length, 1);
  assert.equal(emissions[0].length, 0);
});

test("saveBookConfirmation still allows completed records without checklist data", async () => {
  const { saveBookConfirmation, subscribeBookConfirmations } = await loadBookConfirmationsModule();
  const emissions = [];

  subscribeBookConfirmations({
    classId: "classA",
    callback: (items) => emissions.push(items),
  });
  await saveBookConfirmation(validInput({ confirmed: true }));

  assert.equal(emissions.length, 2);
  assert.equal(emissions.at(-1)[0].confirmed, true);
  assert.equal("checklistValues" in emissions.at(-1)[0], false);
});

test("saveBookConfirmation allows completed checklist records when all items are checked", async () => {
  const { saveBookConfirmation, subscribeBookConfirmations } = await loadBookConfirmationsModule();
  const emissions = [];

  subscribeBookConfirmations({
    classId: "classA",
    callback: (items) => emissions.push(items),
  });
  await saveBookConfirmation(validInput({
    confirmed: true,
    checklistValues: [true, true],
    checklistVersion: "v1:resource:res1",
  }));

  assert.equal(emissions.length, 2);
  assert.deepEqual(Array.from(emissions.at(-1)[0].checklistValues), [true, true]);
  assert.equal(emissions.at(-1)[0].confirmed, true);
});

test("saveBookConfirmation throws when supplied version or confirmed are invalid", async () => {
  const { saveBookConfirmation } = await loadBookConfirmationsModule();

  await assert.rejects(
    saveBookConfirmation(validInput({ checklistVersion: "v".repeat(101) })),
    /checklistVersion must be a string/
  );
  await assert.rejects(
    saveBookConfirmation(validInput({ confirmed: "true" })),
    /confirmed must be a boolean/
  );
});

test("saveBookConfirmation throws when required confirmation context is missing", async () => {
  const { saveBookConfirmation } = await loadBookConfirmationsModule();

  await assert.rejects(saveBookConfirmation(validInput({ classId: "" })), /requires a classId/);
  await assert.rejects(saveBookConfirmation(validInput({ itemId: "" })), /requires a valid item/);
  await assert.rejects(saveBookConfirmation(validInput({ itemKind: "note" })), /requires a valid item/);
  await assert.rejects(saveBookConfirmation(validInput({ user: null })), /requires a signed-in user/);
});
