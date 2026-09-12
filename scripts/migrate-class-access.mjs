import { randomInt } from "node:crypto";
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const require = createRequire(new URL("../tests/rules/package.json", import.meta.url));
const { initializeApp, applicationDefault, deleteApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

export async function migrateClassAccess(db, { apply = false, backupPath } = {}) {
  const classes = await db.collection("classes").get();
  const memberships = await db.collection("memberships").get();
  const secrets = await db.collection("classJoinSecrets").get();
  const lookups = await db.collection("classJoinLookup").get();
  const legacy = classes.docs.filter((entry) => entry.data().accessVersion !== 2 || Object.hasOwn(entry.data(), "joinCode"));
  const pendingMemberships = memberships.docs.filter((entry) => entry.data().accessVersion !== 2 || Object.hasOwn(entry.data(), "joinCode"));
  const exposedCodes = new Set([...classes.docs, ...memberships.docs].map((entry) => entry.data().joinCode).filter(Boolean));
  const summary = { classes: classes.size, classesToMigrate: legacy.length, membershipsToMigrate: pendingMemberships.length, applied: apply };
  if (!apply) return summary;
  if (!backupPath) throw new Error("--backup is required with --apply. The backup contains private data; keep it private.");
  const backup = {};
  for (const [name, snapshot] of Object.entries({ classes, memberships, classJoinSecrets: secrets, classJoinLookup: lookups })) {
    backup[name] = snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() }));
  }
  await writeFile(backupPath, JSON.stringify(backup, null, 2), { flag: "wx", mode: 0o600 });

  for (const entry of legacy) {
    let migrated = false;
    for (let attempt = 0; attempt < 100 && !migrated; attempt += 1) {
      const newCode = String(randomInt(1000000)).padStart(6, "0");
      if (exposedCodes.has(newCode)) continue;
      migrated = await db.runTransaction(async (transaction) => {
        const classRef = entry.ref;
        const secretRef = db.doc(`classJoinSecrets/${entry.id}`);
        const lookupRef = db.doc(`classJoinLookup/${newCode}`);
        const [current, secret, lookup] = await transaction.getAll(classRef, secretRef, lookupRef);
        if (!current.exists) return true;
        if (current.data().accessVersion === 2 && !Object.hasOwn(current.data(), "joinCode")) return true;
        if (lookup.exists || newCode === current.data().joinCode || newCode === secret.data()?.joinCode) return false;
        const oldCode = secret.data()?.joinCode;
        const oldLookup = /^[0-9]{6}$/.test(oldCode || "") && oldCode !== newCode
          ? await transaction.get(db.doc(`classJoinLookup/${oldCode}`)) : null;
        transaction.set(secretRef, { joinCode: newCode });
        transaction.set(lookupRef, { classId: entry.id });
        transaction.update(classRef, {
          joinCode: FieldValue.delete(), accessVersion: 2,
          archived: current.data().archived === true,
          joinEnabled: current.data().joinEnabled === true,
        });
        if (oldLookup?.exists && oldLookup.data().classId === entry.id) transaction.delete(oldLookup.ref);
        return true;
      });
    }
    if (!migrated) throw new Error(`Could not reserve a unique code for class ${entry.id}. Re-run safely after resolving code capacity.`);
  }

  // Process each record transactionally so a concurrent membership deletion is not undone.
  for (const entry of pendingMemberships) {
    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(entry.ref);
      if (!current.exists) return;
      transaction.update(entry.ref, { joinCode: FieldValue.delete(), accessVersion: 2 });
    });
  }
  return summary;
}

async function main() {
  const args = process.argv.slice(2);
  const value = (flag) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
  const projectId = value("--project");
  if (!projectId || projectId.startsWith("--")) throw new Error("Specify --project PROJECT_ID explicitly. Default mode is read-only.");
  if (process.env.FIRESTORE_EMULATOR_HOST && !projectId.startsWith("demo-")) throw new Error("Emulator migrations require a demo- project ID.");
  const app = initializeApp({ projectId, ...(process.env.FIRESTORE_EMULATOR_HOST ? {} : { credential: applicationDefault() }) });
  try {
    const result = await migrateClassAccess(getFirestore(app), { apply: args.includes("--apply"), backupPath: value("--backup") });
    console.log(JSON.stringify(result));
  } finally { await deleteApp(app); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
