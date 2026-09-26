"use client";

import { collection, doc, getDocs, onSnapshot, query, runTransaction, serverTimestamp, setDoc, where, writeBatch } from "firebase/firestore";
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

export async function deleteBookProjectConfirmations(classId, projectId) {
  if (isFirebaseConfigured) {
    const snapshot = await getDocs(query(collection(db, "bookConfirmations"), where("classId", "==", classId)));
    const records = snapshot.docs.filter((record) => record.data().projectId === projectId);
    for (let index = 0; index < records.length; index += 400) {
      const batch = writeBatch(db);
      records.slice(index, index + 400).forEach((record) => batch.delete(record.ref));
      await batch.commit();
    }
    return;
  }
  for (let index = mockConfirmations.length - 1; index >= 0; index -= 1) {
    const record = mockConfirmations[index];
    if (record.classId === classId && record.projectId === projectId) mockConfirmations.splice(index, 1);
  }
  notifyMockConfirmations(classId);
}

function mockConfirmationList(classId, authorId) {
  return mockConfirmations.filter((item) => (
    item.classId === classId
    && (!authorId || item.authorId === authorId)
  ));
}

export function bookConfirmationKey(kind, itemId) {
  return `${normalizedKind(kind)}:${itemId}`;
}

function normalizeTemplateValues(values) {
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    throw new Error("Book confirmation templateValues must be a string map.");
  }
  const entries = Object.entries(values);
  if (entries.length > 100 || entries.some(([key, value]) => typeof key !== "string" || key.length > 120 || typeof value !== "string" || value.length > 10000)) {
    throw new Error("Book confirmation templateValues must contain at most 100 string values.");
  }
  return Object.fromEntries(entries);
}

function baseConfirmationData(input, defaultConfirmed) {
  const {
    classId,
    projectId,
    itemKind,
    itemId,
    itemTitle = "",
    stepId = "",
    user,
  } = input;

  if (!classId) throw new Error("Book confirmation requires a classId.");
  if (!itemId || !isConfirmationKind(itemKind)) throw new Error("Book confirmation requires a valid item.");
  if (!user?.uid) throw new Error("Book confirmation requires a signed-in user.");

  return {
    classId,
    projectId: projectId || classId,
    itemKind: normalizedKind(itemKind),
    itemId,
    itemTitle: itemTitle || "",
    stepId: stepId || "",
    authorId: user.uid,
    authorName: user.realName || user.displayName || "이름 미설정",
    confirmed: defaultConfirmed,
  };
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
      (snap) => callback(snap.docs.map((item) => ({ id: item.id, ...item.data() }))),
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

export async function saveBookConfirmation(input = {}) {
  const {
    classId,
    projectId,
    itemKind,
    itemId,
    itemTitle = "",
    stepId = "",
    confirmed = true,
    checklistValues,
    checklistVersion,
    user,
  } = input;

  const data = baseConfirmationData(input, typeof confirmed === "boolean" ? confirmed : true);
  if ("confirmed" in input && typeof confirmed !== "boolean") {
    throw new Error("Book confirmation confirmed must be a boolean.");
  }

  const isValidChecklistValues = Array.isArray(checklistValues)
    && checklistValues.length <= 500
    && checklistValues.every((value) => typeof value === "boolean");
  const isValidChecklistVersion = typeof checklistVersion === "string" && checklistVersion.length <= 100;
  if ("checklistValues" in input && !isValidChecklistValues) {
    throw new Error("Book confirmation checklistValues must be a boolean array with at most 500 items.");
  }
  if (confirmed === true && isValidChecklistValues && checklistValues.some((value) => value === false)) {
    throw new Error("Book confirmation cannot be confirmed while checklistValues contains false.");
  }
  if ("checklistVersion" in input && !isValidChecklistVersion) {
    throw new Error("Book confirmation checklistVersion must be a string with at most 100 characters.");
  }
  if (isValidChecklistValues) data.checklistValues = checklistValues;
  if (isValidChecklistVersion) data.checklistVersion = checklistVersion;

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

export async function saveBookTemplateDraft(input = {}) {
  const data = baseConfirmationData(input, false);
  const templateValues = normalizeTemplateValues("templateValues" in input ? input.templateValues : {});
  if ("templateText" in input && typeof input.templateText !== "string") {
    throw new Error("Book confirmation templateText must be a string.");
  }
  if ((input.templateText ?? "").length > 100000) {
    throw new Error("Book confirmation templateText must be a string with at most 100000 characters.");
  }
  data.templateValues = templateValues;
  data.templateText = input.templateText ?? "";

  const id = confirmationId(data.classId, data.projectId, data.itemKind, data.itemId, data.authorId);
  if (isFirebaseConfigured) {
    const confirmationRef = doc(db, "bookConfirmations", id);
    await runTransaction(db, async (transaction) => {
      const current = await transaction.get(confirmationRef);
      const currentData = current.exists() ? current.data() : {};
      transaction.set(confirmationRef, {
        ...currentData,
        ...data,
        confirmed: typeof currentData.confirmed === "boolean" ? currentData.confirmed : false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
    return;
  }

  const found = mockConfirmations.find((item) => item.id === id);
  if (found) {
    Object.assign(found, data, {
      confirmed: typeof found.confirmed === "boolean" ? found.confirmed : false,
      updatedAt: new Date(),
    });
  } else {
    mockConfirmations.push({ id, ...data, createdAt: new Date(), updatedAt: new Date() });
  }
  notifyMockConfirmations(data.classId);
}
