import assert from "node:assert/strict";

export default async function verifyBooksScroll(page, baseUrl, route = "/qa-books-scroll") {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(`${baseUrl}${route}`);
  await page.waitForSelector('[data-qa="mobile-scroll-end"]');
  await page.locator(".book-library-main").scrollIntoViewIfNeeded();

  const mobileBefore = await page.evaluate(() => {
    const main = document.querySelector(".books-main--split");
    const helpSections = document.querySelector('[data-qa="help-child-sections"]');
    const helpStyle = getComputedStyle(helpSections);
    return {
      scrollY: window.scrollY,
      innerHeight: window.innerHeight,
      docScrollHeight: document.documentElement.scrollHeight,
      horizontalAccess: main.scrollWidth > main.clientWidth,
      helpIndent: helpStyle.paddingLeft,
      helpBorder: helpStyle.borderLeftWidth,
    };
  });

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(150);
  const mobileAfter = await page.evaluate(() => {
    const rect = document.querySelector('[data-qa="mobile-scroll-end"]').getBoundingClientRect();
    return {
      scrollY: window.scrollY,
      markerVisible: rect.left >= 0 && rect.right <= window.innerWidth && rect.top >= 0 && rect.bottom <= window.innerHeight,
    };
  });
  await page.screenshot({ path: "qa-books-scroll-mobile-bottom.png", fullPage: false });

  assert(mobileBefore.docScrollHeight > mobileBefore.innerHeight);
  assert(mobileAfter.scrollY > 0);
  assert(mobileAfter.markerVisible);
  assert(mobileBefore.horizontalAccess);
  assert.equal(mobileBefore.helpIndent, "12px");
  assert.equal(mobileBefore.helpBorder, "1px");

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${baseUrl}${route}`);
  await page.waitForSelector('[data-qa="mobile-scroll-end"]');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(150);
  const desktop = await page.evaluate(() => {
    const shell = document.querySelector(".books-board-shell");
    const main = document.querySelector(".books-main--split");
    return {
      scrollY: window.scrollY,
      shellHeight: shell.getBoundingClientRect().height,
      viewportHeight: window.innerHeight,
      mainOverflowY: getComputedStyle(main).overflowY,
    };
  });
  await page.screenshot({ path: "qa-books-scroll-desktop.png", fullPage: false });

  assert.equal(desktop.scrollY, 0);
  assert.equal(desktop.mainOverflowY, "hidden");
  assert(Math.abs(desktop.shellHeight - desktop.viewportHeight) <= 2);

  return "Books mobile whole-page scroll, bottom reachability, horizontal access, help child indentation, and desktop fixed panel checks passed";
}
