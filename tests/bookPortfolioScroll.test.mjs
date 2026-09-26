import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const module = new vm.SourceTextModule(await readFile(new URL('../components/bookPortfolioScroll.js', import.meta.url), 'utf8'));
await module.link(() => { throw new Error('Unexpected dependency'); });
await module.evaluate();
const { portfolioScrollPosition, applyPortfolioScroll } = module.namespace;

function documentAt({ top = 200, height = 2000, viewport = 400, blocks = [] } = {}) {
  const calls = [];
  return {
    calls,
    scrollingElement: { scrollTop: top, scrollHeight: height, clientHeight: viewport, scrollTo: (value) => calls.push(value) },
    querySelectorAll: () => blocks.map((rect) => ({ getBoundingClientRect: () => rect })),
  };
}

test('teacher scroll identifies visible report block and position within it', () => {
  const document = documentAt({ blocks: [{ top: -200, height: 100 }, { top: -40, height: 200 }, { top: 180, height: 400 }] });
  const position = portfolioScrollPosition(document);
  assert.equal(position.anchor, 1);
  assert.equal(position.offset, 0.2);
  assert.equal(position.ratio, 0.125);
});

test('different student viewport uses report anchor instead of raw scroll ratio', () => {
  const document = documentAt({ top: 300, blocks: [{ top: -100, height: 600 }] });
  applyPortfolioScroll(document, { ratio: 0.8, anchor: 0, offset: 0.25 });
  assert.equal(document.calls[0].top, 350);
});

test('missing anchor uses scroll ratio and clamps to available height', () => {
  const document = documentAt();
  applyPortfolioScroll(document, { ratio: 0.5, anchor: 8, offset: 0 });
  applyPortfolioScroll(document, { ratio: 2, anchor: -1 });
  assert.deepEqual(document.calls.map((call) => call.top), [800, 1600]);
});

test('loading or malformed scroll state does not move the viewer', () => {
  const document = documentAt();
  applyPortfolioScroll(null, { ratio: 1 });
  applyPortfolioScroll(document, { ratio: Number.NaN });
  applyPortfolioScroll(document, null);
  assert.equal(document.calls.length, 0);
  assert.equal(portfolioScrollPosition(null).ratio, 0);
});
