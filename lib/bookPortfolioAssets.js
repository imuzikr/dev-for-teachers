const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;
const DECODE_TIMEOUT_MS = 3000;
const CONCURRENCY = 3;
const RASTER_DATA_URL = /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i;
const RASTER_CONTENT_TYPE = /^image\/(?:png|jpe?g|gif|webp)$/i;

function abortError() {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError();
}

function missingImage(image) {
  return { caption: image.caption || "캡처", missing: true };
}

function cloneModel(model) {
  return {
    ...model,
    sections: (model.sections ?? []).map((section) => ({
      ...section,
      items: (section.items ?? []).map((item) => ({
        ...item,
        urls: (item.urls ?? []).map((url) => ({ ...url })),
        images: (item.images ?? []).map((image) => ({ ...image })),
      })),
    })),
    stats: { ...(model.stats ?? {}) },
  };
}

function contentType(headers) {
  return headers?.get?.("content-type")?.split(";")[0]?.trim().toLowerCase() || "";
}

function contentLength(headers) {
  const value = headers?.get?.("content-length");
  return value ? Number(value) : 0;
}

function hasContentLength(headers) {
  return Boolean(headers?.get?.("content-length"));
}

function bytesToBase64(bytes) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    output += alphabet[first >> 2];
    output += alphabet[((first & 3) << 4) | (second >> 4)];
    output += index + 1 < bytes.length ? alphabet[((second & 15) << 2) | (third >> 6)] : "=";
    output += index + 2 < bytes.length ? alphabet[third & 63] : "=";
  }
  return output;
}

function encodeDataUrl(type, buffer) {
  return `data:${type};base64,${bytesToBase64(new Uint8Array(buffer))}`;
}

function concatChunks(chunks, size) {
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

async function readCappedBody(response, signal) {
  const length = contentLength(response.headers);
  if (length > MAX_IMAGE_BYTES) return null;
  if (!response.body) {
    if (!hasContentLength(response.headers)) return null;
    const buffer = await response.arrayBuffer();
    return buffer.byteLength > MAX_IMAGE_BYTES ? null : buffer;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      throwIfAborted(signal);
      const { done, value } = await reader.read();
      if (done) return concatChunks(chunks, size);
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      size += chunk.byteLength;
      if (size > MAX_IMAGE_BYTES) {
        await reader.cancel?.();
        return null;
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock?.();
  }
}

function validateWithImage(src, signal) {
  if (typeof Image === "undefined") return Promise.resolve(true);
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => {
      cleanup();
      resolve(false);
    }, DECODE_TIMEOUT_MS);
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", onAbort);
      image.onload = null;
      image.onerror = null;
    };
    signal?.addEventListener?.("abort", onAbort, { once: true });
    image.onload = () => {
      cleanup();
      resolve(true);
    };
    image.onerror = () => {
      cleanup();
      resolve(false);
    };
    image.src = src;
    if (typeof image.decode === "function") {
      image.decode().then(() => {
        cleanup();
        resolve(true);
      }, () => {
        cleanup();
        resolve(false);
      });
    }
  });
}

async function rasterDataUrl(src, signal) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, FETCH_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener?.("abort", onAbort, { once: true });
  try {
    const response = await fetch(src, { signal: controller.signal });
    throwIfAborted(signal);
    const type = contentType(response.headers);
    if (!response.ok || !RASTER_CONTENT_TYPE.test(type)) return null;
    const buffer = await readCappedBody(response, signal);
    throwIfAborted(signal);
    return buffer ? encodeDataUrl(type, buffer) : null;
  } catch (error) {
    if (signal?.aborted) throw abortError();
    if (timedOut || error?.name === "AbortError") return null;
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.("abort", onAbort);
  }
}

async function prepareImage(image, signal) {
  throwIfAborted(signal);
  if (image.missing) return missingImage(image);
  const src = typeof image.src === "string" ? image.src.trim() : "";
  if (RASTER_DATA_URL.test(src)) {
    return await validateWithImage(src, signal) ? { ...image, src } : missingImage(image);
  }
  if (!src.startsWith("https://")) return missingImage(image);
  const dataUrl = await rasterDataUrl(src, signal);
  return dataUrl && await validateWithImage(dataUrl, signal) ? { ...image, src: dataUrl } : missingImage(image);
}

function imageJobs(model) {
  const jobs = [];
  for (const section of model.sections ?? []) {
    for (const item of section.items ?? []) {
      for (const [index, image] of (item.images ?? []).entries()) {
        jobs.push({ item, index, image });
      }
    }
  }
  return jobs;
}

async function runBounded(jobs, signal) {
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      throwIfAborted(signal);
      const job = jobs[next];
      next += 1;
      const prepared = await prepareImage(job.image, signal);
      job.item.images[job.index] = prepared;
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));
}

function missingImages(model) {
  return (model.sections ?? []).flatMap((section) => (
    (section.items ?? []).flatMap((item) => (
      (item.images ?? [])
        .filter((image) => image.missing)
        .map((image) => ({ section: section.title, activity: item.title, caption: image.caption || "캡처" }))
    ))
  ));
}

function countStats(model) {
  const items = (model.sections ?? []).flatMap((section) => section.items ?? []);
  model.stats = {
    ...(model.stats ?? {}),
    imageCount: items.reduce((count, item) => count + (item.images ?? []).filter((image) => !image.missing).length, 0),
    missingImages: items.reduce((count, item) => count + (item.images ?? []).filter((image) => image.missing).length, 0),
  };
}

export async function prepareBookPortfolio(model, { signal } = {}) {
  throwIfAborted(signal);
  const prepared = cloneModel(model);
  await runBounded(imageJobs(prepared), signal);
  countStats(prepared);
  return { model: prepared, missingImages: missingImages(prepared) };
}
