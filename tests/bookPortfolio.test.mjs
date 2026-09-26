import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { buildBookPortfolio, portfolioFilename, renderBookPortfolioHtml } from "../lib/bookPortfolio.mjs";

const participant = { uid: "student-1", realName: "김학생", schoolName: "초록초" };

function projectFixture() {
  return {
    title: "나의 앱 만들기",
    steps: [
      { title: "두 번째 Step", activities: [{ id: "a1", title: "프롬프트", content: "teacher prompt" }, { id: "a2", title: "기능 설명", content: "teacher feature" }], resources: [{ id: "r1", title: "교사 자료", content: "secret" }], itemOrder: [{ kind: "resource", id: "r1" }, { kind: "activity", id: "a2" }, { kind: "activity", id: "a1" }] },
      { title: "마지막 Step", activities: [{ id: "a3", title: "짜잔!", content: "teacher final" }], resources: [], itemOrder: [] },
    ],
  };
}

function entry(activityId, patch = {}) {
  return {
    activityId,
    authorId: participant.uid,
    dashboardText: `답변 ${activityId}`,
    urls: ["https://example.com/app", "javascript:alert(1)"],
    updatedAt: "2026-09-26T01:02:03.000Z",
    ...patch,
  };
}

function portfolio(entries, extra = {}) {
  return buildBookPortfolio({
    project: projectFixture(),
    participant,
    entries,
    generatedAt: "2026-09-26T04:05:06.000Z",
    ...extra,
  });
}

async function loadAssetsModule(fetchImpl = async () => { throw new Error("unexpected fetch"); }, timers = {}, globals = {}) {
  const context = vm.createContext({
    AbortController,
    Image: globals.Image,
    ReadableStream,
    clearTimeout: timers.clearTimeout ?? clearTimeout,
    fetch: fetchImpl,
    setTimeout: timers.setTimeout ?? setTimeout,
  });
  const source = readFileSync(new URL("../lib/bookPortfolioAssets.js", import.meta.url), "utf8");
  const module = new vm.SourceTextModule(source, { context });
  await module.link(() => {});
  await module.evaluate();
  return module.namespace;
}

test("buildBookPortfolio keeps current project activity order and ignores resources", () => {
  const model = buildBookPortfolio({
    project: projectFixture(),
    participant,
    className: "1반",
    entries: { a1: entry("a1"), a2: entry("a2"), r1: entry("r1") },
    generatedAt: "2026-09-26T04:05:06.000Z",
  });

  assert.deepEqual([model.title, model.student, model.className, model.school], ["나의 앱 만들기", "김학생", "1반", "초록초"]);
  assert.deepEqual(model.sections.map((section) => section.title), ["두 번째 Step", "마지막 Step"]);
  assert.deepEqual(model.sections[0].items.map((item) => item.title), ["기능 설명", "프롬프트"]);
  assert.equal(model.sections[0].items[0].text, "답변 a2");
  assert.equal(model.sections[1].items[0].missing, true);
  assert.equal(JSON.stringify(model).includes("교사 자료"), false);
  assert.equal(JSON.stringify(model).includes("student-1"), false);
});

test("buildBookPortfolio rejects entries from another student and preserves legacy answer text", () => {
  const model = portfolio({
    a1: entry("a1", { authorId: "student-2", dashboardText: "다른 학생" }),
    a2: entry("a2", { dashboardText: undefined, answers: { dashboardText: "레거시 답변" } }),
    a3: entry("a3", { dashboardText: undefined, answers: "문자열 답변" }),
  }, { generatedAt: new Date("2026-09-26T04:05:06.000Z") });

  assert.equal(model.sections[0].items[1].missing, true);
  assert.equal(model.sections[0].items[0].text, "레거시 답변");
  assert.equal(model.sections[1].items[0].text, "문자열 답변");
  assert.equal(model.stats.answeredActivities, 2);
});

test("buildBookPortfolio formats Firestore Timestamp-shaped saved dates", () => {
  const model = portfolio({
    a2: entry("a2", { updatedAt: { toDate: () => new Date("2026-09-25T11:12:13.000Z") } }),
    a3: entry("a3", { updatedAt: { seconds: 1790250000, nanoseconds: 123000000 } }),
  });

  assert.equal(model.sections[0].items[0].savedAt, "2026-09-25T11:12:13.000Z");
  assert.match(model.sections[1].items[0].savedAt, /^2026-/);
});

test("renderBookPortfolioHtml escapes hostile markup and keeps only safe links", () => {
  const model = portfolio({
    a2: entry("a2", {
      dashboardText: "<img src=x onerror=alert(1)>\n<script>alert(1)</script>",
      urls: ["javascript:alert(1)", "https://safe.example/path?q=<x>"],
    }),
  });

  const html = renderBookPortfolioHtml(model);
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /javascript:/i);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /저장된 내용이 아직 없어요\./);
});

test("portfolioFilename sanitizes Windows-invalid names and bounds length", () => {
  const name = portfolioFilename({
    title: '긴:프로젝트/이름*'.repeat(20),
    student: '김<학생>|"?',
  });

  assert.match(name, /^차시보고서-차시-김_학생____-긴_프로젝트_이름_/);
  assert.match(name, /\.html$/);
  assert.ok(name.length <= 120);
  assert.doesNotMatch(name, /[<>:"/\\|?*\u0000-\u001f]/);
});

test("long prompt text and Korean newlines are retained without mutation", () => {
  const sourceProject = projectFixture();
  const entries = {
    a1: entry("a1", { dashboardText: "첫 줄\n  둘째 줄\n" + "prompt ".repeat(200) }),
  };
  const before = JSON.stringify({ sourceProject, entries });
  const model = buildBookPortfolio({
    project: sourceProject,
    participant,
    entries,
    generatedAt: "2026-09-26T04:05:06.000Z",
  });
  const promptItem = model.sections[0].items[1];
  const html = renderBookPortfolioHtml(model);

  assert.equal(JSON.stringify({ sourceProject, entries }), before);
  assert.match(promptItem.text, /^첫 줄\n  둘째 줄\n/);
  assert.match(html, /class="portfolio-answer is-prompt"/);
  assert.ok(html.includes("prompt ".repeat(50)));
});

test("prepareBookPortfolio retains raster data URLs and reports rejected or mismatched images", async () => {
  const { prepareBookPortfolio } = await loadAssetsModule();
  const model = portfolio({
    a2: entry("a2", {
      images: [
        "data:image/png;base64,aGVsbG8=",
        "data:image/svg+xml;base64,PHN2Zy8+",
        { src: "https://cdn.example.test/other.png", activityId: "a1" },
      ],
    }),
  });

  const prepared = await prepareBookPortfolio(model);
  const images = prepared.model.sections[0].items[0].images;
  assert.equal(images[0].src, "data:image/png;base64,aGVsbG8=");
  assert.deepEqual([images[1].missing, images[2].missing, "src" in images[1], "src" in images[2]], [true, true, false, false]);
  assert.equal(prepared.missingImages.length, 2);
  assert.equal(JSON.stringify(prepared).includes("cdn.example.test"), false);
});

test("prepareBookPortfolio validates raster data URLs when browser decoding is available", async () => {
  class MockImage {
    set src(value) { this.value = value; }
    decode() {
      return this.value.includes("broken") ? Promise.reject(new Error("decode")) : Promise.resolve();
    }
  }
  const { prepareBookPortfolio } = await loadAssetsModule(undefined, {}, { Image: MockImage });
  const model = portfolio({
    a2: entry("a2", {
      images: [
        "data:image/png;base64,aGVsbG8=",
        "data:image/png;base64,broken",
      ],
    }),
  });

  const prepared = await prepareBookPortfolio(model);
  const images = prepared.model.sections[0].items[0].images;
  assert.equal(images[0].src, "data:image/png;base64,aGVsbG8=");
  assert.equal(images[1].missing, true);
  assert.equal("src" in images[1], false);
});

test("prepareBookPortfolio converts HTTPS raster fetches and records fetch failures", async () => {
  let calls = 0;
  class MockImage {
    set src(value) { this.value = value; }
    decode() {
      return this.value.includes("AQID") ? Promise.resolve() : Promise.reject(new Error("decode"));
    }
  }
  const { prepareBookPortfolio } = await loadAssetsModule(async (url) => {
    calls += 1;
    if (url.includes("fail")) throw new Error("network");
    return {
      ok: true,
      headers: new Map([["content-type", "image/jpeg"], ["content-length", "3"]]),
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    };
  }, {}, { Image: MockImage });
  const model = portfolio({
    a2: entry("a2", {
      images: [
        { src: "https://images.example.test/a.jpg" },
        { src: "https://images.example.test/fail.jpg" },
      ],
    }),
  });

  const prepared = await prepareBookPortfolio(model);
  assert.equal(calls, 2);
  assert.match(prepared.model.sections[0].items[0].images[0].src, /^data:image\/jpeg;base64,/);
  assert.equal(prepared.model.sections[0].items[0].images[1].missing, true);
  assert.equal(prepared.missingImages.length, 1);
});

test("prepareBookPortfolio caps streamed remote image bodies without content length", async () => {
  const { prepareBookPortfolio } = await loadAssetsModule(async () => ({
    ok: true,
    headers: new Map([["content-type", "image/png"]]),
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(5 * 1024 * 1024));
        controller.enqueue(new Uint8Array(1));
        controller.close();
      },
    }),
  }));
  const model = portfolio({ a2: entry("a2", { images: [{ src: "https://images.example.test/too-large.png" }] }) });

  const prepared = await prepareBookPortfolio(model);
  const image = prepared.model.sections[0].items[0].images[0];
  assert.equal(image.missing, true);
  assert.equal("src" in image, false);
});

test("prepareBookPortfolio treats internal timeout as a missing image", async () => {
  const { prepareBookPortfolio } = await loadAssetsModule((url, options) => new Promise((resolve, reject) => {
    const rejectAbort = () => {
      const error = new Error("timeout");
      error.name = "AbortError";
      reject(error);
    };
    if (options.signal.aborted) rejectAbort();
    else options.signal.addEventListener("abort", rejectAbort);
  }), {
    setTimeout: (callback) => {
      callback();
      return 1;
    },
    clearTimeout: () => {},
  });
  const model = portfolio({ a2: entry("a2", { images: [{ src: "https://images.example.test/slow.jpg" }] }) });

  const prepared = await prepareBookPortfolio(model);
  assert.equal(prepared.model.sections[0].items[0].images[0].missing, true);
  assert.equal(prepared.missingImages.length, 1);
});

test("prepareBookPortfolio honors abort signals", async () => {
  const controller = new AbortController();
  controller.abort();
  const { prepareBookPortfolio } = await loadAssetsModule();
  const model = portfolio({ a2: entry("a2", { images: [{ src: "https://images.example.test/a.jpg" }] }) });

  await assert.rejects(() => prepareBookPortfolio(model, { signal: controller.signal }), { name: "AbortError" });
});


test("lesson report cover and filename identify each lesson for the same student and project", () => {
  const first = portfolio({ a1: entry("a1") }, { className: "1차시 문제 발견" });
  const second = portfolio({ a1: entry("a1") }, { className: "2차시 해결 방안" });
  const html = renderBookPortfolioHtml(first);
  assert.match(html, /교내용 · 학생별 차시 보고서/);
  assert(html.includes("<h1>1차시 문제 발견 보고서</h1>"));
  assert.match(html, /portfolio-project-title">나의 앱 만들기/);
  assert.match(html, /김학생/);
  assert.equal(portfolioFilename(first), "차시보고서-1차시 문제 발견-김학생-나의 앱 만들기.html");
  assert.notEqual(portfolioFilename(first), portfolioFilename(second));
});
test("lesson identity is escaped in exported report", () => {
  const html = renderBookPortfolioHtml(portfolio({}, { className: '<img src=x onerror="alert(1)"> 차시' }));
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x/);
});
