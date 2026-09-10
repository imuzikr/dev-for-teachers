export default async function verifyProgressColors(page, baseUrl = "http://localhost:3047") {
  await page.goto(`${baseUrl}/qa-progress-colors`);
  await page.getByRole("dialog").waitFor();
  const result = await page.evaluate(() => {
    const headers = [...document.querySelectorAll("thead th")].slice(1);
    const rows = [...document.querySelectorAll("tbody tr")];
    const sample = rows[0].querySelector(".book-score-cell");
    const checkedFill = getComputedStyle(sample).backgroundColor;
    const checkedWidth = sample.getBoundingClientRect().width;
    sample.classList.remove("is-filled");
    const stableFillAndSize = checkedFill === getComputedStyle(sample).backgroundColor && checkedWidth === sample.getBoundingClientRect().width;
    sample.classList.add("is-filled");
    return {
      stableFillAndSize,
      colors: headers.map((th) => getComputedStyle(th).getPropertyValue("--student-progress-color").trim()),
      firstFill: getComputedStyle(rows[0].querySelector("td span")).backgroundColor,
      checkedBorder: getComputedStyle(rows[0].querySelector("td span")).borderTopWidth,
      checkedDot: getComputedStyle(rows[0].querySelector("td span"), "::after").content,
      pendingBorder: getComputedStyle(rows[0].querySelectorAll("td")[2].querySelector(".book-score-cell")).borderTopWidth,
      pendingFill: getComputedStyle(rows[0].querySelectorAll("td")[2].querySelector(".book-score-cell")).backgroundColor,
      locked: getComputedStyle(rows[2].querySelector("td span")).backgroundImage,
      dots: document.querySelectorAll(".book-score-latest").length,
      matchingColumns: rows.every((row) => [...row.querySelectorAll("td")].every((td, i) => getComputedStyle(td).getPropertyValue("--student-progress-color") === getComputedStyle(headers[i]).getPropertyValue("--student-progress-color"))),
    };
  });
  if (result.colors.length !== 100 || new Set(result.colors).size !== 10 || result.colors[0] !== "#bb6d52" || result.colors[10] !== result.colors[0]) throw new Error("Shared palette mapping failed");
  if (!result.stableFillAndSize || !result.matchingColumns || !result.firstFill.includes("0.14") || result.checkedBorder !== "2px" || result.pendingBorder !== "1px" || result.checkedDot === "none") throw new Error("Confirmed border/dot or preserved color failed");
  if (!result.locked.includes("repeating-linear-gradient") || result.dots !== 67) throw new Error("Locked or latest completion indicator changed");
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const scroll = page.getByRole("region", { name: "Step별 학생 진행률" });
    await scroll.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
    if (!await page.locator("thead th").last().isVisible()) throw new Error("Last student inaccessible");
    if (!await page.getByRole("button", { name: "닫기", exact: true }).isVisible()) throw new Error("Close control missing");
  }
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  return { passed: true, ...result };
}
