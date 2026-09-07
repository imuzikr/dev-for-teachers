export function checklistVersion(content = "") {
  let hash = 2166136261;
  for (const character of content) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `v1-${(hash >>> 0).toString(36)}`;
}

export function checklistSnapshot(defaults, values) {
  return defaults.map((checked, index) => Object.hasOwn(values, index) ? values[index] === true : checked);
}

export function checklistComplete(values) {
  return values.every((checked) => checked === true);
}

export function currentChecklistConfirmation(record, content, expectedCount) {
  if (record.confirmed !== true) return false;
  if (record.checklistVersion === undefined) return expectedCount === 0;
  return record.checklistVersion === checklistVersion(content || "")
    && Array.isArray(record.checklistValues)
    && record.checklistValues.length === expectedCount
    && checklistComplete(record.checklistValues);
}
