// =============================================================
// 규칙 테스트 공용 헬퍼
// -------------------------------------------------------------
// 실제 firestore.rules 파일을 그대로 에뮬레이터에 올려 검증합니다.
// 규칙을 눈으로 읽어서는 놓치기 쉬운 것들(없는 문서 읽기, 집합 비교의
// 허점, 반 소유자 판정 등)을 실제 요청으로 확인하는 것이 목적입니다.
//
// 파일마다 projectId를 다르게 주어 서로의 데이터에 영향을 주지 않게 합니다.
// =============================================================
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const RULES_PATH = resolve(here, "../../firestore.rules");

// emulators:exec 이 넣어 주는 값을 쓰고, 없으면 기본 포트로 떨어집니다.
function emulatorTarget() {
  const raw = process.env.FIRESTORE_EMULATOR_HOST;
  if (!raw) return { host: "127.0.0.1", port: 8080 };
  const [host, port] = raw.split(":");
  return { host, port: Number(port) };
}

export async function makeEnv(projectId) {
  const { host, port } = emulatorTarget();
  return initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync(RULES_PATH, "utf8"), host, port },
  });
}

// ── 로그인 컨텍스트 ──
// 이 앱의 규칙은 role을 커스텀 클레임에서 읽습니다(users 문서가 아님).
// email_verified는 초기 관리자 판정에 쓰이므로 항상 넣어 둡니다.
export const asStudent = (env, uid) =>
  env.authenticatedContext(uid, { email: `${uid}@hansung.hs.kr`, email_verified: true });

export const asTeacher = (env, uid) =>
  env.authenticatedContext(uid, {
    role: "teacher",
    email: `${uid}@hansung.hs.kr`,
    email_verified: true,
  });

export const asAdmin = (env, uid) =>
  env.authenticatedContext(uid, {
    role: "admin",
    email: `${uid}@hansung.hs.kr`,
    email_verified: true,
  });

// 규칙을 우회해 사전 데이터를 심습니다(테스트 준비용).
export const seed = (env, fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));
