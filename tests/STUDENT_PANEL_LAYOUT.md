# Student panel layout regression

Temporarily expose `tests/fixtures/StudentPanelLayoutPage.jsx` at `app/qa-panel/page.jsx`:

```jsx
export { default } from "@/tests/fixtures/StudentPanelLayoutPage";
```

Start Next on an available port and invoke the default export from
`studentPanelLayout.browser.mjs` with a Playwright page and that base URL.
The fixture uses the actual student panel and detail components with a long
checklist code block and a large attached image. It checks panel containment at
375, 768, and 1280px, full clipboard copy, image enlargement, and modal return.
Remove the temporary route before building or deploying.
