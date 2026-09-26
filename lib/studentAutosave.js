const autosaveFlushers = new Map();

export function registerStudentAutosaveFlush(id, flush) {
  if (!id || typeof flush !== "function") return () => {};
  autosaveFlushers.set(id, flush);
  return () => {
    if (autosaveFlushers.get(id) === flush) autosaveFlushers.delete(id);
  };
}

export async function flushStudentAutosaves() {
  const flushes = [...autosaveFlushers.values()];
  if (flushes.length === 0) return true;

  const results = await Promise.allSettled(flushes.map((flush) => Promise.resolve().then(flush)));
  return results.every((result) => result.status === "fulfilled" && result.value !== false);
}
