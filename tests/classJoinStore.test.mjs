import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../lib/store.js", import.meta.url), "utf8");
const student = { uid: "student", role: "student" };
const admin = { uid: "admin", role: "admin" };
const activeClass = { archived: false, accessVersion: 2, joinEnabled: true, createdAt: new Date(0) };
const plain = (value) => JSON.parse(JSON.stringify(value));

async function loadStore(configured = true, initial = {}, generatedCodes = []) {
  const data = new Map(Object.entries(initial));
  const reads = [];
  const writes = [];
  const listeners = [];
  const classDeletionClientCalls = [];
  const deleted = Symbol("delete");
  let sequence = 0;
  const ref = (base, ...parts) => {
    const path = [base?.path, ...parts].filter(Boolean).join("/");
    return { path, id: path.split("/").at(-1) };
  };
  const snapshot = (path, value = data.get(path), pending = false) => ({
    id: path.split("/").at(-1), ref: { path }, exists: () => value !== undefined,
    data: () => value, metadata: { hasPendingWrites: pending },
  });
  const commit = (operations) => {
    writes.push(operations);
    for (const [kind, target, value] of operations) {
      if (kind === "delete") data.delete(target.path);
      else {
        const next = kind === "update" ? { ...data.get(target.path), ...value } : { ...value };
        for (const key of Object.keys(next)) if (next[key] === deleted) delete next[key];
        data.set(target.path, next);
      }
    }
  };
  const firestore = {
    collection: ref,
    doc: (base, ...parts) => ref(base, ...(parts.length ? parts : [`generated${++sequence}`])),
    query: (target, ...filters) => ({ ...target, filters }),
    where: (...args) => args,
    orderBy: (...args) => args,
    getDoc: async (target) => { reads.push(target.path); return snapshot(target.path); },
    getDocs: async (target) => {
      reads.push(target.path);
      return { docs: [...data].filter(([path, value]) => path.startsWith(`${target.path}/`)
        && (target.filters ?? []).every(([field, , expected]) => value[field] === expected))
        .map(([path, value]) => snapshot(path, value)) };
    },
    serverTimestamp: () => "SERVER_TIMESTAMP",
    deleteField: () => deleted,
    deleteDoc: async (target) => commit([["delete", target]]),
    setDoc: async (target, value) => commit([["set", target, value]]),
    onSnapshot: (target, ...args) => {
      const next = args.find((arg) => typeof arg === "function");
      const error = args.at(-1);
      const listener = { target, next, error, options: typeof args[0] === "object" ? args[0] : {}, stopped: false };
      listeners.push(listener);
      return () => { listener.stopped = true; };
    },
    writeBatch: () => {
      const operations = [];
      return { set: (target, value) => operations.push(["set", target, value]), commit: async () => commit(operations) };
    },
    runTransaction: async (_, callback) => {
      const operations = [];
      const result = await callback({
        get: async (target) => {
          assert.equal(operations.length, 0, "transaction reads must precede writes");
          reads.push(target.path);
          return snapshot(target.path);
        },
        set: (target, value) => operations.push(["set", target, value]),
        update: (target, value) => operations.push(["update", target, value]),
        delete: (target) => operations.push(["delete", target]),
      });
      commit(operations);
      return result;
    },
  };
  const context = vm.createContext({ console, Date, Map, Set, crypto: {
    getRandomValues: (bytes) => {
      const code = generatedCodes.shift() ?? "987654";
      bytes.set(Array.from(code, Number));
      return bytes;
    },
  } });
  const module = new vm.SourceTextModule(source, { context });
  await module.link((specifier) => {
    const match = [...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g)]
      .find((item) => item[2] === specifier);
    const names = match[1].split(",").map((name) => name.trim()).filter(Boolean);
    const overrides = specifier === "firebase/firestore" ? firestore : specifier === "./firebase"
      ? { db: {}, isFirebaseConfigured: configured } : specifier === "./user"
        ? { isAdmin: (user) => user?.role === "admin", getCurrentUser: () => student }
        : specifier === "./classPurpose"
          ? { CLASS_PURPOSE_INTERNAL: "internal", normalizeClassPurpose: (purpose) => purpose ?? "internal" }
          : specifier === "./classDeletionClient"
            ? { deleteClassInBrowser: async (classId) => {
              classDeletionClientCalls.push(classId);
              return { status: "completed", retainedFiles: 0 };
            } } : {};
    return new vm.SyntheticModule(names, function () {
      for (const name of names) this.setExport(name, name in overrides ? overrides[name] : () => {});
    }, { context });
  });
  await module.evaluate();
  return { api: module.namespace, classDeletionClientCalls, data, reads, writes, listeners, snapshot };
}

test("code join reads one lookup and creates a private claim with a code-free membership atomically", async () => {
  const h = await loadStore(true, { "classJoinLookup/123456": { classId: "a" }, "classes/a": activeClass });
  const result = await h.api.joinClassByCode("123456", student);
  assert.equal(result.id, "a");
  assert.equal("joinCode" in result, false);
  assert.deepEqual(h.reads, ["classJoinLookup/123456", "classes/a", "memberships/student_a"]);
  assert.equal(h.writes.length, 1);
  assert.deepEqual(plain(h.data.get("classJoinClaims/student")), {
    uid: "student", classId: "a", joinCode: "123456", createdAt: "SERVER_TIMESTAMP",
  });
  assert.deepEqual(plain(h.data.get("memberships/student_a")), {
    uid: "student", classId: "a", joinedAt: "SERVER_TIMESTAMP", accessVersion: 2,
  });
});

test("direct joins validate target and reject closed, archived, and legacy metadata before writing", async () => {
  for (const patch of [{ joinEnabled: false }, { archived: true }, { archived: undefined }, { accessVersion: 1 }]) {
    const h = await loadStore(true, { "classJoinLookup/123456": { classId: "a" }, "classes/a": { ...activeClass, ...patch } });
    await assert.rejects(h.api.joinClass("a", student, "123456"), { code: "class-not-found" });
    assert.equal(h.writes.length, 0);
  }
  const h = await loadStore(true, { "classJoinLookup/123456": { classId: "a" }, "classes/a": activeClass });
  await assert.rejects(h.api.joinClass("b", student, "123456"), { code: "invalid-code" });
  await assert.rejects(h.api.joinClassByCode("123456", null), { code: "permission-denied" });
  assert.equal(h.writes.length, 0);
});

test("confirmed existing memberships make repeat joins idempotent after code validation", async () => {
  const h = await loadStore(true, {
    "classJoinLookup/123456": { classId: "a" }, "classes/a": activeClass,
    "memberships/student_a": { uid: "student", classId: "a", accessVersion: 2 },
  });
  await h.api.joinClassByCode("123456", student);
  assert.equal(h.writes.length, 0);
});

test("class subscriptions require a user, constrain participant queries, and clear failed rows", async () => {
  const h = await loadStore();
  const emissions = [];
  h.api.subscribeClasses((rows) => emissions.push(rows));
  assert.equal(h.listeners.length, 0);
  const stop = h.api.subscribeClasses((rows) => emissions.push(rows), student);
  const listener = h.listeners[0];
  assert.deepEqual(plain(listener.target.filters), [["archived", "==", false], ["accessVersion", "==", 2]]);
  listener.next({ docs: [h.snapshot("classes/a", { ...activeClass, joinCode: "123456" })] });
  assert.equal(emissions.at(-1).length, 1);
  assert.equal("joinCode" in emissions.at(-1)[0], false);
  listener.error(new Error("denied"));
  assert.equal(emissions.at(-1).length, 0);
  stop();
  assert.equal(listener.stopped, true);
});

test("admin class subscriptions merge only private codes and clear secret failures", async () => {
  const h = await loadStore();
  let rows;
  const stop = h.api.subscribeClasses((value) => { rows = value; }, admin);
  h.listeners[0].next({ docs: [h.snapshot("classes/a", { ...activeClass, joinCode: "legacy" })] });
  assert.equal("joinCode" in rows[0], false);
  h.listeners[1].next({ docs: [h.snapshot("classJoinSecrets/a", { joinCode: "123456" })] });
  assert.equal(rows[0].joinCode, "123456");
  h.listeners[1].error(new Error("denied"));
  assert.equal("joinCode" in rows[0], false);
  stop();
  assert.ok(h.listeners.every((listener) => listener.stopped));
});

test("membership subscriptions read exact IDs, suppress pending writes, remove denied rows, and clean up", async () => {
  const h = await loadStore();
  let rows;
  h.api.subscribeMyMemberships(student.uid, (value) => { rows = value; });
  assert.equal(h.listeners.length, 0);
  const stop = h.api.subscribeMyMemberships(student.uid, (value) => { rows = value; }, ["a", "b", "a"]);
  assert.deepEqual(h.listeners.map((item) => item.target.path), ["memberships/student_a", "memberships/student_b"]);
  assert.ok(h.listeners.every((item) => item.options.includeMetadataChanges));
  const membership = { uid: student.uid, classId: "a", accessVersion: 2 };
  h.listeners[0].next(h.snapshot("memberships/student_a", { ...membership, accessVersion: 1 }));
  assert.equal(rows.length, 0);
  h.listeners[0].next(h.snapshot("memberships/student_a", { ...membership, joinCode: "123456" }));
  assert.equal(rows.length, 0);
  h.listeners[0].next(h.snapshot("memberships/student_a", membership, true));
  assert.equal(rows.length, 0);
  h.listeners[0].next(h.snapshot("memberships/student_a", membership));
  h.listeners[1].next(h.snapshot("memberships/student_b", { ...membership, classId: "b" }));
  assert.equal(rows.length, 2);
  h.listeners[0].error(new Error("denied"));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].classId, "b");
  stop();
  assert.ok(h.listeners.every((item) => item.stopped));
});

test("code rotation atomically sanitizes metadata and preserves a lookup owned by another class", async () => {
  const h = await loadStore(true, {
    "classes/a": { name: "A", joinCode: "111111", joinEnabled: true },
    "classJoinSecrets/a": { joinCode: "111111" }, "classJoinLookup/111111": { classId: "other" },
  });
  await h.api.updateClassJoinAccess("a", { joinCode: "222222", joinEnabled: false });
  assert.equal(h.writes.length, 1);
  assert.deepEqual(plain(h.data.get("classes/a")), { name: "A", joinEnabled: false, archived: false, accessVersion: 2 });
  assert.deepEqual(plain(h.data.get("classJoinLookup/222222")), { classId: "a" });
  assert.equal(h.data.get("classJoinLookup/111111").classId, "other");
  assert.equal(h.data.get("classJoinSecrets/a").joinCode, "222222");
  await h.api.updateClassJoinAccess("a", { joinCode: "333333" });
  assert.equal(h.data.has("classJoinLookup/222222"), false);
});

test("colliding codes fail without partial changes and addClass creates three sanitized documents", async () => {
  const h = await loadStore(true, { "classes/a": activeClass, "classJoinLookup/222222": { classId: "b" } });
  await assert.rejects(h.api.updateClassJoinAccess("a", { joinCode: "222222" }), { code: "code-collision" });
  assert.equal(h.writes.length, 0);
  const created = await h.api.addClass(admin, "New");
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].length, 3);
  assert.equal("joinCode" in h.data.get(`classes/${created.id}`), false);
  assert.equal(h.data.get(`classes/${created.id}`).archived, false);
  assert.equal(h.data.get(`classJoinSecrets/${created.id}`).joinCode, created.joinCode);
  assert.deepEqual(plain(h.data.get(`classJoinLookup/${created.joinCode}`)), { classId: created.id });
});

test("deleteClass delegates configured production deletion to the browser client", async () => {
  const h = await loadStore(true, {
    "classes/a": { ...activeClass, joinCode: "111111" },
    "classJoinSecrets/a": { joinCode: "222222" },
    "classJoinLookup/111111": { classId: "b" }, "classJoinLookup/222222": { classId: "a" },
  });
  const result = await h.api.deleteClass("a");
  assert.deepEqual(h.classDeletionClientCalls, ["a"]);
  assert.equal(result.status, "completed");
  assert.equal(h.data.has("classes/a"), true);
  assert.equal(h.data.has("classJoinSecrets/a"), true);
  assert.equal(h.data.has("classJoinLookup/222222"), true);
  assert.equal(h.data.get("classJoinLookup/111111").classId, "b");
});

test("generated code collision retries reserve a different code without overwriting the owner", async () => {
  const h = await loadStore(true, { "classJoinLookup/111111": { classId: "other" } }, ["111111", "222222"]);
  const created = await h.api.addClass(admin, "New");
  assert.equal(created.joinCode, "222222");
  assert.equal(h.data.get("classJoinLookup/111111").classId, "other");
  assert.equal(h.writes.length, 1);
});

test("admin membership copies contain accessVersion 2 and no code", async () => {
  const h = await loadStore(true, {
    "memberships/student_source": { uid: "student", classId: "source", joinCode: "legacy" },
  });
  const created = await h.api.addClass(admin, "Copied", { purpose: "internal", copyFromClassIds: ["source"] });
  const membership = h.data.get(`memberships/student_${created.id}`);
  assert.equal(membership.accessVersion, 2);
  assert.equal("joinCode" in membership, false);
  assert.equal(membership.inheritedFromClassId, "source");
});

test("mock joins hide codes, deny invalid access, and never inherit sibling membership", async () => {
  const h = await loadStore(false);
  let classes;
  h.api.subscribeClasses((value) => { classes = value; }, student);
  assert.ok(classes.every((item) => !("joinCode" in item)));
  await assert.rejects(h.api.joinClassByCode("222222", student), { code: "class-not-found" });
  await assert.rejects(h.api.joinClass("cl1", student, "999999"));
  await h.api.joinClassByCode("111111", student);
  let memberships;
  h.api.subscribeMyMemberships(student.uid, (value) => { memberships = value; }, ["cl1", "cl2", "cl3"]);
  assert.deepEqual(Array.from(memberships, (item) => item.classId), ["cl1"]);
  assert.equal("joinCode" in memberships[0], false);
  await h.api.archiveClass("cl1");
  assert.equal(classes.some((item) => item.id === "cl1"), false);
  await assert.rejects(h.api.joinClassByCode("111111", student), { code: "class-not-found" });
});

test("own-card subscription requires scoped board IDs and clears denied boards", async () => {
  const h = await loadStore();
  let rows;
  h.api.subscribeMyStudyCards(student.uid, (value) => { rows = value; });
  assert.equal(h.listeners.length, 0);
  const stop = h.api.subscribeMyStudyCards(student.uid, (value) => { rows = value; }, ["board"]);
  assert.equal(h.listeners[0].target.path, "studyBoards/board/cards");
  h.listeners[0].next({ docs: [h.snapshot("studyBoards/board/cards/card", { authorId: student.uid })] });
  assert.equal(rows.length, 1);
  h.listeners[0].error(new Error("denied"));
  assert.equal(rows.length, 0);
  stop();
  assert.equal(h.listeners[0].stopped, true);
});
