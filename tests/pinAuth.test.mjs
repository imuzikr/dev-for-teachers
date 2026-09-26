import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as util from "node:util";
import vm from "node:vm";

const source = readFileSync(new URL("../lib/server/pinAuth.js", import.meta.url), "utf8");

async function loadPinAuth() {
  const context = vm.createContext({
    Array,
    Boolean,
    Buffer,
    Date,
    Error,
    JSON,
    Number,
    Object,
    Promise,
    RegExp,
    Response,
    Set,
    String,
    TextDecoder,
    Uint8Array,
  });
  const modules = new Map();
  function synthetic(specifier, namespace) {
    const names = Object.keys(namespace);
    const module = new vm.SyntheticModule(names, function init() {
      for (const name of names) this.setExport(name, namespace[name]);
    }, { context });
    modules.set(specifier, module);
    return module;
  }
  synthetic("node:crypto", crypto);
  synthetic("node:util", util);
  const module = new vm.SourceTextModule(source, { context });
  await module.link((specifier) => {
    const found = modules.get(specifier);
    if (!found) throw new Error(`unexpected import ${specifier}`);
    return found;
  });
  await module.evaluate();
  return module.namespace;
}

class FakeSnap {
  constructor(id, data) {
    this.id = id;
    this._data = data;
    this.exists = data !== undefined;
  }
  data() {
    return structuredClone(this._data);
  }
}

class FakeDoc {
  constructor(db, path) {
    this.db = db;
    this.path = path;
    this.id = path.split("/").pop();
  }
  async get() {
    await this.db.beforeGet?.(this.path);
    return new FakeSnap(this.id, this.db.docs.get(this.path));
  }
  async delete() {
    this.db.docs.delete(this.path);
  }
}

class FakeCollection {
  constructor(db, name) {
    this.db = db;
    this.name = name;
    this.filters = [];
    this.max = Infinity;
  }
  doc(id) {
    return new FakeDoc(this.db, `${this.name}/${id}`);
  }
  where(field, op, value) {
    assert.equal(op, "==");
    const next = new FakeCollection(this.db, this.name);
    next.filters = [...this.filters, [field, value]];
    next.max = this.max;
    return next;
  }
  limit(max) {
    const next = new FakeCollection(this.db, this.name);
    next.filters = this.filters;
    next.max = max;
    return next;
  }
  async get() {
    const prefix = `${this.name}/`;
    const docs = [];
    for (const [path, data] of this.db.docs.entries()) {
      if (!path.startsWith(prefix) || path.slice(prefix.length).includes("/")) continue;
      if (this.filters.every(([field, value]) => data?.[field] === value)) {
        docs.push(new FakeSnap(path.slice(prefix.length), data));
      }
      if (docs.length >= this.max) break;
    }
    return { docs };
  }
}

class FakeTransaction {
  constructor(db) {
    this.db = db;
  }
  async get(ref) {
    return ref.get();
  }
  set(ref, data, options = {}) {
    const current = this.db.docs.get(ref.path);
    this.db.docs.set(ref.path, options.merge ? { ...(current ?? {}), ...structuredClone(data) } : structuredClone(data));
  }
  create(ref, data) {
    if (this.db.docs.has(ref.path)) throw Object.assign(new Error("exists"), { code: "already-exists" });
    this.db.docs.set(ref.path, structuredClone(data));
  }
}

class FakeDb {
  constructor(seed = {}) {
    this.docs = new Map(Object.entries(seed).map(([path, data]) => [path, structuredClone(data)]));
    this.queue = Promise.resolve();
  }
  collection(name) {
    return new FakeCollection(this, name);
  }
  doc(path) {
    return new FakeDoc(this, path);
  }
  async runTransaction(fn) {
    const run = this.queue.then(() => fn(new FakeTransaction(this)));
    this.queue = run.catch(() => {});
    return run;
  }
}

class FakeAuth {
  constructor({ tokens = {}, users = {} } = {}) {
    this.tokens = tokens;
    this.users = new Map(Object.entries(users).map(([uid, record]) => [uid, { uid, providerData: [], ...record }]));
    this.customTokens = [];
    this.verifyCalls = [];
    this.revoked = [];
  }
  async verifyIdToken(token, checkRevoked) {
    this.verifyCalls.push({ token, checkRevoked });
    const decoded = this.tokens[token];
    if (!decoded) throw Object.assign(new Error("bad token"), { code: "auth/invalid-token" });
    return { ...decoded };
  }
  async createUser(user) {
    if (this.users.has(user.uid)) throw Object.assign(new Error("exists"), { code: "auth/uid-already-exists" });
    this.users.set(user.uid, { uid: user.uid, providerData: [] });
    return this.users.get(user.uid);
  }
  async deleteUser(uid) {
    this.users.delete(uid);
  }
  async getUser(uid) {
    const user = this.users.get(uid);
    if (!user) throw Object.assign(new Error("missing"), { code: "auth/user-not-found" });
    return user;
  }
  async createCustomToken(uid, claims) {
    this.customTokens.push({ uid, claims });
    return `token:${uid}:${claims.pinAuthenticated}`;
  }
  async revokeRefreshTokens(uid) {
    this.revoked.push(uid);
  }
}

function req(body, { token = "", ip = "" } = {}) {
  const encoded = new TextEncoder().encode(JSON.stringify(body));
  return {
    headers: new Headers({
      "Content-Type": "application/json",
      "Content-Length": String(encoded.byteLength),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(ip ? { "x-nf-client-connection-ip": ip } : {}),
    }),
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(encoded);
        controller.close();
      },
    }),
  };
}

function response(body, init = {}) {
  return { body, status: init.status ?? 200 };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function deps({ db = new FakeDb(), auth = new FakeAuth(), now = 1000 } = {}) {
  return {
    db,
    auth,
    value: {
      now: () => now,
      getServices: async () => ({ db, auth, bucket: {} }),
    },
  };
}

test("register validates a 4 digit PIN, stores only a salted hash, and returns a PIN custom token", async () => {
  const api = await loadPinAuth();
  const h = deps();
  const result = await api.handlePinAuthPost(req({
    action: "register",
    schoolName: "새학교",
    realName: "김학생",
    pin: "0123",
    pinConfirm: "0123",
  }), h.value, response);

  assert.equal(result.status, 200);
  assert.match(result.body.customToken, /^token:pin_/);
  const uid = h.auth.customTokens[0].uid;
  assert.deepEqual(plain(h.auth.customTokens[0].claims), { pinAuthenticated: true });
  const credential = h.db.docs.get(`pinCredentials/${uid}`);
  assert.equal(credential.pin, undefined);
  assert.notEqual(credential.hash, "0123");
  assert.equal(credential.salt.length > 10, true);
  assert.equal(h.db.docs.get(`users/${uid}`).role, "student");

  const bad = await api.handlePinAuthPost(req({
    action: "register",
    schoolName: "새학교",
    realName: "박학생",
    pin: "12345",
    pinConfirm: "12345",
  }), h.value, response);
  assert.equal(bad.status, 400);
});

test("request body reader enforces the 4KB bound even when request.json exists", async () => {
  const api = await loadPinAuth();
  const body = {
    action: "begin",
    schoolName: "긴학교",
    realName: "김학생",
    padding: "x".repeat(5000),
  };
  const request = req(body);
  request.headers.set("Content-Length", "0");
  request.json = async () => body;

  const result = await api.handlePinAuthPost(request, deps().value, response);

  assert.equal(result.status, 400);
  assert.equal(result.body.code, "auth/pin-invalid-request");
});

test("login rejects wrong PINs, rate limits before hash checks, and succeeds with leading zeros", async () => {
  const api = await loadPinAuth();
  const h = deps();
  await api.handlePinAuthPost(req({
    action: "register",
    schoolName: "가나초",
    realName: "이학생",
    pin: "0007",
    pinConfirm: "0007",
  }), h.value, response);

  const wrong = await api.handlePinAuthPost(req({
    action: "login",
    schoolName: "가나초",
    realName: "이학생",
    pin: "0008",
  }), h.value, response);
  assert.equal(wrong.status, 401);

  const ok = await api.handlePinAuthPost(req({
    action: "login",
    schoolName: "가나초",
    realName: "이학생",
    pin: "0007",
  }), h.value, response);
  assert.equal(ok.status, 200);
  assert.match(ok.body.customToken, /:true$/);

  for (let i = 0; i < 5; i += 1) {
    const attempt = await api.handlePinAuthPost(req({
      action: "login",
      schoolName: "가나초",
      realName: "없는학생",
      pin: "1111",
    }), h.value, response);
    assert.equal(attempt.status, 401);
  }
  const limited = await api.handlePinAuthPost(req({
    action: "login",
    schoolName: "가나초",
    realName: "없는학생",
    pin: "1111",
  }), h.value, response);
  assert.equal(limited.status, 429);
});

test("login refuses disabled, missing Auth, Google, system admin, teacher, and role-admin PIN targets", async () => {
  const api = await loadPinAuth();
  const h = deps();
  const cases = [
    ["disabled", "중지초", "정학생", { disabled: true }, {}, 409, "auth/pin-target-unavailable"],
    ["missingAuth", "삭제초", "권학생", null, {}, 409, "auth/pin-target-unavailable"],
    ["google", "구글초", "나학생", { providerData: [{ providerId: "google.com" }] }, {}, 403, "auth/pin-target-forbidden"],
    ["sysadmin", "시스템초", "관리자", {}, {}, 403, "auth/pin-target-forbidden"],
    ["teacher", "교사초", "김교사", {}, { role: "teacher" }, 403, "auth/pin-target-forbidden"],
    ["roleadmin", "역할초", "관리자", {}, { role: "admin" }, 403, "auth/pin-target-forbidden"],
  ];

  for (const [uid, schoolName, realName, authRecord, profilePatch, status, code] of cases) {
    const identity = api.pinAuthInternals.canonicalIdentity(schoolName, realName);
    const hash = api.pinAuthInternals.identityHash(identity);
    const credential = await api.pinAuthInternals.hashPin("1212");
    h.db.docs.set(`pinIdentities/${hash}`, { uid, ...identity });
    h.db.docs.set(`pinCredentials/${uid}`, { uid, identityHash: hash, ...identity, ...credential });
    h.db.docs.set(`users/${uid}`, { schoolName, realName, role: "student", ...profilePatch });
    if (authRecord) h.auth.users.set(uid, { uid, providerData: [], ...authRecord });
    if (uid === "sysadmin") h.db.docs.set("system/admin", { uid });

    const result = await api.handlePinAuthPost(req({
      action: "login",
      schoolName,
      realName,
      pin: "1212",
    }), h.value, response);

    assert.equal(result.status, status);
    assert.equal(result.body.code, code);
  }
});

test("login starts independent account checks while the profile lookup is still pending", async () => {
  const api = await loadPinAuth();
  const h = deps();
  const identity = { schoolName: "parallel-school", realName: "parallel-student", pin: "1212" };
  await api.handlePinAuthPost(req({ action: "register", ...identity, pinConfirm: identity.pin }), h.value, response);
  const uid = h.auth.customTokens[0].uid;
  const started = [];
  let releaseProfile;
  let markProfileStarted;
  const profileGate = new Promise((resolve) => { releaseProfile = resolve; });
  const profileStarted = new Promise((resolve) => { markProfileStarted = resolve; });
  h.db.beforeGet = async (path) => {
    if (path === `users/${uid}`) {
      started.push("profile");
      markProfileStarted();
      await profileGate;
    }
    if (path === "system/admin") started.push("admin");
  };
  const getUser = h.auth.getUser.bind(h.auth);
  h.auth.getUser = async (targetUid) => {
    started.push("auth");
    return getUser(targetUid);
  };

  const pending = api.handlePinAuthPost(req({ action: "login", ...identity }), h.value, response);
  await profileStarted;
  const startedBeforeProfileResolved = [...started];
  const tokensBeforeProfileResolved = h.auth.customTokens.length;
  releaseProfile();
  const result = await pending;

  assert.deepEqual(startedBeforeProfileResolved, ["profile", "admin", "auth"]);
  assert.equal(tokensBeforeProfileResolved, 1, "no login token may be issued before all account checks finish");
  assert.equal(result.status, 200);
  assert.equal(h.auth.customTokens.length, 2);
});

test("login fails closed on account lookup failures and preserves account rejection priority", async () => {
  const api = await loadPinAuth();
  const h = deps();
  const identity = { schoolName: "failure-school", realName: "failure-student", pin: "1212" };
  await api.handlePinAuthPost(req({ action: "register", ...identity, pinConfirm: identity.pin }), h.value, response);
  const uid = h.auth.customTokens[0].uid;
  const profile = h.db.docs.get(`users/${uid}`);
  const getUser = h.auth.getUser.bind(h.auth);
  const cases = [
    { name: "profile service failure", failedLookup: "profile", status: 503, code: "auth/pin-unavailable" },
    { name: "admin service failure", failedLookup: "admin", status: 503, code: "auth/pin-unavailable" },
    { name: "auth service failure", authFailure: true, status: 503, code: "auth/pin-unavailable" },
    { name: "deleted profile", missingProfile: true, failedLookup: "admin", authFailure: true, status: 409, code: "auth/pin-orphaned-identity" },
    { name: "teacher profile", role: "teacher", failedLookup: "admin", authFailure: true, status: 403, code: "auth/pin-target-forbidden" },
    { name: "system admin", admin: true, authFailure: true, status: 403, code: "auth/pin-target-forbidden" },
  ];
  for (const item of cases) {
    h.db.docs.set(`users/${uid}`, { ...profile, role: item.role ?? "student" });
    if (item.missingProfile) h.db.docs.delete(`users/${uid}`);
    if (item.admin) h.db.docs.set("system/admin", { uid });
    else h.db.docs.delete("system/admin");
    for (const path of h.db.docs.keys()) {
      if (path.startsWith("pinLoginAttempts/")) h.db.docs.delete(path);
    }
    h.db.beforeGet = async (path) => {
      if ((item.failedLookup === "profile" && path === `users/${uid}`)
          || (item.failedLookup === "admin" && path === "system/admin")) {
        throw new Error("account lookup unavailable");
      }
    };
    h.auth.getUser = async (targetUid) => {
      if (item.authFailure) throw new Error("auth lookup unavailable");
      return getUser(targetUid);
    };

    const result = await api.handlePinAuthPost(req({ action: "login", ...identity }), h.value, response);
    assert.equal(result.status, item.status, item.name);
    assert.equal(result.body.code, item.code, item.name);
    assert.equal(h.auth.customTokens.length, 1, `${item.name} must not issue a token`);
  }
});

test("orphaned PIN identities fail closed instead of returning a token for a deleted profile", async () => {
  const api = await loadPinAuth();
  const h = deps();
  await api.handlePinAuthPost(req({
    action: "register",
    schoolName: "삭제초",
    realName: "윤학생",
    pin: "9090",
    pinConfirm: "9090",
  }), h.value, response);
  const uid = h.auth.customTokens[0].uid;
  h.db.docs.delete(`users/${uid}`);

  const begin = await api.handlePinAuthPost(req({
    action: "begin",
    schoolName: "삭제초",
    realName: "윤학생",
  }), h.value, response);
  assert.equal(begin.status, 409);
  assert.equal(begin.body.code, "auth/pin-orphaned-identity");

  const login = await api.handlePinAuthPost(req({
    action: "login",
    schoolName: "삭제초",
    realName: "윤학생",
    pin: "9090",
  }), h.value, response);
  assert.equal(login.status, 409);
  assert.equal(login.body.code, "auth/pin-orphaned-identity");
  assert.equal(h.auth.customTokens.length, 1);
  assert.equal(h.db.docs.has(`users/${uid}`), false);
});

test("legacy enrollment requires the matching bearer owner and then reuses that UID", async () => {
  const api = await loadPinAuth();
  const db = new FakeDb({
    "users/legacy": { schoolName: "기존초", realName: "최학생", role: "student", createdAt: "old" },
  });
  const auth = new FakeAuth({
    tokens: { owner: { uid: "legacy" }, other: { uid: "other" } },
    users: { legacy: { providerData: [] } },
  });
  const h = deps({ db, auth });

  const unauth = await api.handlePinAuthPost(req({
    action: "begin",
    schoolName: "기존초",
    realName: "최학생",
  }), h.value, response);
  assert.equal(unauth.status, 401);
  assert.equal(unauth.body.code, "auth/pin-enrollment-required");

  const wrongOwner = await api.handlePinAuthPost(req({
    action: "register",
    schoolName: "기존초",
    realName: "최학생",
    pin: "2222",
    pinConfirm: "2222",
  }, { token: "other" }), h.value, response);
  assert.equal(wrongOwner.status, 401);

  const begin = await api.handlePinAuthPost(req({
    action: "begin",
    schoolName: "기존초",
    realName: "최학생",
  }, { token: "owner" }), h.value, response);
  assert.deepEqual(plain(begin.body), { mode: "enroll" });
  assert.deepEqual(auth.verifyCalls.at(-1), { token: "owner", checkRevoked: true });

  const registered = await api.handlePinAuthPost(req({
    action: "register",
    schoolName: "기존초",
    realName: "최학생",
    pin: "2222",
    pinConfirm: "2222",
  }, { token: "owner" }), h.value, response);
  assert.equal(registered.status, 200);
  assert.equal(auth.customTokens[0].uid, "legacy");
  assert.deepEqual(auth.verifyCalls.at(-1), { token: "owner", checkRevoked: true });
});

test("legacy enrollment rejects teacher profiles and concurrent admin promotion or identity rename", async () => {
  const api = await loadPinAuth();
  const teacher = await api.handlePinAuthPost(req({
    action: "begin",
    schoolName: "교사초",
    realName: "김교사",
  }, { token: "teacher" }), deps({
    db: new FakeDb({ "users/teacher": { schoolName: "교사초", realName: "김교사", role: "teacher" } }),
    auth: new FakeAuth({ tokens: { teacher: { uid: "teacher" } }, users: { teacher: { providerData: [] } } }),
  }).value, response);
  assert.equal(teacher.status, 200);
  assert.deepEqual(plain(teacher.body), { mode: "register" });

  const promotedDb = new FakeDb({
    "users/legacy": { schoolName: "기존초", realName: "최학생", role: "student" },
  });
  let promotedOnce = false;
  const originalPromotedRun = promotedDb.runTransaction.bind(promotedDb);
  promotedDb.runTransaction = async (fn) => originalPromotedRun(async (transaction) => {
    if (!promotedOnce) {
      promotedOnce = true;
      promotedDb.docs.set("users/legacy", { schoolName: "기존초", realName: "최학생", role: "admin" });
    }
    return fn(transaction);
  });
  const promoted = await api.handlePinAuthPost(req({
    action: "register",
    schoolName: "기존초",
    realName: "최학생",
    pin: "2222",
    pinConfirm: "2222",
  }, { token: "owner" }), deps({
    db: promotedDb,
    auth: new FakeAuth({ tokens: { owner: { uid: "legacy" } }, users: { legacy: { providerData: [] } } }),
  }).value, response);
  assert.equal(promoted.status, 403);

  const renamedDb = new FakeDb({
    "users/legacy": { schoolName: "기존초", realName: "최학생", role: "student" },
  });
  let renamedOnce = false;
  const originalRenamedRun = renamedDb.runTransaction.bind(renamedDb);
  renamedDb.runTransaction = async (fn) => originalRenamedRun(async (transaction) => {
    if (!renamedOnce) {
      renamedOnce = true;
      renamedDb.docs.set("users/legacy", { schoolName: "다른초", realName: "최학생", role: "student" });
    }
    return fn(transaction);
  });
  const renamed = await api.handlePinAuthPost(req({
    action: "register",
    schoolName: "기존초",
    realName: "최학생",
    pin: "2222",
    pinConfirm: "2222",
  }, { token: "owner" }), deps({
    db: renamedDb,
    auth: new FakeAuth({ tokens: { owner: { uid: "legacy" } }, users: { legacy: { providerData: [] } } }),
  }).value, response);
  assert.equal(renamed.status, 409);
});

test("duplicates, concurrent registration, and trusted Netlify IP throttles fail closed", async () => {
  const api = await loadPinAuth();
  const duplicateDb = new FakeDb({
    "users/a": { schoolName: "중복초", realName: "한학생", role: "student" },
    "users/b": { schoolName: "중복초", realName: "한학생", role: "student" },
  });
  const duplicate = await api.handlePinAuthPost(req({
    action: "begin",
    schoolName: "중복초",
    realName: "한학생",
  }), deps({ db: duplicateDb, auth: new FakeAuth({ users: { a: {}, b: {} } }) }).value, response);
  assert.equal(duplicate.status, 409);

  const h = deps();
  const body = { action: "register", schoolName: "경쟁초", realName: "오학생", pin: "3333", pinConfirm: "3333" };
  const [one, two] = await Promise.all([
    api.handlePinAuthPost(req(body), h.value, response),
    api.handlePinAuthPost(req(body), h.value, response),
  ]);
  assert.deepEqual([one.status, two.status].sort(), [200, 409]);

  for (let i = 0; i < 300; i += 1) {
    const result = await api.handlePinAuthPost(req({
      action: "begin",
      schoolName: `IP초${i}`,
      realName: "학생",
    }, { ip: "203.0.113.10" }), h.value, response);
    assert.equal(result.status, 200);
  }
  const limited = await api.handlePinAuthPost(req({
    action: "begin",
    schoolName: "IP초301",
    realName: "학생",
  }, { ip: "203.0.113.10" }), h.value, response);
  assert.equal(limited.status, 429);
});

test("admin reset requires revoked-check Google admin and uses the server-loaded profile identity", async () => {
  const api = await loadPinAuth();
  const db = new FakeDb({
    "system/admin": { uid: "admin" },
    "users/student": { schoolName: "서버초", realName: "정학생", role: "student" },
    "users/admin": { schoolName: "관리초", realName: "관리자", role: "admin" },
  });
  const auth = new FakeAuth({
    tokens: {
      adminToken: { uid: "admin", email_verified: true, firebase: { sign_in_provider: "google.com" } },
      studentToken: { uid: "student", email_verified: true, firebase: { sign_in_provider: "google.com" } },
    },
    users: {
      admin: { providerData: [{ providerId: "google.com" }] },
      student: { providerData: [] },
      googleStudent: { providerData: [{ providerId: "google.com" }] },
    },
  });
  const h = deps({ db, auth });

  const denied = await api.handlePinAuthPost(req({
    action: "reset",
    uid: "student",
    pin: "4444",
    pinConfirm: "4444",
  }, { token: "studentToken" }), h.value, response);
  assert.equal(denied.status, 403);

  const ok = await api.handlePinAuthPost(req({
    action: "reset",
    uid: "student",
    schoolName: "클라이언트조작",
    realName: "조작",
    pin: "4444",
    pinConfirm: "4444",
  }, { token: "adminToken" }), h.value, response);
  assert.deepEqual(plain(ok), { status: 200, body: { ok: true } });
  assert.deepEqual(auth.verifyCalls.at(-1), { token: "adminToken", checkRevoked: true });
  assert.deepEqual(auth.revoked, ["student"]);
  const credential = db.docs.get("pinCredentials/student");
  assert.equal(credential.schoolName, "서버초");
  assert.equal(credential.realName, "정학생");

  const adminTarget = await api.handlePinAuthPost(req({
    action: "reset",
    uid: "admin",
    pin: "5555",
    pinConfirm: "5555",
  }, { token: "adminToken" }), h.value, response);
  assert.equal(adminTarget.status, 403);
});

test("admin reset transaction rereads target profile and fails closed on concurrent delete, rename conflict, or teacher role", async () => {
  const api = await loadPinAuth();
  const auth = new FakeAuth({
    tokens: { adminToken: { uid: "admin", email_verified: true, firebase: { sign_in_provider: "google.com" } } },
    users: { admin: { providerData: [{ providerId: "google.com" }] }, student: { providerData: [] }, teacher: { providerData: [] } },
  });

  const deletedDb = new FakeDb({
    "system/admin": { uid: "admin" },
    "users/student": { schoolName: "서버초", realName: "정학생", role: "student" },
  });
  let deletedOnce = false;
  const originalDeletedRun = deletedDb.runTransaction.bind(deletedDb);
  deletedDb.runTransaction = async (fn) => originalDeletedRun(async (transaction) => {
    if (!deletedOnce) {
      deletedOnce = true;
      deletedDb.docs.delete("users/student");
    }
    return fn(transaction);
  });
  const deleted = await api.handlePinAuthPost(req({
    action: "reset",
    uid: "student",
    pin: "4444",
    pinConfirm: "4444",
  }, { token: "adminToken" }), deps({ db: deletedDb, auth }).value, response);
  assert.equal(deleted.status, 409);
  assert.equal(deleted.body.code, "auth/pin-profile-missing");

  const conflictDb = new FakeDb({
    "system/admin": { uid: "admin" },
    "users/student": { schoolName: "서버초", realName: "정학생", role: "student" },
  });
  const conflictingIdentity = api.pinAuthInternals.canonicalIdentity("변경초", "정학생");
  conflictDb.docs.set(`pinIdentities/${api.pinAuthInternals.identityHash(conflictingIdentity)}`, { uid: "other", ...conflictingIdentity });
  let renamedOnce = false;
  const originalConflictRun = conflictDb.runTransaction.bind(conflictDb);
  conflictDb.runTransaction = async (fn) => originalConflictRun(async (transaction) => {
    if (!renamedOnce) {
      renamedOnce = true;
      conflictDb.docs.set("users/student", { schoolName: "변경초", realName: "정학생", role: "student" });
    }
    return fn(transaction);
  });
  const renamed = await api.handlePinAuthPost(req({
    action: "reset",
    uid: "student",
    pin: "4444",
    pinConfirm: "4444",
  }, { token: "adminToken" }), deps({ db: conflictDb, auth }).value, response);
  assert.equal(renamed.status, 409);
  assert.equal(renamed.body.code, "auth/pin-identity-conflict");

  const teacher = await api.handlePinAuthPost(req({
    action: "reset",
    uid: "teacher",
    pin: "4444",
    pinConfirm: "4444",
  }, { token: "adminToken" }), deps({
    db: new FakeDb({
      "system/admin": { uid: "admin" },
      "users/teacher": { schoolName: "교사초", realName: "김교사", role: "teacher" },
    }),
    auth,
  }).value, response);
  assert.equal(teacher.status, 403);
  assert.equal(teacher.body.code, "auth/pin-target-forbidden");
});

test("missing config maps to 503 and active deletion lock blocks creates and resets", async () => {
  const api = await loadPinAuth();
  const unavailable = await api.handlePinAuthPost(req({
    action: "begin",
    schoolName: "설정초",
    realName: "김학생",
  }), {
    getServices: async () => {
      const error = new Error("missing");
      error.name = "FirebaseAdminConfigError";
      throw error;
    },
    now: () => 1,
  }, response);
  assert.equal(unavailable.status, 503);

  const db = new FakeDb({ "system/classDeletionLock": { active: true } });
  const locked = await api.handlePinAuthPost(req({
    action: "register",
    schoolName: "잠금초",
    realName: "김학생",
    pin: "6666",
    pinConfirm: "6666",
  }), deps({ db }).value, response);
  assert.equal(locked.status, 409);
});
