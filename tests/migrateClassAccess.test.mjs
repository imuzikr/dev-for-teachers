import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateClassAccess } from "../scripts/migrate-class-access.mjs";

function fakeDatabase() {
  const records = new Map([
    ["classes/active", { name: "Active", createdBy: "admin", joinCode: "123456", joinEnabled: true }],
    ["classes/archived", { name: "Archived", createdBy: "admin", archived: true, joinCode: "234567", joinEnabled: false }],
    ["memberships/student_active", { uid: "student", classId: "active", joinCode: "123456" }],
    ["memberships/student_archived", { uid: "student", classId: "archived", joinCode: "234567" }],
  ]);
  const doc = (path) => ({ path, id: path.split("/").at(-1) });
  const snapshot = (ref) => ({ ref, id: ref.id, exists: records.has(ref.path), data: () => records.get(ref.path) });
  return {
    records, doc,
    collection: (name) => ({ get: async () => {
      const docs = [...records.keys()].filter((path) => path.split("/").length === 2 && path.startsWith(`${name}/`)).map((path) => snapshot(doc(path)));
      return { docs, size: docs.length };
    } }),
    runTransaction: async (fn) => {
      const writes = [];
      const result = await fn({
        get: async (ref) => snapshot(ref),
        getAll: async (...refs) => refs.map(snapshot),
        set: (ref, data) => writes.push(() => records.set(ref.path, data)),
        update: (ref, patch) => writes.push(() => {
          const next = { ...records.get(ref.path) };
          for (const [key, value] of Object.entries(patch)) {
            if (typeof value?.isEqual === "function") delete next[key];
            else next[key] = value;
          }
          records.set(ref.path, next);
        }),
        delete: (ref) => writes.push(() => records.delete(ref.path)),
      });
      writes.forEach((write) => write());
      return result;
    },
  };
}

test("class access migration defaults to read-only and requires a new private backup", async () => {
  const db = fakeDatabase();
  assert.deepEqual(await migrateClassAccess(db), { classes: 2, classesToMigrate: 2, membershipsToMigrate: 2, applied: false });
  assert.equal(db.records.get("classes/active").joinCode, "123456");
  await assert.rejects(migrateClassAccess(db, { apply: true }), /backup/);
});

test("migration rotates exposed codes, preserves content and memberships, and is idempotent", async () => {
  const dir = await mkdtemp(join(tmpdir(), "class-access-test-"));
  try {
    const db = fakeDatabase();
    const backupPath = join(dir, "backup.json");
    await migrateClassAccess(db, { apply: true, backupPath });
    for (const id of ["active", "archived"]) {
      const data = db.records.get(`classes/${id}`);
      assert.equal(data.accessVersion, 2);
      assert.equal(Object.hasOwn(data, "joinCode"), false);
      assert.equal(data.archived, id === "archived");
      const secret = db.records.get(`classJoinSecrets/${id}`);
      assert.match(secret.joinCode, /^[0-9]{6}$/);
      assert(!["123456", "234567"].includes(secret.joinCode));
      assert.deepEqual(db.records.get(`classJoinLookup/${secret.joinCode}`), { classId: id });
      const membership = db.records.get(`memberships/student_${id}`);
      assert.equal(membership.accessVersion, 2);
      assert.equal(Object.hasOwn(membership, "joinCode"), false);
    }
    assert.equal(db.records.get("classes/active").name, "Active");
    const backup = JSON.parse(await readFile(backupPath, "utf8"));
    assert.equal(backup.classes[0].data.joinCode, "123456");
    await assert.rejects(migrateClassAccess(db, { apply: true, backupPath }), /EEXIST/);
    const before = JSON.stringify([...db.records]);
    await migrateClassAccess(db, { apply: true, backupPath: join(dir, "second.json") });
    assert.equal(JSON.stringify([...db.records]), before);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
