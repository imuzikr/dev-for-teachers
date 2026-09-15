import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  await mkdir("artifacts/admin-action-size", { recursive: true });
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 300 });
    await page.setContent(`<style>${css}</style><main style="padding:24px"><div class="admin-user-actions"><button class="btn-outline">PIN 설정·재설정</button><button class="btn-ghost role-danger-btn"><svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15" stroke="currentColor" fill="none"/></svg>탈퇴 처리</button></div></main>`);
    const buttons = page.locator(".admin-user-actions > button");
    const first = await buttons.nth(0).boundingBox(), second = await buttons.nth(1).boundingBox();
    assert.equal(first.width, second.width);
    assert.equal(first.height, second.height);
    assert(first.height >= 44);
    assert(second.x + second.width <= width);
    assert(await buttons.evaluateAll(nodes => nodes.every(node => node.scrollWidth <= node.clientWidth && node.scrollHeight <= node.clientHeight)));
    await page.screenshot({ path: `artifacts/admin-action-size/${width}.png` });
    console.log(JSON.stringify({ width, first, second }));
  }
} finally {
  await browser.close();
}
