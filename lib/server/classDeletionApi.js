const MAX_JSON_BYTES = 2048;
const CONFIRMATION_PREFIX = "DELETE ";
const ENABLED_ENV_VALUE = "true";

class ClassDeletionHttpError extends Error {
  constructor(status, publicMessage, options = {}) {
    super(publicMessage);
    this.name = "ClassDeletionHttpError";
    this.status = status;
    this.publicMessage = publicMessage;
    this.retryable = options.retryable === true;
  }
}

function jsonResponse(body, init = {}) {
  return Response.json(body, { ...init, headers: { ...init.headers, "Cache-Control": "no-store" } });
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

function assertSameOriginPost(request) {
  const origin = getHeader(request.headers, "origin");
  if (!origin) throw new ClassDeletionHttpError(403, "요청을 처리할 수 없어요.");
  const requestOrigin = new URL(request.url).origin;
  let parsedOrigin;
  try {
    parsedOrigin = new URL(origin).origin;
  } catch {
    throw new ClassDeletionHttpError(403, "요청을 처리할 수 없어요.");
  }
  if (parsedOrigin !== requestOrigin) {
    throw new ClassDeletionHttpError(403, "요청을 처리할 수 없어요.");
  }
}

async function readConfirmedDeletionBody(request, classId) {
  const contentType = getHeader(request.headers, "content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new ClassDeletionHttpError(415, "요청을 처리할 수 없어요.");
  }
  const contentLength = Number(getHeader(request.headers, "content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BYTES) {
    throw new ClassDeletionHttpError(413, "요청을 처리할 수 없어요.");
  }
  if (!request.body?.getReader) {
    throw new ClassDeletionHttpError(400, "삭제 확인 정보를 읽지 못했어요.");
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
      throw new ClassDeletionHttpError(413, "요청을 처리할 수 없어요.");
    }
    chunks.push(value);
  }
  const buffer = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(buffer);
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ClassDeletionHttpError(400, "삭제 확인 정보를 읽지 못했어요.");
  }
  if (body?.classId !== classId || body?.confirmation !== `${CONFIRMATION_PREFIX}${classId}`) {
    throw new ClassDeletionHttpError(400, "삭제 확인 문구가 일치하지 않아요.");
  }
}

async function authenticateAdmin(request, services) {
  const token = bearerToken(request.headers);
  if (!token) throw new ClassDeletionHttpError(401, "로그인이 필요해요.");
  let decoded;
  try {
    decoded = await services.auth.verifyIdToken(token, true);
  } catch {
    throw new ClassDeletionHttpError(401, "로그인이 필요해요.");
  }
  const adminSnap = await services.db.doc("system/admin").get();
  const adminUid = adminSnap.exists ? adminSnap.data()?.uid : null;
  if (!decoded?.uid || decoded.uid !== adminUid) {
    throw new ClassDeletionHttpError(403, "요청을 처리할 수 없어요.");
  }
  return decoded.uid;
}

function publicJob(job) {
  if (!job) return { status: "idle" };
  return {
    status: job.status ?? "running",
    phase: job.phase ?? "pending",
    deletedDocuments: Number(job.deletedDocuments ?? 0),
    deletedFiles: Number(job.deletedFiles ?? 0),
    retainedFiles: Number(job.retainedFiles ?? 0),
  };
}

function engineErrorResponse(error) {
  if (error?.code === "deletion-busy" || error?.retryable === true) {
    return new ClassDeletionHttpError(409, "삭제 유지보수 작업이 이미 진행 중이에요. 잠시 후 다시 시도하면 이어서 확인합니다.", {
      retryable: true,
    });
  }
  if (error?.code === "class-not-archived") {
    return new ClassDeletionHttpError(409, "보관된 반만 삭제할 수 있어요.");
  }
  if (error?.code === "invalid-class") {
    return new ClassDeletionHttpError(400, "삭제할 반 정보를 확인하지 못했어요.");
  }
  if (error?.code === "bucket-mismatch") {
    return new ClassDeletionHttpError(409, "삭제 작업의 저장소 설정이 달라졌어요. 유지보수 잠금은 유지되며 같은 반 삭제를 다시 실행하면 상태를 확인합니다.");
  }
  if (error?.code === "class-recreated") {
    return new ClassDeletionHttpError(409, "이미 삭제 완료된 반 ID가 다시 사용되고 있어요. 이 ID로는 삭제를 재개할 수 없습니다.");
  }
  if (error?.code === "residual-data") {
    return new ClassDeletionHttpError(409, "일부 반 데이터가 남아 있어 삭제를 완료하지 못했어요. 유지보수 잠금은 유지되며 같은 반 삭제를 다시 실행하면 이어서 점검합니다.");
  }
  if (error?.code === "data-changed") {
    return new ClassDeletionHttpError(409, "삭제 중 반 데이터가 바뀌었어요. 유지보수 잠금은 유지되며 같은 반 삭제를 다시 실행하면 이어서 점검합니다.");
  }
  if (error?.code === "lease-lost") {
    return new ClassDeletionHttpError(409, "삭제 작업 권한이 갱신되었어요. 같은 반 삭제를 다시 실행하면 이어서 진행합니다.", {
      retryable: true,
    });
  }
  return new ClassDeletionHttpError(500, "삭제 작업을 진행하지 못했어요. 유지보수 잠금이 남아 있을 수 있으니 같은 반 삭제를 다시 실행해 상태를 확인해 주세요.");
}

function failedJobResponse(job) {
  if (job?.status !== "failed") return null;
  return new ClassDeletionHttpError(409, "삭제 작업이 실패 상태로 저장되어 있어요. 유지보수 잠금은 유지되며 같은 반 삭제를 다시 실행하면 이어서 점검합니다.");
}

function assertDeletionEnabled(deps) {
  const enabled = deps.env?.FIREBASE_CLASS_DELETION_ENABLED === ENABLED_ENV_VALUE;
  if (!enabled) {
    throw new ClassDeletionHttpError(503, "반 삭제 API가 아직 활성화되지 않았어요. 새 보안 규칙과 서버 자격 증명 설정 후에만 사용할 수 있어요.");
  }
}

function normalizeEngine(engineModule) {
  return engineModule.default ?? engineModule;
}

async function sendError(error, respond) {
  if (error instanceof ClassDeletionHttpError) {
    return respond(
      { error: error.publicMessage, retryable: error.retryable },
      { status: error.status }
    );
  }
  return respond({ error: "삭제 작업을 진행하지 못했어요.", retryable: false }, { status: 500 });
}

export function classDeletionConfirmation(classId) {
  return `${CONFIRMATION_PREFIX}${classId}`;
}

export async function handleClassDeletionGet(request, context, deps, respond = jsonResponse) {
  try {
    assertDeletionEnabled(deps);
    const classId = context.params.classId;
    const services = await deps.getServices();
    await authenticateAdmin(request, services);
    const engine = normalizeEngine(await deps.getEngine());
    const job = await engine.readClassDeletion(services.db, classId);
    return respond(publicJob(job));
  } catch (error) {
    return sendError(error, respond);
  }
}

export async function handleClassDeletionPost(request, context, deps, respond = jsonResponse) {
  try {
    assertDeletionEnabled(deps);
    const classId = context.params.classId;
    assertSameOriginPost(request);
    await readConfirmedDeletionBody(request, classId);
    const services = await deps.getServices();
    const uid = await authenticateAdmin(request, services);
    const engine = normalizeEngine(await deps.getEngine());
    let result;
    try {
      result = await engine.advanceClassDeletion(services.db, services.bucket, classId, uid);
    } catch (error) {
      throw engineErrorResponse(error);
    }
    const failedJob = failedJobResponse(result);
    if (failedJob) throw failedJob;
    return respond(publicJob(result), { status: result.status === "completed" ? 200 : 202 });
  } catch (error) {
    return sendError(error, respond);
  }
}
