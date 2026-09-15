export const LESSON_FILE_MAX_BYTES = 50 * 1024 * 1024;
export const LESSON_FILE_EXTENSIONS = [
  "jpg", "jpeg", "jfif", "png", "apng", "gif", "webp", "avif", "bmp", "tif", "tiff", "ico", "svg", "heic", "heif",
  "txt", "pdf", "pptx", "xlsx", "csv", "zip", "html", "htm", "json", "doc", "docx", "hwp", "hwpx",
];
export const LESSON_FILE_ACCEPT = LESSON_FILE_EXTENSIONS.map(extension => `.${extension}`).join(",");

export function validateLessonFile(file) {
  const extension = file.name.split(".").pop().toLowerCase();
  if (!LESSON_FILE_EXTENSIONS.includes(extension)) throw new Error("지원하지 않는 파일 형식입니다.");
  if (!file.name || file.name.length > 240 || /[\x00-\x1f\x7f]/.test(file.name)) throw new Error("파일 이름은 제어 문자 없이 240자 이내여야 합니다.");
  if (!Number.isInteger(file.size) || file.size < 1) throw new Error("빈 파일은 올릴 수 없습니다.");
  if (file.size > LESSON_FILE_MAX_BYTES) throw new Error("파일은 하나당 50MB까지 올릴 수 있습니다.");
  return extension;
}

export function lessonFileDisposition(name) {
  return `attachment; filename*=UTF-8''${encodeURIComponent(name).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}

export function lessonFileError(error) {
  if (["permission-denied", "storage/unauthorized"].includes(error?.code)) return "자료 접근 권한이 없습니다. 로그인 상태와 최신 Firestore·Storage 규칙 게시 여부를 확인해 주세요.";
  return error?.message || "자료를 처리하지 못했습니다. 다시 시도해 주세요.";
}
