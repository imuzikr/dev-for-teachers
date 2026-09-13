export function presentationScrollPosition(body) {
  const top = body.getBoundingClientRect().top;
  const blocks = [...body.querySelectorAll(".book-presentation-rich > *")];
  let anchor = -1;
  blocks.forEach((block, index) => {
    if (block.getBoundingClientRect().top <= top + 1) anchor = index;
  });
  const rect = blocks[anchor]?.getBoundingClientRect();
  return {
    ratio: body.scrollTop / Math.max(1, body.scrollHeight - body.clientHeight),
    anchor,
    offset: rect ? Math.min(1, Math.max(0, (top - rect.top) / Math.max(1, rect.height))) : 0,
  };
}

export function applyPresentationScroll(body, position) {
  if (!body || !position || !Number.isFinite(position.ratio)) return;
  const block = body.querySelectorAll(".book-presentation-rich > *")[position.anchor];
  const rect = block?.getBoundingClientRect();
  const max = Math.max(0, body.scrollHeight - body.clientHeight);
  const top = rect && Number.isFinite(position.offset)
    ? body.scrollTop + rect.top - body.getBoundingClientRect().top + rect.height * position.offset
    : max * position.ratio;
  body.scrollTo({ top: Math.max(0, Math.min(max, top)), behavior: "instant" });
}
