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

function cardWithText(page, selector, text) {
  return page.locator(selector).filter({ hasText: text }).first();
}

async function assertFooterButtons(card, expectedNames) {
  const buttons = await card.locator("footer button").evaluateAll((items) => items.map((item) => item.textContent.trim()));
  assert.deepEqual(buttons, expectedNames);
}

async function assertNoButtonOverlap(page) {
  const geometry = await page.locator(".book-personal-card-actions").evaluateAll((footers) => footers.map((footer) => {
    const buttons = Array.from(footer.querySelectorAll("button")).map((button) => {
      const rect = button.getBoundingClientRect();
      return { text: button.textContent.trim(), left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, height: rect.height };
    });
    const overlaps = [];
    for (let i = 0; i < buttons.length; i += 1) {
      for (let j = i + 1; j < buttons.length; j += 1) {
        const a = buttons[i];
        const b = buttons[j];
        if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) overlaps.push([a.text, b.text]);
      }
    }
    return { overlaps, minHeight: Math.min(...buttons.map((button) => button.height)) };
  }));
  assert.deepEqual(geometry.flatMap((item) => item.overlaps), []);
  assert.ok(geometry.every((item) => item.minHeight >= 28));
}

async function captureVisibleSidebarConfirm(page, screenshotRoot, name, width, height) {
  await page.setViewportSize({ width, height });
  const confirm = page.locator(".student-activity-detail").getByRole("button", { name: "확인", exact: true });
  await confirm.scrollIntoViewIfNeeded();
  const geometry = await confirm.evaluate((button) => {
    const buttonRect = button.getBoundingClientRect();
    const panel = button.closest(".student-activity-panel-content");
    const panelRect = panel.getBoundingClientRect();
    return {
      button: { top: buttonRect.top, bottom: buttonRect.bottom, left: buttonRect.left, right: buttonRect.right },
      panel: { top: panelRect.top, bottom: panelRect.bottom, left: panelRect.left, right: panelRect.right },
      viewport: { width: innerWidth, height: innerHeight },
    };
  });
  assert.ok(geometry.button.top >= geometry.panel.top, `${name} confirm top is clipped by panel`);
  assert.ok(geometry.button.bottom <= geometry.panel.bottom, `${name} confirm bottom is clipped by panel`);
  assert.ok(geometry.button.left >= geometry.panel.left, `${name} confirm left is clipped by panel`);
  assert.ok(geometry.button.right <= geometry.panel.right, `${name} confirm right is clipped by panel`);
  assert.ok(geometry.button.top >= 0 && geometry.button.bottom <= geometry.viewport.height, `${name} confirm is outside viewport vertically`);
  assert.ok(geometry.button.left >= 0 && geometry.button.right <= geometry.viewport.width, `${name} confirm is outside viewport horizontally`);
  await page.screenshot({ path: path.join(screenshotRoot, name), fullPage: true });
}

export default async function verifyBookWorkflowUi(page, baseUrl) {
  const errors = [];
  page.setDefaultTimeout(120000);
  page.setDefaultNavigationTimeout(120000);
  page.on("pageerror", (error) => errors.push(error.message));
  const screenshotRoot = process.env.BOOK_WORKFLOW_UI_OUTPUT ?? "artifacts/book-workflow-ui";

  async function capture(name, width, height) {
    await page.setViewportSize({ width, height });
    await assertNoButtonOverlap(page);
    await page.screenshot({ path: path.join(screenshotRoot, name), fullPage: true });
  }

  await page.goto(`${baseUrl}/qa-book-workflow`);
  await page.getByRole("heading", { name: "책방 최종 행동" }).waitFor();
  const resourceCard = cardWithText(page, ".book-personal-resource-card", "체크리스트 자료");
  const activityCard = cardWithText(page, ".book-personal-activity-card:not(.book-personal-resource-card)", "생각 정리 활동");
  await assertFooterButtons(resourceCard, ["확인", "패널에서 열기"]);
  await assertFooterButtons(activityCard, ["확인", "패널에서 열기"]);
  await resourceCard.getByRole("button", { name: "자료 복사" }).click();
  await resourceCard.getByRole("button", { name: "자료를 복사했습니다" }).waitFor();
  const copiedText = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n");
  assert.equal(copiedText, "체크리스트 자료\n자료를 읽고 체크하세요. 핵심 개념 확인 친구에게 설명 준비\nhttps://example.com/resource");
  await capture("student-main-1280.png", 1280, 900);
  await capture("student-main-768.png", 768, 900);
  await capture("student-main-375.png", 375, 812);

  await resourceCard.getByRole("button", { name: "확인", exact: true }).click();
  await page.getByRole("alertdialog", { name: "미완료 할 일" }).waitFor();
  assert.equal(await resourceCard.getByRole("button", { name: "확인", exact: true }).isVisible(), true);
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await resourceCard.getByRole("button", { name: "패널에서 열기", exact: true }).click();
  await page.locator(".student-activity-detail").getByText("체크리스트 자료").waitFor();
  await page.locator(".student-activity-detail").getByRole("button", { name: "모두 체크하기" }).click();
  await page.locator(".student-activity-detail").getByText("자동 저장됨").waitFor();
  await captureVisibleSidebarConfirm(page, screenshotRoot, "student-sidebar-controls-768.png", 768, 900);
  await captureVisibleSidebarConfirm(page, screenshotRoot, "student-sidebar-controls-375.png", 375, 812);
  await page.locator(".student-activity-detail").getByRole("button", { name: "확인", exact: true }).click();
  await resourceCard.getByRole("button", { name: "확인됨", exact: true }).waitFor();
  assert.equal(await resourceCard.getByRole("button", { name: "확인됨", exact: true }).isDisabled(), true);
  await capture("student-sidebar-1280.png", 1280, 900);
  await capture("student-sidebar-768.png", 768, 900);
  await capture("student-sidebar-375.png", 375, 812);

  await activityCard.getByRole("button", { name: "패널에서 열기", exact: true }).click();
  await page.locator(".student-activity-detail").getByText("생각 정리 활동").waitFor();
  await page.locator(".student-activity-detail").getByRole("button", { name: "확인", exact: true }).click();
  await activityCard.getByRole("button", { name: "확인됨", exact: true }).waitFor();

  await page.getByRole("button", { name: "교사 보기" }).click();
  await page.getByTestId("mode").getByText("teacher").waitFor();
  const teacherResource = cardWithText(page, ".book-personal-resource-card", "체크리스트 자료");
  const teacherActivity = cardWithText(page, ".book-personal-activity-card:not(.book-personal-resource-card)", "생각 정리 활동");
  await assertFooterButtons(teacherResource, ["발표 모드"]);
  await assertFooterButtons(teacherActivity, ["발표 모드"]);
  await teacherResource.getByRole("button", { name: "자료 복사" }).waitFor();
  await teacherResource.getByRole("button", { name: "자료 잠그기" }).click();
  await teacherResource.getByRole("button", { name: "자료 잠금 해제" }).waitFor();
  await teacherResource.getByRole("button", { name: "자료 잠금 해제" }).click();
  await teacherResource.getByRole("button", { name: "자료 잠그기" }).waitFor();
  await capture("teacher-main-1280.png", 1280, 900);
  await capture("teacher-main-768.png", 768, 900);
  await capture("teacher-main-375.png", 375, 812);
  await teacherResource.getByRole("button", { name: "발표 모드" }).click();
  await page.getByRole("alertdialog", { name: /체크리스트 자료 발표 모드/ }).waitFor();
  assert.deepEqual(errors, []);
  return {
    passed: true,
    cases: [
      "student main cards expose confirm and panel buttons",
      "main checklist warning gates confirmation",
      "panel check-all enables main confirmation",
      "sidebar confirmation still works",
      "student resource copy icon works",
      "teacher card footer only presents",
      "teacher header resource lock toggles through existing callback",
    ],
    screenshots: [
      "student-main-1280.png",
      "student-main-768.png",
      "student-main-375.png",
      "student-sidebar-1280.png",
      "student-sidebar-768.png",
      "student-sidebar-375.png",
      "student-sidebar-controls-768.png",
      "student-sidebar-controls-375.png",
      "teacher-main-1280.png",
      "teacher-main-768.png",
      "teacher-main-375.png",
    ],
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const outputDir = path.resolve(process.env.BOOK_WORKFLOW_UI_OUTPUT ?? path.join(root, "artifacts", "book-workflow-ui"));
  const testRoot = path.join(outputDir, `next-app-${process.pid}-${Date.now()}`);
  const route = path.join(testRoot, "app", "qa-book-workflow");
  const port = Number(process.env.BOOK_WORKFLOW_UI_PORT ?? 3153);
  const baseUrl = `http://127.0.0.1:${port}`;
  const require = createRequire(import.meta.url);
  const { chromium } = process.env.BOOK_WORKFLOW_PLAYWRIGHT
    ? require(process.env.BOOK_WORKFLOW_PLAYWRIGHT)
    : require("playwright");
  let server;
  let serverExited = Promise.resolve();
  let browser;
  let logs = "";
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
    await writeFile(path.join(testRoot, "lib", "firebase.js"), "export const isFirebaseConfigured = false;\nexport const db = null;\nexport const auth = null;\nexport const storage = null;\n");
    await writeFile(path.join(testRoot, "next.config.mjs"), "/** @type {import('next').NextConfig} */\nconst nextConfig = { devIndicators: false };\nexport default nextConfig;\n");
    await writeFile(path.join(testRoot, "app", "layout.js"), 'import "../app/globals.css";\nimport "../app/book-sidebar.css";\nexport default function RootLayout({ children }) { return <html lang="ko"><body>{children}</body></html>; }\n');
    await writeFile(path.join(route, "page.jsx"), 'export { default } from "@/tests/fixtures/BookWorkflowPage";\n');
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
    const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"], baseURL: baseUrl });
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseUrl });
    const page = await context.newPage();
    const result = await verifyBookWorkflowUi(page, baseUrl);
    await writeFile(path.join(outputDir, "results.json"), JSON.stringify({ ...result, fixtureUrl: `${baseUrl}/qa-book-workflow` }, null, 2));
    console.log(JSON.stringify({ ...result, fixtureUrl: `${baseUrl}/qa-book-workflow` }));
  } finally {
    await browser?.close();
    if (server && server.exitCode === null) {
      if (process.platform === "win32") {
        await new Promise((resolve) => spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true }).on("close", resolve));
      } else {
        server.kill("SIGTERM");
      }
      await Promise.race([serverExited, new Promise((resolve) => setTimeout(resolve, 5000))]);
    }
    await writeFile(path.join(outputDir, "dev-server.log"), logs);
    assertInsideDirectory(testRoot, outputDir);
    const cleaned = await removeWithRetry(testRoot);
    if (!cleaned) await writeFile(path.join(outputDir, `cleanup-${path.basename(testRoot)}.txt`), `Could not remove locked fixture directory: ${testRoot}\n`);
    console.log("Book workflow QA dev server stopped; temporary route removed.");
  }
  process.exit(0);
}
