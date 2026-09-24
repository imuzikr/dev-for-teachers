import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const plain = value => JSON.parse(JSON.stringify(value));
const alice = { uid: "student-a", realName: "학생 가" };
const bob = { uid: "student-b", realName: "학생 나" };

async function loadStore(firebase = false) {
  const context = vm.createContext({ console, Date, Map, Set, URL });
  const source = readFileSync(new URL("../lib/store.js", import.meta.url), "utf8");
  const urls = new vm.SourceTextModule(readFileSync(new URL("../lib/bookItemUrls.js", import.meta.url), "utf8"), { context });
  await urls.link(() => {});
  await urls.evaluate();
  const writes = [];
  const records = new Map();
  const firestore = {
    doc: (_db, ...parts) => ({ path: parts.join("/") }),
    serverTimestamp: () => "SERVER_TIMESTAMP",
    setDoc: async (ref, data, options) => {
      writes.push({ path: ref.path, data, options });
      records.set(ref.path, options?.merge ? { ...records.get(ref.path), ...data } : data);
    },
  };
  const store = new vm.SourceTextModule(source, { context });
  await store.link(specifier => {
    if (specifier === "./bookItemUrls") return urls;
    const match = [...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g)].find(item => item[2] === specifier);
    const names = match[1].split(",").map(name => name.trim()).filter(Boolean);
    const values = specifier === "firebase/firestore" ? firestore : specifier === "./firebase" ? { db: {}, isFirebaseConfigured: firebase } : {};
    return new vm.SyntheticModule(names, function () {
      for (const name of names) this.setExport(name, name in values ? values[name] : () => { throw new Error("Unexpected call: " + name); });
    }, { context });
  });
  await store.evaluate();
  return { ...store.namespace, ...urls.namespace, writes, records };
}

test("student URLs normalize blank rows and preserve ordered HTTP(S) or schemeless values", async () => {
  const api = await loadStore();
  assert.deepEqual(plain(api.normalizeBookItemUrls(undefined)), []);
  assert.deepEqual(plain(api.normalizeBookItemUrls([" github.com/a/repo ", "", " \n ", "http://localhost:3000", "github.com/a/repo"])), ["github.com/a/repo", "http://localhost:3000", "github.com/a/repo"]);
  assert.equal(api.bookItemUrlHref(" example.com/app?x=1 "), "https://example.com/app?x=1");
  for (const value of [null, 1, "", "javascript:alert(1)", "data:text/html,hello", "ftp://example.com/file", "http://", "https://invalid host"]) assert.equal(api.bookItemUrlHref(value), "");
  for (const value of [null, {}, "https://example.com", [123], [null], ["javascript:alert(1)"], ["http://"]]) assert.throws(() => api.normalizeBookItemUrls(value), { code: "book-project/url-invalid" });
});

test("real mock entries keep student/activity URLs separate and merge with answers and text", async () => {
  const api = await loadStore();
  let own;
  let other;
  let teacher;
  const stopOwn = api.subscribeMyBookEntry("activity-1", alice.uid, entry => { own = entry; });
  const stopOther = api.subscribeMyBookEntry("activity-1", bob.uid, entry => { other = entry; });
  const stopTeacher = api.subscribeBookEntries("activity-1", entries => { teacher = entries; });
  assert.equal(own, null);
  await api.saveBookEntry("activity-1", alice, { K: "기존 답변" });
  await api.saveBookDashboardText("activity-1", alice, "내 결과", [" github.com/a/repo ", "", "https://example.com/app"]);
  await api.saveBookDashboardText("activity-1", bob, "다른 학생", ["https://example.com/b"]);
  await api.saveBookDashboardText("activity-2", alice, "다른 활동", ["https://example.com/other"]);
  assert.deepEqual(plain(own.urls), ["github.com/a/repo", "https://example.com/app"]);
  assert.deepEqual(plain(own.answers), { K: "기존 답변" });
  assert.equal(teacher.length, 2);
  assert.deepEqual(plain(other.urls), ["https://example.com/b"]);
  await api.saveBookDashboardText("activity-1", alice, undefined, ["https://example.com/revised"]);
  assert.equal(own.dashboardText, "내 결과");
  assert.deepEqual(plain(own.answers), { K: "기존 답변" });
  await api.saveBookDashboardText("activity-1", alice, "글만 수정");
  assert.deepEqual(plain(own.urls), ["https://example.com/revised"]);
  await api.saveBookDashboardText("activity-1", alice, undefined, []);
  assert.deepEqual(plain(own.urls), []);
  assert.equal(own.dashboardText, "글만 수정");
  assert.deepEqual(plain(other.urls), ["https://example.com/b"]);
  let otherActivity;
  const stopActivity = api.subscribeMyBookEntry("activity-2", alice.uid, entry => { otherActivity = entry; });
  assert.deepEqual(plain(otherActivity.urls), ["https://example.com/other"]);
  stopOwn(); stopOther(); stopTeacher(); stopActivity();
});

test("Firestore submission paths are per student and optional fields preserve existing entries", async () => {
  const api = await loadStore(true);
  const path = "bookActivities/activity-1/entries/student-a";
  await api.saveBookEntry("activity-1", alice, { K: "keep answer" });
  await api.saveBookDashboardText("activity-1", alice, "result", [" example.com/one ", "https://example.com/two"]);
  const combined = api.writes.at(-1);
  assert.equal(combined.path, path);
  assert.deepEqual(plain(combined.options), { merge: true });
  assert.deepEqual(plain(combined.data.urls), ["example.com/one", "https://example.com/two"]);
  assert.equal(combined.data.authorId, alice.uid);
  assert.equal(combined.data.updatedAt, "SERVER_TIMESTAMP");
  await api.saveBookDashboardText("activity-1", alice, undefined, ["https://example.com/new"]);
  assert.equal("dashboardText" in api.writes.at(-1).data, false);
  assert.equal(api.records.get(path).dashboardText, "result");
  assert.deepEqual(plain(api.records.get(path).answers), { K: "keep answer" });
  await api.saveBookDashboardText("activity-1", alice, "text only");
  assert.equal("urls" in api.writes.at(-1).data, false);
  assert.deepEqual(plain(api.records.get(path).urls), ["https://example.com/new"]);
  await api.saveBookDashboardText("activity-1", bob, undefined, ["https://example.com/b"]);
  assert.equal(api.writes.at(-1).path, "bookActivities/activity-1/entries/student-b");
  await api.saveBookDashboardText("activity-1", alice, undefined, []);
  assert.deepEqual(plain(api.records.get(path).urls), []);
  assert.equal(api.records.get(path).dashboardText, "text only");
  assert.deepEqual(plain(api.records.get("bookActivities/activity-1/entries/student-b").urls), ["https://example.com/b"]);
});

test("invalid URL input causes neither Firestore writes nor changes to mock student records", async () => {
  for (const firebase of [false, true]) {
    const api = await loadStore(firebase);
    let own;
    const stop = firebase ? () => {} : api.subscribeMyBookEntry("activity-1", alice.uid, entry => { own = entry; });
    await api.saveBookDashboardText("activity-1", alice, "kept", ["https://example.com/kept"]);
    const count = api.writes.length;
    for (const urls of [null, {}, "https://example.com", [42], ["https://example.com/good", "javascript:alert(1)"]]) {
      await assert.rejects(api.saveBookDashboardText("activity-1", alice, "must not replace", urls), { code: "book-project/url-invalid" });
    }
    assert.equal(api.writes.length, count);
    const record = firebase ? api.records.get("bookActivities/activity-1/entries/student-a") : own;
    assert.equal(record.dashboardText, "kept");
    assert.deepEqual(plain(record.urls), ["https://example.com/kept"]);
    stop();
  }
});

test("URL-only first saves do not add an undefined answer field and legacy text saves keep the old shape", async () => {
  const api = await loadStore(true);
  await api.saveBookDashboardText("new-activity", alice, undefined, ["https://example.com"]);
  assert.equal("dashboardText" in api.writes.at(-1).data, false);
  await api.saveBookDashboardText("legacy-activity", alice, "legacy text");
  assert.equal("urls" in api.writes.at(-1).data, false);
  assert.equal(api.writes.at(-1).data.dashboardText, "legacy text");
});
