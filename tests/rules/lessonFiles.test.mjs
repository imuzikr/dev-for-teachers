import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, deleteDoc, serverTimestamp } from "firebase/firestore";

test("teacher distribution files preserve originals, enforce ownership, and force downloads", async () => {
  const projectId = process.env.GCLOUD_PROJECT;
  assert.match(projectId, /^demo-/);
  const target = key => { const [host, port] = process.env[key].split(":"); return { host, port: Number(port) }; };
  const env = await initializeTestEnvironment({ projectId,
    firestore: { rules: readFileSync("firestore.rules", "utf8"), ...target("FIRESTORE_EMULATOR_HOST") },
    storage: { rules: readFileSync("storage.rules", "utf8"), ...target("FIREBASE_STORAGE_EMULATOR_HOST") },
  });
  try {
    await env.clearFirestore(); await env.clearStorage();
    const owner = env.authenticatedContext("teacher", { role: "teacher" });
    const other = env.authenticatedContext("other", { role: "teacher" });
    const student = env.authenticatedContext("student", { role: "student" });
    const id = "12345678-1234-1234-1234-123456789abc";
    const extensions = ["jpg", "jpeg", "jfif", "png", "apng", "gif", "webp", "avif", "bmp", "tif", "tiff", "ico", "svg", "heic", "heif", "txt", "pdf", "pptx", "xlsx", "csv", "zip", "html", "htm", "json", "doc", "docx", "hwp", "hwpx"];
    const metadata = { contentType: "application/octet-stream", contentDisposition: "attachment; filename*=UTF-8''lesson.html" };
    for (const extension of extensions) {
      const path = `lesson-files/teacher/${id}.${extension}`;
      const object = owner.storage(`gs://${projectId}`).ref(path);
      await assertSucceeds(object.putString("original bytes", "raw", metadata));
      const url = await assertSucceeds(object.getDownloadURL());
      const response = await fetch(url);
      assert.equal(await response.text(), "original bytes");
      assert.match(response.headers.get("content-disposition"), /^attachment/);
      await assertFails(other.storage(`gs://${projectId}`).ref(path).getDownloadURL());
      await assertFails(student.storage(`gs://${projectId}`).ref(path).delete());
      await assertFails(object.putString("replace", "raw", metadata));
      await assertSucceeds(object.delete());
    }
    const path = `lesson-files/teacher/${id}.html`;
    await assertFails(owner.storage(`gs://${projectId}`).ref(path).putString("html", "raw", { contentType: "text/html", contentDisposition: "inline" }));
    await assertFails(student.storage(`gs://${projectId}`).ref(`lesson-files/student/${id}.txt`).putString("text", "raw", metadata));
    await assertFails(owner.storage(`gs://${projectId}`).ref(`lesson-files/teacher/${id}.exe`).putString("exe", "raw", metadata));
    const payload = { ownerId: "teacher", name: "수업 자료.html", extension: "html", size: 14, storagePath: path, createdAt: serverTimestamp() };
    const record = doc(owner.firestore(), "lessonFiles", "teacher", "files", id);
    await assertSucceeds(setDoc(record, payload));
    await assertSucceeds(getDoc(record));
    await assertFails(getDoc(doc(other.firestore(), "lessonFiles", "teacher", "files", id)));
    await assertFails(getDoc(doc(student.firestore(), "lessonFiles", "teacher", "files", id)));
    await assertFails(setDoc(record, { ...payload, name: "overwrite" }));
    await assertSucceeds(deleteDoc(record));
    await assertFails(setDoc(record, { ...payload, size: 52428801 }));
    await assertFails(setDoc(record, { ...payload, storagePath: "another/path" }));
    await assertFails(setDoc(doc(student.firestore(), "lessonFiles", "student", "files", id), { ...payload, ownerId: "student" }));
  } finally { await env.cleanup(); }
});
