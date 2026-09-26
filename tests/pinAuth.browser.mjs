import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const root = process.cwd();
const output = path.join(root, "artifacts", `pin-auth-${Date.now()}`);
const fixture = path.join(output, "app-fixture");
const port = Number(process.env.QA_PORT || 3224);
const baseUrl = `http://127.0.0.1:${port}`;
let server;
let browser;
let logs = "";
const pinState = {
  beginMode: "register",
  failure: null,
  requests: [],
  authorizations: [],
  legacyAction: null,
};

async function copyFixture() {
  await mkdir(path.join(fixture, "app/admin"), { recursive: true });
  await mkdir(path.join(fixture, "lib"), { recursive: true });
  for (const entry of ["app/page.js", "app/admin/page.js", "app/globals.css", "components", "lib", "public", "package.json", "jsconfig.json"]) {
    await cp(path.join(root, entry), path.join(fixture, entry), { recursive: true });
  }
  await mkdir(path.join(fixture, "app/books"), { recursive: true });
  await writeFile(path.join(fixture, "app/layout.js"), 'import "./globals.css"; export default function Layout({ children }) { return <html lang="ko"><body>{children}</body></html>; }');
  await cp(path.join(root, "tests/fixtures/authLatency/BooksPage.jsx"), path.join(fixture, "app/books/page.js"));
  await writeFile(path.join(fixture, "components/TopNav.jsx"), 'export default function TopNav() { return <nav className="top-nav">사용자 관리</nav>; }');
  await cp(path.join(root, "tests/fixtures/authLatency/firebase.js"), path.join(fixture, "lib/firebase.js"));
  await cp(path.join(root, "tests/fixtures/authLatency/navigation.js"), path.join(fixture, "lib/authLatencyNavigation.js"));
  const authSource = await readFile(path.join(root, "lib/auth.js"), "utf8");
  await writeFile(path.join(fixture, "lib/auth.js"), authSource.replaceAll('"firebase/auth"', '"./firebase"').replaceAll('"firebase/firestore"', '"./firebase"'));
  const landingSource = await readFile(path.join(root, "app/page.js"), "utf8");
  await writeFile(path.join(fixture, "app/page.js"), landingSource.replace('"next/navigation"', '"@/lib/authLatencyNavigation"'));
  await writeFile(path.join(fixture, "lib/useCurrentUser.js"), 'export function useCurrentUser() { return { uid: "admin", role: "admin", realName: "관리자" }; }');
  await writeFile(path.join(fixture, "lib/useRequireAuth.js"), "export function useRequireAuth() {}");
  await writeFile(path.join(fixture, "lib/store.js"), `
    const users = [
      { uid: "admin", realName: "관리자", role: "admin" },
      { uid: "student-a", realName: "김학생", schoolName: "가나학교" },
      { uid: "student-b", realName: "이학생", schoolName: "다라학교" },
    ];
    export function subscribeUserDirectory(cb) { cb(users); return () => {}; }
    export function subscribeUserActivity(uid, cb) { cb([]); return () => {}; }
    export function subscribeAdminUserGroups(cb) {
      cb({ classes: [{ id: "one", name: "융과원" }], memberships: [{ uid: "student-a", classId: "one" }] });
      return () => {};
    }
    export async function deleteStudent() {}
  `);
}

async function startServer() {
  server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: fixture, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", (data) => { logs += data; });
  server.stderr.on("data", (data) => { logs += data; });
  const deadline = Date.now() + 120000;
  while (!logs.includes("Ready in")) {
    if (server.exitCode !== null || Date.now() > deadline) throw new Error(logs);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function openLanding(page, { stall = null, legacy = false } = {}) {
  const response = await page.goto(baseUrl);
  assert.equal(response.status(), 200, logs);
  await page.evaluate(({ stall, legacy }) => { window.__stallPinSession = stall; window.__legacySession = legacy; }, { stall, legacy });
  await page.getByRole("textbox", { name: "학교 이름" }).fill("가나학교");
  await page.getByRole("textbox", { name: "이름", exact: true }).fill("김교사");
  await page.getByRole("button", { name: "시작하기" }).click();
  await page.getByRole("dialog").waitFor();
  assert.deepEqual(await page.evaluate(() => window.__routePrefetches), ["/books"]);
  assert.equal(await page.evaluate(() => window.__authMetrics?.profileReads || 0), 0);
}

async function installPinApi(page) {
  await page.route("**/api/auth/pin", async (route) => {
    const payload = route.request().postDataJSON();
    pinState.requests.push(payload);
    const authorization = route.request().headers().authorization || null;
    pinState.authorizations.push(authorization);
    if (pinState.legacyAction === payload.action && !authorization) {
      await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ code: "auth/pin-enrollment-required" }) });
      return;
    }
    const failure = pinState.failure;
    pinState.failure = null;
    if (failure) {
      await route.fulfill({
        status: failure.status || 400,
        contentType: "application/json",
        body: JSON.stringify({ code: failure.code, message: failure.message || "fixture failure" }),
      });
      return;
    }
    if (payload.action === "begin") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mode: pinState.beginMode }) });
      return;
    }
    if (payload.action === "reset") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ customToken: "fixture-token" }) });
  });
}

async function assertHydrated(page) {
  await page.getByRole("heading", { name: "책방", exact: true }).waitFor();
  for (const number of [1, 2, 3]) await page.getByTestId(`consumer-${number}`).filter({ hasText: "pin-user" }).waitFor();
  assert.equal(await page.evaluate(() => window.__authMetrics.profileReads), 1, "PIN sign-in and all destination consumers share a single profile read");
}

async function assertNoOverflow(page, label) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${label}: document has horizontal overflow`);
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(output, name), fullPage: true });
}

async function run() {
  await copyFixture();
  await startServer();
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.setDefaultTimeout(30000);
  await installPinApi(page);

  await page.setViewportSize({ width: 1280, height: 900 });
  await openLanding(page);
  await page.getByLabel("새 PIN").fill("0123");
  await page.getByLabel("PIN 다시 입력").fill("0124");
  await page.getByRole("button", { name: "등록하고 시작" }).click();
  await page.getByText("두 PIN이 일치하지 않습니다.").waitFor();
  assert.equal(pinState.requests.filter((request) => request.action === "register").length, 0);
  await screenshot(page, "register-mismatch-1280.png");
  console.log("checked register mismatch");

  await page.getByLabel("PIN 다시 입력").fill("0123");
  await page.getByRole("button", { name: "등록하고 시작" }).click();
  console.log("submitted leading-zero register");
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.equal(pinState.requests.at(-1).pin, "0123");
  await assertHydrated(page);
  await screenshot(page, "authenticated-consumers-1280.png");
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  for (const number of [1, 2, 3]) await page.getByTestId(`consumer-${number}`).filter({ hasText: "signed-out" }).waitFor();
  await page.getByText("사용자 캐시 초기화됨").waitFor();
  await screenshot(page, "signed-out-consumers-1280.png");
  console.log("checked leading-zero register");

  pinState.beginMode = "login";
  await openLanding(page);
  pinState.failure = { status: 401, code: "auth/pin-invalid-credentials" };
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("PIN", { exact: true }).fill("0007");
  await dialog.getByRole("button", { name: "시작하기" }).click();
  await page.getByText("학교명, 이름 또는 PIN이 일치하지 않습니다.").waitFor();
  assert.equal(await dialog.getByLabel("PIN", { exact: true }).inputValue(), "");

  pinState.failure = { status: 429, code: "auth/pin-rate-limited" };
  await dialog.getByLabel("PIN", { exact: true }).fill("0007");
  await dialog.getByRole("button", { name: "시작하기" }).click();
  await page.getByText("입력 시도가 많습니다. 15분 후 다시 시도해 주세요.").waitFor();

  pinState.failure = { status: 503, code: "auth/pin-config-unavailable" };
  await dialog.getByLabel("PIN", { exact: true }).fill("0007");
  await dialog.getByRole("button", { name: "시작하기" }).click();
  await page.getByText("로그인 서버 설정이 필요합니다. 선생님께 문의해 주세요.").waitFor();

  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await openLanding(page);
  await page.mouse.click(5, 5);
  await page.getByRole("dialog").waitFor({ state: "detached" });

  for (const mode of ["login", "register"]) {
    pinState.beginMode = mode;
    for (const phase of ["restore", "token"]) {
      const before = pinState.requests.length;
      await openLanding(page, { stall: phase });
      if (mode === "register") {
        await page.getByLabel("새 PIN").fill("0007");
        await page.getByLabel("PIN 다시 입력").fill("0007");
        await page.getByRole("button", { name: "등록하고 시작" }).click();
      } else {
        await page.getByLabel("PIN", { exact: true }).fill("0007");
        await page.getByRole("dialog").getByRole("button", { name: "시작하기" }).click();
      }
      await assertHydrated(page);
      assert.deepEqual(pinState.requests.slice(before).map(request => request.action), ["begin", mode]);
      assert.deepEqual(pinState.authorizations.slice(before), [null, null]);
      const metrics = await page.evaluate(() => window.__authMetrics);
      assert.equal(metrics.sessionWaits, 0);
      assert.equal(metrics.bearerReads, 0);
      console.log(`checked begin/${mode} reaches books while old session ${phase} is stalled`);
    }
  }

  for (const action of ["begin", "register"]) {
    pinState.beginMode = "register";
    pinState.legacyAction = action;
    const before = pinState.requests.length;
    await openLanding(page, { legacy: true });
    if (action === "register") {
      await page.getByLabel("새 PIN").fill("0007");
      await page.getByLabel("PIN 다시 입력").fill("0007");
      await page.getByRole("button", { name: "등록하고 시작" }).click();
      await assertHydrated(page);
    }
    const indexes = pinState.requests.map((request, index) => ({ request, index })).filter(({ request, index }) => index >= before && request.action === action);
    assert.equal(indexes.length, 2);
    assert.deepEqual(indexes.map(({ index }) => pinState.authorizations[index]), [null, "Bearer fixture-token"]);
    const metrics = await page.evaluate(() => window.__authMetrics);
    assert.equal(metrics.sessionWaits, 1);
    assert.equal(metrics.bearerReads, 1);
    console.log(`checked legacy ${action} ownership fallback exactly once`);
    pinState.legacyAction = null;
  }
  pinState.beginMode = "login";

  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await openLanding(page);
    await assertNoOverflow(page, `landing ${width}`);
    await screenshot(page, `pin-landing-${width}.png`);
    await page.keyboard.press("Escape");
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${baseUrl}/admin`);
  await page.evaluate(() => { window.__legacySession = true; });
  await page.getByRole("button", { name: "PIN 설정·재설정" }).click();
  await page.getByRole("dialog", { name: "PIN 설정·재설정" }).waitFor();
  await page.getByLabel("새 PIN").fill("0007");
  await page.getByLabel("PIN 다시 입력").fill("0007");
  await screenshot(page, "admin-reset-modal-1280.png");
  await page.getByRole("button", { name: "PIN 저장" }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await page.getByText("김학생의 PIN을 저장했습니다.").waitFor();
  assert.deepEqual(pinState.requests.at(-1), {
    action: "reset",
    uid: "student-a",
    pin: "0007",
    pinConfirm: "0007",
  });

  assert.equal(pinState.authorizations.at(-1), "Bearer fixture-token");

  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${baseUrl}/admin`);
    await page.getByRole("button", { name: "PIN 설정·재설정" }).click();
    await assertNoOverflow(page, `admin reset ${width}`);
    await screenshot(page, `admin-reset-${width}.png`);
    await page.keyboard.press("Escape");
  }

  assert.deepEqual(errors, []);
  await writeFile(path.join(output, "results.json"), JSON.stringify({ pass: true, stalledSessionChecks: 4, legacyFallbackChecks: 2, sharedProfileReads: 1, authConsumers: 3, logoutChecked: true, prefetch: "router call before authentication (Next dev does not warm route network)", errors }, null, 2));
  console.log(output);
}

try {
  await run();
} catch (error) {
  if (browser) {
    const pages = browser.contexts().flatMap((context) => context.pages());
    await Promise.all(pages.map((page, index) => screenshot(page, `failure-${index}.png`).catch(() => {})));
  }
  await writeFile(path.join(output, "results.json"), JSON.stringify({ pass: false, error: String(error?.stack || error) }, null, 2));
  throw error;
} finally {
  await browser?.close();
  if (server && server.exitCode === null) {
    await new Promise((resolve) => spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true }).on("close", resolve));
  }
  await writeFile(path.join(output, "server.log"), logs);
}
