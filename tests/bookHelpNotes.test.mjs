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
      this.setExport("updateDoc", async () => {});
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
const plain = (value) => JSON.parse(JSON.stringify(value));

test("mock help notes normalize legacy notes and keep sections through root edits", async () => {
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
  await api.updateBookHelpNote(sectionedId, {
    title: "Renamed",
    content: "changed root",
    url: "https://example.test/changed",
  });
  unsubscribe();

  const notes = emissions.at(-1);
  const legacy = notes.find((note) => note.id === legacyId);
  const sectioned = notes.find((note) => note.id === sectionedId);
  assert.deepEqual(plain(legacy.sections), []);
  assert.deepEqual(plain(sectioned.sections), [sectionA]);
  assert.equal(sectioned.content, "changed root");
  assert.equal(sectioned.url, "https://example.test/changed");
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
  assert.equal(note.content, "root content");
  assert.equal(note.url, "https://example.test/root");
  assert.deepEqual(plain(note.sections), [
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
  assert.equal(note.content, "root content");
  assert.equal(note.url, "https://example.test/root");
  assert.deepEqual(plain(note.sections), [sectionB]);
});

test("Firestore subscription skips malformed stored sections without dropping the note", async () => {
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
    ],
  });
  const emissions = [];

  api.subscribeBookHelpNotes("classA", (items) => emissions.push(items));

  assert.equal(emissions.length, 1);
  assert.equal(emissions[0][0].title, "Stored note");
  assert.deepEqual(plain(emissions[0][0].sections), [
    sectionA,
    { id: "a", title: "Duplicate id still readable", content: "", url: "" },
  ]);
});

test("Firestore section save runs a transaction against the latest note and updates only sections metadata", async () => {
  const { api, updates } = await loadBookHelpNotesModule({
    firebase: true,
    transactionData: {
      content: "root content",
      url: "https://example.test/root",
      sections: [sectionA, sectionB],
    },
  });

  await api.saveBookHelpSection("note1", { ...sectionA, content: "edited" });

  assert.equal(updates.length, 1);
  assert.deepEqual(plain(updates[0][1]), {
    sections: [{ ...sectionA, content: "edited" }, sectionB],
    updatedAt: "SERVER_TIME",
  });
});

test("Firestore section delete runs a transaction and preserves sibling sections", async () => {
  const { api, updates } = await loadBookHelpNotesModule({
    firebase: true,
    transactionData: { sections: [sectionA, sectionB] },
  });

  await api.deleteBookHelpSection("note1", "a");

  assert.equal(updates.length, 1);
  assert.deepEqual(plain(updates[0][1]), {
    sections: [sectionB],
    updatedAt: "SERVER_TIME",
  });
});
