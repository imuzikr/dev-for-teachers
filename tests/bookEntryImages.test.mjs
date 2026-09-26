import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const plain = value => JSON.parse(JSON.stringify(value));
const image = "data:image/jpeg;base64,YWJj";
const alice = { uid: "student-a", realName: "학생 가" };

async function loadStore(firebase = false) {
  const context = vm.createContext({ console, Date, Map, Set, TextEncoder, URL });
  const source = name => readFileSync(new URL(`../lib/${name}.js`, import.meta.url), "utf8");
  const storeSource = source("store");
  const imageModule = new vm.SourceTextModule(source("bookProjectImages"), { context });
  await imageModule.link(() => {});
  await imageModule.evaluate();
  const urlModule = new vm.SourceTextModule(source("bookItemUrls"), { context });
  await urlModule.link(() => {});
  await urlModule.evaluate();

  const writes = [];
  const records = new Map();
  const ref = (_db, ...parts) => ({ path: parts.join("/"), id: parts.at(-1) });
  const applyWrite = ({ path, data, options }) => {
    records.set(path, options?.merge ? { ...records.get(path), ...data } : data);
  };
  const firestore = {
    doc: ref,
    serverTimestamp: () => "SERVER_TIMESTAMP",
    setDoc: async (reference, data, options) => {
      const write = { path: reference.path, data, options };
      writes.push(write);
      applyWrite(write);
    },
    runTransaction: async (_db, callback) => {
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
    },
  };
  const store = new vm.SourceTextModule(`${storeSource}\nexport const testMock = mock;`, { context });
  await store.link(specifier => {
    if (specifier === "./bookProjectImages") return imageModule;
    if (specifier === "./bookItemUrls") return urlModule;
    const match = [...storeSource.matchAll(/import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g)].find(item => item[2] === specifier);
    const names = match[1].split(",").map(name => name.trim()).filter(Boolean);
    const values = specifier === "firebase/firestore" ? firestore : specifier === "./firebase" ? { db: {}, isFirebaseConfigured: firebase } : {};
    return new vm.SyntheticModule(names, function () {
      for (const name of names) this.setExport(name, name in values ? values[name] : () => { throw new Error("Unexpected call: " + name); });
    }, { context });
  });
  await store.evaluate();
  return { ...store.namespace, writes, records };
}

test("mock entry images merge with text URLs and answers while undefined preserves and empty array clears", async () => {
  const api = await loadStore();
  let own;
  const stop = api.subscribeMyBookEntry("activity-1", alice.uid, entry => { own = entry; });

  await api.saveBookEntry("activity-1", alice, { K: "기존 답변" });
  await api.saveBookDashboardText("activity-1", alice, "결과 텍스트", ["https://example.com/app"], [image]);
  assert.deepEqual(plain(own.answers), { K: "기존 답변" });
  assert.equal(own.dashboardText, "결과 텍스트");
  assert.deepEqual(plain(own.urls), ["https://example.com/app"]);
  assert.deepEqual(plain(own.images), [image]);

  await api.saveBookDashboardText("activity-1", alice, "글만 수정");
  assert.deepEqual(plain(own.images), [image]);
  assert.deepEqual(plain(own.urls), ["https://example.com/app"]);

  await api.saveBookDashboardText("activity-1", alice, undefined, undefined, []);
  assert.deepEqual(plain(own.images), []);
  assert.equal(own.dashboardText, "글만 수정");
  assert.deepEqual(plain(own.urls), ["https://example.com/app"]);
  assert.deepEqual(plain(own.answers), { K: "기존 답변" });
  stop();
});

test("Firestore image saves validate the merged entry and preserve existing fields", async () => {
  const api = await loadStore(true);
  const path = "bookActivities/activity-1/entries/student-a";

  await api.saveBookEntry("activity-1", alice, { K: "keep answer" });
  await api.saveBookDashboardText("activity-1", alice, "텍스트", ["https://example.com/app"], [image]);
  assert.deepEqual(plain(api.records.get(path).answers), { K: "keep answer" });
  assert.equal(api.records.get(path).dashboardText, "텍스트");
  assert.deepEqual(plain(api.records.get(path).urls), ["https://example.com/app"]);
  assert.deepEqual(plain(api.records.get(path).images), [image]);

  await api.saveBookDashboardText("activity-1", alice, undefined, ["https://example.com/revised"]);
  assert.deepEqual(plain(api.records.get(path).images), [image]);
  await api.saveBookDashboardText("activity-1", alice, undefined, undefined, []);
  assert.deepEqual(plain(api.records.get(path).images), []);
  assert.deepEqual(plain(api.records.get(path).answers), { K: "keep answer" });
});

test("activity template values persist and clear without replacing existing answer URLs or images", async () => {
  const api = await loadStore(true);
  const path = "bookActivities/activity-1/entries/student-a";

  await api.saveBookEntry("activity-1", alice, { K: "기존 답변" });
  await api.saveBookDashboardText("activity-1", alice, "초안", ["https://example.com/app"], [image], {
    problem: "문제 정의",
    prompt: "프롬프트",
  });
  assert.deepEqual(plain(api.records.get(path).templateValues), { problem: "문제 정의", prompt: "프롬프트" });
  assert.deepEqual(plain(api.records.get(path).answers), { K: "기존 답변" });
  assert.deepEqual(plain(api.records.get(path).urls), ["https://example.com/app"]);
  assert.deepEqual(plain(api.records.get(path).images), [image]);

  await api.saveBookDashboardText("activity-1", alice, undefined, undefined, undefined, {});
  assert.deepEqual(plain(api.records.get(path).templateValues), {});
  assert.equal(api.records.get(path).dashboardText, "초안");
  assert.deepEqual(plain(api.records.get(path).urls), ["https://example.com/app"]);
  assert.deepEqual(plain(api.records.get(path).images), [image]);

  await api.saveBookDashboardText("activity-1", alice, undefined, undefined, undefined, { problem: "다시 작성" });
  assert.deepEqual(plain(api.records.get(path).templateValues), { problem: "다시 작성" });
  await api.saveBookDashboardText("activity-1", alice, undefined, undefined, undefined, { prompt: "프롬프트만" });
  assert.deepEqual(plain(api.records.get(path).templateValues), { prompt: "프롬프트만" });
});

test("invalid activity template values reject before writes", async () => {
  const api = await loadStore(true);
  await api.saveBookDashboardText("activity-1", alice, "보존", ["https://example.com/keep"], [image]);
  const writeCount = api.writes.length;

  for (const templateValues of [null, [], { answer: 42 }, Object.fromEntries(Array.from({ length: 101 }, (_, index) => [`k${index}`, "v"]))]) {
    await assert.rejects(
      api.saveBookDashboardText("activity-1", alice, "대체 금지", undefined, undefined, templateValues),
      { code: "book-project/template-invalid" }
    );
  }

  assert.equal(api.writes.length, writeCount);
  assert.equal(api.records.get("bookActivities/activity-1/entries/student-a").dashboardText, "보존");
});

test("invalid or oversized entry images reject before writes or mock replacement", async () => {
  for (const firebase of [false, true]) {
    const api = await loadStore(firebase);
    await api.saveBookDashboardText("activity-1", alice, "보존", ["https://example.com/keep"], [image]);
    const writeCount = api.writes.length;
    for (const images of [null, {}, ["javascript:alert(1)"], ["data:image/svg+xml;base64,YWJj"], Array(9).fill(image)]) {
      await assert.rejects(api.saveBookDashboardText("activity-1", alice, "대체 금지", undefined, images), { code: "book-project/image-limit" });
    }
    const record = firebase
      ? api.records.get("bookActivities/activity-1/entries/student-a")
      : api.testMock.bookEntries.find(entry => entry.activityId === "activity-1" && entry.authorId === alice.uid);
    assert.equal(record.dashboardText, "보존");
    assert.deepEqual(plain(record.images), [image]);
    assert.equal(api.writes.length, writeCount);
  }
});

test("oversized merged entry image save is rejected without overwriting text or URLs", async () => {
  const api = await loadStore(true);
  const path = "bookActivities/activity-1/entries/student-a";
  const retainedText = "a".repeat(849800);
  await api.saveBookDashboardText("activity-1", alice, retainedText, ["https://example.com/keep"]);
  const writeCount = api.writes.length;

  await assert.rejects(api.saveBookDashboardText("activity-1", alice, undefined, undefined, [image]), { code: "book-project/size-limit" });

  assert.equal(api.writes.length, writeCount);
  assert.equal(api.records.get(path).dashboardText, retainedText);
  assert.deepEqual(plain(api.records.get(path).urls), ["https://example.com/keep"]);
  assert.equal("images" in api.records.get(path), false);
});
