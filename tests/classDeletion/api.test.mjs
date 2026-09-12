import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../../lib/server/classDeletionApi.js", import.meta.url), "utf8");

async function loadApi() {
  const context = vm.createContext({ Response, URL, JSON, Number, Error, TextDecoder, Uint8Array });
  const module = new vm.SourceTextModule(source, { context });
  await module.link(() => {
    throw new Error("classDeletionApi test does not expect imports");
  });
  await module.evaluate();
  return module.namespace;
}

function request({ method = "POST", origin = "https://app.example", token = "token", body, headers = {} } = {}) {
  const text = body === undefined ? "" : JSON.stringify(body);
  return {
    method,
    url: "https://app.example/api/admin/classes/class-a/deletion",
    headers: new Headers({
      Origin: origin,
      Authorization: token ? `Bearer ${token}` : "",
      "Content-Type": "application/json",
      "Content-Length": String(text.length),
      ...headers,
    }),
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(text));
        controller.close();
      },
    }),
  };
}

function response(body, init = {}) {
  return { body, status: init.status ?? 200 };
}

function deps({ uid = "admin", adminUid = "admin", engine = {} } = {}) {
  const calls = [];
  return {
    calls,
    value: {
      getServices: async () => ({
        auth: {
          verifyIdToken: async (token, checkRevoked) => {
            calls.push(["verify", token, checkRevoked]);
            return { uid };
          },
        },
        bucket: { name: "bucket" },
        db: {
          doc: (path) => ({
            get: async () => {
              calls.push(["get", path]);
              return { exists: true, data: () => ({ uid: adminUid }) };
            },
          }),
        },
      }),
      env: { FIREBASE_CLASS_DELETION_ENABLED: "true" },
      getEngine: async () => engine,
    },
  };
}

test("requests return 503 before credentials or engine load when production gate is disabled", async () => {
  const api = await loadApi();
  let touched = false;
  const result = await api.handleClassDeletionPost(
    request({ body: { classId: "class-a", confirmation: api.classDeletionConfirmation("class-a") } }),
    { params: { classId: "class-a" } },
    {
      env: {},
      getServices: async () => {
        touched = true;
      },
      getEngine: async () => {
        touched = true;
      },
    },
    response
  );
  assert.equal(result.status, 503);
  assert.equal(touched, false);
});

test("POST rejects cross-origin and malformed confirmation before deletion engine runs", async () => {
  const api = await loadApi();
  const engine = {
    advanceClassDeletion: async () => {
      throw new Error("engine should not run");
    },
  };
  const missingOrigin = await api.handleClassDeletionPost(
    request({ origin: "" }),
    { params: { classId: "class-a" } },
    deps({ engine }).value,
    response
  );
  assert.equal(missingOrigin.status, 403);

  const badBody = await api.handleClassDeletionPost(
    request({ body: { classId: "class-a", confirmation: "delete class-a" } }),
    { params: { classId: "class-a" } },
    deps({ engine }).value,
    response
  );
  assert.equal(badBody.status, 400);
});

test("POST authenticates against system/admin.uid and advances bounded work", async () => {
  const api = await loadApi();
  const seen = [];
  const h = deps({
    engine: {
      advanceClassDeletion: async (db, bucket, classId, uid) => {
        seen.push({ bucket, classId, db, uid });
        return { status: "running", phase: "cards", deletedDocuments: 12, deletedFiles: 1, retainedFiles: 2 };
      },
    },
  });
  const result = await api.handleClassDeletionPost(
    request({ body: { classId: "class-a", confirmation: api.classDeletionConfirmation("class-a") } }),
    { params: { classId: "class-a" } },
    h.value,
    response
  );
  assert.equal(result.status, 202);
  assert.deepEqual(JSON.parse(JSON.stringify(result.body)), {
    status: "running",
    phase: "cards",
    deletedDocuments: 12,
    deletedFiles: 1,
    retainedFiles: 2,
  });
  assert.equal(seen[0].classId, "class-a");
  assert.equal(seen[0].uid, "admin");
  assert.deepEqual(h.calls[0], ["verify", "token", true]);
});

test("POST maps lease contention to retryable status instead of success", async () => {
  const api = await loadApi();
  const result = await api.handleClassDeletionPost(
    request({ body: { classId: "class-a", confirmation: api.classDeletionConfirmation("class-a") } }),
    { params: { classId: "class-a" } },
    deps({
      engine: {
        advanceClassDeletion: async () => {
          throw Object.assign(new Error("busy"), { code: "deletion-busy" });
        },
      },
    }).value,
    response
  );
  assert.equal(result.status, 409);
  assert.equal(result.body.retryable, true);
});

test("POST maps archived and residual engine failures to actionable locked-state responses", async () => {
  const api = await loadApi();
  const archived = await api.handleClassDeletionPost(
    request({ body: { classId: "class-a", confirmation: api.classDeletionConfirmation("class-a") } }),
    { params: { classId: "class-a" } },
    deps({
      engine: {
        advanceClassDeletion: async () => {
          throw Object.assign(new Error("active"), { code: "class-not-archived" });
        },
      },
    }).value,
    response
  );
  assert.equal(archived.status, 409);
  assert.match(archived.body.error, /보관된 반/);

  const residual = await api.handleClassDeletionPost(
    request({ body: { classId: "class-a", confirmation: api.classDeletionConfirmation("class-a") } }),
    { params: { classId: "class-a" } },
    deps({
      engine: {
        advanceClassDeletion: async () => {
          throw Object.assign(new Error("leftover"), { code: "residual-data" });
        },
      },
    }).value,
    response
  );
  assert.equal(residual.status, 409);
  assert.match(residual.body.error, /유지보수 잠금/);
});

test("POST maps class reuse and persisted failed jobs to non-success responses", async () => {
  const api = await loadApi();
  const recreated = await api.handleClassDeletionPost(
    request({ body: { classId: "class-a", confirmation: api.classDeletionConfirmation("class-a") } }),
    { params: { classId: "class-a" } },
    deps({
      engine: {
        advanceClassDeletion: async () => {
          throw Object.assign(new Error("reused"), { code: "class-recreated" });
        },
      },
    }).value,
    response
  );
  assert.equal(recreated.status, 409);
  assert.match(recreated.body.error, /다시 사용/);

  const failed = await api.handleClassDeletionPost(
    request({ body: { classId: "class-a", confirmation: api.classDeletionConfirmation("class-a") } }),
    { params: { classId: "class-a" } },
    deps({
      engine: {
        advanceClassDeletion: async () => ({ status: "failed", phase: "validate-references" }),
      },
    }).value,
    response
  );
  assert.equal(failed.status, 409);
  assert.match(failed.body.error, /실패 상태/);
});

test("GET returns authenticated job status without running deletion", async () => {
  const api = await loadApi();
  const result = await api.handleClassDeletionGet(
    request({ method: "GET" }),
    { params: { classId: "class-a" } },
    deps({
      engine: {
        readClassDeletion: async () => ({
          status: "completed",
          phase: "done",
          deletedDocuments: 30,
          deletedFiles: 4,
          retainedFiles: 1,
        }),
      },
    }).value,
    response
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.status, "completed");
  assert.equal(result.body.retainedFiles, 1);
});

test("GET rejects a verified non-admin uid with a generic forbidden response", async () => {
  const api = await loadApi();
  const result = await api.handleClassDeletionGet(
    request({ method: "GET" }),
    { params: { classId: "class-a" } },
    deps({ uid: "other", adminUid: "admin", engine: { readClassDeletion: async () => null } }).value,
    response
  );
  assert.equal(result.status, 403);
  assert.equal(result.body.error, "요청을 처리할 수 없어요.");
});
