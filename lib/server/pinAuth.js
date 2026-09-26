import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const MAX_JSON_BYTES = 4096;
const MAX_TEXT_LENGTH = 40;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LIMIT = 5;
const IP_WINDOW_MS = 15 * 60 * 1000;
const IP_LIMIT = 300;
const SCRYPT_PARAMS = Object.freeze({ N: 16384, r: 8, p: 1, keylen: 32 });
const PUBLIC_IP_ACTIONS = new Set(["begin", "register", "login"]);
const TRUSTED_NETLIFY_IP_HEADER = "x-nf-client-connection-ip";

class PinAuthHttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "PinAuthHttpError";
    this.status = status;
    this.code = code;
    this.publicMessage = message;
  }
}

function jsonResponse(body, init = {}) {
  return Response.json(body, { ...init, headers: { ...init.headers, "Cache-Control": "no-store" } });
}

function errorResponse(error, respond) {
  if (error instanceof PinAuthHttpError) {
    return respond({ code: error.code, message: error.publicMessage }, { status: error.status });
  }
  if (error?.name === "FirebaseAdminConfigError") {
    return respond(
      { code: "auth/pin-config-unavailable", message: "PIN authentication is not configured." },
      { status: 503 }
    );
  }
  return respond(
    { code: "auth/pin-unavailable", message: "PIN authentication is unavailable." },
    { status: 503 }
  );
}

function getHeader(headers, name) {
  if (typeof headers?.get === "function") return headers.get(name);
  return headers?.[name] ?? headers?.[name.toLowerCase()] ?? null;
}

function bearerToken(headers) {
  const value = getHeader(headers, "authorization");
  if (typeof value !== "string") return "";
  const [scheme, token] = value.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : "";
}

function trustedNetlifyIp(headers) {
  const value = getHeader(headers, TRUSTED_NETLIFY_IP_HEADER);
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 128 ? trimmed : "";
}

function cleanText(value, field) {
  if (typeof value !== "string") {
    throw new PinAuthHttpError(400, "auth/pin-invalid-request", `${field} is required.`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_TEXT_LENGTH) {
    throw new PinAuthHttpError(400, "auth/pin-invalid-request", `${field} must be 1-40 characters.`);
  }
  return trimmed;
}

function requirePin(value, field = "pin") {
  if (typeof value !== "string" || !/^[0-9]{4}$/.test(value)) {
    throw new PinAuthHttpError(400, "auth/pin-invalid-pin", `${field} must be exactly 4 digits.`);
  }
  return value;
}

function requireConfirmedPin(body) {
  const pin = requirePin(body.pin, "pin");
  const pinConfirm = requirePin(body.pinConfirm, "pinConfirm");
  if (pin !== pinConfirm) {
    throw new PinAuthHttpError(400, "auth/pin-confirmation-mismatch", "PIN confirmation does not match.");
  }
  return pin;
}

function canonicalText(value) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}

function canonicalIdentity(schoolName, realName) {
  return {
    schoolName,
    realName,
    schoolNameCanonical: canonicalText(schoolName),
    realNameCanonical: canonicalText(realName),
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function identityHash(identity) {
  return sha256(`${identity.schoolNameCanonical}\u0000${identity.realNameCanonical}`);
}

function requestIpHash(ip) {
  return sha256(`ip\u0000${ip}`);
}

function docData(snap) {
  return snap?.exists ? snap.data() : null;
}

function nowMs(deps) {
  return Number(deps.now?.() ?? Date.now());
}

function nowDate(deps) {
  return new Date(nowMs(deps));
}

function collectionDoc(db, collection, id) {
  return db.collection(collection).doc(id);
}

async function readJsonBody(request) {
  const contentType = getHeader(request.headers, "content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new PinAuthHttpError(400, "auth/pin-invalid-request", "JSON body is required.");
  }
  const contentLength = Number(getHeader(request.headers, "content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BYTES) {
    throw new PinAuthHttpError(400, "auth/pin-invalid-request", "Request body is too large.");
  }
  if (!request.body?.getReader) {
    throw new PinAuthHttpError(400, "auth/pin-invalid-request", "JSON body is required.");
  }
  const reader = request.body.getReader();
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_JSON_BYTES) {
      await reader.cancel();
      throw new PinAuthHttpError(400, "auth/pin-invalid-request", "Request body is too large.");
    }
    chunks.push(value);
  }
  const buffer = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(buffer));
  } catch {
    throw new PinAuthHttpError(400, "auth/pin-invalid-request", "JSON body is invalid.");
  }
}

function parseBody(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new PinAuthHttpError(400, "auth/pin-invalid-request", "Request body is invalid.");
  }
  const action = raw.action;
  if (!["begin", "register", "login", "reset"].includes(action)) {
    throw new PinAuthHttpError(400, "auth/pin-invalid-action", "Unsupported PIN action.");
  }
  if (action === "reset") {
    return {
      action,
      uid: cleanText(raw.uid, "uid"),
      pin: requireConfirmedPin(raw),
    };
  }
  const schoolName = cleanText(raw.schoolName, "schoolName");
  const realName = cleanText(raw.realName, "realName");
  const parsed = { action, schoolName, realName, identity: canonicalIdentity(schoolName, realName) };
  if (action === "register") parsed.pin = requireConfirmedPin(raw);
  if (action === "login") parsed.pin = requirePin(raw.pin);
  return parsed;
}

async function hashPin(pin) {
  const salt = randomBytes(16);
  const derived = await scryptAsync(pin, salt, SCRYPT_PARAMS.keylen, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
    maxmem: 64 * 1024 * 1024,
  });
  return {
    algorithm: "scrypt",
    params: { N: SCRYPT_PARAMS.N, r: SCRYPT_PARAMS.r, p: SCRYPT_PARAMS.p, keylen: SCRYPT_PARAMS.keylen },
    salt: salt.toString("base64"),
    hash: Buffer.from(derived).toString("base64"),
  };
}

async function verifyPin(pin, credential) {
  if (credential?.algorithm !== "scrypt" || !credential?.salt || !credential?.hash) return false;
  const params = credential.params ?? SCRYPT_PARAMS;
  const expected = Buffer.from(credential.hash, "base64");
  const salt = Buffer.from(credential.salt, "base64");
  const derived = await scryptAsync(pin, salt, expected.length, {
    N: Number(params.N ?? SCRYPT_PARAMS.N),
    r: Number(params.r ?? SCRYPT_PARAMS.r),
    p: Number(params.p ?? SCRYPT_PARAMS.p),
    maxmem: 64 * 1024 * 1024,
  });
  const actual = Buffer.from(derived);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function hasGoogleProvider(userRecord) {
  return (userRecord?.providerData ?? []).some((provider) => provider?.providerId === "google.com");
}

function isStudentProfile(profile) {
  return !profile.role || profile.role === "student";
}

async function safeGetUser(auth, uid) {
  try {
    return await auth.getUser(uid);
  } catch (error) {
    if (error?.code === "auth/user-not-found") return null;
    throw error;
  }
}

async function isSystemAdminUid(db, uid) {
  const admin = docData(await db.doc("system/admin").get());
  return Boolean(uid && admin?.uid === uid);
}

async function classDeletionLocked(db) {
  const lock = docData(await db.doc("system/classDeletionLock").get());
  return lock?.active === true;
}

function assertLockOpenFromSnap(lockSnap) {
  if (docData(lockSnap)?.active === true) {
    throw new PinAuthHttpError(409, "auth/pin-maintenance-locked", "PIN changes are unavailable during class deletion maintenance.");
  }
}

async function queryExactProfiles(db, schoolName, realName) {
  const snap = await db
    .collection("users")
    .where("schoolName", "==", schoolName)
    .where("realName", "==", realName)
    .limit(6)
    .get();
  return snap.docs.map((item) => ({ uid: item.id, data: item.data() }));
}

async function findLegacyProfile(services, identity) {
  const matches = await queryExactProfiles(services.db, identity.schoolName, identity.realName);
  const candidates = [];
  for (const match of matches) {
    if (!isStudentProfile(match.data)) continue;
    if (await isSystemAdminUid(services.db, match.uid)) continue;
    const userRecord = await safeGetUser(services.auth, match.uid);
    if (hasGoogleProvider(userRecord)) continue;
    candidates.push(match);
  }
  if (candidates.length > 1) {
    throw new PinAuthHttpError(409, "auth/pin-identity-conflict", "Multiple matching profiles require administrator cleanup.");
  }
  if (candidates.length !== 1) return null;
  const credential = docData(await collectionDoc(services.db, "pinCredentials", candidates[0].uid).get());
  if (credential) return null;
  return candidates[0];
}

async function credentialForIdentity(db, hash) {
  const identity = docData(await collectionDoc(db, "pinIdentities", hash).get());
  if (!identity?.uid) return { identity: null, credential: null };
  const credential = docData(await collectionDoc(db, "pinCredentials", identity.uid).get());
  return { identity, credential };
}

async function requireExistingProfile(db, uid) {
  const profile = docData(await collectionDoc(db, "users", uid).get());
  if (!profile) {
    throw new PinAuthHttpError(
      409,
      "auth/pin-orphaned-identity",
      "This PIN account no longer has a user profile. Ask an administrator to reset enrollment."
    );
  }
  return profile;
}

async function requirePinLoginTarget(services, uid) {
  const [profileResult, adminResult, accountResult] = await Promise.allSettled([
    requireExistingProfile(services.db, uid),
    isSystemAdminUid(services.db, uid),
    safeGetUser(services.auth, uid),
  ]);
  if (profileResult.status === "rejected") throw profileResult.reason;
  const profile = profileResult.value;
  const isStudent = isStudentProfile(profile);
  if (isStudent && adminResult.status === "rejected") throw adminResult.reason;
  if (!isStudent || adminResult.value) {
    throw new PinAuthHttpError(403, "auth/pin-target-forbidden", "Only student accounts can use PIN login.");
  }
  if (accountResult.status === "rejected") throw accountResult.reason;
  const userRecord = accountResult.value;
  if (!userRecord || userRecord.disabled === true) {
    throw new PinAuthHttpError(409, "auth/pin-target-unavailable", "This PIN account is unavailable.");
  }
  if (hasGoogleProvider(userRecord)) {
    throw new PinAuthHttpError(403, "auth/pin-target-forbidden", "Google accounts cannot use PIN login.");
  }
  return profile;
}

async function authenticateBearer(auth, headers, checkRevoked = false) {
  const token = bearerToken(headers);
  if (!token) return null;
  try {
    return await auth.verifyIdToken(token, checkRevoked);
  } catch {
    return null;
  }
}

async function requireEnrollmentOwner(services, headers, legacyProfile) {
  const decoded = await authenticateBearer(services.auth, headers, true);
  if (!decoded?.uid || decoded.uid !== legacyProfile?.uid) {
    throw new PinAuthHttpError(
      401,
      "auth/pin-enrollment-required",
      "This profile must set a PIN from its current signed-in session."
    );
  }
  return decoded;
}

function tokenClaims() {
  return { pinAuthenticated: true };
}

async function createToken(auth, uid) {
  return auth.createCustomToken(uid, tokenClaims());
}

function createRandomUid() {
  return `pin_${randomBytes(18).toString("base64url")}`;
}

async function incrementThrottle(db, docId, limit, windowMs, currentMs, code) {
  const ref = collectionDoc(db, "pinLoginAttempts", docId);
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const existing = docData(snap);
    const reset = !existing?.windowStartedAtMs || currentMs - Number(existing.windowStartedAtMs) >= windowMs;
    const next = reset
      ? { count: 1, windowStartedAtMs: currentMs }
      : { count: Number(existing.count ?? 0) + 1, windowStartedAtMs: Number(existing.windowStartedAtMs) };
    if (next.count > limit) {
      throw new PinAuthHttpError(429, code, "Too many PIN attempts. Try again later.");
    }
    transaction.set(ref, { ...next, updatedAt: new Date(currentMs) }, { merge: true });
  });
}

async function resetIdentityThrottle(db, hash) {
  await collectionDoc(db, "pinLoginAttempts", `identity_${hash}`).delete();
}

async function throttlePublicIpIfTrusted(db, request, deps) {
  const ip = trustedNetlifyIp(request.headers);
  if (!ip) return;
  await incrementThrottle(
    db,
    `ip_${requestIpHash(ip)}`,
    IP_LIMIT,
    IP_WINDOW_MS,
    nowMs(deps),
    "auth/pin-ip-rate-limited"
  );
}

async function throttleLoginIdentity(db, hash, deps) {
  await incrementThrottle(
    db,
    `identity_${hash}`,
    LOGIN_LIMIT,
    LOGIN_WINDOW_MS,
    nowMs(deps),
    "auth/pin-rate-limited"
  );
}

async function beginPin(parsed, services, request) {
  const hash = identityHash(parsed.identity);
  const { identity, credential } = await credentialForIdentity(services.db, hash);
  if (credential) {
    await requireExistingProfile(services.db, identity.uid);
    return { mode: "login" };
  }

  const legacy = await findLegacyProfile(services, parsed.identity);
  if (legacy) {
    await requireEnrollmentOwner(services, request.headers, legacy);
    return { mode: "enroll" };
  }
  return { mode: "register" };
}

async function registerPin(parsed, services, request, deps) {
  if (await classDeletionLocked(services.db)) {
    throw new PinAuthHttpError(409, "auth/pin-maintenance-locked", "PIN changes are unavailable during class deletion maintenance.");
  }
  const hash = identityHash(parsed.identity);
  const existing = await credentialForIdentity(services.db, hash);
  if (existing.credential) {
    throw new PinAuthHttpError(409, "auth/pin-already-registered", "This profile already has a PIN.");
  }
  const legacy = await findLegacyProfile(services, parsed.identity);
  const uid = legacy?.uid ?? createRandomUid();
  if (legacy) {
    await requireEnrollmentOwner(services, request.headers, legacy);
  } else {
    await services.auth.createUser({ uid });
  }

  const credential = await hashPin(parsed.pin);
  try {
    await services.db.runTransaction(async (transaction) => {
      const identityRef = collectionDoc(services.db, "pinIdentities", hash);
      const credentialRef = collectionDoc(services.db, "pinCredentials", uid);
      const userRef = collectionDoc(services.db, "users", uid);
      const lockRef = services.db.doc("system/classDeletionLock");
      const adminRef = services.db.doc("system/admin");
      const [identitySnap, credentialSnap, userSnap, lockSnap, adminSnap] = await Promise.all([
        transaction.get(identityRef),
        transaction.get(credentialRef),
        transaction.get(userRef),
        transaction.get(lockRef),
        transaction.get(adminRef),
      ]);
      assertLockOpenFromSnap(lockSnap);
      if (docData(identitySnap)?.uid && docData(identitySnap).uid !== uid) {
        throw new PinAuthHttpError(409, "auth/pin-identity-conflict", "This school and name is already registered.");
      }
      if (docData(credentialSnap)) {
        throw new PinAuthHttpError(409, "auth/pin-already-registered", "This profile already has a PIN.");
      }
      const currentUser = docData(userSnap);
      if (legacy && !currentUser) {
        throw new PinAuthHttpError(409, "auth/pin-profile-missing", "The existing profile could not be found.");
      }
      if (legacy && (!isStudentProfile(currentUser) || docData(adminSnap)?.uid === uid)) {
        throw new PinAuthHttpError(403, "auth/pin-target-forbidden", "Only student accounts can use PIN enrollment.");
      }
      if (legacy && (currentUser.schoolName !== parsed.identity.schoolName || currentUser.realName !== parsed.identity.realName)) {
        throw new PinAuthHttpError(409, "auth/pin-identity-conflict", "The existing profile changed during enrollment.");
      }
      const createdAt = currentUser?.createdAt ?? nowDate(deps);
      transaction.set(identityRef, {
        uid,
        schoolName: parsed.identity.schoolName,
        realName: parsed.identity.realName,
        schoolNameCanonical: parsed.identity.schoolNameCanonical,
        realNameCanonical: parsed.identity.realNameCanonical,
        createdAt: nowDate(deps),
        updatedAt: nowDate(deps),
      });
      transaction.set(credentialRef, {
        uid,
        identityHash: hash,
        schoolName: parsed.identity.schoolName,
        realName: parsed.identity.realName,
        schoolNameCanonical: parsed.identity.schoolNameCanonical,
        realNameCanonical: parsed.identity.realNameCanonical,
        ...credential,
        createdAt: nowDate(deps),
        updatedAt: nowDate(deps),
      });
      if (!legacy) {
        transaction.create(userRef, {
          uid,
          schoolName: parsed.identity.schoolName,
          realName: parsed.identity.realName,
          role: "student",
          requestedRole: null,
          createdAt,
        });
      }
    });
  } catch (error) {
    if (!legacy) {
      try {
        await services.auth.deleteUser(uid);
      } catch {
      }
    }
    throw error;
  }
  return { customToken: await createToken(services.auth, uid) };
}

async function loginPin(parsed, services, deps) {
  const hash = identityHash(parsed.identity);
  await throttleLoginIdentity(services.db, hash, deps);
  const { identity, credential } = await credentialForIdentity(services.db, hash);
  if (!identity?.uid || !credential) {
    throw new PinAuthHttpError(401, "auth/pin-invalid-credentials", "School, name, or PIN is incorrect.");
  }
  await requirePinLoginTarget(services, identity.uid);
  if (credential.schoolNameCanonical !== parsed.identity.schoolNameCanonical
      || credential.realNameCanonical !== parsed.identity.realNameCanonical) {
    throw new PinAuthHttpError(409, "auth/pin-identity-conflict", "Stored PIN identity is inconsistent.");
  }
  const ok = await verifyPin(parsed.pin, credential);
  if (!ok) {
    throw new PinAuthHttpError(401, "auth/pin-invalid-credentials", "School, name, or PIN is incorrect.");
  }
  await resetIdentityThrottle(services.db, hash);
  return { customToken: await createToken(services.auth, identity.uid) };
}

async function requireAdminResetter(services, request) {
  const decoded = await authenticateBearer(services.auth, request.headers, true);
  if (!decoded?.uid) {
    throw new PinAuthHttpError(401, "auth/pin-admin-required", "Administrator sign-in is required.");
  }
  if (decoded.email_verified !== true || decoded.firebase?.sign_in_provider !== "google.com") {
    throw new PinAuthHttpError(403, "auth/pin-admin-required", "A verified Google administrator is required.");
  }
  if (!(await isSystemAdminUid(services.db, decoded.uid))) {
    throw new PinAuthHttpError(403, "auth/pin-admin-required", "Administrator authorization is required.");
  }
  return decoded.uid;
}

async function resetPin(parsed, services, request, deps) {
  const adminUid = await requireAdminResetter(services, request);
  if (parsed.uid === adminUid || await isSystemAdminUid(services.db, parsed.uid)) {
    throw new PinAuthHttpError(403, "auth/pin-target-forbidden", "Administrator accounts cannot use PIN reset.");
  }
  if (await classDeletionLocked(services.db)) {
    throw new PinAuthHttpError(409, "auth/pin-maintenance-locked", "PIN changes are unavailable during class deletion maintenance.");
  }
  const userRecord = await safeGetUser(services.auth, parsed.uid);
  if (!userRecord || userRecord.disabled === true) {
    throw new PinAuthHttpError(409, "auth/pin-target-unavailable", "Target account is unavailable.");
  }
  if (hasGoogleProvider(userRecord)) {
    throw new PinAuthHttpError(403, "auth/pin-target-forbidden", "Google accounts cannot use PIN reset.");
  }
  const credential = await hashPin(parsed.pin);
  let resetHash = "";
  await services.db.runTransaction(async (transaction) => {
    const userRef = collectionDoc(services.db, "users", parsed.uid);
    const profileSnap = await transaction.get(userRef);
    const profile = docData(profileSnap);
    if (!profile) {
      throw new PinAuthHttpError(409, "auth/pin-profile-missing", "Target profile was not found.");
    }
    if (!isStudentProfile(profile)) {
      throw new PinAuthHttpError(403, "auth/pin-target-forbidden", "Only student accounts can use PIN reset.");
    }
    const identity = canonicalIdentity(cleanText(profile.schoolName, "schoolName"), cleanText(profile.realName, "realName"));
    const hash = identityHash(identity);
    resetHash = hash;
    const identityRef = collectionDoc(services.db, "pinIdentities", hash);
    const credentialRef = collectionDoc(services.db, "pinCredentials", parsed.uid);
    const lockRef = services.db.doc("system/classDeletionLock");
    const [identitySnap, credentialSnap, lockSnap] = await Promise.all([
      transaction.get(identityRef),
      transaction.get(credentialRef),
      transaction.get(lockRef),
    ]);
    assertLockOpenFromSnap(lockSnap);
    const identityData = docData(identitySnap);
    if (identityData?.uid && identityData.uid !== parsed.uid) {
      throw new PinAuthHttpError(409, "auth/pin-identity-conflict", "Target profile identity conflicts with another PIN account.");
    }
    transaction.set(identityRef, {
      uid: parsed.uid,
      schoolName: identity.schoolName,
      realName: identity.realName,
      schoolNameCanonical: identity.schoolNameCanonical,
      realNameCanonical: identity.realNameCanonical,
      createdAt: identityData?.createdAt ?? nowDate(deps),
      updatedAt: nowDate(deps),
    });
    transaction.set(credentialRef, {
      uid: parsed.uid,
      identityHash: hash,
      schoolName: identity.schoolName,
      realName: identity.realName,
      schoolNameCanonical: identity.schoolNameCanonical,
      realNameCanonical: identity.realNameCanonical,
      ...credential,
      createdAt: docData(credentialSnap)?.createdAt ?? nowDate(deps),
      updatedAt: nowDate(deps),
    });
  });
  await resetIdentityThrottle(services.db, resetHash);
  await services.auth.revokeRefreshTokens(parsed.uid);
  return { ok: true };
}

export async function handlePinAuthPost(request, deps, respond = jsonResponse) {
  try {
    const raw = await readJsonBody(request);
    const parsed = parseBody(raw);
    const services = await deps.getServices();
    if (PUBLIC_IP_ACTIONS.has(parsed.action)) {
      await throttlePublicIpIfTrusted(services.db, request, deps);
    }
    if (parsed.action === "begin") return respond(await beginPin(parsed, services, request));
    if (parsed.action === "register") return respond(await registerPin(parsed, services, request, deps));
    if (parsed.action === "login") return respond(await loginPin(parsed, services, deps));
    return respond(await resetPin(parsed, services, request, deps));
  } catch (error) {
    return errorResponse(error, respond);
  }
}

export const pinAuthInternals = {
  PinAuthHttpError,
  canonicalIdentity,
  identityHash,
  verifyPin,
  hashPin,
  trustedNetlifyIp,
};
