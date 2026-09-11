import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

async function loadBookHelpNotesModule({ firebase = false, transactionData = null, snapshotDocs = [] } = {}) {
  const context = vm.createContext({ console, Date, Map, Set, Object });
  const transactions = [];
  const updates = [];
  const firestoreModule = new vm.SyntheticModule(
    [
      "addDoc",
      "collection",
      "deleteDoc",
      "doc",
      "onSnapshot",
      "query",
      "runTransaction",
      "serverTimestamp",
      "updateDoc",
      "where",
      "writeBatch",
    ],
    function defineFirestoreExports() {
      this.setExport("addDoc", async () => ({ id: "firestore-note" }));
      this.setExport("collection", (_db, name) => ({ path: name }));
      this.setExport("deleteDoc", async () => {});
      this.setExport("doc", (_db, collectionName, id) => ({ path: `${collectionName}/${id}` }));
      this.setExport("onSnapshot", (_query, onNext) => {
        onNext({
          docs: snapshotDocs.map((item) => ({
            id: item.id,
            data: () => item.data,
          })),
        });
        return () => {};
      });
      this.setExport("query", () => ({}));
      this.setExport("runTransaction", async (_db, callback) => {
        const transaction = {
          get: async () => ({
            exists: () => transactionData != null,
            data: () => transactionData,
          }),
          update: (ref, data) => updates.push([ref, data]),
        };
        transactions.push(transaction);
        await callback(transaction);
      });
      this.setExport("serverTimestamp", () => "SERVER_TIME");
      this.setExport("updateDoc", async (ref, data) => updates.push([ref, data]));
      this.setExport("where", () => ({}));
      this.setExport("writeBatch", () => ({ update: () => {}, commit: async () => {} }));
    },
    { context }
  );
  const firebaseModule = new vm.SyntheticModule(
    ["db", "isFirebaseConfigured"],
    function defineFirebaseExports() {
      this.setExport("db", {});
      this.setExport("isFirebaseConfigured", firebase);
    },
    { context }
  );
  const source = readFileSync(new URL("../lib/bookHelpNotes.js", import.meta.url), "utf8");
  const module = new vm.SourceTextModule(source, { context });

  await module.link((specifier) => {
    if (specifier === "firebase/firestore") return firestoreModule;
    if (specifier === "./firebase") return firebaseModule;
    throw new Error(`Unexpected import: ${specifier}`);
  });
  await module.evaluate();
  return { api: module.namespace, transactions, updates };
}

const user = { uid: "teacherA" };
const sectionA = { id: "a", title: "Alpha", content: "first", url: "https://example.test/a" };
const sectionB = { id: "b", title: "Beta", content: "second", url: "" };
const legacySection = { id: "legacy-content", title: "기존 내용", content: "root", url: "" };
const plain = (value) => JSON.parse(JSON.stringify(value));

test("mock help notes expose legacy content as the first virtual section", async () => {
  const { api } = await loadBookHelpNotesModule();
  const emissions = [];

  const unsubscribe = api.subscribeBookHelpNotes("classA", (items) => emissions.push(items));
  const legacyId = await api.addBookHelpNote(user, "classA", {
    title: "Legacy",
    content: "root",
    url: "",
  });
  const sectionedId = await api.addBookHelpNote(user, "classA", {
    title: "Sectioned",
    content: "root",
    url: "https://example.test/root",
    sections: [sectionA],
  });
  unsubscribe();

  const notes = emissions.at(-1);
  const legacy = notes.find((note) => note.id === legacyId);
  const sectioned = notes.find((note) => note.id === sectionedId);
  assert.equal(legacy.content, "");
  assert.deepEqual(plain(legacy.sections), [legacySection]);
  assert.equal(sectioned.content, "");
  assert.deepEqual(plain(sectioned.sections), [legacySection, sectionA]);
});

test("mock parent title and url edits preserve legacy body when content is absent", async () => {
  const { api } = await loadBookHelpNotesModule();
  const emissions = [];
  api.subscribeBookHelpNotes("classA", (items) => emissions.push(items));
  const noteId = await api.addBookHelpNote(user, "classA", {
    title: "Legacy",
    content: "root",
    url: "https://example.test/root",
  });

  await api.updateBookHelpNote(noteId, {
    title: "Renamed",
    url: "https://example.test/changed",
  });

  const note = emissions.at(-1).find((item) => item.id === noteId);
  assert.equal(note.title, "Renamed");
  assert.equal(note.url, "https://example.test/changed");
  assert.equal(note.content, "");
  assert.deepEqual(plain(note.sections), [legacySection]);
});

test("mock section saves append, edit by stable id, and reject duplicates or missing edits", async () => {
  const { api } = await loadBookHelpNotesModule();
  const emissions = [];
  api.subscribeBookHelpNotes("classA", (items) => emissions.push(items));
  const noteId = await api.addBookHelpNote(user, "classA", {
    title: "Note",
    content: "root content",
    url: "https://example.test/root",
    sections: [sectionA],
  });

  await api.saveBookHelpSection(noteId, sectionB, { create: true });
  await assert.rejects(api.saveBookHelpSection(noteId, sectionB, { create: true }), /이미 같은 ID/);
  await api.saveBookHelpSection(noteId, { ...sectionA, title: "Alpha edited" });
  await assert.rejects(api.saveBookHelpSection(noteId, { id: "missing", title: "Missing", content: "", url: "" }), /수정할 도움 글 섹션/);

  const note = emissions.at(-1)[0];
  assert.equal(note.content, "");
  assert.equal(note.url, "https://example.test/root");
  assert.deepEqual(plain(note.sections), [
    { ...legacySection, content: "root content" },
    { ...sectionA, title: "Alpha edited" },
    sectionB,
  ]);
});

test("mock section delete removes only the target section and rejects missing ids", async () => {
  const { api } = await loadBookHelpNotesModule();
  const emissions = [];
  api.subscribeBookHelpNotes("classA", (items) => emissions.push(items));
  const noteId = await api.addBookHelpNote(user, "classA", {
    title: "Note",
    content: "root content",
    url: "https://example.test/root",
    sections: [sectionA, sectionB],
  });

  await api.deleteBookHelpSection(noteId, "a");
  await assert.rejects(api.deleteBookHelpSection(noteId, "missing"), /삭제할 도움 글 섹션/);

  const note = emissions.at(-1)[0];
  assert.equal(note.content, "");
  assert.equal(note.url, "https://example.test/root");
  assert.deepEqual(plain(note.sections), [{ ...legacySection, content: "root content" }, sectionB]);
});

test("mock first legacy edit migrates content into sections once", async () => {
  const { api } = await loadBookHelpNotesModule();
  const emissions = [];
  api.subscribeBookHelpNotes("classA", (items) => emissions.push(items));
  const noteId = await api.addBookHelpNote(user, "classA", {
    title: "Note",
    content: "root",
    url: "",
    sections: [sectionA],
  });

  await api.saveBookHelpSection(noteId, { ...legacySection, content: "edited root" });
  await api.saveBookHelpSection(noteId, { ...sectionA, content: "edited first" });

  const note = emissions.at(-1)[0];
  assert.equal(note.content, "");
  assert.deepEqual(plain(note.sections), [
    { ...legacySection, content: "edited root" },
    { ...sectionA, content: "edited first" },
  ]);
});

test("mock first legacy delete migrates content out without losing siblings", async () => {
  const { api } = await loadBookHelpNotesModule();
  const emissions = [];
  api.subscribeBookHelpNotes("classA", (items) => emissions.push(items));
  const noteId = await api.addBookHelpNote(user, "classA", {
    title: "Note",
    content: "root",
    url: "",
    sections: [sectionA],
  });

  await api.deleteBookHelpSection(noteId, "legacy-content");

  const note = emissions.at(-1)[0];
  assert.equal(note.content, "");
  assert.deepEqual(plain(note.sections), [sectionA]);
});

test("Firestore subscription normalizes legacy content and skips malformed stored sections without dropping the note", async () => {
  const { api } = await loadBookHelpNotesModule({
    firebase: true,
    snapshotDocs: [
      {
        id: "note1",
        data: {
          classId: "classA",
          title: "Stored note",
          content: "root",
          url: "",
          sections: [
            sectionA,
            { id: "a", title: "Duplicate id still readable", content: "", url: "" },
            { id: "bad", title: "", content: "", url: "" },
            "bad-shape",
          ],
        },
      },
      {
        id: "note2",
        data: {
          classId: "classA",
          title: "Collision note",
          content: "root",
          url: "",
          sections: [{ ...sectionA, id: "legacy-content" }],
        },
      },
    ],
  });
  const emissions = [];

  api.subscribeBookHelpNotes("classA", (items) => emissions.push(items));

  assert.equal(emissions.length, 1);
  assert.equal(emissions[0][0].title, "Stored note");
  assert.deepEqual(plain(emissions[0][0].sections), [
    legacySection,
    sectionA,
    { id: "a", title: "Duplicate id still readable", content: "", url: "" },
  ]);
  assert.deepEqual(plain(emissions[0][1].sections), [
    { id: "legacy-content-1", title: "기존 내용", content: "root", url: "" },
    { ...sectionA, id: "legacy-content" },
  ]);
});

test("Firestore parent title and url update omits content when the draft omits it", async () => {
  const { api, updates } = await loadBookHelpNotesModule({ firebase: true });

  await api.updateBookHelpNote("note1", {
    title: "Renamed",
    url: "https://example.test/changed",
  });

  assert.deepEqual(plain(updates[0][1]), {
    title: "Renamed",
    url: "https://example.test/changed",
    updatedAt: "SERVER_TIME",
  });
  assert.equal(Object.hasOwn(updates[0][1], "content"), false);
});

test("Firestore section save migrates legacy content atomically and preserves root title and url", async () => {
  const { api, updates } = await loadBookHelpNotesModule({
    firebase: true,
    transactionData: {
      title: "Root title",
      content: "root content",
      url: "https://example.test/root",
      sections: [sectionA, sectionB],
    },
  });

  await api.saveBookHelpSection("note1", { ...sectionA, content: "edited" });

  assert.equal(updates.length, 1);
  assert.deepEqual(plain(updates[0][1]), {
    sections: [
      { id: "legacy-content", title: "기존 내용", content: "root content", url: "" },
      { ...sectionA, content: "edited" },
      sectionB,
    ],
    content: "",
    updatedAt: "SERVER_TIME",
  });
  assert.equal(Object.hasOwn(updates[0][1], "title"), false);
  assert.equal(Object.hasOwn(updates[0][1], "url"), false);
});

test("Firestore section delete migrates once and preserves sibling sections", async () => {
  const { api, updates } = await loadBookHelpNotesModule({
    firebase: true,
    transactionData: { content: "root", sections: [sectionA, sectionB] },
  });

  await api.deleteBookHelpSection("note1", "a");

  assert.equal(updates.length, 1);
  assert.deepEqual(plain(updates[0][1]), {
    sections: [legacySection, sectionB],
    content: "",
    updatedAt: "SERVER_TIME",
  });
});

test("Firestore section delete can reduce a legacy plus 20 stored sections to the max", async () => {
  const storedSections = Array.from({ length: 20 }, (_, index) => ({
    id: `s${index}`,
    title: `Section ${index}`,
    content: "",
    url: "",
  }));
  const { api, updates } = await loadBookHelpNotesModule({
    firebase: true,
    transactionData: { content: "root", sections: storedSections },
  });

  await api.deleteBookHelpSection("note1", "s0");

  assert.equal(updates.length, 1);
  assert.equal(updates[0][1].sections.length, 20);
  assert.deepEqual(plain(updates[0][1].sections[0]), legacySection);
  assert.equal(updates[0][1].content, "");
});

test("Firestore section edit fails safely when legacy plus stored sections exceed the max", async () => {
  const storedSections = Array.from({ length: 20 }, (_, index) => ({
    id: `s${index}`,
    title: `Section ${index}`,
    content: "",
    url: "",
  }));
  const { api, updates } = await loadBookHelpNotesModule({
    firebase: true,
    transactionData: { content: "root", sections: storedSections },
  });

  await assert.rejects(api.saveBookHelpSection("note1", { ...storedSections[0], title: "Edited" }), /최대 20개/);

  assert.equal(updates.length, 0);
});
