const BLOCKS = '.portfolio-cover, .portfolio-toc, .portfolio-section > header, .portfolio-item';

export function portfolioScrollPosition(document) {
  const body = document?.scrollingElement;
  if (!body) return { ratio: 0, anchor: -1, offset: 0 };
  const blocks = [...document.querySelectorAll(BLOCKS)];
  let anchor = -1;
  blocks.forEach((block, index) => { if (block.getBoundingClientRect().top <= 1) anchor = index; });
  const rect = blocks[anchor]?.getBoundingClientRect();
  return {
    ratio: body.scrollTop / Math.max(1, body.scrollHeight - body.clientHeight),
    anchor,
    offset: rect ? Math.min(1, Math.max(0, -rect.top / Math.max(1, rect.height))) : 0,
  };
}

export function applyPortfolioScroll(document, position) {
  const body = document?.scrollingElement;
  if (!body || !Number.isFinite(position?.ratio)) return;
  const rect = document.querySelectorAll(BLOCKS)[position.anchor]?.getBoundingClientRect();
  const max = Math.max(0, body.scrollHeight - body.clientHeight);
  const top = rect && Number.isFinite(position.offset)
    ? body.scrollTop + rect.top + rect.height * position.offset
    : max * position.ratio;
  body.scrollTo({ top: Math.max(0, Math.min(max, top)), behavior: 'instant' });
}
