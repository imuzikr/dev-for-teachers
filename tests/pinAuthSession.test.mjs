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
} = {}) {
  const localStorage = new Storage(storageSeed);
  const sessionStorage = new Storage(storageSeed);
  const auth = { currentUser: null };
  const state = {
    authCallback: null,
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
    Date,
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
      state.authCallback = callback;
      return () => {};
    },
    signInWithCustomToken: async (_auth, token) => {
      state.customTokenCalls.push(token);
      return { user: credentialUser };
    },
    signInWithPopup: async () => {
      throw new Error("unexpected popup");
    },
    signOut: async () => {
      state.signOutCalls += 1;
    },
  });
  const firestoreModule = synthetic(context, {
    doc: (_db, ...parts) => ({ path: parts.join("/") }),
    getDoc: async (ref) => {
      state.getDocCalls.push(ref.path);
      const data = docs.get(ref.path);
      return {
        exists: () => data !== undefined,
        data: () => ({ ...data }),
      };
    },
    runTransaction: async () => {
      throw new Error("unexpected transaction");
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
  return { auth: authModule.namespace, user: userModule.namespace, state, localStorage, sessionStorage };
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
