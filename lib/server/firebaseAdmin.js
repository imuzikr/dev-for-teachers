const EXPECTED_PROJECT_ID = "dev-for-teachers";
const EXPECTED_STORAGE_BUCKET = "dev-for-teachers.firebasestorage.app";
const ADMIN_APP_NAME = "class-deletion-admin";
const EXPECTED_EMULATORS = {
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8186",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9196",
  FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9296",
};
const STORAGE_EMULATOR_ALIAS = "STORAGE_EMULATOR_HOST";
const EXPECTED_STORAGE_EMULATOR_URL = "http://127.0.0.1:9296";

let cachedServices = null;

class FirebaseAdminConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "FirebaseAdminConfigError";
  }
}

function emulatorKeys(env) {
  return [...Object.keys(EXPECTED_EMULATORS), STORAGE_EMULATOR_ALIAS].filter((key) => Boolean(env[key]));
}

function assertLoopbackEmulators(env) {
  const configured = emulatorKeys(env);
  if (configured.length === 0) return false;
  for (const [key, expected] of Object.entries(EXPECTED_EMULATORS)) {
    if (env[key] !== expected) {
      throw new FirebaseAdminConfigError("Firebase Admin emulator mode requires Firestore, Auth, and Storage loopback ports 8186/9296/9196.");
    }
  }
  if (env[STORAGE_EMULATOR_ALIAS] && env[STORAGE_EMULATOR_ALIAS] !== EXPECTED_STORAGE_EMULATOR_URL) {
    throw new FirebaseAdminConfigError("Firebase Admin emulator mode requires STORAGE_EMULATOR_HOST=http://127.0.0.1:9296 when the alias is present.");
  }
  return true;
}

export function validateFirebaseAdminConfig({ projectId, storageBucket, serviceAccount, env }) {
  const emulatorMode = assertLoopbackEmulators(env);
  if (serviceAccount?.project_id && serviceAccount.project_id !== projectId) {
    throw new FirebaseAdminConfigError("Firebase Admin service account project_id does not match FIREBASE_ADMIN_PROJECT_ID.");
  }
  if (emulatorMode) {
    if (!projectId.startsWith("demo-") || !storageBucket.startsWith("demo-")) {
      throw new FirebaseAdminConfigError("Firebase Admin emulator mode requires both project and bucket to use demo- identifiers.");
    }
    return;
  }
  if (projectId !== EXPECTED_PROJECT_ID) {
    throw new FirebaseAdminConfigError("Firebase Admin project does not match the configured app project.");
  }
  if (storageBucket !== EXPECTED_STORAGE_BUCKET) {
    throw new FirebaseAdminConfigError("Firebase Admin storage bucket does not match the configured app bucket.");
  }
}

function parseServiceAccount(rawJson) {
  if (!rawJson) return null;
  try {
    return JSON.parse(rawJson);
  } catch {
    throw new FirebaseAdminConfigError("FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON is not valid JSON.");
  }
}

async function loadFirebaseAdminModules() {
  const [appModule, authModule, firestoreModule, storageModule] = await Promise.all([
    import("firebase-admin/app"),
    import("firebase-admin/auth"),
    import("firebase-admin/firestore"),
    import("firebase-admin/storage"),
  ]);
  return { appModule, authModule, firestoreModule, storageModule };
}

export async function getFirebaseAdminServices(env = process.env) {
  if (cachedServices) return cachedServices;
  const projectId = env.FIREBASE_ADMIN_PROJECT_ID;
  const storageBucket = env.FIREBASE_ADMIN_STORAGE_BUCKET;
  if (!projectId || !storageBucket) {
    throw new FirebaseAdminConfigError("Firebase Admin project and storage bucket env vars are required.");
  }
  const serviceAccount = parseServiceAccount(env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON);
  validateFirebaseAdminConfig({ projectId, storageBucket, serviceAccount, env });
  const { appModule, authModule, firestoreModule, storageModule } = await loadFirebaseAdminModules();
  const credential = serviceAccount
    ? appModule.cert(serviceAccount)
    : appModule.applicationDefault();
  const app = appModule.getApps().find((item) => item.name === ADMIN_APP_NAME)
    ?? appModule.initializeApp({ credential, projectId, storageBucket }, ADMIN_APP_NAME);
  const db = firestoreModule.getFirestore(app);
  const auth = authModule.getAuth(app);
  const bucket = storageModule.getStorage(app).bucket(storageBucket);
  cachedServices = { auth, bucket, db };
  return cachedServices;
}

export { FirebaseAdminConfigError };
