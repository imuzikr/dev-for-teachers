# Overall progress colors

Temporarily mount `tests/fixtures/ProgressColorsPage.jsx` at `app/qa-progress-colors/page.jsx`:

```jsx
export { default } from "@/tests/fixtures/ProgressColorsPage";
```

Run `progressColors.browser.mjs` with a Playwright page and the local origin.
It checks the 100-student shared palette, column consistency, confirmed/pending
colors, neutral locked hatching, latest completion markers, scroll and close.
Remove the temporary route before building or deploying.
