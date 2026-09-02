"use client";

import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase";

const mockConfirmations = [];
const mockConfirmationListeners = new Map();

function normalizedKind(kind) {
  return kind === "resource" ? "resource" : "activity";
}

function isConfirmationKind(kind) {
  return kind === "activity" || kind === "resource";
}

function confirmationId(classId, projectId, itemKind, itemId, authorId) {
  return [classId, projectId, normalizedKind(itemKind), itemId, authorId].join("|");
}

function notifyMockConfirmations(classId) {
  mockConfirmationListeners.get(classId)?.forEach((callback) => callback());
}

function mockConfirmationList(classId, authorId) {
  return mockConfirmations.filter((item) => (
    item.classId === classId
    && item.confirmed
    && (!authorId || item.authorId === authorId)
  ));
}

export function bookConfirmationKey(kind, itemId) {
  return `${normalizedKind(kind)}:${itemId}`;
}

export function subscribeBookConfirmations({ classId, authorId = "", callback }) {
  if (!classId) {
    callback([]);
    return () => {};
  }

  if (isFirebaseConfigured) {
    const filters = [where("classId", "==", classId)];
    if (authorId) filters.push(where("authorId", "==", authorId));
    return onSnapshot(
      query(collection(db, "bookConfirmations"), ...filters),
      (snap) => callback(snap.docs.map((item) => ({ id: item.id, ...item.data() })).filter((item) => item.confirmed)),
      (error) => {
        console.warn("[책방] 확인 진척도를 읽지 못했어요:", error?.code, error?.message);
        callback([]);
      }
    );
  }

  if (!mockConfirmationListeners.has(classId)) mockConfirmationListeners.set(classId, new Set());
  const emit = () => callback(mockConfirmationList(classId, authorId));
  mockConfirmationListeners.get(classId).add(emit);
  emit();
  return () => mockConfirmationListeners.get(classId)?.delete(emit);
}

export async function saveBookConfirmation({
  classId,
  projectId,
  itemKind,
  itemId,
  itemTitle = "",
  stepId = "",
  user,
}) {
  if (!classId || !itemId || !user?.uid || !isConfirmationKind(itemKind)) return;

  const data = {
    classId,
    projectId: projectId || classId,
    itemKind: normalizedKind(itemKind),
    itemId,
    itemTitle: itemTitle || "",
    stepId: stepId || "",
    authorId: user.uid,
    authorName: user.realName || user.displayName || "이름 미설정",
    confirmed: true,
  };

  if (isFirebaseConfigured) {
    await setDoc(
      doc(db, "bookConfirmations", confirmationId(data.classId, data.projectId, data.itemKind, data.itemId, data.authorId)),
      { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
      { merge: true }
    );
    return;
  }

  const id = confirmationId(data.classId, data.projectId, data.itemKind, data.itemId, data.authorId);
  const found = mockConfirmations.find((item) => item.id === id);
  if (found) Object.assign(found, data, { updatedAt: new Date() });
  else mockConfirmations.push({ id, ...data, createdAt: new Date(), updatedAt: new Date() });
  notifyMockConfirmations(data.classId);
}
