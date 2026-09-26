import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const authSource = readFileSync(new URL("../lib/auth.js", import.meta.url), "utf8");
const userSource = readFileSync(new URL("../lib/user.js", import.meta.url), "utf8");
const guestKey = "guest_teacher_profile";

class Storage {
  constructor(seed = {}) {
    this.items = new Map(Object.entries(seed));
  }
  getItem(key) {
    return this.items.has(key) ? this.items.get(key) : null;
  }
  setItem(key, value) {
    this.items.set(key, String(value));
  }
  removeItem(key) {
    this.items.delete(key);
  }
}

function synthetic(context, exports) {
  const names = Object.keys(exports);
  return new vm.SyntheticModule(names, function defineExports() {
    for (const name of names) this.setExport(name, exports[name]);
  }, { context });
}

function appUser(uid, claims = { pinAuthenticated: true, firebase: { sign_in_provider: "custom" } }) {
  return {
    uid,
    email: "",
    isAnonymous: false,
    getIdTokenResult: async () => ({ claims }),
  };
}

async function loadAuthHarness({
  requestPinAuth = async () => ({ customToken: "custom-token" }),
  credentialUser = appUser("pin-user"),
  users = {
    "users/pin-user": { realName: "핀 사용자", schoolName: "한성고", role: "student" },
  },
  adminUid = null,
  storageSeed = {},
  beforeGetDoc = async () => {},
  beforeTransaction = async () => {},
  now = () => Date.now(),
} = {}) {
  const localStorage = new Storage(storageSeed);
  const sessionStorage = new Storage(storageSeed);
  const auth = { currentUser: null };
  const state = {
    authCallback: null,
    authCallbacks: new Set(),
    credentialUser,
    customTokenCalls: [],
    signOutCalls: 0,
    getDocCalls: [],
    setDocCalls: [],
  };
  const docs = new Map(Object.entries(users));
  if (adminUid) docs.set("system/admin", { uid: adminUid });

  const context = vm.createContext({
    console,
    crypto: { randomUUID: () => "uuid" },
    Date: class extends Date { static now() { return now(); } },
    Error,
    Event: class Event {
      constructor(type) {
        this.type = type;
      }
    },
    JSON,
    Math,
    Object,
    Promise,
    String,
    localStorage,
    sessionStorage,
    window: { dispatchEvent: () => {} },
  });

  const firebaseModule = synthetic(context, { auth, db: {}, isFirebaseConfigured: true });
  const firebaseAuthModule = synthetic(context, {
    GoogleAuthProvider: class GoogleAuthProvider {
      setCustomParameters() {}
    },
    onAuthStateChanged: (_auth, callback) => {
      state.authCallbacks.add(callback);
      state.authCallback = async (next) => {
        auth.currentUser = next;
        await Promise.all([...state.authCallbacks].map((notify) => notify(next)));
      };
      return () => state.authCallbacks.delete(callback);
    },
    signInWithCustomToken: async (_auth, token) => {
      state.customTokenCalls.push(token);
      auth.currentUser = state.credentialUser;
      for (const notify of state.authCallbacks) void notify(auth.currentUser);
      return { user: state.credentialUser };
    },
    signInWithPopup: async () => {
      auth.currentUser = state.credentialUser;
      for (const notify of state.authCallbacks) void notify(auth.currentUser);
      return { user: state.credentialUser };
    },
    signOut: async () => {
      state.signOutCalls += 1;
      auth.currentUser = null;
      for (const notify of state.authCallbacks) void notify(null);
    },
  });
  const firestoreModule = synthetic(context, {
    doc: (_db, ...parts) => ({ path: parts.join("/") }),
    getDoc: async (ref) => {
      state.getDocCalls.push(ref.path);
      await beforeGetDoc(ref, state);
      const data = docs.get(ref.path);
      return {
        exists: () => data !== undefined,
        data: () => ({ ...data }),
      };
    },
    runTransaction: async (_db, run) => {
      await beforeTransaction();
      return run({
        get: async (ref) => ({ exists: () => docs.has(ref.path), data: () => ({ ...docs.get(ref.path) }) }),
        set: (ref, data) => docs.set(ref.path, data),
      });
    },
    serverTimestamp: () => new Date(0),
    setDoc: async (ref, data) => {
      state.setDocCalls.push([ref.path, data]);
      docs.set(ref.path, data);
    },
  });
  const pinAuthClientModule = synthetic(context, { requestPinAuth });
  const userModule = new vm.SourceTextModule(userSource, { context });
  const authModule = new vm.SourceTextModule(authSource, { context });

  async function linker(specifier) {
    if (specifier === "./firebase") return firebaseModule;
    if (specifier === "firebase/auth") return firebaseAuthModule;
    if (specifier === "firebase/firestore") return firestoreModule;
    if (specifier === "./pinAuthClient") return pinAuthClientModule;
    if (specifier === "./user") return userModule;
    throw new Error(`Unexpected import: ${specifier}`);
  }

  await userModule.link(linker);
  await authModule.link(linker);
  await userModule.evaluate();
  await authModule.evaluate();
  return { auth: authModule.namespace, user: userModule.namespace, state, localStorage, sessionStorage, firebaseAuth: auth, docs };
}

test("localStorage guest session cannot provide Firebase auth when Firebase is configured", async () => {
  const saved = JSON.stringify({ uid: "legacy-local", schoolName: "학교", teacherName: "선생님" });
  const { user } = await loadAuthHarness({ storageSeed: { [guestKey]: saved } });

  assert.equal(user.getGuestTeacherUser()?.uid, "legacy-local");
  assert.equal(user.getCurrentUser(), null);
});

test("anonymous legacy auth callback emits null and retains the stored guest session", async () => {
  const saved = JSON.stringify({ uid: "legacy-token", schoolName: "학교", teacherName: "선생님" });
  const { auth, state, localStorage, sessionStorage, user } = await loadAuthHarness({ storageSeed: { [guestKey]: saved } });
  const callbacks = [];

  auth.onAuthChange((next) => callbacks.push(next));
  await state.authCallback({
    uid: "anonymous-uid",
    isAnonymous: true,
    getIdTokenResult: async () => ({ claims: { pinAuthenticated: false } }),
  });

  assert.deepEqual(callbacks, [null]);
  assert.equal(user.getCurrentUser(), null);
  assert.equal(localStorage.getItem(guestKey), saved);
  assert.equal(sessionStorage.getItem(guestKey), saved);
});

test("wrong backend PIN request never signs in to Firebase", async () => {
  const { auth, state } = await loadAuthHarness({
    requestPinAuth: async () => {
      throw Object.assign(new Error("PIN이 일치하지 않습니다."), { code: "auth/invalid-pin" });
    },
  });

  await assert.rejects(
    auth.signInWithPin({ mode: "login", schoolName: "학교", realName: "학생", pin: "0000" }),
    { code: "auth/invalid-pin" }
  );
  assert.deepEqual(state.customTokenCalls, []);
  assert.equal(state.signOutCalls, 0);
});

test("custom-token sign-in requires pinAuthenticated claim", async () => {
  const { auth, state, localStorage } = await loadAuthHarness({
    credentialUser: appUser("pin-user", { pinAuthenticated: false }),
  });

  await assert.rejects(
    auth.signInWithPin({ mode: "login", schoolName: "학교", realName: "학생", pin: "1234" }),
    /PIN 인증을 확인하지 못했습니다\./
  );
  assert.deepEqual(state.customTokenCalls, ["custom-token"]);
  assert.equal(state.signOutCalls, 1);
  assert.equal(localStorage.getItem(guestKey), null);
});

test("PIN sign-in returns and stores the same Firebase UID from the custom-token credential", async () => {
  const { auth, state, localStorage } = await loadAuthHarness({
    requestPinAuth: async (payload) => {
      assert.equal(payload.action, "register");
      assert.equal(payload.schoolName, "한성고");
      assert.equal(payload.realName, "핀 사용자");
      assert.equal(payload.pin, "1234");
      assert.equal(payload.pinConfirm, "1234");
      return { customToken: "token-for-pin-user" };
    },
    credentialUser: appUser("pin-user", { pinAuthenticated: true }),
  });

  const signedIn = await auth.signInWithPin({
    mode: "register",
    schoolName: "한성고",
    realName: "핀 사용자",
    pin: "1234",
    pinConfirm: "1234",
  });

  assert.equal(signedIn.uid, "pin-user");
  assert.equal(signedIn.isGuestTeacher, true);
  assert.deepEqual(state.customTokenCalls, ["token-for-pin-user"]);
  assert.deepEqual(state.getDocCalls, ["users/pin-user"]);
  assert.equal(JSON.parse(localStorage.getItem(guestKey)).uid, "pin-user");
});

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

const loginInput = { mode: "login", schoolName: "한성고", realName: "학생", pin: "1234" };
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("PIN sign-in and simultaneous auth consumers share one profile read, including a late route mount", async () => {
  const gate = deferred();
  const { auth, state } = await loadAuthHarness({ beforeGetDoc: () => gate.promise });
  const values = [[], [], []];
  for (const next of values) auth.onAuthChange((user) => next.push(user));
  const signingIn = auth.signInWithPin(loginInput);
  await tick();
  assert.deepEqual(state.getDocCalls, ["users/pin-user"]);
  gate.resolve();
  const signedIn = await signingIn;
  await tick();
  for (const next of values) assert.equal(next.at(-1), signedIn);
  const late = [];
  auth.onAuthChange((user) => late.push(user));
  await state.authCallback(state.credentialUser);
  assert.equal(late.at(-1), signedIn);
  assert.deepEqual(state.getDocCalls, ["users/pin-user"]);
});

test("profile handoff expires so later consumers refresh changed profile data", async () => {
  let time = 1000;
  const { auth, state, docs } = await loadAuthHarness({ now: () => time });
  const values = [];
  auth.onAuthChange((user) => values.push(user));
  await state.authCallback(state.credentialUser);
  docs.set("users/pin-user", { realName: "변경 이름", schoolName: "학교" });
  time += 6000;
  await state.authCallback(state.credentialUser);
  assert.equal(values.at(-1).realName, "변경 이름");
  assert.equal(state.getDocCalls.length, 2);
});

test("sign-out during pending PIN hydration cannot restore the old user or guest session", async () => {
  const gate = deferred();
  const { auth, state, user, localStorage } = await loadAuthHarness({ beforeGetDoc: () => gate.promise });
  const values = [];
  auth.onAuthChange((next) => values.push(next));
  const signingIn = auth.signInWithPin(loginInput);
  const rejected = assert.rejects(signingIn, { code: "auth/session-changed" });
  await tick();
  await auth.signOutUser();
  gate.resolve();
  await rejected;
  await tick();
  assert.equal(user.getCurrentUser(), null);
  assert.equal(localStorage.getItem(guestKey), null);
  assert.deepEqual(values, [null]);
  assert.equal(state.signOutCalls, 1);
});

test("switching Firebase accounts ignores a late profile result from the previous account", async () => {
  const gate = deferred();
  const { auth, state, user } = await loadAuthHarness({
    users: { "users/old": { realName: "이전" }, "users/new": { realName: "현재" } },
    beforeGetDoc: (ref) => ref.path === "users/old" ? gate.promise : undefined,
  });
  const values = [];
  auth.onAuthChange((next) => values.push(next));
  const old = state.authCallback(appUser("old"));
  await tick();
  await state.authCallback(appUser("new"));
  gate.resolve();
  await old;
  assert.deepEqual(values.map((next) => next?.uid), ["new"]);
  assert.equal(user.getCurrentUser().uid, "new");
});

test("unsubscribed auth consumers cannot publish a pending profile result", async () => {
  const gate = deferred();
  const { auth, state, user } = await loadAuthHarness({ beforeGetDoc: () => gate.promise });
  const values = [];
  const unsubscribe = auth.onAuthChange((next) => values.push(next));
  const pending = state.authCallback(state.credentialUser);
  await tick();
  unsubscribe();
  gate.resolve();
  await pending;
  assert.deepEqual(values, []);
  assert.equal(user.getCurrentUser(), null);
});

test("a new PIN login with the same Firebase User object refreshes its profile", async () => {
  const { auth, state, docs } = await loadAuthHarness();
  auth.onAuthChange(() => {});
  await auth.signInWithPin(loginInput);
  docs.set("users/pin-user", { realName: "새 로그인", schoolName: "학교" });
  const next = await auth.signInWithPin(loginInput);
  assert.equal(next.realName, "새 로그인");
  assert.equal(state.getDocCalls.length, 2);
});

test("a changed verified provider on the same Firebase User never reuses the prior role", async () => {
  let claims = { pinAuthenticated: true, firebase: { sign_in_provider: "custom" } };
  const credentialUser = { ...appUser("pin-user"), getIdTokenResult: async () => ({ claims }) };
  const { auth, state } = await loadAuthHarness({ credentialUser, adminUid: "pin-user" });
  const values = [];
  auth.onAuthChange((next) => values.push(next));
  await state.authCallback(credentialUser);
  claims = { firebase: { sign_in_provider: "google.com" } };
  await state.authCallback(credentialUser);
  assert.equal(values[0].role, "student");
  assert.equal(values[1].role, "admin");
  assert.deepEqual(state.getDocCalls, ["users/pin-user", "users/pin-user", "system/admin"]);
});

test("failed hydration is retried by a later subscriber instead of cached", async () => {
  let fail = true;
  const { auth, state } = await loadAuthHarness({ beforeGetDoc: async () => { if (fail) throw new Error("offline"); } });
  const values = [];
  auth.onAuthChange((next) => values.push(next));
  await state.authCallback(state.credentialUser);
  fail = false;
  await state.authCallback(state.credentialUser);
  assert.equal(values[0], null);
  assert.equal(values[1].uid, "pin-user");
  assert.equal(state.getDocCalls.length, 2);
});

test("Google admin bootstrap refreshes a profile read that completed before the transaction", async () => {
  const transactionGate = deferred();
  const credentialUser = { ...appUser("admin", { firebase: { sign_in_provider: "google.com" } }), emailVerified: true, displayName: "관리자" };
  const { auth, state } = await loadAuthHarness({
    credentialUser,
    users: { "users/admin": { realName: "이전 이름" } },
    beforeTransaction: () => transactionGate.promise,
  });
  auth.onAuthChange(() => {});
  const signingIn = auth.signInAsAdminWithGoogle();
  await tick();
  transactionGate.resolve();
  const signedIn = await signingIn;
  assert.equal(signedIn.role, "admin");
  assert.equal(signedIn.realName, "관리자");
  assert.equal(state.getDocCalls.filter((path) => path === "users/admin").length, 2);
});

test("sign-out cancels a pending PIN request before it can authenticate again", async () => {
  const gate = deferred();
  const { auth, state } = await loadAuthHarness({ requestPinAuth: async () => { await gate.promise; return { customToken: "late" }; } });
  const signingIn = auth.signInWithPin(loginInput);
  const rejected = assert.rejects(signingIn, { code: "auth/session-changed" });
  await auth.signOutUser();
  gate.resolve();
  await rejected;
  assert.deepEqual(state.customTokenCalls, []);
});

test("a Google bootstrap failure cannot sign out a newer PIN session", async () => {
  const gate = deferred();
  const credentialUser = { ...appUser("admin", { firebase: { sign_in_provider: "google.com" } }), emailVerified: true };
  const { auth, state, user, firebaseAuth } = await loadAuthHarness({
    credentialUser,
    beforeTransaction: async () => { await gate.promise; throw new Error("transaction failed"); },
  });
  const signingIn = auth.signInAsAdminWithGoogle();
  const rejected = assert.rejects(signingIn, { code: "auth/session-changed" });
  await tick();
  state.credentialUser = appUser("pin-user");
  await auth.signInWithPin(loginInput);
  gate.resolve();
  await rejected;
  assert.equal(firebaseAuth.currentUser.uid, "pin-user");
  assert.equal(user.getCurrentUser().uid, "pin-user");
  assert.equal(state.signOutCalls, 0);
});
