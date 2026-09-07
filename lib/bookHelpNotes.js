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
  writeBatch,
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
    order: typeof data?.order === "number" ? data.order : null,
    createdBy: data?.createdBy ?? "",
    createdAt: data?.createdAt ?? null,
    updatedAt: data?.updatedAt ?? null,
  };
}

function noteSortValue(note) {
  if (typeof note.order === "number" && Number.isFinite(note.order)) return note.order;
  return note.createdAt?.toMillis?.() ?? note.createdAt?.getTime?.() ?? 0;
}

function sortHelpNotes(notes) {
  return [...notes].sort((a, b) => {
    const byOrder = noteSortValue(a) - noteSortValue(b);
    if (byOrder !== 0) return byOrder;
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
    order: Date.now(),
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

export async function reorderBookHelpNotes(classId, orderedNotes) {
  if (!classId) return;

  const scopedNotes = orderedNotes.filter((note) => note.classId === classId);
  if (scopedNotes.length !== orderedNotes.length) {
    throw new Error("Cannot reorder help notes across classes.");
  }

  const noteIds = new Set(scopedNotes.map((note) => note.id));
  if (noteIds.size !== scopedNotes.length) {
    throw new Error("Cannot reorder help notes with duplicate ids.");
  }

  if (isFirebaseConfigured) {
    const batch = writeBatch(db);
    scopedNotes.forEach((note, index) => {
      batch.update(doc(db, "bookHelpNotes", note.id), {
        order: index,
        updatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
    return;
  }

  scopedNotes.forEach((note, index) => {
    const target = mockHelpNotes.find((item) => item.id === note.id && item.classId === classId);
    if (target) Object.assign(target, { order: index, updatedAt: new Date() });
  });
  mockHelpListeners.forEach((listener) => listener());
}
