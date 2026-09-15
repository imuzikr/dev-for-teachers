import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const sidebarCss = await readFile(new URL("../app/book-sidebar.css", import.meta.url), "utf8");
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  await mkdir("artifacts/add-item-size", { recursive: true });
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const measurements = [];
    for (const count of [1, 3, 4, 5]) {
      await page.setContent(`<style>${css}\n${sidebarCss}</style><main class="book-library-layout"><section class="book-library-main"><div class="book-personal-detail-list book-project-flow-detail-list">${Array.from({ length: count }, () => '<article class="book-personal-activity-card is-compact" style="min-height:260px">활동</article>').join("")}<button class="btn-outline book-main-add-item">추가하기</button></div></section></main>`);
      const button = page.getByRole("button", { name: "추가하기" });
      measurements.push(await button.boundingBox());
      await page.screenshot({ path: `artifacts/add-item-size/${width}-${count}.png` });
      const card = await page.locator("article").first().boundingBox();
      const added = measurements.at(-1);
      assert(Math.abs(added.height - card.height) < 1, `Add tile must match card height: ${added.height} vs ${card.height}, viewport ${width}, count ${count}`);
      assert(Math.abs(added.width - card.width) < 1, "Add tile must match card width");
      await button.click();
    }
    console.log(JSON.stringify({ width, measurements }));
    assert.equal(measurements[0].height, measurements[1].height, "Add button height must not depend on adjacent cards or row position");
    assert.equal(measurements[0].width, measurements[1].width, "Add button width must match its grid column");
  }
} finally {
  await browser.close();
}
