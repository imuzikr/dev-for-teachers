# Help Sections Browser QA

`helpSections.browser.mjs` exports a Playwright scenario, like the other browser
scenarios in this directory. It requires a development-only fixture at
`/qa-help-sections`; the fixture is deliberately not a production route.

Run only in a disposable local checkout, never against a deployed site:

1. Install the project's existing dependencies and provide Playwright with Chrome.
2. Copy `tests/fixtures/HelpSectionsPage.jsx` to `app/qa-help-sections/page.jsx`.
3. Temporarily set `isFirebaseConfigured` to `false` in `lib/firebase.js` so the
   fixture uses the real help-note service's in-memory backend, not production.
4. Start `next dev` on an unused port.
5. Import `verifyHelpSections` from `tests/helpSections.browser.mjs`, create a
   Playwright page, and await `verifyHelpSections(page, baseUrl)`.
6. Close the browser and development server. Remove the temporary route and
   restore the Firebase configuration before building or committing.

The scenario covers section creation, editing, deletion, validation and retry,
sibling preservation, new-note sections, read-only student views, modal focus,
and screenshots at 375, 768, and 1280 pixels.

Service tests run independently with:

```sh
node --experimental-vm-modules --test tests/bookHelpNotes.test.mjs
```

Firestore rules tests run from `tests/rules` with:

```sh
npx firebase emulators:exec --only firestore --project demo-rules-test "node --test bookHelpNotes.test.mjs"
```
