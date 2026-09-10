export default async function verifyStudentPanelLayout(page, baseUrl = "http://localhost:3039") {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`${baseUrl}/qa-panel`);
  await page.getByRole("button", { name: "활동 열기", exact: true }).click();
  await page.locator(".rich-code-preview").waitFor();
  const results = [];
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 960 });
    await page.waitForTimeout(700);
    const sizes = await page.evaluate(() => [
      ".student-activity-side", ".student-activity-panel-content", ".student-activity-detail",
      ".book-personal-expand-body", ".book-personal-expand-content", ".rich-code-copy-row", ".book-item-image-gallery",
    ].map((selector) => {
      const element = document.querySelector(selector);
      return { selector, width: element.clientWidth, scroll: element.scrollWidth };
    }));
    if (sizes.some(({ width, scroll }) => scroll > width + 1)) throw new Error(JSON.stringify({ width, sizes }));
    const image = page.locator(".book-item-image-gallery img");
    if (!await image.evaluate((img) => img.complete && img.naturalWidth > 0)) throw new Error("Image failed to load");
    results.push({ width, sizes });
  }
  await page.getByRole("button", { name: "코드 복사", exact: true }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  if (copied !== "메모에 입력된 글자의 수가 5글자 이상이면 저장하도록 작성해 주세요. ".repeat(8)) throw new Error("Full code copy changed");
  await page.getByRole("button", { name: "이미지 1 크게 보기" }).click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "확대", exact: true }).click();
  await page.getByRole("dialog", { name: "MCP 설치하기" }).waitFor();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.locator(".student-activity-detail").waitFor();
  return { passed: true, results };
}
