import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const plain = value => JSON.parse(JSON.stringify(value));

async function loadBookConfirmationsModule(firebase = false) {
  const context = vm.createContext({ console, Date, Map, Set });
  const writes = [];
  const records = new Map();
  const ref = (_db, ...parts) => ({ path: parts.join("/"), id: parts.at(-1) });
  const applyWrite = ({ path, data, options }) => {
    records.set(path, options?.merge ? { ...records.get(path), ...data } : data);
  };
  const firestoreModule = new vm.SyntheticModule(
    ["collection", "doc", "getDocs", "onSnapshot", "query", "runTransaction", "serverTimestamp", "setDoc", "where", "writeBatch"],
    function defineFirestoreExports() {
      this.setExport("collection", () => {});
      this.setExport("doc", ref);
      this.setExport("onSnapshot", () => {});
      this.setExport("query", () => {});
      this.setExport("serverTimestamp", () => new Date(0));
      this.setExport("setDoc", async (reference, data, options) => {
        const write = { path: reference.path, data, options };
        writes.push(write);
        applyWrite(write);
      });
      this.setExport("runTransaction", async (_db, callback) => {
        const pending = [];
        await callback({
          get: async (reference) => ({
            exists: () => records.has(reference.path),
            data: () => records.get(reference.path),
          }),
          set: (reference, data, options) => pending.push({ path: reference.path, data, options }),
        });
        for (const write of pending) {
          writes.push(write);
          applyWrite(write);
        }
      });
      this.setExport("where", () => {});
      this.setExport("getDocs", async () => { throw new Error("Unexpected Firestore read"); });
      this.setExport("writeBatch", () => { throw new Error("Unexpected Firestore write"); });
    },
    { context }
  );
  const firebaseModule = new vm.SyntheticModule(
    ["db", "isFirebaseConfigured"],
    function defineFirebaseExports() {
      this.setExport("db", null);
      this.setExport("isFirebaseConfigured", firebase);
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
  return { ...module.namespace, writes, records };
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

test("saveBookTemplateDraft stores resource templates without completing or clearing checklist drafts", async () => {
  const { saveBookConfirmation, saveBookTemplateDraft, subscribeBookConfirmations } = await loadBookConfirmationsModule();
  const emissions = [];

  subscribeBookConfirmations({
    classId: "classA",
    authorId: "stu1",
    callback: (items) => emissions.push(items),
  });
  await saveBookConfirmation(validInput({
    confirmed: false,
    checklistValues: [true, false],
    checklistVersion: "v1:resource:res1",
  }));
  await saveBookTemplateDraft(validInput({
    templateValues: { problem: "문제", prompt: "프롬프트" },
    templateText: "문제: 문제\n프롬프트: 프롬프트",
  }));
  await saveBookTemplateDraft(validInput({
    templateValues: {},
    templateText: "",
  }));

  const [saved] = emissions.at(-1);
  assert.equal(saved.confirmed, false);
  assert.deepEqual(Array.from(saved.checklistValues), [true, false]);
  assert.equal(saved.checklistVersion, "v1:resource:res1");
  assert.deepEqual(plain(saved.templateValues), {});
  assert.equal(saved.templateText, "");
});

test("saveBookTemplateDraft preserves existing completed confirmations in Firestore transactions", async () => {
  const api = await loadBookConfirmationsModule(true);
  const path = "bookConfirmations/classA|classA|resource|res1|stu1";

  await api.saveBookConfirmation(validInput({ confirmed: true }));
  await api.saveBookTemplateDraft(validInput({
    templateValues: { summary: "자료 요약" },
    templateText: "자료 요약",
  }));

  assert.equal(api.records.get(path).confirmed, true);
  assert.deepEqual(plain(api.records.get(path).templateValues), { summary: "자료 요약" });
  assert.equal(api.records.get(path).templateText, "자료 요약");
  assert.equal(api.records.get(path).authorId, "stu1");
  assert.equal(api.records.get(path).itemKind, "resource");
});

test("saveBookConfirmation preserves resource template drafts on later checklist writes", async () => {
  const api = await loadBookConfirmationsModule(true);
  const path = "bookConfirmations/classA|classA|resource|res1|stu1";

  await api.saveBookTemplateDraft(validInput({
    templateValues: { problem: "문제" },
    templateText: "문제",
  }));
  await api.saveBookConfirmation(validInput({
    confirmed: false,
    checklistValues: [true, false],
    checklistVersion: "v1:resource:res1",
  }));

  assert.equal(api.records.get(path).confirmed, false);
  assert.deepEqual(plain(api.records.get(path).templateValues), { problem: "문제" });
  assert.equal(api.records.get(path).templateText, "문제");
  assert.deepEqual(plain(api.records.get(path).checklistValues), [true, false]);
  assert.equal(api.records.get(path).checklistVersion, "v1:resource:res1");
});

test("saveBookTemplateDraft validates template input before writes", async () => {
  const api = await loadBookConfirmationsModule(true);

  for (const templateValues of [null, [], { answer: false }, Object.fromEntries(Array.from({ length: 101 }, (_, index) => [`k${index}`, "v"]))]) {
    await assert.rejects(
      api.saveBookTemplateDraft(validInput({ templateValues, templateText: "보존 금지" })),
      /templateValues/
    );
  }
  await assert.rejects(
    api.saveBookTemplateDraft(validInput({ templateValues: {}, templateText: "a".repeat(100001) })),
    /templateText/
  );

  assert.equal(api.writes.length, 0);
});
