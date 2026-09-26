const callbacks = new Set();
let currentUser = null;
export function metrics() {
  if (typeof window === "undefined") return {};
  return window.__authMetrics ||= { profileReads: 0, tokenReads: 0, sessionWaits: 0, bearerReads: 0 };
}
const legacyUser = {
  uid: "legacy-user",
  async getIdToken() {
    metrics().bearerReads++;
    if (window.__stallPinSession === "token") return new Promise(() => {});
    return "fixture-token";
  },
};
export const isFirebaseConfigured = true;
export const db = {};
export const auth = {
  async authStateReady() {
    metrics().sessionWaits++;
    if (window.__stallPinSession === "restore") return new Promise(() => {});
  },
  get currentUser() {
    return currentUser || (typeof window !== "undefined" && (window.__legacySession || window.__stallPinSession === "token") ? legacyUser : null);
  },
};
export function onAuthStateChanged(_auth, cb) {
  callbacks.add(cb);
  queueMicrotask(() => { if (callbacks.has(cb)) cb(currentUser); });
  return () => callbacks.delete(cb);
}
export const onIdTokenChanged = onAuthStateChanged;
export async function signInWithCustomToken() {
  currentUser = {
    uid: "pin-user", isAnonymous: false,
    async getIdTokenResult() {
      metrics().tokenReads++;
      return { token: "fixture-verified-pin-token", claims: { pinAuthenticated: true, firebase: { sign_in_provider: "custom" } } };
    },
    async getIdToken() { return "fixture-token"; },
  };
  for (const callback of callbacks) callback(currentUser);
  return { user: currentUser };
}
export async function signOut() {
  currentUser = null;
  for (const callback of callbacks) callback(null);
}
export class GoogleAuthProvider { setCustomParameters() {} }
export async function signInWithPopup() { throw new Error("Google is outside this isolated fixture"); }
export function doc(_db, ...parts) { return parts.join("/"); }
export async function getDoc(ref) {
  if (ref.startsWith("users/")) {
    metrics().profileReads++;
    await new Promise(resolve => setTimeout(resolve, 20));
    return { exists: () => true, data: () => ({ realName: "김교사", schoolName: "가나학교" }) };
  }
  return { exists: () => false };
}
export async function runTransaction() { throw new Error("Google is outside this isolated fixture"); }
export function serverTimestamp() { return 0; }
