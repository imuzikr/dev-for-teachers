import { readImageAsDataUrl, readFileAsDataUrl } from "./image";

function finishProgress(onProgress) {
  if (onProgress) onProgress(1);
}

export async function uploadImage(file, { maxWidth = 1080, onProgress } = {}) {
  const imageUrl = await readImageAsDataUrl(file, maxWidth);
  finishProgress(onProgress);
  return imageUrl;
}

export async function uploadImageBlob(blob, name = "image.jpg", { onProgress } = {}) {
  const imageUrl = await readFileAsDataUrl(blob);
  finishProgress(onProgress);
  return imageUrl;
}

export async function uploadFile(file, { onProgress } = {}) {
  const fileUrl = await readFileAsDataUrl(file);
  finishProgress(onProgress);
  return fileUrl;
}

export async function uploadDataUrl(dataUrl, name = "image.png", { onProgress } = {}) {
  finishProgress(onProgress);
  return dataUrl;
}

export async function deleteUploadedFile(url) {
  return;
}

export async function deleteAttachedFiles({ imageUrl, images, attachments } = {}) {
  return;
}
