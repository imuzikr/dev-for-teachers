import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../lib/pinAuthClient.js", import.meta.url), "utf8");

async function loadPinAuthClient({ configured = true, currentUser = null, fetchImpl, authStateReadyImpl = async () => {} } = {}) {
  const auth = {
    currentUser,
    authStateReadyCalls: 0,
    async authStateReady() {
      this.authStateReadyCalls += 1;
      await authStateReadyImpl();
    },
  };
  const context = vm.createContext({
    Error,
    JSON,
    Object,
    Promise,
    String,
    fetch: fetchImpl ?? (async () => ({ ok: true, json: async () => ({}) })),
  });
  const firebaseModule = new vm.SyntheticModule(
    ["auth", "isFirebaseConfigured"],
    function defineFirebaseExports() {
      this.setExport("auth", auth);
      this.setExport("isFirebaseConfigured", configured);
    },
    { context }
  );
  const module = new vm.SourceTextModule(source, { context });
  await module.link((specifier) => {
    if (specifier === "./firebase") return firebaseModule;
    throw new Error(`Unexpected import: ${specifier}`);
  });
  await module.evaluate();
  return { auth, namespace: module.namespace };
}

test("public PIN login ignores locally stored guest credentials", async () => {
  const calls = [];
  const { auth, namespace } = await loadPinAuthClient({
    currentUser: null,
    fetchImpl: async (...args) => {
      calls.push(args);
      return { ok: true, json: async () => ({ customToken: "token" }) };
    },
  });

  globalThis.localStorage = { getItem: () => JSON.stringify({ uid: "legacy", schoolName: "S", teacherName: "T" }) };
  try {
    const result = await namespace.requestPinAuth({ action: "login", schoolName: "S", realName: "T", pin: "1234" });

    assert.deepEqual(result, { customToken: "token" });
    assert.equal(auth.authStateReadyCalls, 0);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], "/api/auth/pin");
    assert.equal(calls[0][1].headers.Authorization, undefined);
    assert.equal(calls[0][1].body, JSON.stringify({ action: "login", schoolName: "S", realName: "T", pin: "1234" }));
  } finally {
    delete globalThis.localStorage;
  }
});

test("requestPinAuth includes a Firebase bearer token when currentUser supplies one", async () => {
  const calls = [];
  const { namespace } = await loadPinAuthClient({
    currentUser: { getIdToken: async () => "firebase-id-token" },
    fetchImpl: async (...args) => {
      calls.push(args);
      return { ok: true, json: async () => ({ ok: true }) };
    },
  });

  await namespace.requestPinAuth({ action: "register" });

  assert.equal(calls[0][1].headers.Authorization, "Bearer firebase-id-token");
  assert.equal(calls[0][1].cache, "no-store");
});

test("public PIN login does not attempt to refresh a stale Firebase token", async () => {
  const calls = [];
  const { namespace } = await loadPinAuthClient({
    currentUser: {
      getIdToken: async () => {
        throw Object.assign(new Error("refresh token revoked"), { code: "auth/user-token-expired" });
      },
    },
    fetchImpl: async (...args) => {
      calls.push(args);
      return { ok: true, json: async () => ({ customToken: "fresh-custom-token" }) };
    },
  });

  const result = await namespace.requestPinAuth({ action: "login", schoolName: "S", realName: "T", pin: "1234" });

  assert.deepEqual(result, { customToken: "fresh-custom-token" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].headers.Authorization, undefined);
});

for (const stalledPhase of ["auth restoration", "old token refresh"]) {
  test(`public PIN login starts while previous session ${stalledPhase} is stalled`, async () => {
    let release;
    const stalled = new Promise(resolve => { release = resolve; });
    const calls = [];
    const { namespace } = await loadPinAuthClient({
      authStateReadyImpl: () => stalledPhase === "auth restoration" ? stalled : Promise.resolve(),
      currentUser: { getIdToken: () => stalled },
      fetchImpl: async (...args) => {
        calls.push(args);
        return { ok: true, json: async () => ({ customToken: "new-pin-token" }) };
      },
    });
    const login = namespace.requestPinAuth({ action: "login", schoolName: "S", realName: "T", pin: "1234" });
    try {
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(calls.length, 1, "PIN verification must not wait for a previous session");
      assert.equal(calls[0][1].headers.Authorization, undefined);
      assert.deepEqual(await login, { customToken: "new-pin-token" });
    } finally {
      release();
    }
  });
}

test("PIN reset rethrows stale Firebase token refresh failure before fetch", async () => {
  const staleTokenError = Object.assign(new Error("refresh token revoked"), { code: "auth/user-token-expired" });
  let fetchCalls = 0;
  const { namespace } = await loadPinAuthClient({
    currentUser: {
      getIdToken: async () => {
        throw staleTokenError;
      },
    },
    fetchImpl: async () => {
      fetchCalls += 1;
      return { ok: true, json: async () => ({ ok: true }) };
    },
  });

  await assert.rejects(
    namespace.requestPinAuth({ action: "reset", uid: "pin-user", pin: "9999", pinConfirm: "9999" }),
    staleTokenError
  );
  assert.equal(fetchCalls, 0);
});

test("requestPinAuth maps unavailable Firebase and backend request failures to stable auth errors", async () => {
  const unavailable = await loadPinAuthClient({ configured: false });
  await assert.rejects(
    unavailable.namespace.requestPinAuth({ action: "login" }),
    { code: "auth/pin-unavailable", message: "Firebase 설정이 필요합니다." }
  );

  const backend = await loadPinAuthClient({
    fetchImpl: async () => ({
      ok: false,
      json: async () => ({ code: "auth/invalid-pin", message: "PIN mismatch" }),
    }),
  });
  await assert.rejects(
    backend.namespace.requestPinAuth({ action: "login" }),
    { code: "auth/invalid-pin", message: "PIN mismatch" }
  );

  const nonJson = await loadPinAuthClient({
    fetchImpl: async () => ({
      ok: false,
      json: async () => {
        throw new Error("not json");
      },
    }),
  });
  await assert.rejects(
    nonJson.namespace.requestPinAuth({ action: "login" }),
    { code: "auth/pin-unavailable", message: "로그인 서버에 연결하지 못했습니다." }
  );
});
