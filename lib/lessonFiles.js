import { collection, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage, isFirebaseConfigured } from "./firebase";
import { validateLessonFile, lessonFileDisposition } from "./lessonFilePolicy";

const mockFiles = new Map();
const listeners = new Set();
function notify() { listeners.forEach(listener => listener()); }
function fileCollection(uid) { return collection(db, "lessonFiles", uid, "files"); }

export function subscribeLessonFiles(uid, onFiles, onError) {
  if (!uid) { onFiles([]); return () => {}; }
  if (isFirebaseConfigured) return onSnapshot(fileCollection(uid), snapshot => {
    onFiles(snapshot.docs.map(item => ({ ...item.data(), id: item.id }))
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)));
  }, onError);
  const emit = () => onFiles([...mockFiles.values()].filter(file => file.ownerId === uid).reverse());
  listeners.add(emit);
  emit();
  return () => listeners.delete(emit);
}

export async function addLessonFile(user, file, onProgress) {
  if (!user?.uid) throw new Error("로그인이 필요합니다.");
  const extension = validateLessonFile(file);
  const id = crypto.randomUUID();
  const storagePath = `lesson-files/${user.uid}/${id}.${extension}`;
  const data = { ownerId: user.uid, name: file.name, size: file.size, extension, storagePath };
  if (!isFirebaseConfigured) {
    mockFiles.set(id, { id, ...data, blob: file });
    onProgress?.(1);
    notify();
    return;
  }
  const object = ref(storage, storagePath);
  // Force download, including active formats such as HTML and SVG.
  const task = uploadBytesResumable(object, file, {
    contentType: "application/octet-stream", contentDisposition: lessonFileDisposition(file.name),
  });
  await new Promise((resolve, reject) => task.on("state_changed", snapshot => {
    onProgress?.(snapshot.totalBytes ? snapshot.bytesTransferred / snapshot.totalBytes : 0);
  }, reject, resolve));
  try {
    await setDoc(doc(fileCollection(user.uid), id), { ...data, createdAt: serverTimestamp() });
  } catch (error) {
    try { await deleteObject(object); } catch (cleanupError) { console.warn("Lesson file cleanup failed", cleanupError.code); }
    throw error;
  }
}

export async function lessonFileUrl(file) {
  if (!isFirebaseConfigured) {
    const stored = mockFiles.get(file.id);
    if (!stored) throw new Error("자료를 찾을 수 없습니다.");
    return URL.createObjectURL(stored.blob);
  }
  return getDownloadURL(ref(storage, file.storagePath));
}

export async function deleteLessonFile(user, file) {
  if (!user?.uid || user.uid !== file.ownerId) throw new Error("본인의 자료만 삭제할 수 있습니다.");
  if (!isFirebaseConfigured) { mockFiles.delete(file.id); notify(); return; }
  const expected = `lesson-files/${user.uid}/${file.id}.${file.extension}`;
  if (file.storagePath !== expected) throw new Error("파일 경로가 올바르지 않습니다.");
  try { await deleteObject(ref(storage, expected)); }
  catch (error) { if (error.code !== "storage/object-not-found") throw error; }
  await deleteDoc(doc(fileCollection(user.uid), file.id));
}
