# Checklist Confirmation Browser Tests

Temporarily mount the local fixture at `app/qa-confirm/page.jsx`:

```jsx
export { default } from "@/tests/fixtures/ConfirmModalPage";
```

Run the default functions in `confirmModal.browser.mjs` and `incompleteChecklist.browser.mjs` with a Playwright page and the local server origin. The fixture uses the real checklist hook and detail component with an in-memory save callback, without production data writes.

Verify partial checklists are rejected at the hook and UI, warning copy/line break, close-button dismissal preserving content and checkbox values without confirming, full-check completion, and panel versus enlarged modal close behavior. Existing non-checklist success/failure behavior is covered separately by `confirmModal.browser.mjs`.

Remove the temporary route before a production build.
