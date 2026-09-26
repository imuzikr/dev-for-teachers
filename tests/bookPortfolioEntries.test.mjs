import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

async function harness({ configured = true, read = async path => ({ activityId: path[1], authorId: path[3], dashboardText: path[1] }) } = {}) {
  const context = vm.createContext({ console });
  const calls = [];
  const stub = exports => new vm.SyntheticModule(Object.keys(exports), function () {
    for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
  }, { context });
  const dependencies = {
    "firebase/firestore": stub({ doc: (_db, ...path) => path, getDocFromServer: async path => {
      calls.push(path); const value = await read(path); return { exists: () => value !== null, data: () => value };
    } }),
    "./firebase": stub({ db: {}, isFirebaseConfigured: configured }),
    "./user": stub({ isTeacher: user => ["teacher", "admin"].includes(user.role) }),
  };
  const module = new vm.SourceTextModule(await readFile(new URL("../lib/bookPortfolioEntries.js", import.meta.url), "utf8"), { context });
  await module.link(name => dependencies[name]); await module.evaluate();
  return { load: module.namespace.loadBookPortfolioEntries, calls };
}
const project = { id: "class-one", steps: [{ activities: [{ id: "problem" }, { id: "solution" }], resources: [{ id: "teacher-secret" }] }] };
const user = { uid: "student-one", role: "student" };
const request = { project, classId: project.id, user, participantUid: user.uid };

test("portfolio reads only direct own entry paths for current project activities", async () => {
  const h = await harness(); const entries = await h.load(request);
  assert.deepEqual(h.calls, [["bookActivities", "problem", "entries", user.uid], ["bookActivities", "solution", "entries", user.uid]]);
  assert.deepEqual(Object.keys(entries), ["problem", "solution"]);
});
test("student cannot request another student's records, including demo mode", async () => {
  for (const configured of [true, false]) {
    const h = await harness({ configured });
    await assert.rejects(h.load({ ...request, participantUid: "someone-else" }), /본인/);
    assert.equal(h.calls.length, 0);
  }
});
test("teacher request remains scoped to the selected student's direct entries", async () => {
  const h = await harness(); await h.load({ ...request, user: { uid: "teacher-one", role: "teacher" } });
  assert(h.calls.every(path => path[3] === user.uid));
});
test("missing entries are empty, but permission or network errors reject generation", async () => {
  const empty = await harness({ read: async () => null });
  assert.equal((await empty.load(request)).problem, null);
  for (const code of ["permission-denied", "unavailable"]) {
    const h = await harness({ read: async () => { throw Object.assign(Error(code), { code }); } });
    await assert.rejects(h.load(request), { code });
  }
});
test("mismatched entry ownership or activity metadata fails closed", async () => {
  for (const patch of [{ authorId: "student-two" }, { activityId: "stale-activity" }]) {
    const h = await harness({ read: async path => ({ activityId: path[1], authorId: user.uid, ...patch }) });
    await assert.rejects(h.load(request), /소유 정보/);
  }
});
test("scope cancellation stops loading and never returns the old records", async () => {
  const controller = new AbortController();
  const h = await harness({ read: async path => { controller.abort(); return { activityId: path[1], authorId: user.uid }; } });
  await assert.rejects(h.load({ ...request, signal: controller.signal }), { name: "AbortError" });
});
test("demo mode filters mixed snapshots to the selected author", async () => {
  const h = await harness({ configured: false });
  const result = await h.load({ ...request, entriesByActivity: { problem: [
    { authorId: "other", activityId: "problem", dashboardText: "PRIVATE" },
    { authorId: user.uid, activityId: "problem", dashboardText: "MY WORK" },
  ] } });
  assert.equal(result.problem.dashboardText, "MY WORK");
  assert.equal(result.solution, null); assert.equal(h.calls.length, 0);
});


test("lesson report rejects missing or mismatched selected lesson before reading entries", async () => {
  for (const configured of [true, false]) {
    for (const classId of [undefined, "class-two"]) {
      const h = await harness({ configured });
      await assert.rejects(h.load({ ...request, classId }), /선택한 차시/);
      assert.equal(h.calls.length, 0);
    }
    const h = await harness({ configured });
    await assert.rejects(h.load({ ...request, project: { ...project, classId: "class-two" } }), /선택한 차시/);
    assert.equal(h.calls.length, 0);
  }
});
test("same student receives separate activity records for each lesson", async () => {
  const h = await harness();
  const first = await h.load(request);
  const second = await h.load({ ...request, classId: "class-two", project: {
    id: "project-two", classId: "class-two", steps: [{ activities: [{ id: "lesson-two-only" }] }],
  } });
  assert.deepEqual(Object.keys(first), ["problem", "solution"]);
  assert.deepEqual(Object.keys(second), ["lesson-two-only"]);
  assert(h.calls.every(path => path[3] === user.uid));
});
