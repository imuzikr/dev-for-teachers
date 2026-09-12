# Class Deletion Operations

## Browser Administrator Deletion

Class deletion uses the existing Firebase browser login. No Netlify server
credentials, service-account key, or deletion enable flag is required.
The registered administrator is identified by `system/admin.uid`, not by a
role supplied by the browser. The former server endpoint returns HTTP 410
and cannot execute a deletion, even when old server environment variables exist.

## Publishing

Publish the current Firestore AND Storage rules, then deploy the updated app.
The earlier Firestore-only clipboard rules are not the final rules for this
implementation: archived attendance cleanup and Storage listing/deletion also
need the new permissions. Do not publish a public read/write rule.

No production rules, production data, or credentials are changed by local tests.

## Operation

Archive the class before deleting it. Keep the deletion window open and do not
edit or copy class content in another tab during deletion. The workflow assumes
the application's single-administrator use; it is not a multi-operator job queue.

The browser reads the known application collections, checks for shared image
references, deletes child records in bounded batches, then removes exclusive
class-owned images. The class document is removed last. Other class data,
user accounts, and shared files are retained.

## Failure and Scope

A failure is reported rather than treated as completion. Keep the archived class
and retry the same deletion. Already removed records/files are handled
idempotently. Closing the browser stops work; there is no background worker.
Deletion is not atomic and has no rollback.

Only the application's known collection/subcollection schema is covered.
Arbitrary manually added collections or unknown nested paths cannot be
discovered by the browser SDK. Unknown file shapes are retained conservatively.
Do not run external Admin SDK scripts or console edits at the same time.
An unfinished legacy server lock is not automatically bypassed.

Storage soft-delete policies, historical object versions, and backups have
their own retention periods. This workflow does not erase retained history.

## Local Verification

Use demo-only Firestore and Storage emulators. Browser deletion integration is
in `tests/rules/browserClassDeletion.test.mjs`; it exercises the actual modular
Firebase browser SDK under authenticated security rules, including nested
records, multiple batches, and exclusive/shared Storage images.
The disabled legacy endpoint is covered by
`tests/classDeletion/retiredRoute.test.mjs`.
