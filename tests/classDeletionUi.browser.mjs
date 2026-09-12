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

export default async function verifyClassDeletionUi(page, baseUrl) {
  const errors = [];
  page.setDefaultTimeout(120000);
  page.setDefaultNavigationTimeout(120000);
  page.on("pageerror", (error) => errors.push(error.message));
  const screenshotRoot = process.env.CLASS_DELETION_UI_OUTPUT ?? "artifacts/class-deletion-ui";
  async function captureState(name, width, height) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: `${screenshotRoot}/${name}.png`, fullPage: true });
  }
  await page.goto(`${baseUrl}/qa-class-deletion`);
  await page.getByRole("heading", { name: /관리하기/ }).waitFor();
  await page.getByRole("button", { name: "삭제 대상 반 삭제", exact: true }).click();
  await page.getByText("보관된 반 기록과 사용하지 않는 이미지가 삭제됩니다.", { exact: false }).waitFor();
  await page.getByText("공유 중인 파일은 보존됩니다.", { exact: false }).waitFor();
  await page.getByText("다른 탭에서 같은 반을 수정하지 마세요.", { exact: false }).waitFor();
  await captureState("desktop-confirm-warning", 1280, 900);
  await captureState("mobile-confirm-warning", 375, 812);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "삭제", exact: true }).click();
  const pendingButton = page.getByRole("button", { name: "삭제 중...", exact: true });
  await pendingButton.waitFor();
  await captureState("desktop-delete-pending", 1280, 900);
  await captureState("mobile-delete-pending", 375, 812);
  assert.equal(await pendingButton.isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: "취소", exact: true }).isDisabled(), true);
  await page.evaluate(() => window.__CLASS_DELETION_RELEASE__());
  await page.getByText("삭제를 완료하지 못했어요.", { exact: false }).waitFor();
  assert.equal(await page.getByRole("alertdialog").count(), 0);
  const errorAlert = page.locator(".form-error[role='alert']");
  await errorAlert.waitFor();
  assert.equal(await errorAlert.isVisible(), true);
  await captureState("desktop-failure-visible", 1280, 900);
  await captureState("mobile-failure-visible", 375, 812);
  const mobileGeometry = await page.locator(".modal-class-manager").evaluate((modal) => {
    const box = modal.getBoundingClientRect();
    const buttons = Array.from(modal.querySelectorAll("button")).map((button) => {
      const rect = button.getBoundingClientRect();
      return {
        text: button.textContent.trim(),
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    });
    const overlaps = [];
    for (let i = 0; i < buttons.length; i += 1) {
      for (let j = i + 1; j < buttons.length; j += 1) {
        const a = buttons[i];
        const b = buttons[j];
        if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) {
          overlaps.push([a.text, b.text]);
        }
      }
    }
    return {
      inViewport: box.left >= 0 && box.right <= innerWidth,
      minButtonHeight: Math.min(...buttons.map((button) => button.height)),
      overlaps,
    };
  });
  assert.equal(mobileGeometry.inViewport, true);
  assert.equal(mobileGeometry.overlaps.length, 0);
  assert(mobileGeometry.minButtonHeight >= 20);
  await page.setViewportSize({ width: 1280, height: 900 });
  assert.equal(await page.getByTestId("calls").textContent(), "1");
  await page.getByRole("button", { name: "삭제 대상 반 삭제", exact: true }).click();
  await page.getByText("다른 탭에서 같은 반을 수정하지 마세요.", { exact: false }).waitFor();
  await page.getByRole("button", { name: "삭제", exact: true }).click();
  const retryPendingButton = page.getByRole("button", { name: "삭제 중...", exact: true });
  await retryPendingButton.waitFor();
  assert.equal(await retryPendingButton.isDisabled(), true);
  await page.evaluate(() => window.__CLASS_DELETION_RELEASE__());
  await page.waitForFunction(() => document.querySelector('[data-testid="toast"]').textContent.includes("공유 중이거나 확인이 필요한 파일 2개는 보존했어요"));
  await captureState("desktop-success-toast", 1280, 900);
  await captureState("mobile-success-toast", 375, 812);
  assert.equal(await page.getByRole("alertdialog").count(), 0);
  assert.equal(await page.getByTestId("calls").textContent(), "2");
  assert.deepEqual(errors, []);
  return {
    passed: true,
    cases: ["confirmation maintenance warning", "pending buttons disabled", "failed deletion remains retryable", "success reports shared retained files"],
    screenshots: [
      "desktop-confirm-warning.png",
      "mobile-confirm-warning.png",
      "desktop-delete-pending.png",
      "mobile-delete-pending.png",
      "desktop-failure-visible.png",
      "mobile-failure-visible.png",
      "desktop-success-toast.png",
      "mobile-success-toast.png",
    ],
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const outputDir = path.resolve(process.env.CLASS_DELETION_UI_OUTPUT ?? path.join(root, "artifacts", "class-deletion-ui"));
  const testRoot = path.join(outputDir, `next-app-${process.pid}-${Date.now()}`);
  const route = path.join(testRoot, "app", "qa-class-deletion");
  const port = Number(process.env.CLASS_DELETION_UI_PORT ?? 3151);
  const baseUrl = `http://127.0.0.1:${port}`;
  const require = createRequire(import.meta.url);
  const { chromium } = process.env.CLASS_DELETION_PLAYWRIGHT
    ? require(process.env.CLASS_DELETION_PLAYWRIGHT)
    : require("playwright");
  let server;
  let serverExited = Promise.resolve();
  let browser;
  let logs = "";
  const pageSource = 'export { default } from "@/tests/fixtures/ClassDeletionPage";\n';
  try {
    await mkdir(route, { recursive: true });
    await mkdir(outputDir, { recursive: true });
    await Promise.all([
      cp(path.join(root, "components"), path.join(testRoot, "components"), { recursive: true }),
      cp(path.join(root, "lib"), path.join(testRoot, "lib"), { recursive: true }),
      cp(path.join(root, "tests", "fixtures"), path.join(testRoot, "tests", "fixtures"), { recursive: true }),
      cp(path.join(root, "public"), path.join(testRoot, "public"), { recursive: true }),
      cp(path.join(root, "app", "globals.css"), path.join(testRoot, "app", "globals.css")),
      cp(path.join(root, "package.json"), path.join(testRoot, "package.json")),
      cp(path.join(root, "jsconfig.json"), path.join(testRoot, "jsconfig.json")),
    ]);
    await writeFile(path.join(testRoot, "next.config.mjs"), "/** @type {import('next').NextConfig} */\nconst nextConfig = { devIndicators: false };\nexport default nextConfig;\n");
    await writeFile(path.join(testRoot, "app", "layout.js"), 'import "../app/globals.css";\nexport default function RootLayout({ children }) { return <html lang="ko"><body>{children}</body></html>; }\n');
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
    const result = await verifyClassDeletionUi(page, baseUrl);
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
