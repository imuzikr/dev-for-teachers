# Code Formatting Browser Regression

Use a local development server only. Temporarily expose `tests/fixtures/CodeFormatPage.jsx` through `app/qa-code/page.jsx` with:

```jsx
export { default } from "@/tests/fixtures/CodeFormatPage";
```

Call the default export of `tests/codeFormatting.browser.mjs` with a Playwright Chromium page and the server origin. It checks code entry, line breaks, exiting the block, exact clipboard text, template substitution, checklist preservation, permission failure/retry, and viewport overflow at 375/768/1280 pixels. The browser context must support clipboard permissions. Windows clipboard line endings are normalized in assertions.

Remove the temporary route before building or deploying. This fixture has no backend writes or authentication dependencies.

Student and template previews must hide the code body and expose a full-width copy row. The teacher preview must retain the expanded code. The suite verifies these role-specific states without changing the stored HTML.

The visible code-exit command must move to a regular paragraph and become disabled outside code. Code-format toggling and Ctrl/Cmd+Enter share the exit path. When code is nested in a list, exit after the containing list so creating a new checklist cannot toggle off the original checklist.
