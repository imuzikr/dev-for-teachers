import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { cp, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = process.cwd();
const output = path.join(root, "artifacts", `activity-urls-${Date.now()}`);
const fixture = path.join(output, "fixture");
const report = { cases: [], captures: [], linkRequests: [], externalRequests: [], errors: [],
  persistenceAdapter: "Real saveBookDashboardText plus entry subscriptions; test-only sessionStorage serializes successful entries and restores them through the real save path on reload because the mock store is in memory." };
const activityTitle = "완성한 앱 소개하기";
const resourceTitle = "배포 도움 자료";
const urls = ["https://links.example.test/repository?lesson=complete-app", "links.example.test/deployed-app/results/our-class?project=sharing&mode=preview"];
const hrefs = urls.map(value => value.startsWith("https:") ? value : `https://${value}`);
let server, browser, page, logs = "";
const record = (name, details = {}) => report.cases.push({ name, ...details });
const card = title => page.locator(".book-personal-activity-card:visible").filter({ hasText: title }).first();
const expanded = () => page.locator(".book-personal-expand-modal");
const editor = scope => scope.locator(".book-item-url-editor");
const links = scope => scope.locator(".book-item-url-list a");
const stored = () => page.evaluate(() => window.__activityUrls.entries());
const state = () => page.evaluate(() => window.__activityUrls.state());
const configure = value => page.evaluate(patch => window.__activityUrls.configure(patch), value);
const entry = (entries, uid = "urls-student-a", title = activityTitle) => entries.find(value => value.authorId === uid && value.title === title);
const sidebar = () => page.locator(".student-activity-side:not(.is-collapsed)");

async function metrics() {
  return page.evaluate(() => {
    const visible = selector => [...document.querySelectorAll(selector)].filter(node => node.getClientRects().length);
    const rect = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
    return { viewport: innerWidth, viewportHeight: innerHeight, documentWidth: document.documentElement.scrollWidth,
      media: { coarse: matchMedia("(pointer: coarse)").matches, fine: matchMedia("(pointer: fine)").matches, noHover: matchMedia("(hover: none)").matches, touchPoints: navigator.maxTouchPoints },
      editors: visible(".book-item-url-editor").map(node => ({ ...rect(node), rows: [...node.querySelectorAll(".book-item-url-row")].map(row => ({ ...rect(row), controls: [...row.querySelectorAll("input,button")].map(control => ({ ...rect(control), label: control.getAttribute("aria-label") })) })) })),
      lists: visible(".book-item-url-list").map(node => ({ ...rect(node), links: [...node.querySelectorAll("a")].map(link => ({ ...rect(link), scrollWidth: link.scrollWidth, clientWidth: link.clientWidth, href: link.href })) })),
      dialogs: visible('[role="dialog"], [role="alertdialog"]').map(node => ({ ...rect(node), scrollWidth: node.scrollWidth, clientWidth: node.clientWidth })),
    };
  });
}

async function capture(name, anchor) {
  if (anchor) await anchor.scrollIntoViewIfNeeded();
  await page.evaluate(() => document.fonts.ready);
  let current = await metrics(), settled = 0;
  for (let attempt = 0; attempt < 60 && settled < 3; attempt++) {
    await page.waitForTimeout(100);
    const next = await metrics();
    settled = JSON.stringify(next) === JSON.stringify(current) ? settled + 1 : 0;
    current = next;
  }
  assert.equal(settled, 3, `${name}: stable layout before capture`);
  assert(current.documentWidth <= current.viewport, `${name}: page fits viewport`);
  for (const box of current.editors) for (const row of box.rows) for (const control of row.controls) {
    assert(control.width > 0 && control.x >= box.x - 1 && control.right <= box.right + 1, `${name}: editor control fits row`);
    if (control.label.endsWith("입력 칸 추가") || control.label.endsWith("삭제")) {
      assert(control.width >= 40 && control.height >= 40, `${name}: URL actions have usable hit areas`);
    }
  }
  for (const list of current.lists) for (const link of list.links) {
    assert(link.scrollWidth <= link.clientWidth + 1, `${name}: URL wraps within link`);
    assert(link.x >= list.x - 1 && link.right <= list.right + 1, `${name}: URL stays inside list`);
  }
  for (const modal of current.dialogs) assert(modal.x >= -1 && modal.right <= current.viewport + 1, `${name}: dialog fits viewport`);
  const fullPage = !current.media.coarse;
  const image = await page.screenshot({ path: path.join(output, `${name}.png`), fullPage });
  const afterScreenshot = await metrics();
  assert.deepEqual(afterScreenshot, current, `${name}: screenshot preserves layout and media queries`);
  const imageSize = { width: image.readUInt32BE(16), height: image.readUInt32BE(20) };
  if (!fullPage) assert.deepEqual(imageSize, { width: current.viewport, height: current.viewportHeight });
  report.captures.push({ name, metrics: current, afterScreenshot, fullPage, imageSize });
}

async function newPage(origin, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 1280, serviceWorkers: "block" });
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin === origin || ["data:", "blob:"].includes(url.protocol)) return route.continue();
    if (url.hostname === "links.example.test") {
      report.linkRequests.push(url.href);
      return route.fulfill({ status: 200, contentType: "text/html", body: '<!doctype html><html lang="ko"><title>URL navigation target</title><body>테스트 링크 목적지</body></html>' });
    }
    report.externalRequests.push(url.href);
    return route.abort();
  });
  await context.addInitScript(() => {
    localStorage.setItem("book_library_panel_collapsed", "1");
    localStorage.setItem("book_help_drawer_collapsed", "1");
  });
  page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", error => report.errors.push(error.message));
  await page.goto(origin, { timeout: 120000 });
  await page.locator('[data-fixture-ready="true"]').waitFor();
  await card(activityTitle).waitFor();
  const media = (await metrics()).media;
  assert.equal(media.coarse, width < 1280);
  assert.equal(media.noHover, width < 1280);
  return context;
}

async function openPanel(title = activityTitle) {
  await card(title).getByRole("button", { name: "패널에서 열기", exact: true }).click();
  await sidebar().locator(".student-activity-detail").filter({ hasText: title }).waitFor();
  await editor(sidebar()).waitFor();
  await sidebar().getByRole("button", { name: "URL 저장", exact: true }).waitFor();
}
async function assertLinks(scope, expected = hrefs) {
  await links(scope).first().waitFor();
  assert.deepEqual(await links(scope).evaluateAll(nodes => nodes.map(node => node.href)), expected);
  assert.equal(await scope.getByRole("group", { name: "저장한 URL", exact: true }).count(), 1);
  for (const link of await links(scope).all()) {
    assert.equal(await link.getAttribute("target"), "_blank");
    assert.match(await link.getAttribute("rel"), /noopener/);
    assert.match(await link.getAttribute("rel"), /noreferrer/);
  }
}
async function clickLink(scope, index = 0, expected = hrefs[index]) {
  const popupPromise = page.waitForEvent("popup");
  await links(scope).nth(index).click();
  const popup = await popupPromise;
  await popup.waitForLoadState("domcontentloaded");
  assert.equal(popup.url(), expected);
  assert.equal(await popup.evaluate(() => window.opener), null);
  await popup.close();
}
async function saveUrls(scope, expected, title = activityTitle) {
  await scope.getByRole("button", { name: "URL 저장", exact: true }).click();
  await page.waitForFunction(({ expected, title }) => {
    const value = window.__activityUrls.entries().find(item => item.authorId === "urls-student-a" && item.title === title);
    return JSON.stringify(value?.urls) === JSON.stringify(expected);
  }, { expected, title });
}
async function closeExpanded() {
  await expanded().getByRole("button", { name: "닫기", exact: true }).click();
  await expanded().waitFor({ state: "hidden" });
}
async function setActor(actor) {
  await page.evaluate(value => window.__activityUrls.actor(value), actor);
  await page.locator(`[data-fixture-role="${actor}"][data-fixture-ready="true"]`).waitFor();
}

try {
  await mkdir(path.join(fixture, "app"), { recursive: true });
  for (const dir of ["components", "lib"]) await cp(path.join(root, dir), path.join(fixture, dir), { recursive: true });
  await mkdir(path.join(fixture, "tests/fixtures"), { recursive: true });
  for (const file of ["package.json", "jsconfig.json", "app/globals.css", "app/book-sidebar.css", "tests/fixtures/ActivityUrlsPage.jsx"])
    await cp(path.join(root, file), path.join(fixture, file));
  await writeFile(path.join(fixture, "lib/firebase.js"), "export const isFirebaseConfigured = false; export const db = null; export const auth = null; export const storage = null;");
  await writeFile(path.join(fixture, "next.config.mjs"), "export default { devIndicators: false };");
  await writeFile(path.join(fixture, "app/page.jsx"), 'export { default } from "@/tests/fixtures/ActivityUrlsPage";');
  await writeFile(path.join(fixture, "app/layout.jsx"), 'import "./globals.css"; import "./book-sidebar.css"; export default function Layout({children}) { return <html lang="ko"><body>{children}</body></html>; }');
  const probe = createServer();
  await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const origin = `http://127.0.0.1:${port}`; report.origin = origin;
  const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };
  for (const key of Object.keys(env)) if (/FIREBASE|FIRESTORE|GCLOUD_PROJECT/.test(key)) delete env[key];
  server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: fixture, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", value => { logs += value; }); server.stderr.on("data", value => { logs += value; });
  const deadline = Date.now() + 120000;
  while (!logs.includes("Ready in")) {
    if (server.exitCode !== null || Date.now() > deadline) throw new Error(logs);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  browser = await chromium.launch({ channel: "chrome", headless: true });

  for (const width of [375, 768, 1280]) {
    const context = await newPage(origin, width);
    const originalProject = await page.evaluate(() => window.__activityUrls.storedProject());
    await openPanel();
    assert.equal(await editor(sidebar()).locator("input").count(), 1);
    assert.equal(await editor(sidebar()).locator("input").inputValue(), "");
    const inPosition = await editor(sidebar()).evaluate(node => {
      const body = node.closest(".book-personal-expand-body");
      const text = body.querySelector(".book-personal-expand-content");
      const images = body.querySelector(".book-item-image-gallery");
      return Boolean(text && (text.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) && images && (node.compareDocumentPosition(images) & Node.DOCUMENT_POSITION_FOLLOWING));
    });
    assert(inPosition, "student URL editor lies between activity content and images");
    await capture(`student-${width}-editor-empty`, editor(sidebar()));
    await editor(sidebar()).locator("input").fill(`  ${urls[0]}  `);
    await editor(sidebar()).getByRole("button", { name: "활동 URL 입력 칸 추가", exact: true }).focus();
    await page.keyboard.press("Enter");
    assert.equal(await editor(sidebar()).locator("input").count(), 2);
    assert.equal(await editor(sidebar()).locator("input").nth(1).evaluate(node => document.activeElement === node), true);
    await editor(sidebar()).locator("input").nth(1).fill(urls[1]);
    await capture(`student-${width}-editor-multiple`, editor(sidebar()));
    await sidebar().getByRole("button", { name: "확대", exact: true }).click();
    assert.deepEqual(await editor(expanded()).locator("input").evaluateAll(nodes => nodes.map(node => node.value.trim())), urls);
    assert.equal(await links(expanded()).count(), 0);
    await closeExpanded();
    const beforeInvalid = (await state()).calls.length;
    await editor(sidebar()).locator("input").nth(1).fill("javascript:window.__urlAttack=1");
    await sidebar().getByRole("button", { name: "URL 저장", exact: true }).click();
    await sidebar().getByRole("alert").waitFor();
    assert.equal(await editor(sidebar()).locator("input").nth(1).getAttribute("aria-invalid"), "true");
    assert.equal((await state()).calls.length, beforeInvalid);
    await capture(`student-${width}-editor-invalid`, editor(sidebar()));
    await editor(sidebar()).locator("input").nth(1).fill(urls[1]);
    await editor(sidebar()).getByRole("button", { name: "활동 URL 입력 칸 추가", exact: true }).click();
    await editor(sidebar()).locator("input").nth(2).fill("   ");
    await saveUrls(sidebar(), urls);
    assert.equal(entry(await stored()).dashboardText, "이전 답변");
    await assertLinks(sidebar());
    await capture(`student-${width}-saved-sidebar`, sidebar().locator(".student-activity-urls"));
    await clickLink(sidebar());
    await sidebar().getByRole("button", { name: "확대", exact: true }).click();
    await assertLinks(expanded());
    await capture(`student-${width}-saved-expanded`, expanded().locator(".student-activity-urls"));
    await clickLink(expanded(), 1);
    await closeExpanded();
    assert.deepEqual(await page.evaluate(() => window.__activityUrls.storedProject()), originalProject);
    record(`student-${width}-add-focus-panel-expanded-draft-validation-save-blank-skip-links-primary-unchanged`);

    await setActor("b");
    await openPanel();
    assert.equal(await editor(sidebar()).locator("input").inputValue(), "https://links.example.test/other-student");
    await assertLinks(sidebar(), ["https://links.example.test/other-student"]);
    assert.equal(entry(await stored(), "urls-student-b").dashboardText, "친구의 답변");
    await setActor("teacher");
    await page.getByRole("button", { name: "김학생 개인 카드 열기", exact: true }).click();
    await card(activityTitle).getByRole("button", { name: "활동 확대", exact: true }).click();
    await assertLinks(expanded());
    assert.equal(await editor(expanded()).count(), 0);
    assert.equal(await expanded().getByRole("button", { name: "URL 저장", exact: true }).count(), 0);
    await capture(`teacher-${width}-student-readonly`, expanded().locator(".book-item-url-list"));
    await clickLink(expanded());
    await closeExpanded();
    record(`teacher-${width}-selected-student-readonly-and-student-identity-isolation`);

    await setActor("a");
    for (const title of ["확인한 활동", "템플릿 활동", "체크리스트 활동"]) {
      await openPanel(title);
      const value = `https://links.example.test/${title === "확인한 활동" ? "confirmed" : title === "템플릿 활동" ? "template" : "checklist"}`;
      await editor(sidebar()).locator("input").fill(value);
      await saveUrls(sidebar(), [value], title);
      await assertLinks(sidebar(), [value]);
      if (width === 375 || width === 1280) await capture(`student-${width}-${title === "확인한 활동" ? "confirmed" : title === "템플릿 활동" ? "template" : "incomplete-checklist"}`, sidebar().locator(".student-activity-urls"));
      if (title === "체크리스트 활동") {
        assert.equal(await sidebar().locator('input[type="checkbox"]').first().isChecked(), false);
        assert.equal((await state()).records.some(record => record.itemTitle === title && record.confirmed), false);
      }
    }
    record(`student-${width}-confirmed-noanswer-template-incomplete-checklist-independent-url-save`);
    await card(resourceTitle).getByRole("button", { name: "자료 확대", exact: true }).click();
    await expanded().waitFor();
    assert.equal(await editor(expanded()).count(), 0);
    await closeExpanded();

    if (width === 1280) {
      await page.reload();
      await page.locator('[data-fixture-ready="true"]').waitFor();
      await openPanel();
      assert.deepEqual(await editor(sidebar()).locator("input").evaluateAll(nodes => nodes.map(node => node.value)), urls);
      await configure({ failSave: 1 });
      await editor(sidebar()).locator("input").nth(1).fill("https://links.example.test/retry");
      await sidebar().getByRole("button", { name: "URL 저장", exact: true }).click();
      await sidebar().getByRole("alert").waitFor();
      assert.equal(await editor(sidebar()).locator("input").nth(1).inputValue(), "https://links.example.test/retry");
      assert.deepEqual(entry(await stored()).urls, urls);
      await capture("student-1280-save-failure", sidebar().locator(".student-activity-urls"));
      await configure({ holdSave: true });
      const beforeDuplicate = (await state()).calls.length;
      await sidebar().getByRole("button", { name: "URL 저장", exact: true }).evaluate(button => { button.click(); button.click(); });
      await sidebar().getByRole("button", { name: "URL 저장 중...", exact: true }).waitFor();
      assert.equal(await editor(sidebar()).getAttribute("disabled"), "");
      assert.equal((await state()).calls.length, beforeDuplicate + 1);
      await page.evaluate(() => window.__activityUrls.releaseSave());
      await page.waitForFunction(() => window.__activityUrls.entries().some(entry => entry.urls?.includes("https://links.example.test/retry")));
      assert.equal(entry(await stored()).dashboardText, "이전 답변");
      record("serialized-reload-failure-preserves-draft-retry-deduplicates-disabled-saving");

      await sidebar().getByRole("button", { name: "확대", exact: true }).click();
      await editor(expanded()).locator("input").nth(1).fill("https://links.example.test/combined-save");
      await expanded().getByRole("textbox", { name: "답변 내용", exact: true }).fill("URL과 함께 저장한 답변");
      await expanded().getByRole("button", { name: "저장", exact: true }).click();
      await expanded().waitFor({ state: "hidden" });
      assert.deepEqual(entry(await stored()).urls, [urls[0], "https://links.example.test/combined-save"]);
      assert.equal(entry(await stored()).dashboardText, "URL과 함께 저장한 답변");
      assert.deepEqual(entry(await stored(), "urls-student-b").urls, ["https://links.example.test/other-student"]);
      record("normal-activity-save-persists-answer-and-urls-without-overwriting-other-student");

      await editor(sidebar()).getByRole("button", { name: "활동 URL 2 삭제", exact: true }).click();
      await editor(sidebar()).getByRole("button", { name: "활동 URL 1 삭제", exact: true }).click();
      assert.equal(await editor(sidebar()).locator("input").count(), 1);
      assert.equal(await editor(sidebar()).locator("input").inputValue(), "");
      await saveUrls(sidebar(), []);
      await page.reload();
      await page.locator('[data-fixture-ready="true"]').waitFor();
      await openPanel();
      assert.deepEqual(entry(await stored()).urls, []);
      assert.equal(entry(await stored()).dashboardText, "URL과 함께 저장한 답변");
      assert.equal(await links(sidebar()).count(), 0);
      assert.equal(await editor(sidebar()).locator("input").inputValue(), "");
      record("delete-all-clears-entry-urls-after-reload-preserves-answer");

      await page.evaluate(() => {
        window.__urlAttack = 0;
        window.__activityUrls.unsafe(["javascript:window.__urlAttack=1", "data:text/html,<script>window.__urlAttack=1</script>", "ftp://links.example.test/file", null, 12, "https://links.example.test/safe-legacy"]);
      });
      await setActor("teacher");
      await page.getByRole("button", { name: "김학생 개인 카드 열기", exact: true }).click();
      await card(activityTitle).getByRole("button", { name: "활동 확대", exact: true }).click();
      await assertLinks(expanded(), ["https://links.example.test/safe-legacy"]);
      await clickLink(expanded(), 0, "https://links.example.test/safe-legacy");
      assert.equal(await page.evaluate(() => window.__urlAttack), 0);
      assert.equal(await page.locator('a[href^="javascript:"], a[href^="data:"], a[href^="ftp:"]').count(), 0);
      await closeExpanded();
      record("unsafe-malformed-stored-urls-never-render-executable-links");
    }
    await context.close(); page = null;
  }
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.externalRequests, []);
  assert(report.linkRequests.length >= 10);
  report.result = "PASS";
  console.log(`PASS: ${report.cases.length} cases, ${report.captures.length} captures. Evidence: ${output}`);
} catch (error) {
  report.result = "FAIL"; report.failure = error.stack || String(error);
  if (page) {
    await writeFile(path.join(output, "failure.html"), await page.content()).catch(() => {});
    await page.screenshot({ path: path.join(output, "failure.png") }).catch(() => {});
  }
  console.error(report.failure); process.exitCode = 1;
} finally {
  await browser?.close();
  if (server && server.exitCode === null) {
    if (process.platform === "win32") await new Promise(resolve => spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }).on("close", resolve));
    else server.kill("SIGTERM");
  }
  await writeFile(path.join(output, "server.log"), logs);
  await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
}
