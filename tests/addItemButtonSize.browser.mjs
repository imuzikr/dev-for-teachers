import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  await mkdir("artifacts/add-item-size", { recursive: true });
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const measurements = [];
    for (const count of [1, 3]) {
      await page.setContent(`<style>${css}</style><main class="book-library-layout is-student-main"><section class="book-personal-detail--teacher"><div class="book-personal-detail-list">${Array.from({ length: count }, () => '<article style="height:260px;min-width:0;border:1px solid gray">활동</article>').join("")}<button class="btn-outline book-main-add-item">추가하기</button></div></section></main>`);
      const button = page.getByRole("button", { name: "추가하기" });
      measurements.push(await button.boundingBox());
      await page.screenshot({ path: `artifacts/add-item-size/${width}-${count}.png` });
      await button.click();
    }
    console.log(JSON.stringify({ width, measurements }));
    assert.equal(measurements[0].height, measurements[1].height, "Add button height must not depend on adjacent cards or row position");
    assert.equal(measurements[0].width, measurements[1].width, "Add button width must match its grid column");
  }
} finally {
  await browser.close();
}
