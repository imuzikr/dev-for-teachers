// Run with Playwright installed, or set PLAYWRIGHT_MODULE to its package path.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import nextConfig from "../next.config.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const downloads = await mkdtemp(path.join(tmpdir(), "lesson-downloads-"));
const files = [
  { name: "학습 자료.zip", body: Buffer.from("504b0506000000000000000000000000000000000000", "hex") },
  { name: "활동 안내.html", body: Buffer.from("<script>document.title='UNSAFE'</script>") },
];
const requests = [];
const source = await readFile(new URL("../lib/lessonDownloads.js", import.meta.url));
const policySource = await readFile(new URL("../lib/lessonFilePolicy.js", import.meta.url));
const { lessonFileDisposition } = await import(`data:text/javascript;base64,${policySource.toString("base64")}`);
async function listen(server) {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
async function waitForFiles(expected) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const saved = (await readdir(downloads)).filter(name => !name.endsWith(".crdownload"));
    if (saved.length === expected) return saved;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.fail(`Expected ${expected} downloaded files; found ${(await readdir(downloads)).join(", ")}`);
}
const storage = createServer((request, response) => {
  const file = files[Number(new URL(request.url, "http://fixture").pathname.slice(1))];
  if (!file) { response.writeHead(404).end(); return; }
  requests.push(request.headers["sec-fetch-mode"]);
  // Deliberately omit Access-Control-Allow-Origin, matching the reported failure.
  response.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Disposition": lessonFileDisposition(file.name) });
  response.end(file.body);
});
let app, browser;
try {
  const storageOrigin = await listen(storage);
  const appHeaders = (await nextConfig.headers())[0].headers;
  const csp = appHeaders.find(header => header.key === "Content-Security-Policy").value;
  assert(csp.includes("frame-src 'self' https://firebasestorage.googleapis.com"));
  // Substitute only the test Storage origin; retain the application's other CSP rules.
  const fixtureCsp = csp.replaceAll("https://firebasestorage.googleapis.com", storageOrigin)
    .replace("connect-src 'self'", `connect-src 'self' ${storageOrigin}`);
  const selection = files.map((file, index) => ({ name: file.name, downloadUrl: `${storageOrigin}/${index}` }));
  app = createServer((request, response) => {
    if (request.url === "/lessonDownloads.js") {
      response.writeHead(200, { "Content-Type": "text/javascript" }).end(source); return;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": fixtureCsp }).end(`<!doctype html>
      <title>Lesson download regression</title>
      <button id="single">Single download</button><button id="multiple">Selected downloads</button>
      <button id="old">Reproduce fetch failure</button><output id="result"></output>
      <script type="module">
        import { downloadLessonSelection } from '/lessonDownloads.js';
        const files = ${JSON.stringify(selection)};
        document.querySelector('#single').onclick = () => downloadLessonSelection([files[0]]);
        document.querySelector('#multiple').onclick = () => downloadLessonSelection(files);
        document.querySelector('#old').onclick = async () => {
          try { await fetch(files[0].downloadUrl); document.querySelector('#result').textContent = 'unexpected success'; }
          catch { document.querySelector('#result').textContent = 'CORS blocked'; }
        };
      </script>`);
  });
  const appOrigin = await listen(app);
  browser = await chromium.launch({ channel: "chrome", headless: true, ignoreDefaultArgs: ["--disable-popup-blocking"] });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const completed = [];
  const names = new Set();
  // A target=_blank attachment may emit its download on either the opener or
  // the transient new page, depending on the browser version.
  const collect = download => {
    const original = download.suggestedFilename();
    const name = names.has(original) ? `selected-${original}` : original;
    names.add(original);
    completed.push(download.saveAs(path.join(downloads, name)));
  };
  page.on("download", collect);
  context.on("page", popup => popup.on("download", collect));
  await page.goto(appOrigin);
  await page.locator("#old").click();
  await page.waitForFunction(() => document.querySelector("#result").textContent === "CORS blocked");
  await page.locator("#single").click();
  await waitForFiles(1);
  assert.deepEqual(await readFile(path.join(downloads, files[0].name)), files[0].body);
  await page.locator("#multiple").click();
  const saved = await waitForFiles(3);
  assert(saved.includes(files[1].name));
  assert.deepEqual(await readFile(path.join(downloads, files[1].name)), files[1].body);
  const repeatedZip = saved.find(name => name !== files[0].name && name.endsWith(".zip"));
  assert(repeatedZip, "Selected downloads must include the ZIP as well as HTML");
  assert.deepEqual(await readFile(path.join(downloads, repeatedZip)), files[0].body);
  assert.equal(await page.title(), "Lesson download regression");
  await Promise.all(completed);
  assert.equal(requests.filter(mode => mode === "cors").length, 1, "Only the old-code reproduction should fetch with CORS");
  assert.equal(requests.filter(mode => mode === "navigate").length, 3);
  console.log("PASS: CORS failure reproduced; direct single and selected downloads preserve names/bytes and keep the app open. Active HTML was downloaded.");
} finally {
  await browser?.close();
  await Promise.all([storage, app].filter(Boolean).map(server => new Promise(resolve => server.close(resolve))));
}
