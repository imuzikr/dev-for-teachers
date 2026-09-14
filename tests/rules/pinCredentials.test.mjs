import { after, before, beforeEach, describe, it } from "node:test";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { asStudent, asTeacher, makeEnv, seed } from "./helpers.mjs";

const asPinUser = (env, uid) =>
  env.authenticatedContext(uid, {
    pinAuthenticated: true,
    firebase: { sign_in_provider: "custom" },
  });

const asVerifiedGoogle = (env, uid) =>
  env.authenticatedContext(uid, {
    email: `${uid}@example.test`,
    email_verified: true,
    firebase: { sign_in_provider: "google.com" },
  });

const asRegisteredAdmin = (env) => env.authenticatedContext("rootAdmin");

describe("PIN credential Firestore boundary", () => {
  let env;

  before(async () => {
    env = await makeEnv("demo-rules-pin-credentials");
  });

  after(async () => {
    await env.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env, async (db) => {
      await setDoc(doc(db, "system/admin"), { uid: "rootAdmin", createdAt: new Date() });
      await setDoc(doc(db, "users/pinUser"), {
        uid: "pinUser",
        role: "student",
        schoolName: "한성고",
        realName: "학생A",
      });
      await setDoc(doc(db, "users/legacyUser"), {
        uid: "legacyUser",
        role: "student",
        schoolName: "한성고",
        realName: "학생B",
      });
      await setDoc(doc(db, "users/teacherA"), {
        uid: "teacherA",
        role: "teacher",
        schoolName: "한성고",
        realName: "김선생",
      });
      await setDoc(doc(db, "users/pinPromoted"), {
        uid: "pinPromoted",
        role: "teacher",
        schoolName: "한성고",
        realName: "핀선생",
      });
      await setDoc(doc(db, "pinCredentials/pinUser"), {
        uid: "pinUser",
        hash: "server-hash",
        salt: "server-salt",
        identityHash: "identity-a",
      });
      await setDoc(doc(db, "pinIdentities/identity-a"), { uid: "pinUser" });
      await setDoc(doc(db, "pinLoginAttempts/attempt-a"), { count: 1 });
      await setDoc(doc(db, "classes/classA"), {
        name: "A반",
        createdBy: "teacherA",
        purpose: "internal",
        accessVersion: 2,
        archived: false,
        joinEnabled: true,
      });
      await setDoc(doc(db, "memberships/pinUser_classA"), {
        uid: "pinUser",
        classId: "classA",
        joinedAt: new Date(0),
        accessVersion: 2,
      });
    });
  });

  async function assertSecretBoundary(db) {
    await assertFails(getDoc(doc(db, "pinCredentials/pinUser")));
    await assertFails(setDoc(doc(db, "pinCredentials/pinUser"), {
      uid: "pinUser",
      hash: "client-hash",
      salt: "client-salt",
    }));
    await assertFails(updateDoc(doc(db, "pinCredentials/pinUser"), { hash: "changed" }));
    await assertFails(deleteDoc(doc(db, "pinCredentials/pinUser")));

    await assertFails(getDoc(doc(db, "pinIdentities/identity-a")));
    await assertFails(setDoc(doc(db, "pinIdentities/identity-b"), { uid: "pinUser" }));

    await assertFails(getDoc(doc(db, "pinLoginAttempts/attempt-a")));
    await assertFails(setDoc(doc(db, "pinLoginAttempts/attempt-b"), { count: 1 }));
  }

  it("denies PIN secret reads and writes to anonymous, PIN custom token, and Google admin clients", async () => {
    await assertSecretBoundary(env.unauthenticatedContext().firestore());
    await assertSecretBoundary(env.authenticatedContext("anonUid", {
      firebase: { sign_in_provider: "anonymous" },
    }).firestore());
    await assertSecretBoundary(asPinUser(env, "pinUser").firestore());
    await assertSecretBoundary(asVerifiedGoogle(env, "rootAdmin").firestore());
    await assertSecretBoundary(asRegisteredAdmin(env).firestore());
  });

  it("does not let an anonymous UID claim its own or another user's credential document", async () => {
    const db = env.authenticatedContext("anonUid", {
      firebase: { sign_in_provider: "anonymous" },
    }).firestore();

    await assertFails(setDoc(doc(db, "pinCredentials/anonUid"), {
      uid: "anonUid",
      hash: "client-hash",
      salt: "client-salt",
    }));
    await assertFails(setDoc(doc(db, "pinCredentials/pinUser"), {
      uid: "pinUser",
      hash: "client-hash",
      salt: "client-salt",
    }));
  });

  it("treats a PIN custom token as a normal student for own profile and class reads", async () => {
    const db = asPinUser(env, "pinUser").firestore();

    await assertSucceeds(getDoc(doc(db, "users/pinUser")));
    await assertSucceeds(updateDoc(doc(db, "users/pinUser"), { fcmTokens: ["token-a"] }));
    await assertSucceeds(getDoc(doc(db, "classes/classA")));
    await assertSucceeds(getDoc(doc(db, "memberships/pinUser_classA")));
    await assertFails(setDoc(doc(db, "classes/newClass"), {
      name: "새 반",
      createdBy: "pinUser",
      accessVersion: 2,
      archived: false,
    }));
  });

  it("does not let PIN sessions inherit teacher access from a promoted profile", async () => {
    const pinDb = asPinUser(env, "pinPromoted").firestore();
    const normalTeacherDb = env.authenticatedContext("teacherA").firestore();

    await assertFails(getDoc(doc(pinDb, "users/pinUser")));
    await assertSucceeds(getDoc(doc(normalTeacherDb, "users/pinUser")));
  });

  it("freezes server-bound PIN identity fields while preserving other own-profile writes", async () => {
    const db = asPinUser(env, "pinUser").firestore();

    await assertFails(updateDoc(doc(db, "users/pinUser"), { schoolName: "다른학교" }));
    await assertFails(updateDoc(doc(db, "users/pinUser"), { realName: "다른학생" }));
    await assertSucceeds(updateDoc(doc(db, "users/pinUser"), {
      withdrawRequested: true,
      withdrawRequestedAt: new Date(),
    }));
  });

  it("keeps non-PIN legacy self profile identity updates until enrollment", async () => {
    const db = asStudent(env, "legacyUser").firestore();

    await assertSucceeds(updateDoc(doc(db, "users/legacyUser"), {
      schoolName: "새학교",
      realName: "새이름",
    }));
  });

  it("denies non-admin teacher edits to PIN-bound identity but allows registered admin repair", async () => {
    const teacherDb = asTeacher(env, "teacherA").firestore();
    const adminDb = asRegisteredAdmin(env).firestore();

    await assertFails(updateDoc(doc(teacherDb, "users/pinUser"), { realName: "교사수정" }));
    await assertSucceeds(updateDoc(doc(adminDb, "users/pinUser"), { realName: "관리자수정" }));
  });

  it("allows the existing Google admin bootstrap transaction shape", async () => {
    await env.clearFirestore();
    const db = asVerifiedGoogle(env, "firstGoogleUser").firestore();

    await assertSucceeds(setDoc(doc(db, "system/admin"), {
      uid: "firstGoogleUser",
      createdAt: serverTimestamp(),
    }));
    await assertSucceeds(setDoc(doc(db, "users/firstGoogleUser"), {
      uid: "firstGoogleUser",
      role: "admin",
    }));
  });
});
