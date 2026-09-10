import { storage, isFirebaseConfigured } from "./firebase";
import { getDownloadURL, ref, uploadString } from "firebase/storage";
import { normalizeBookImageSizes, normalizeBookItemImages } from "./bookProjectImages";

const INLINE_JPEG_PREFIX = "data:image/jpeg;base64,";
const STORAGE_PREFIX = "book-project-images";

function uploadError(message, cause) {
  const error = new Error(message);
  error.code = "book-project/image-upload";
  if (cause) error.cause = cause;
  return error;
}

function assertPathSegment(value, label) {
  if (typeof value !== "string" || !value.trim() || value.includes("/")) {
    throw uploadError(`${label} 정보가 올바르지 않아 이미지를 저장하지 못했어요.`);
  }
  return value.trim();
}

async function sha256Hex(value) {
  if (!globalThis.crypto?.subtle?.digest) {
    throw uploadError("이미지 저장을 준비하지 못했어요. 브라우저 보안 설정을 확인해 주세요.");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function bookProjectImagePath({ classId, uid, hash }) {
  return `${STORAGE_PREFIX}/${assertPathSegment(classId, "수업")}/${assertPathSegment(uid, "사용자")}/${hash}.jpg`;
}

function prepareBookProjectImageSteps(steps) {
  return (steps ?? []).map((step) => ({
    ...step,
    activities: (step.activities ?? []).map((activity) => {
      const images = normalizeBookItemImages(activity.images);
      return { ...activity, images, imageSizes: normalizeBookImageSizes(activity.imageSizes, images) };
    }),
    resources: (step.resources ?? []).map((resource) => {
      const images = normalizeBookItemImages(resource.images);
      return { ...resource, images, imageSizes: normalizeBookImageSizes(resource.imageSizes, images) };
    }),
  }));
}

async function uploadBookProjectImage(user, classId, image, cache) {
  if (image.startsWith("https://")) return image;
  if (!image.startsWith(INLINE_JPEG_PREFIX)) {
    throw uploadError("JPG 형식의 첨부 이미지만 저장할 수 있어요.");
  }
  if (!isFirebaseConfigured || !storage) {
    throw uploadError("이미지 저장소가 준비되지 않았어요. 잠시 후 다시 저장해 주세요.");
  }
  if (cache.has(image)) return cache.get(image);
  const pendingUpload = (async () => {
    const hash = await sha256Hex(image);
    const imageRef = ref(storage, bookProjectImagePath({ classId, uid: user.uid, hash }));
    try {
      return await getDownloadURL(imageRef);
    } catch (missingCause) {
      if (missingCause?.code !== "storage/object-not-found") throw missingCause;
    }
    try {
      await uploadString(imageRef, image, "data_url", {
        contentType: "image/jpeg",
        cacheControl: "public,max-age=31536000,immutable",
        customMetadata: {
          classId,
          ownerUid: user.uid,
          sha256: hash,
        },
      });
    } catch (uploadCause) {
      try {
        return await getDownloadURL(imageRef);
      } catch {
        throw uploadCause;
      }
    }
    return getDownloadURL(imageRef);
  })();
  cache.set(image, pendingUpload);
  try {
    return await pendingUpload;
  } catch (cause) {
    cache.delete(image);
    if (cause?.code === "book-project/image-upload") throw cause;
    throw uploadError("이미지를 저장하지 못했어요. 권한과 네트워크 연결을 확인한 뒤 다시 저장해 주세요.", cause);
  }
}

async function uploadItemImages(user, classId, item, cache) {
  const images = [];
  for (const image of item.images) {
    images.push(await uploadBookProjectImage(user, classId, image, cache));
  }
  return { ...item, images, imageSizes: normalizeBookImageSizes(item.imageSizes, images) };
}

export async function uploadBookProjectImages(user, { classId, steps }) {
  const uid = assertPathSegment(user?.uid, "사용자");
  const normalizedClassId = assertPathSegment(classId, "수업");
  const preparedSteps = prepareBookProjectImageSteps(steps);
  const cache = new Map();
  const uploadUser = { ...user, uid };
  return Promise.all(preparedSteps.map(async (step) => ({
    ...step,
    activities: await Promise.all((step.activities ?? []).map((activity) =>
      uploadItemImages(uploadUser, normalizedClassId, activity, cache))),
    resources: await Promise.all((step.resources ?? []).map((resource) =>
      uploadItemImages(uploadUser, normalizedClassId, resource, cache))),
  })));
}
