export function bookProjectSaveErrorMessage(error) {
  if (error?.code?.startsWith("book-project/") || error?.code?.startsWith("book-trash/")) {
    return error.message;
  }
  if (error?.code === "permission-denied" || error?.code === "firestore/permission-denied") {
    return "저장 권한 또는 보안 규칙 때문에 저장이 거부됐어요. 입력 내용은 유지됩니다. 반 접근 권한과 최신 Firestore 규칙 적용 여부를 확인해 주세요.";
  }
  return "프로젝트를 저장하지 못했어요. 입력 내용은 유지됩니다. 잠시 후 다시 시도해 주세요.";
}
