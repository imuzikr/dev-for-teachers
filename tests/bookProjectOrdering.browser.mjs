import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

async function removeWithRetry(target) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await rm(target, { force: true, recursive: true });
      return true;
    } catch (error) {
      if (error?.code !== "EBUSY" || attempt === 29) return false;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  return true;
}

function assertInsideDirectory(child, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to remove path outside fixture output directory: ${child}`);
  }
}

function parseProject(text) {
  return JSON.parse(text);
}

export default async function verifyBookProjectOrdering(page, baseUrl) {
  const errors = [];
  page.setDefaultTimeout(120000);
  page.setDefaultNavigationTimeout(120000);
  page.on("pageerror", (error) => errors.push(error.message));
  const screenshotRoot = process.env.BOOK_ORDERING_UI_OUTPUT ?? "artifacts/book-project-ordering-ui";
  async function capture(name, width, height) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: `${screenshotRoot}/${name}.png`, fullPage: true });
  }
  const draftProject = async () => parseProject(await page.getByTestId("draft-project").textContent());
  const savedProject = async () => parseProject(await page.getByTestId("saved-project").textContent());

  await page.goto(`${baseUrl}/qa-book-ordering`);
  await page.getByRole("button", { name: "프로젝트 크게 편집", exact: true }).waitFor();
  await capture("desktop-ordering-sidebar", 1280, 900);
  await capture("mobile-ordering-sidebar", 375, 812);

  assert.equal(await page.getByRole("textbox", { name: /Step \d+ 제목/ }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Step 추가", exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "활동 추가", exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "자료 추가", exact: true }).count(), 0);
  assert.equal(await page.getByText("프로젝트 이름", { exact: true }).count(), 0);

  const visibleItems = await page.locator(".book-step-order-list strong").allTextContents();
  assert.deepEqual(visibleItems, ["도구 안내", "아이디어 스케치"]);
  await page.getByRole("button", { name: "활동 2 위로 이동", exact: true }).click();
  assert.deepEqual((await draftProject()).steps[1].itemOrder, [
    { kind: "activity", id: "a2" },
    { kind: "resource", id: "r2" },
  ]);

  await page.getByRole("button", { name: "Step 2 위로 이동", exact: true }).click();
  assert.equal((await draftProject()).steps[0].id, "s2");
  await page.getByRole("button", { name: "순서 저장", exact: true }).click();
  await page.waitForFunction(() => JSON.parse(document.querySelector('[data-testid="saved-project"]').textContent).steps[0].id === "s2");
  assert.equal((await savedProject()).steps[0].id, "s2");

  await page.getByRole("button", { name: "프로젝트 크게 편집", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await capture("desktop-full-editor-modal", 1280, 900);
  assert.equal(await dialog.getByText("프로젝트 이름", { exact: true }).count(), 1);
  assert.equal(await dialog.getByRole("button", { name: "Step 추가", exact: true }).count(), 1);
  assert.equal(await dialog.getByRole("textbox", { name: "Step 1 제목", exact: true }).count(), 1);
  assert(await dialog.getByRole("button", { name: "+ 활동 추가", exact: true }).count() >= 1);
  assert(await dialog.getByRole("button", { name: "+ 자료 추가", exact: true }).count() >= 1);
  await dialog.getByRole("button", { name: "패널에서 계속 편집", exact: true }).click();
  await page.getByRole("button", { name: "저장된 사이드바 보기", exact: true }).click();
  await page.getByRole("button", { name: "프로젝트 크게 편집", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Step 추가", exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Step 편집", exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "프로젝트 편집", exact: true }).count(), 0);
  await page.getByRole("button", { name: "Step 1 아래로 이동", exact: true }).click();
  await page.waitForFunction(() => JSON.parse(document.querySelector('[data-testid="saved-project"]').textContent).steps[0].id === "s1");
  await page.locator(".book-step-flow-trigger").filter({ hasText: "해결책 설계" }).click();
  await page.getByRole("button", { name: "활동 1 아래로 이동", exact: true }).click();
  await page.waitForFunction(() => {
    const project = JSON.parse(document.querySelector('[data-testid="saved-project"]').textContent);
    return project.steps[1].itemOrder[0].kind === "resource";
  });
  await page.getByRole("button", { name: "프로젝트 크게 편집", exact: true }).click();
  await page.getByRole("dialog").waitFor();

  assert.deepEqual(errors, []);
  return {
    passed: true,
    cases: [
      "collapsed sidebar contains ordering controls only",
      "selected Step reveals ordered activity/resource names",
      "Step and item order draft and save payload update",
      "saved sidebar autosaves Step and item ordering without edit/add controls",
      "expanded modal preserves full project and content editing controls",
    ],
    screenshots: [
      "desktop-ordering-sidebar.png",
      "mobile-ordering-sidebar.png",
      "desktop-full-editor-modal.png",
    ],
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const outputDir = path.resolve(process.env.BOOK_ORDERING_UI_OUTPUT ?? path.join(root, "artifacts", "book-project-ordering-ui"));
  const testRoot = path.join(outputDir, `next-app-${process.pid}-${Date.now()}`);
  const route = path.join(testRoot, "app", "qa-book-ordering");
  const port = Number(process.env.BOOK_ORDERING_UI_PORT ?? 3152);
  const baseUrl = `http://127.0.0.1:${port}`;
  const require = createRequire(import.meta.url);
  const { chromium } = process.env.BOOK_ORDERING_PLAYWRIGHT
    ? require(process.env.BOOK_ORDERING_PLAYWRIGHT)
    : require("playwright");
  let server;
  let serverExited = Promise.resolve();
  let browser;
  let logs = "";
  const pageSource = 'export { default } from "@/tests/fixtures/BookProjectOrderingPage";\n';
  try {
    await mkdir(route, { recursive: true });
    await mkdir(outputDir, { recursive: true });
    await Promise.all([
      cp(path.join(root, "components"), path.join(testRoot, "components"), { recursive: true }),
      cp(path.join(root, "lib"), path.join(testRoot, "lib"), { recursive: true }),
      cp(path.join(root, "tests", "fixtures"), path.join(testRoot, "tests", "fixtures"), { recursive: true }),
      cp(path.join(root, "public"), path.join(testRoot, "public"), { recursive: true }),
      cp(path.join(root, "app", "globals.css"), path.join(testRoot, "app", "globals.css")),
      cp(path.join(root, "app", "book-sidebar.css"), path.join(testRoot, "app", "book-sidebar.css")),
      cp(path.join(root, "package.json"), path.join(testRoot, "package.json")),
      cp(path.join(root, "jsconfig.json"), path.join(testRoot, "jsconfig.json")),
    ]);
    await writeFile(path.join(testRoot, "next.config.mjs"), "/** @type {import('next').NextConfig} */\nconst nextConfig = { devIndicators: false };\nexport default nextConfig;\n");
    await writeFile(path.join(testRoot, "app", "layout.js"), 'import "../app/globals.css";\nimport "../app/book-sidebar.css";\nexport default function RootLayout({ children }) { return <html lang="ko"><body>{children}</body></html>; }\n');
    await writeFile(path.join(route, "page.jsx"), pageSource);
    server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--port", String(port), "--hostname", "127.0.0.1"], {
      cwd: testRoot,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    serverExited = new Promise((resolve) => server.on("close", resolve));
    server.stdout.on("data", (data) => { logs += data; });
    server.stderr.on("data", (data) => { logs += data; });
    const deadline = Date.now() + 120000;
    while (!logs.includes("Ready in")) {
      if (server.exitCode !== null || Date.now() > deadline) throw new Error(`Dev server failed: ${logs}`);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const page = await browser.newPage();
    const result = await verifyBookProjectOrdering(page, baseUrl);
    await writeFile(path.join(outputDir, "results.json"), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally {
    await browser?.close();
    if (server && server.exitCode === null) {
      if (process.platform === "win32") {
        await new Promise((resolve) => spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true }).on("close", resolve));
      } else {
        server.kill("SIGTERM");
      }
      await Promise.race([
        serverExited,
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ]);
    }
    await writeFile(path.join(outputDir, "dev-server.log"), logs);
    assertInsideDirectory(testRoot, outputDir);
    const cleaned = await removeWithRetry(testRoot);
    if (!cleaned) {
      await writeFile(path.join(outputDir, `cleanup-${path.basename(testRoot)}.txt`), `Could not remove locked fixture directory: ${testRoot}\n`);
    }
    console.log("QA dev server stopped; temporary route removed.");
  }
  process.exit(0);
}
