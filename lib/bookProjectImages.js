export const BOOK_ITEM_IMAGE_LIMIT = 8;
export const BOOK_ITEM_IMAGE_MAX_CHARS = 600000;
export const BOOK_PROJECT_MAX_BYTES = 850000;

export function normalizeBookImageSizes(imageSizes, images = []) {
  return images.map((_, index) => {
    const size = Array.isArray(imageSizes) ? imageSizes[index] : undefined;
    return ["large", "medium", "small"].includes(size) ? size : "medium";
  });
}

function imageError(message) {
  const error = new Error(message);
  error.code = "book-project/image-limit";
  return error;
}

export function normalizeBookItemImages(images) {
  if (images === undefined) return [];
  if (!Array.isArray(images) || images.length > BOOK_ITEM_IMAGE_LIMIT) {
    throw imageError("활동이나 자료에는 이미지를 최대 8장까지 첨부할 수 있어요.");
  }
  let total = 0;
  for (const image of images) {
    if (typeof image !== "string" || !(/^(https:\/\/[^\s]+|data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2})$/.test(image))) {
      throw imageError("첨부 이미지 형식을 확인하고 다시 첨부해 주세요.");
    }
    total += image.length;
  }
  if (total > BOOK_ITEM_IMAGE_MAX_CHARS) {
    throw imageError("첨부 이미지 용량이 커요. 이미지 크기나 장수를 줄여 주세요.");
  }
  return [...images];
}

export function assertBookProjectSize(project, { pendingImageUploads = false } = {}) {
  const serialized = JSON.stringify(project, pendingImageUploads
    ? (key, value) => key === "images" && Array.isArray(value)
      ? value.map((image) => typeof image === "string" && image.startsWith("data:image/") ? "" : image)
      : value
    : undefined);
  const bytes = new TextEncoder().encode(serialized).byteLength;
  if (bytes > BOOK_PROJECT_MAX_BYTES) {
    const error = new Error("프로젝트의 전체 용량이 커요. 첨부 이미지 크기나 장수를 줄여 주세요.");
    error.code = "book-project/size-limit";
    throw error;
  }
}
