# Code Formatting Browser Regression

Use a local development server only. Temporarily expose `tests/fixtures/CodeFormatPage.jsx` through `app/qa-code/page.jsx` with:

```jsx
export { default } from "@/tests/fixtures/CodeFormatPage";
```

Call the default export of `tests/codeFormatting.browser.mjs` with a Playwright Chromium page and the server origin. It checks code entry, line breaks, exiting the block, exact clipboard text, template substitution, checklist preservation, permission failure/retry, and viewport overflow at 375/768/1280 pixels. The browser context must support clipboard permissions. Windows clipboard line endings are normalized in assertions.

Remove the temporary route before building or deploying. This fixture has no backend writes or authentication dependencies.
