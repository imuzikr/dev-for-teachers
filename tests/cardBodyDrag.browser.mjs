import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = process.cwd();
const output = path.join(root, "artifacts", `card-body-drag-${Date.now()}`);
const fixture = path.join(output, "fixture");
let server, browser;
let logs = "";
try {
  await mkdir(path.join(fixture, "app"), { recursive: true });
  for (const dir of ["components", "lib", "tests/fixtures"]) await cp(path.join(root, dir), path.join(fixture, dir), { recursive: true });
  for (const file of ["package.json", "jsconfig.json", "app/globals.css", "app/book-sidebar.css"]) await cp(path.join(root, file), path.join(fixture, file));
  await writeFile(path.join(fixture, "app/page.jsx"), 'export { default } from "@/tests/fixtures/BookWorkflowPage";');
  await writeFile(path.join(fixture, "app/layout.jsx"), 'import "./globals.css"; import "./book-sidebar.css"; export default function Layout({children}) { return <html lang="ko"><body>{children}</body></html>; }');
  server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", "3251"], { cwd: fixture, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", value => { logs += value; });
  server.stderr.on("data", value => { logs += value; });
  const deadline = Date.now() + 120000;
  while (!logs.includes("Ready in")) {
    if (server.exitCode !== null || Date.now() > deadline) throw new Error(logs);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://127.0.0.1:3251");
  await page.getByRole("button", { name: "교사 보기", exact: true }).click();
  const cards = page.locator(".book-project-flow-detail-list > article[data-reorder-key]");
  const card = key => page.locator(`.book-project-flow-detail-list > article[data-reorder-key="${key}"]`);
  const activity = card("activity:activity-1");
  const resource = card("resource:resource-1");
  const order = () => cards.evaluateAll(nodes => nodes.map(node => node.dataset.reorderKey));
  const original = ["activity:activity-1", "resource:resource-1"];
  const reversed = [...original].reverse();
  await activity.waitFor();
  assert.equal(await activity.getAttribute("draggable"), "true");
  assert.deepEqual(await order(), original);
  await resource.dragTo(activity, { sourcePosition: { x: 100, y: 110 } });
  await page.waitForFunction(() => document.querySelector('.book-project-flow-detail-list > article').dataset.reorderKey === "resource:resource-1");
  assert.deepEqual(await order(), reversed);
  await page.getByRole("button", { name: "Step 2 열기", exact: true }).click();
  await page.getByRole("button", { name: "Step 열기", exact: true }).click();
  assert.deepEqual(await order(), reversed);
  await resource.getByRole("button", { name: "체크리스트 자료 순서 이동", exact: true }).press("ArrowDown");
  assert.deepEqual(await order(), original);
  await activity.locator(".book-personal-activity-copy strong").dragTo(resource);
  assert.deepEqual(await order(), reversed);
  await resource.getByRole("button", { name: "활동 전", exact: true }).dragTo(activity);
  assert.deepEqual(await order(), reversed);
  await resource.locator("a").first().dragTo(activity);
  assert.deepEqual(await order(), reversed);
  await resource.getByRole("button", { name: "활동 전", exact: true }).click();
  await resource.getByRole("button", { name: "활동중", exact: true }).waitFor();
  await activity.getByRole("button", { name: "활동 확대", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.locator(".book-personal-expand-backdrop").click({ position: { x: 2, y: 2 } });
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const itemBox = await activity.boundingBox();
    const addTile = page.locator(".book-project-flow-detail-list > .book-main-add-item");
    const addBox = await addTile.boundingBox();
    assert(Math.abs(addBox.height - itemBox.height) < 1, `Add tile and real card heights must match at ${width}px`);
    assert(Math.abs(addBox.width - itemBox.width) < 1, `Add tile and real card widths must match at ${width}px`);
    await page.screenshot({ path: path.join(output, `${width}.png`), fullPage: true });
  }
  await page.getByRole("button", { name: "학생 보기", exact: true }).click();
  assert.equal(await cards.count(), 0);
  assert.deepEqual(errors, []);
  console.log(`PASS: card body/title drag, saved order after switching steps, keyboard reorder, interactive controls excluded, student guard. ${output}`);
} finally {
  await browser?.close();
  if (server && server.exitCode === null) await new Promise(resolve => spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true }).on("close", resolve));
  await writeFile(path.join(output, "server.log"), logs);
}
