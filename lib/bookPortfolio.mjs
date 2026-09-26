const EMPTY_TEXT = "저장된 내용이 아직 없어요.";
const CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";
const RASTER_DATA_URL = /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i;
const RASTER_REMOTE_URL = /^https?:\/\//i;

function textValue(value) {
  return typeof value === "string" ? value : "";
}

function participantName(participant = {}) {
  return participant.realName || participant.name || participant.displayName || "이름 미설정";
}

function participantSchool(participant = {}) {
  return participant.schoolName || participant.school || "";
}

function safeDate(value) {
  const source = typeof value?.toDate === "function"
    ? value.toDate()
    : typeof value?.seconds === "number"
      ? new Date((value.seconds * 1000) + Math.floor((value.nanoseconds || 0) / 1000000))
      : value || Date.now();
  const date = source instanceof Date ? source : new Date(source);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function displayDate(value) {
  return safeDate(value).slice(0, 10);
}

function orderedActivities(step = {}) {
  const activities = step.activities ?? [];
  const byId = new Map(activities.map((activity) => [activity.id, activity]));
  const seen = new Set();
  const ordered = [];
  for (const item of step.itemOrder ?? []) {
    if (item?.kind === "activity" && byId.has(item.id) && !seen.has(item.id)) {
      seen.add(item.id);
      ordered.push(byId.get(item.id));
    }
  }
  return [...ordered, ...activities.filter((activity) => !seen.has(activity.id))];
}

function entryText(entry) {
  if (typeof entry?.dashboardText === "string") return entry.dashboardText;
  if (typeof entry?.answers === "string") return entry.answers;
  if (typeof entry?.answers?.dashboardText === "string") return entry.answers.dashboardText;
  return "";
}

function safeHttpUrl(raw) {
  const text = textValue(raw).trim();
  if (!text) return null;
  if (/^[a-z][a-z\d+.-]*:/i.test(text) && !/^https?:\/\//i.test(text)) return null;
  const candidate = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return { text, href: url.href };
  } catch {
    return null;
  }
}

function entryUrls(entry) {
  if (!Array.isArray(entry?.urls)) return [];
  return entry.urls.map(safeHttpUrl).filter(Boolean);
}

function missingImage(caption) {
  return { caption, missing: true };
}

function entryImageSource(image) {
  if (typeof image === "string") return image.trim();
  return textValue(image?.src || image?.dataUrl || image?.url).trim();
}

function entryImageCaption(image, fallback) {
  return textValue(image?.caption || image?.alt).trim() || fallback;
}

function entryImages(entry, activityId, activityTitle) {
  const sources = Array.isArray(entry?.images) ? entry.images : [];
  return sources.map((image, index) => {
    const caption = entryImageCaption(image, `${activityTitle} 캡처 ${index + 1}`);
    if (image && typeof image === "object" && image.activityId && image.activityId !== activityId) {
      return missingImage(caption);
    }
    const src = entryImageSource(image);
    if (RASTER_DATA_URL.test(src) || RASTER_REMOTE_URL.test(src)) return { src, caption };
    return missingImage(caption);
  });
}

function validEntry(entry, participant, activityId) {
  if (!entry || typeof entry !== "object") return null;
  if (entry.activityId !== activityId) return null;
  if (entry.authorId !== participant?.uid) return null;
  return entry;
}

function buildItem(activity, entry, participant) {
  const accepted = validEntry(entry, participant, activity.id);
  const text = entryText(accepted);
  const urls = entryUrls(accepted);
  const images = entryImages(accepted, activity.id, activity.title || "활동");
  return {
    title: activity.title || "제목 없는 활동",
    text,
    urls,
    images,
    savedAt: accepted?.updatedAt ? safeDate(accepted.updatedAt) : "",
    missing: !accepted || (!text && urls.length === 0 && images.every((image) => image.missing)),
    isPrompt: /프롬프트|prompt/i.test(activity.title || ""),
  };
}

function statsFrom(sections) {
  const items = sections.flatMap((section) => section.items);
  return {
    totalActivities: items.length,
    answeredActivities: items.filter((item) => !item.missing).length,
    missingEntries: items.filter((item) => item.missing).length,
    urlCount: items.reduce((count, item) => count + item.urls.length, 0),
    imageCount: items.reduce((count, item) => count + item.images.filter((image) => !image.missing).length, 0),
    missingImages: items.reduce((count, item) => count + item.images.filter((image) => image.missing).length, 0),
  };
}

export function buildBookPortfolio(input = {}) {
  const project = input.project ?? {};
  const participant = input.participant ?? {};
  const entries = input.entries ?? {};
  const sections = (project.steps ?? []).map((step, index) => ({
    title: step.title || `Step ${index + 1}`,
    items: orderedActivities(step).map((activity) => buildItem(activity, entries[activity.id] ?? null, participant)),
  }));
  return {
    title: project.title || "개발자실 포트폴리오",
    student: participantName(participant),
    className: input.className || "",
    school: participantSchool(participant),
    generatedAt: safeDate(input.generatedAt),
    sections,
    stats: statsFrom(sections),
  };
}

function escapeHtml(value) {
  return textValue(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

function renderUrls(urls) {
  if (urls.length === 0) return "";
  const links = urls.map((url, index) => (
    `<li><a href="${escapeAttr(url.href)}" target="_blank" rel="noopener noreferrer">활동 URL ${index + 1}</a><span>${escapeHtml(url.text)}</span></li>`
  )).join("");
  return `<ul class="portfolio-links">${links}</ul>`;
}

function renderImages(images) {
  if (images.length === 0) return "";
  return images.map((image) => {
    const caption = escapeHtml(image.caption || "캡처");
    if (image.missing) {
      return `<figure class="portfolio-figure is-missing"><div>이미지를 준비하지 못했어요.</div><figcaption>${caption}</figcaption></figure>`;
    }
    return `<figure class="portfolio-figure"><img src="${escapeAttr(image.src)}" alt="${caption}"><figcaption>${caption}</figcaption></figure>`;
  }).join("");
}

function renderItem(item) {
  const answerClass = item.isPrompt ? "portfolio-answer is-prompt" : "portfolio-answer";
  const savedAt = item.savedAt ? `<time datetime="${escapeAttr(item.savedAt)}">${escapeHtml(displayDate(item.savedAt))}</time>` : "";
  return `<article class="portfolio-item">
      <header><h3>${escapeHtml(item.title)}</h3>${savedAt}</header>
      <div class="${answerClass}">${escapeHtml(item.text || EMPTY_TEXT)}</div>
      ${renderUrls(item.urls)}
      ${renderImages(item.images)}
    </article>`;
}

function renderSections(sections) {
  return sections.map((section, index) => (
    `<section class="portfolio-section">
      <header><span>${String(index + 1).padStart(2, "0")}</span><h2>${escapeHtml(section.title)}</h2></header>
      ${section.items.length === 0 ? `<p class="portfolio-empty">${EMPTY_TEXT}</p>` : section.items.map(renderItem).join("")}
    </section>`
  )).join("");
}

function renderToc(sections) {
  return `<ol class="portfolio-toc">${sections.map((section) => `<li>${escapeHtml(section.title)}</li>`).join("")}</ol>`;
}

function renderCss() {
  return `:root{--forest:#2f6f3e;--deep:#24552f;--ink:#1f2e25;--body:#344238;--muted:#617468;--paper:#fbfaf3;--sage:#e6f1ea;--border:#d5e1d2;--white:#fff}*{box-sizing:border-box}html{background:var(--paper);color:var(--body)}body{margin:0;font-family:"Malgun Gothic","Apple SD Gothic Neo",system-ui,sans-serif;font-size:16px;line-height:1.8;word-break:keep-all;overflow-wrap:anywhere}main{width:min(100%,900px);margin:0 auto;padding:48px 24px}.portfolio-cover{padding:48px 0 32px;border-bottom:2px solid var(--forest)}.portfolio-label{margin:0 0 8px;color:var(--forest);font-size:14px;font-weight:700}.portfolio-cover h1{margin:0 0 16px;color:var(--ink);font-family:Batang,Georgia,serif;font-size:40px;line-height:1.25;letter-spacing:0}.portfolio-project-title{margin:0 0 16px;color:var(--deep);font-size:18px;font-weight:700}.portfolio-meta{display:flex;flex-wrap:wrap;gap:8px 16px;margin:0;color:var(--muted);font-size:14px}.portfolio-note{margin:24px 0 0;color:var(--body)}.portfolio-toc{display:grid;gap:8px;margin:24px 0 48px;padding:0;list-style-position:inside;color:var(--deep);font-weight:700}.portfolio-section{padding:32px 0;border-top:1px solid var(--border)}.portfolio-section>header{display:flex;gap:12px;align-items:baseline;margin-bottom:24px}.portfolio-section>header span{color:var(--forest);font-weight:800}.portfolio-section h2{margin:0;color:var(--ink);font-family:Batang,Georgia,serif;font-size:24px}.portfolio-item{padding:0 0 24px;margin:0 0 24px;border-bottom:1px solid var(--border)}.portfolio-item header{display:flex;justify-content:space-between;gap:16px;align-items:baseline;margin-bottom:8px}.portfolio-item h3{margin:0;color:var(--deep);font-size:18px}.portfolio-item time{flex:0 0 auto;color:var(--muted);font-size:12px}.portfolio-answer{white-space:pre-wrap;color:var(--body);overflow-wrap:anywhere}.portfolio-answer.is-prompt{padding:16px;border:1px solid var(--border);border-radius:8px;background:var(--white);font-family:Consolas,"Malgun Gothic","Apple SD Gothic Neo",monospace;font-size:14px;line-height:1.65;word-break:keep-all}.portfolio-links{display:grid;gap:8px;margin:16px 0 0;padding:0;list-style:none}.portfolio-links li{display:grid;gap:2px;padding:12px;border-left:4px solid var(--forest);background:var(--sage)}.portfolio-links a{color:var(--deep);font-weight:700}.portfolio-links span{font-size:14px;overflow-wrap:anywhere;word-break:break-word}.portfolio-figure{margin:16px 0 0;break-inside:avoid}.portfolio-figure img{display:block;max-width:100%;max-height:180mm;margin:0 auto;border:1px solid var(--border);border-radius:8px}.portfolio-figure figcaption{margin-top:8px;color:var(--muted);font-size:12px;text-align:center}.portfolio-figure.is-missing div{padding:24px;border:1px dashed var(--border);border-radius:8px;background:var(--sage);color:var(--muted);text-align:center}.portfolio-empty{color:var(--muted)}@media(max-width:480px){main{padding:32px 16px}.portfolio-cover h1{font-size:28px}.portfolio-item header{display:block}.portfolio-toc{margin-bottom:32px}}@page{size:A4;margin:14mm}@media print{html{background:#fff}.portfolio-section>header,.portfolio-item header{break-after:avoid}body{background:#fff;color:#000;font-size:11pt}main{width:auto;padding:0}.portfolio-cover,.portfolio-section>header,.portfolio-item header,.portfolio-figure,.portfolio-links li{break-inside:avoid}.portfolio-answer.is-prompt{break-inside:auto}}`;
}

export function renderBookPortfolioHtml(model) {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="${escapeAttr(CSP)}">
  <title>${escapeHtml(model.className || "차시")} · ${escapeHtml(model.student)} 보고서</title>
  <style>${renderCss()}</style>
</head>
<body>
  <main>
    <section class="portfolio-cover">
      <p class="portfolio-label">교내용 · 학생별 차시 보고서</p>
      <h1>${escapeHtml(model.className || "차시")} 보고서</h1>
      <p class="portfolio-project-title">${escapeHtml(model.title)}</p>
      <p class="portfolio-meta"><span>${escapeHtml(model.student)}</span><span>${escapeHtml(model.school)}</span><span>${escapeHtml(model.className)}</span><time datetime="${escapeAttr(model.generatedAt)}">${escapeHtml(displayDate(model.generatedAt))}</time></p>
      <p class="portfolio-note">이 보고서는 이 차시의 모든 STEP에서 학생이 저장한 답변, 링크, 캡처로 자동 구성되었습니다.</p>
    </section>
    ${renderToc(model.sections ?? [])}
    ${renderSections(model.sections ?? [])}
  </main>
</body>
</html>`;
}

export function portfolioFilename(model) {
  const base = `차시보고서-${model?.className || "차시"}-${model?.student || "학생"}-${model?.title || "프로젝트"}`
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return `${base.slice(0, 115)}.html`;
}
