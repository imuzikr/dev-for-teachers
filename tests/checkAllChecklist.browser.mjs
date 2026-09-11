import assert from "node:assert/strict";

export default async function verifyCheckAllChecklist(page, baseUrl) {
  for (const panel of [false, true]) {
    for (const kind of ["activity", "resource"]) {
      await page.goto(`${baseUrl}/qa-confirm`);
      await page.getByRole("combobox", { name: "종류" }).selectOption(kind);
      if (panel) await page.getByLabel("패널", { exact: true }).check();
      await page.getByLabel("할 일 사용").check();
      await page.getByRole("button", { name: "열기", exact: true }).click();
      const detail = page.locator(panel ? ".student-activity-detail" : ".book-personal-expand-modal");
      const checks = detail.getByRole("checkbox");
      const bulk = detail.getByRole("button", { name: "한 번에 체크하기", exact: true });
      await checks.first().check();
      await bulk.click();
      assert.deepEqual(await checks.evaluateAll((inputs) => inputs.map((input) => input.checked)), [true, true]);
      assert.equal(await page.locator("output").textContent(), "미확인");
      assert(await bulk.isDisabled());
      assert(await detail.isVisible());
      await checks.last().uncheck();
      assert(await bulk.isEnabled());
      await bulk.click();
      if (kind === "activity") {
        for (const width of [375, 768, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          await bulk.scrollIntoViewIfNeeded();
          const bulkBox = await bulk.boundingBox();
          const confirmBox = await detail.getByRole("button", { name: "확인", exact: true }).boundingBox();
          assert(bulkBox.y + bulkBox.height <= confirmBox.y);
          assert(await bulk.evaluate((button) => button.scrollWidth <= button.clientWidth));
          await page.screenshot({ path: `qa-check-all-${panel ? "panel" : "modal"}-${width}.png`, fullPage: true });
        }
      }
      await detail.getByRole("button", { name: "확인", exact: true }).click();
      await page.getByText("확인 완료", { exact: true }).waitFor();
      if (!panel) await detail.waitFor({ state: "detached" });
      else assert(await detail.isVisible());
    }
  }
  await page.goto(`${baseUrl}/qa-confirm`);
  await page.getByRole("button", { name: "열기", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "한 번에 체크하기", exact: true }).count(), 0);
  return "Bulk checks remain unconfirmed until Confirm; activity/resource, modal/panel, repeat, empty and responsive checks passed";
}
