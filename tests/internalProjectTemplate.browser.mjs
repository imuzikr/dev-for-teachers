import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = process.cwd();
const output = path.join(root, "artifacts", `internal-template-${Date.now()}`);
const fixture = path.join(output, "app-fixture");
const port = 3247;
let server;
let browser;
let logs = "";
const errors = [];
try {
  await mkdir(path.join(fixture, "app"), { recursive: true });
  for (const dir of ["components", "lib", "tests/fixtures"]) {
    await cp(path.join(root, dir), path.join(fixture, dir), { recursive: true });
  }
  for (const file of ["package.json", "jsconfig.json", "app/globals.css", "app/book-sidebar.css"]) {
    await cp(path.join(root, file), path.join(fixture, file));
  }
  await writeFile(path.join(fixture, "app/page.jsx"), 'export { default } from "@/tests/fixtures/InternalProjectTemplatePage";');
  await writeFile(path.join(fixture, "app/layout.jsx"), 'import "./globals.css"; import "./book-sidebar.css"; export default function Layout({children}) { return <html lang="ko"><body>{children}</body></html>; }');
  server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: fixture, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", data => { logs += data; });
  server.stderr.on("data", data => { logs += data; });
  const deadline = Date.now() + 120000;
  while (!logs.includes("Ready in")) {
    if (server.exitCode !== null || Date.now() > deadline) throw new Error(logs);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}`);
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  assert.deepEqual(await dialog.locator('.book-step-nav-copy strong').allTextContents(), ["나의 고민은?", "한 번 들어보세요.", "프롬프트", "시제품", "짜잔!"]);
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: path.join(output, `template-${width}.png`), fullPage: true });
    assert(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  }
  await dialog.getByRole("button", { name: "프로젝트 저장", exact: true }).last().click();
  await dialog.waitFor({ state: "hidden" });
  const saved = JSON.parse(await page.getByTestId("saved").textContent());
  assert.deepEqual(saved.steps.map(step => step.activities.length), [1, 2, 1, 1, 1]);
  await page.getByRole("button", { name: "프로젝트 크게 편집", exact: true }).click();
  await dialog.waitFor();
  await dialog.getByRole("button", { name: "프로젝트 저장", exact: true }).last().click();
  await dialog.waitFor({ state: "hidden" });
  assert.deepEqual(JSON.parse(await page.getByTestId("saved").textContent()), saved);
  await page.getByRole("button", { name: "New training", exact: true }).click();
  await dialog.waitFor();
  assert.equal(await dialog.locator('.book-step-flow-trigger').count(), 0);
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, "results.json"), JSON.stringify({ passed: true, errors, activityCounts: saved.steps.map(step => step.activities.length) }));
  console.log(`PASS: template creation, save, reopen, training isolation, responsive layout. Evidence: ${output}`);
} finally {
  await browser?.close();
  if (server && server.exitCode === null) {
    if (process.platform === "win32") {
      await new Promise(resolve => spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true }).on("close", resolve));
    } else server.kill("SIGTERM");
  }
  await writeFile(path.join(output, "server.log"), logs);
}
