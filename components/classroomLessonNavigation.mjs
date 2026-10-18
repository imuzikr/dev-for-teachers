export function lessonPositions(sections) {
  return sections.flatMap(section => [
    { stepId: section.id, key: null },
    ...section.items.map(item => ({ stepId: section.id, key: `${item.kind}:${item.id}` })),
  ]);
}

export function lessonSelection(sections, selectedStepId, selection) {
  const section = sections.find(row => row.id === selectedStepId) ?? sections[0] ?? null;
  const requestedKey = selection && section && selection.stepId === section.id ? selection.key : null;
  const item = section?.items.find(row => `${row.kind}:${row.id}` === requestedKey) ?? null;
  return { section, item, itemKey: item ? requestedKey : null };
}
