import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import test from "node:test";
import vm from "node:vm";

async function loadModule({ existingPaths = [], uploadImpl, urlImpl } = {}) {
  const uploads = [];
  const uploadedPaths = new Set(existingPaths);
  const context = vm.createContext({ console, Map, Promise, TextEncoder, Uint8Array, crypto: webcrypto });
  const source = (file) => readFileSync(new URL(`../lib/${file}.js`, import.meta.url), "utf8");
  const stub = (exports) => new vm.SyntheticModule(Object.keys(exports), function defineExports() {
    Object.entries(exports).forEach(([name, value]) => this.setExport(name, value));
  }, { context });
  const storageApi = {
    ref: (_storage, path) => ({ path }),
    uploadString: async (imageRef, value, format, metadata) => {
      uploads.push({ imageRef, value, format, metadata });
      if (uploadImpl) return uploadImpl(imageRef, value, format, metadata);
      uploadedPaths.add(imageRef.path);
      return {};
    },
    getDownloadURL: async (imageRef) => {
      if (urlImpl) return urlImpl(imageRef);
      if (!uploadedPaths.has(imageRef.path)) {
        const error = new Error("not found");
        error.code = "storage/object-not-found";
        throw error;
      }
      return `https://firebasestorage.googleapis.com/v0/b/dev-for-teachers.firebasestorage.app/o/${encodeURIComponent(imageRef.path)}?alt=media`;
    },
  };
  const imageModule = new vm.SourceTextModule(source("bookProjectImages"), { context });
  await imageModule.link(() => {});
  await imageModule.evaluate();
  const dependencies = {
    "./firebase": stub({ storage: {}, isFirebaseConfigured: true }),
    "firebase/storage": stub(storageApi),
    "./bookProjectImages": imageModule,
  };
  const module = new vm.SourceTextModule(source("bookProjectStorage"), { context });
  await module.link((specifier) => dependencies[specifier]);
  await module.evaluate();
  return { ...module.namespace, uploads };
}

async function sha256Hex(value) {
  const digest = await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const image = "data:image/jpeg;base64,YWJj";
const otherImage = "data:image/jpeg;base64,ZGVm";
const existingUrl = "https://example.com/existing.jpg";
const user = { uid: "teacherA" };

test("uploadBookProjectImages validates every item before uploading", async () => {
  const api = await loadModule();
  const steps = [{
    id: "step1",
    activities: [{ id: "act1", title: "활동", images: [image] }],
    resources: [{ id: "res1", title: "자료", images: ["javascript:alert(1)"] }],
  }];
  await assert.rejects(api.uploadBookProjectImages(user, { classId: "classA", steps }), {
    code: "book-project/image-limit",
  });
  assert.equal(api.uploads.length, 0);
});

test("uploadBookProjectImages stores inline JPEGs at deterministic hash paths and reuses HTTPS URLs", async () => {
  const api = await loadModule();
  const steps = [{
    id: "step1",
    activities: [{ id: "act1", title: "활동", images: [image, existingUrl], imageSizes: ["large"] }],
    resources: [{ id: "res1", title: "자료", images: [otherImage], imageSizes: ["small"] }],
  }];
  const prepared = await api.uploadBookProjectImages(user, { classId: "classA", steps });
  const hash = await sha256Hex(image);
  assert.equal(api.uploads[0].imageRef.path, `book-project-images/classA/teacherA/${hash}.jpg`);
  assert.equal(api.uploads[0].format, "data_url");
  assert.equal(api.uploads[0].metadata.contentType, "image/jpeg");
  assert.equal(api.uploads[0].metadata.customMetadata.sha256, hash);
  assert.equal(prepared[0].activities[0].images[0], `https://firebasestorage.googleapis.com/v0/b/dev-for-teachers.firebasestorage.app/o/${encodeURIComponent(api.uploads[0].imageRef.path)}?alt=media`);
  assert.equal(prepared[0].activities[0].images[1], existingUrl);
  assert.deepEqual(Array.from(prepared[0].activities[0].imageSizes), ["large", "medium"]);
  assert.deepEqual(Array.from(prepared[0].resources[0].imageSizes), ["small"]);
});

test("uploadBookProjectImages reuses existing hashed Storage objects without rewriting them", async () => {
  const hash = await sha256Hex(image);
  const path = `book-project-images/classA/teacherA/${hash}.jpg`;
  const api = await loadModule({ existingPaths: [path] });
  const steps = [{ id: "step1", activities: [{ id: "act1", title: "활동", images: [image] }], resources: [] }];
  const prepared = await api.uploadBookProjectImages(user, { classId: "classA", steps });
  assert.equal(api.uploads.length, 0);
  assert.equal(prepared[0].activities[0].images[0], `https://firebasestorage.googleapis.com/v0/b/dev-for-teachers.firebasestorage.app/o/${encodeURIComponent(path)}?alt=media`);
});

test("uploadBookProjectImages reuses identical inline content across concurrent steps", async () => {
  const api = await loadModule();
  const steps = [{
    id: "step1",
    activities: [{ id: "act1", title: "활동", images: [image] }],
    resources: [{ id: "res1", title: "자료", images: [image] }],
  }, {
    id: "step2",
    activities: [{ id: "act2", title: "활동 2", images: [image] }],
    resources: [{ id: "res2", title: "자료 2", images: [image] }],
  }];
  const prepared = await api.uploadBookProjectImages(user, { classId: "classA", steps });
  assert.equal(api.uploads.length, 1);
  assert.equal(prepared[0].activities[0].images[0], prepared[0].resources[0].images[0]);
  assert.equal(prepared[0].activities[0].images[0], prepared[1].activities[0].images[0]);
  assert.equal(prepared[0].activities[0].images[0], prepared[1].resources[0].images[0]);
});

test("uploadBookProjectImages reports meaningful Storage failures", async () => {
  const api = await loadModule({
    uploadImpl: async () => {
      const error = new Error("denied");
      error.code = "storage/unauthorized";
      throw error;
    },
  });
  const steps = [{ id: "step1", activities: [{ id: "act1", title: "활동", images: [image] }], resources: [] }];
  await assert.rejects(api.uploadBookProjectImages(user, { classId: "classA", steps }), {
    code: "book-project/image-upload",
  });
});
