import { auth, isFirebaseConfigured } from "./firebase";

export async function requestPinAuth(payload) {
  if (!isFirebaseConfigured) {
    throw Object.assign(new Error("Firebase 설정이 필요합니다."), { code: "auth/pin-unavailable" });
  }
  await auth.authStateReady();
  let token;
  try {
    token = await auth.currentUser?.getIdToken();
  } catch (error) {
    if (payload.action === "reset") throw error;
  }
  const response = await fetch("/api/auth/pin", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(data.message || "로그인 서버에 연결하지 못했습니다."), { code: data.code || "auth/pin-unavailable" });
  }
  return data;
}

export function pinErrorMessage(error) {
  const messages = {
    "auth/pin-config-unavailable": "로그인 서버 설정이 필요합니다. 선생님께 문의해 주세요.",
    "auth/pin-invalid-request": "학교명과 이름을 확인해 주세요.",
    "auth/pin-invalid-pin": "PIN은 숫자 4자리로 입력해 주세요.",
    "auth/pin-confirmation-mismatch": "두 PIN이 일치하지 않습니다.",
    "auth/pin-invalid-credentials": "학교명, 이름 또는 PIN이 일치하지 않습니다.",
    "auth/pin-rate-limited": "입력 시도가 많습니다. 15분 후 다시 시도해 주세요.",
    "auth/pin-ip-rate-limited": "접속 시도가 많습니다. 15분 후 다시 시도해 주세요.",
    "auth/pin-identity-conflict": "같은 학교와 이름의 계정을 확인해야 합니다. 선생님께 문의해 주세요.",
    "auth/pin-orphaned-identity": "삭제된 계정의 로그인 정보가 남아 있습니다. 선생님께 문의해 주세요.",
    "auth/pin-profile-missing": "사용자 정보를 찾을 수 없습니다. 선생님께 문의해 주세요.",
    "auth/pin-already-registered": "이미 PIN이 등록되었습니다. 창을 닫고 다시 시작해 주세요.",
    "auth/pin-maintenance-locked": "반 삭제 작업 중입니다. 잠시 후 다시 시도해 주세요.",
    "auth/pin-admin-required": "관리자 계정으로 다시 로그인해 주세요.",
    "auth/pin-target-forbidden": "이 계정은 PIN으로 로그인할 수 없습니다.",
    "auth/pin-target-unavailable": "삭제되었거나 비활성화된 계정입니다. 선생님께 문의해 주세요.",
    "auth/pin-unavailable": "로그인 서버 설정을 확인해 주세요. 선생님께 문의해 주세요.",
    "auth/pin-enrollment-required": "기존 계정의 PIN 등록이 필요합니다. 이전에 사용한 기기에서 등록하거나 선생님께 PIN 설정을 요청해 주세요.",
    "auth/invalid-pin": "PIN이 일치하지 않습니다.",
    "auth/too-many-requests": "입력 시도가 많습니다. 잠시 후 다시 시도해 주세요.",
    "auth/identity-conflict": "같은 학교와 이름의 계정이 여러 개 있습니다. 선생님께 계정 확인을 요청해 주세요.",
  };
  return messages[error?.code] || error?.message || "처리하지 못했습니다. 다시 시도해 주세요.";
}
