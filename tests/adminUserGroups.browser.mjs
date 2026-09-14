import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const root = process.cwd();
const output = path.join(root, "artifacts", `admin-groups-${Date.now()}`);
const fixture = path.join(output, "app-fixture");
const port = Number(process.env.QA_PORT || 3214);
let server;
let browser;
let logs = "";
await mkdir(path.join(fixture, "app/admin"), { recursive: true });
await mkdir(path.join(fixture, "lib"), { recursive: true });
try {
  for (const entry of ["components", "lib", "public", "package.json", "jsconfig.json", "app/globals.css", "app/admin/page.js"]) {
    await cp(path.join(root, entry), path.join(fixture, entry), { recursive: true });
  }
  await writeFile(path.join(fixture, "app/layout.js"), 'import "./globals.css"; export default function Layout({children}) { return <html lang="ko"><body>{children}</body></html>; }');
  await writeFile(path.join(fixture, "components/TopNav.jsx"), 'export default function TopNav() { return <nav className="top-nav">사용자 관리</nav>; }');
  await writeFile(path.join(fixture, "lib/useCurrentUser.js"), 'const user = {uid:"admin", role:"admin"}; export function useCurrentUser(){return user;}');
  await writeFile(path.join(fixture, "lib/useRequireAuth.js"), 'export function useRequireAuth(){}');
  await writeFile(path.join(fixture, "lib/user.js"), 'export function isAdmin(user){return user.role === "admin";}');
  await writeFile(path.join(fixture, "lib/store.js"), `
    const users = [{uid:"admin",realName:"관리자"},{uid:"a",realName:"김학생",schoolName:"가나학교"},{uid:"b",realName:"이학생",schoolName:"다라학교"},{uid:"c",realName:"박학생",schoolName:"마바학교"}];
    let listener;
    export function subscribeUserDirectory(cb){listener=cb;cb(users);return ()=>{};}
    export function subscribeUserActivity(id,cb){cb([]);return ()=>{};}
    export function subscribeAdminUserGroups(cb,onError){
      window.failGroups = ()=>onError(new Error("denied"));
      cb({classes:[{id:"one",name:"융과원"},{id:"two",name:"보관된 연수반",archived:true}],memberships:[{uid:"a",classId:"one"},{uid:"a",classId:"two"},{uid:"b",classId:"two"}]});return ()=>{};
    }
    export async function deleteStudent(uid){listener(users.filter(user=>user.uid!==uid));}
  `);
  server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: fixture, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", (data) => { logs += data; });
  server.stderr.on("data", (data) => { logs += data; });
  const deadline = Date.now() + 120000;
  while (!logs.includes("Ready in")) {
    if (server.exitCode !== null || Date.now() > deadline) throw new Error(logs);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.setDefaultTimeout(120000);
  const response = await page.goto(`http://127.0.0.1:${port}/admin`);
  assert.equal(response.status(), 200, logs);
  await page.locator(".admin-class-group").first().waitFor();
  assert.equal(await page.locator(".admin-class-group").count(), 3);
  assert.equal(await page.locator(".student-panel .admin-panel-head span").textContent(), "3명");
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    if (width <= 768) {
      const panel = await page.locator(".student-panel").boundingBox();
      const main = await page.locator(".admin-main").boundingBox();
      assert.ok(main.y >= panel.y + panel.height - 1);
    }
    await page.screenshot({ path: path.join(output, `groups-${width}.png`), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
  await page.getByRole("combobox", { name: "반 선택" }).selectOption("two");
  assert.equal(await page.locator(".student-row").count(), 2);
  await page.getByRole("searchbox").fill("다라");
  assert.equal(await page.locator(".student-row").count(), 1);
  await page.getByRole("heading", { level: 1, name: "이학생" }).waitFor();
  await page.getByRole("searchbox").fill("");
  await page.getByRole("combobox", { name: "반 선택" }).selectOption("unassigned");
  await page.getByRole("heading", { level: 1, name: "박학생" }).waitFor();
  await page.getByRole("button", { name: "박학생 탈퇴 처리" }).click();
  await page.getByRole("alertdialog").waitFor();
  await page.screenshot({ path: path.join(output, "delete-confirm.png"), fullPage: true });
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await page.getByRole("searchbox").fill("없는사람");
  await page.getByText("조회할 사용자가 없습니다.").waitFor();
  await page.evaluate(() => window.failGroups());
  await page.locator(".student-panel [role='alert']").waitFor();
  assert.equal(await page.locator(".admin-class-group").count(), 0);
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, "results.json"), JSON.stringify({ pass: true, viewports: [375, 768, 1280], errors }));
  console.log(output);
} finally {
  await browser?.close();
  if (server && server.exitCode === null) {
    await new Promise((resolve) => spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true }).on("close", resolve));
  }
  await writeFile(path.join(output, "server.log"), logs);
}
