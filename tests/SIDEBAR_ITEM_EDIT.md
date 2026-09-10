# Sidebar item editing

Temporarily mount `tests/fixtures/SidebarItemEditPage.jsx` at `app/qa-item-edit/page.jsx`:

```jsx
export { default } from "@/tests/fixtures/SidebarItemEditPage";
```

Run `sidebarItemEdit.browser.mjs` with a Playwright page and local server origin.
It uses the real project panel and item modal with in-memory saving, tests both
pencil commands, scoped title/content/URL saves, sibling/order preservation,
failed-save draft retention, cancellation, and the separate Step editor command.
Remove the temporary route before building or deploying.
