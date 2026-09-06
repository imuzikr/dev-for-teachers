import { db, isFirebaseConfigured } from "./firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

const mockHelpNotes = [];
const mockHelpListeners = new Set();
let mockHelpSeq = 1;

function normalizeHelpNote(id, data) {
  return {
    id,
    classId: data?.classId ?? "",
    title: data?.title ?? "",
    content: data?.content ?? "",
    url: data?.url ?? "",
    createdBy: data?.createdBy ?? "",
    createdAt: data?.createdAt ?? null,
    updatedAt: data?.updatedAt ?? null,
  };
}

function sortHelpNotes(notes) {
  return [...notes].sort((a, b) => {
    const left = a.createdAt?.toMillis?.() ?? a.createdAt?.getTime?.() ?? 0;
    const right = b.createdAt?.toMillis?.() ?? b.createdAt?.getTime?.() ?? 0;
    return left - right;
  });
}

function emitMockHelpNotes(classId, callback) {
  callback(sortHelpNotes(mockHelpNotes.filter((note) => note.classId === classId)));
}

function sanitizeHelpDraft(draft) {
  return {
    title: (draft?.title ?? "").trim(),
    content: (draft?.content ?? "").trim(),
    url: (draft?.url ?? "").trim(),
  };
}

export function subscribeBookHelpNotes(classId, callback) {
  if (!classId) {
    callback([]);
    return () => {};
  }

  if (isFirebaseConfigured) {
    const helpQuery = query(collection(db, "bookHelpNotes"), where("classId", "==", classId));
    return onSnapshot(
      helpQuery,
      (snapshot) => {
        callback(sortHelpNotes(snapshot.docs.map((item) => normalizeHelpNote(item.id, item.data()))));
      },
      (error) => {
        console.warn("[책방] 도움 글을 읽지 못했어요:", error?.code, error?.message);
        callback([]);
      }
    );
  }

  const listener = () => emitMockHelpNotes(classId, callback);
  mockHelpListeners.add(listener);
  listener();
  return () => mockHelpListeners.delete(listener);
}

export async function addBookHelpNote(user, classId, draft) {
  const data = sanitizeHelpDraft(draft);
  if (isFirebaseConfigured) {
    const noteRef = await addDoc(collection(db, "bookHelpNotes"), {
      classId,
      ...data,
      createdBy: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return noteRef.id;
  }

  const id = `help${++mockHelpSeq}_m`;
  mockHelpNotes.push({
    id,
    classId,
    ...data,
    createdBy: user.uid,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  mockHelpListeners.forEach((listener) => listener());
  return id;
}

export async function updateBookHelpNote(noteId, draft) {
  const data = sanitizeHelpDraft(draft);
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, "bookHelpNotes", noteId), {
      ...data,
      updatedAt: serverTimestamp(),
    });
    return;
  }

  const target = mockHelpNotes.find((note) => note.id === noteId);
  if (target) Object.assign(target, data, { updatedAt: new Date() });
  mockHelpListeners.forEach((listener) => listener());
}

export async function deleteBookHelpNote(noteId) {
  if (isFirebaseConfigured) {
    await deleteDoc(doc(db, "bookHelpNotes", noteId));
    return;
  }

  const index = mockHelpNotes.findIndex((note) => note.id === noteId);
  if (index >= 0) mockHelpNotes.splice(index, 1);
  mockHelpListeners.forEach((listener) => listener());
}
