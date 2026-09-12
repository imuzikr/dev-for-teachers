import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../../lib/server/firebaseAdmin.js", import.meta.url), "utf8");

async function loadFirebaseAdmin() {
  const context = vm.createContext({ Error, JSON, Object, Boolean });
  const module = new vm.SourceTextModule(source, { context });
  await module.link(() => {
    throw new Error("firebaseAdmin config tests should not import firebase-admin modules");
  });
  await module.evaluate();
  return module.namespace;
}

test("normal Firebase Admin config requires exact production project and bucket", async () => {
  const admin = await loadFirebaseAdmin();
  assert.doesNotThrow(() => admin.validateFirebaseAdminConfig({
    projectId: "dev-for-teachers",
    storageBucket: "dev-for-teachers.firebasestorage.app",
    serviceAccount: { project_id: "dev-for-teachers" },
    env: {},
  }));
  assert.throws(() => admin.validateFirebaseAdminConfig({
    projectId: "other",
    storageBucket: "dev-for-teachers.firebasestorage.app",
    serviceAccount: { project_id: "other" },
    env: {},
  }), /project/);
  assert.throws(() => admin.validateFirebaseAdminConfig({
    projectId: "dev-for-teachers",
    storageBucket: "demo-bucket",
    serviceAccount: { project_id: "dev-for-teachers" },
    env: {},
  }), /bucket/);
});

test("service account project_id must match configured project", async () => {
  const admin = await loadFirebaseAdmin();
  assert.throws(() => admin.validateFirebaseAdminConfig({
    projectId: "dev-for-teachers",
    storageBucket: "dev-for-teachers.firebasestorage.app",
    serviceAccount: { project_id: "other" },
    env: {},
  }), /service account/);
});

test("emulator mode requires demo project, demo bucket, and all expected loopback ports", async () => {
  const admin = await loadFirebaseAdmin();
  const emulatorEnv = {
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:8186",
    FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9196",
    FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9296",
  };
  assert.doesNotThrow(() => admin.validateFirebaseAdminConfig({
    projectId: "demo-dev-for-teachers",
    storageBucket: "demo-dev-for-teachers",
    serviceAccount: null,
    env: emulatorEnv,
  }));
  assert.throws(() => admin.validateFirebaseAdminConfig({
    projectId: "dev-for-teachers",
    storageBucket: "demo-dev-for-teachers",
    serviceAccount: null,
    env: emulatorEnv,
  }), /demo/);
  assert.throws(() => admin.validateFirebaseAdminConfig({
    projectId: "demo-dev-for-teachers",
    storageBucket: "demo-dev-for-teachers",
    serviceAccount: null,
    env: { FIRESTORE_EMULATOR_HOST: "127.0.0.1:8186" },
  }), /loopback/);
  assert.throws(() => admin.validateFirebaseAdminConfig({
    projectId: "dev-for-teachers",
    storageBucket: "dev-for-teachers.firebasestorage.app",
    serviceAccount: { project_id: "dev-for-teachers" },
    env: { STORAGE_EMULATOR_HOST: "http://127.0.0.1:9296" },
  }), /loopback|demo/);
  assert.throws(() => admin.validateFirebaseAdminConfig({
    projectId: "demo-dev-for-teachers",
    storageBucket: "demo-dev-for-teachers",
    serviceAccount: null,
    env: { ...emulatorEnv, STORAGE_EMULATOR_HOST: "http://127.0.0.1:9297" },
  }), /STORAGE_EMULATOR_HOST/);
  assert.doesNotThrow(() => admin.validateFirebaseAdminConfig({
    projectId: "demo-dev-for-teachers",
    storageBucket: "demo-dev-for-teachers",
    serviceAccount: null,
    env: { ...emulatorEnv, STORAGE_EMULATOR_HOST: "http://127.0.0.1:9296" },
  }));
});
