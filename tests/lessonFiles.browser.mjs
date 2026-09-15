import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = process.cwd();
const output = path.join(root, "artifacts", `lesson-files-${Date.now()}`);
const fixture = path.join(output, "fixture");
let server, browser;
let logs = "";
try {
  await mkdir(path.join(fixture, "app"), { recursive: true });
  for (const dir of ["components", "lib", "tests/fixtures"]) await cp(path.join(root, dir), path.join(fixture, dir), { recursive: true });
  for (const file of ["package.json", "jsconfig.json", "app/globals.css", "app/book-sidebar.css"]) await cp(path.join(root, file), path.join(fixture, file));
  await writeFile(path.join(fixture, "lib/firebase.js"), "export const isFirebaseConfigured = false; export const db = null; export const auth = null; export const storage = null;");
  if (process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
    const projectId = process.env.GCLOUD_PROJECT;
    assert.match(projectId, /^demo-/);
    const [firestoreHost, firestorePort] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
    const [storageHost, storagePort] = process.env.FIREBASE_STORAGE_EMULATOR_HOST.split(":");
    const nextConfig = await readFile(path.join(root, "next.config.mjs"), "utf8");
    await writeFile(path.join(fixture, "next.config.mjs"), nextConfig.replace("connect-src 'self'", `connect-src 'self' http://${firestoreHost}:${firestorePort} http://${storageHost}:${storagePort}`));
    await writeFile(path.join(fixture, "lib/firebase.js"), `
      import { initializeApp } from "firebase/app";
      import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
      import { getStorage, connectStorageEmulator } from "firebase/storage";
      const app = initializeApp({apiKey:"demo-key", projectId:${JSON.stringify(projectId)}, storageBucket:${JSON.stringify(projectId)}});
      export const db = getFirestore(app), storage = getStorage(app), auth = null, isFirebaseConfigured = true;
      const options = {mockUserToken:{sub:"qa-teacher", role:"teacher"}};
      connectFirestoreEmulator(db, ${JSON.stringify(firestoreHost)}, ${Number(firestorePort)}, options);
      connectStorageEmulator(storage, ${JSON.stringify(storageHost)}, ${Number(storagePort)}, options);
    `);
  }
  await writeFile(path.join(fixture, "app/page.jsx"), 'export { default } from "@/tests/fixtures/LessonFilesPage";');
  await mkdir(path.join(fixture, "app/qa-class"), { recursive: true });
  await writeFile(path.join(fixture, "app/qa-class/page.jsx"), 'export { default } from "@/tests/fixtures/ClassManagerLayoutPage";');
  await writeFile(path.join(fixture, "app/layout.jsx"), 'import "./globals.css"; import "./book-sidebar.css"; export default function Layout({children}) { return <html lang="ko"><body>{children}</body></html>; }');
  server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", "3257"], { cwd: fixture, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
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
  page.on("console", message => { if (message.type() === "error") logs += message.text() + "\n"; });

  await page.goto("http://127.0.0.1:3257");
  await page.getByText("저장된 파일이 없습니다.", {exact:true}).waitFor();
  const extensions = ["png", "jpg", "svg", "txt", "pdf", "pptx", "xlsx", "csv", "zip", "html", "json", "doc", "docx", "hwp", "hwpx"];
  await page.getByLabel("자료 파일", {exact:true}).setInputFiles(extensions.map(ext => ({name:"수업 자료."+ext, mimeType:"application/octet-stream", buffer:Buffer.from("original content")})));
  await page.waitForFunction(() => document.querySelectorAll(".lesson-file-row").length === 15 || document.querySelector(".lesson-error"));
  assert.equal(await page.locator(".lesson-error").allTextContents().then(values => values.join(" ")), "", logs);
  await page.waitForFunction(() => document.querySelectorAll(".lesson-file-row").length === 15);
  if (process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
    await page.waitForFunction(() => !document.querySelector('.lesson-file-toolbar button').disabled);
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll(".lesson-file-row").length === 15);
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", {configurable:true, value:{writeText:async text => {window.copiedLessonUrl = text;}}}));
    await page.getByRole("button", {name:"수업 자료.html 배포 링크 복사",exact:true}).click();
    await page.waitForFunction(() => Boolean(window.copiedLessonUrl));
    const response = await fetch(await page.evaluate(() => window.copiedLessonUrl));
    assert.equal(await response.text(), "original content");
    assert.match(response.headers.get("content-disposition"), /^attachment/);
  }
  assert.equal(await page.getByRole("button", {name:"수업 시작하기",exact:true}).count(), 0);
  assert.equal(await page.getByRole("button", {name:"편집하기",exact:true}).count(), 0);
  for (const width of [375,768,1280]) {
    await page.setViewportSize({width,height:900});
    assert(await page.locator(".lesson-file-manager").evaluate(el => el.scrollWidth <= el.clientWidth));
    await page.screenshot({path:path.join(output, width+".png"),fullPage:true});
  }
  await page.getByLabel("자료 검색").fill(".html");
  await page.waitForFunction(() => document.querySelectorAll(".lesson-file-row").length === 1);
  const download = page.waitForEvent("download");
  await page.getByRole("button", {name:"다운로드",exact:true}).click();
  const downloaded = await download;
  assert.equal(downloaded.suggestedFilename(), "수업 자료.html");
  await page.getByRole("button", {name:"수업 자료.html 삭제",exact:true}).click();
  await page.getByRole("alertdialog").getByRole("button", {name:"취소",exact:true}).click();
  assert.equal(await page.locator(".lesson-file-row").count(),1);
  await page.getByRole("button", {name:"수업 자료.html 삭제",exact:true}).click();
  await page.getByRole("alertdialog").getByRole("button", {name:"삭제",exact:true}).click();
  await page.waitForFunction(() => document.querySelectorAll(".lesson-file-row").length === 0);
  await page.waitForFunction(() => !document.querySelector('.lesson-file-toolbar button').disabled);
  await page.getByLabel("자료 파일", {exact:true}).setInputFiles({name:"bad.exe",mimeType:"application/octet-stream",buffer:Buffer.from("bad")});
  await page.getByRole("alert").filter({hasText:"지원하지 않는"}).waitFor();
  await page.getByLabel("자료 검색").fill("");
  await page.getByRole("button", {name:"닫기",exact:true}).click();
  await page.getByRole("button", {name:"수업 준비 열기",exact:true}).click();
  await page.waitForFunction(() => document.querySelectorAll(".lesson-file-row").length === 14);
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({state:"hidden"});
  assert.deepEqual(errors, []);
  console.log("PASS: upload 15 formats, search, download HTML, cancel/delete, reject executable, reopen persistence, responsive and Escape. "+output);
} finally {
  await browser?.close();
  if (server && server.exitCode === null) await new Promise(resolve => spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true }).on("close", resolve));
  await writeFile(path.join(output, "server.log"), logs);
}
