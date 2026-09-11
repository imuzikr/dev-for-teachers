import assert from "node:assert/strict";

export default async function verifyProgressCompletion(page, baseUrl) {
  await page.goto(`${baseUrl}/qa-progress-colors`);
  const dialog = page.getByRole("dialog");
  const stars = dialog.getByRole("img", { name: "모두 확인 완료", exact: true });
  await dialog.waitFor();
  assert.equal(await stars.count(), 0);
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "모두 확인", exact: true }).click();
  await stars.first().waitFor();
  assert.equal(await stars.count(), 2);
  const counts = dialog.locator(".book-score-row-meta > span:last-child");
  assert.deepEqual(await counts.allTextContents(), ["⭐ 100/100", "⭐ 100/100", "0/100"]);
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const count of await counts.all()) {
      assert(await count.evaluate((element) => element.scrollWidth <= element.clientWidth));
    }
    await page.screenshot({ path: `qa-progress-completion-${width}.png`, fullPage: true });
  }
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "일부 확인", exact: true }).click();
  await dialog.waitFor();
  assert.equal(await stars.count(), 0);
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "참여자 없음", exact: true }).click();
  await dialog.getByText("참여한 학생이 없습니다.").waitFor();
  assert.equal(await stars.count(), 0);
  return "Completion stars: activity, resource, partial, empty and responsive checks passed";
}
