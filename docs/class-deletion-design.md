# Class Deletion Contract

Status: server implementation in progress; production deployment is not enabled.
Production deletion is not authorized by this document.

## Delete

- `classes/{classId}` and every descendant, including attendanceRecords,
  seatLayouts, groupAssignments and questionSignals.
- Documents selected by exact classId in studyBoards, bookActivities,
  bookResources, bookConfirmations, bookHelpNotes, memberships, presence,
  studentNotes, rewards and kwl, including descendants of each selected document.
- The class project at `bookProjects/{classId}` and any additional project
  documents whose classId matches. Retain projects owned by other classes.
- `broadcasts/{classId}` and any records selected by exact classId.
- `classJoinSecrets/{classId}`, classJoinLookup records owned by the class,
  and classJoinClaims whose current classId still matches when deleted.
- Storage objects no longer referenced by retained data. A class-prefixed path
  alone is not proof of exclusive ownership: project export can retain URLs.

## Preserve

- Other classes and all their records, including a claim or lookup reassigned
  to another class before the deletion transaction commits.
- User profiles and Firebase Authentication accounts.
- Teacher-owned lessons and shared questions, answers, keywords and notices.
- Student notes without the target classId and shared image objects.
- Externally hosted images. Never derive an arbitrary deletion target from a URL.

## Execution Requirements

1. Verify a Firebase ID token on the server and compare its uid with
   `system/admin.uid`. Do not trust browser role overrides or request-body roles.
2. Require an archived class and explicit deletion confirmation. Reserve a
   durable deletion job and block mutations/restoration while it is running,
   including administrative writes through Firestore rules and app endpoints.
3. Enumerate data and image references before removing metadata. Persist the
   bounded work manifest so network failure or server timeout can be resumed.
4. Delete descendants before their parents with bounded batches. Do not rely on
   a parent document delete to cascade. Keep the class tombstone until verified.
5. Resolve image sharing before removal. Retain shared objects with a later
   garbage-collection record. Prevent new
   references racing with garbage collection. Never report full image deletion
   while shared references remain unresolved.
6. Make each stage idempotent. Missing documents/objects are successful no-ops;
   permission, transport and reference-scan failures are not success.
7. Finish only after a residual-data check. Keep minimal job status without
   student content, raw join codes or download-token URLs in logs.

## Verification Before Release

- Restore tests/rules/deleteClass.test.mjs without weakening its assertions.
- Cover all collection families above, unknown nested subcollections, more than
  one batch, missing parents, repeat execution and interrupted-job recovery.
- Prove other-class data, teacher lessons and shared images survive.
- Test unauthenticated and non-admin requests, active-class refusal, concurrent
  restore/edit/copy attempts and reassigned claims/lookups.
- Use demo-project Firestore and Storage emulators only. No live purge tests.
- Verify the real admin deletion UI reports pending, failed and completed jobs
  accurately; no success toast merely because a job was accepted.

## Deployment Decision

The same-origin Next.js endpoint is `/api/admin/classes/{classId}/deletion`.
It uses firebase-admin only on the server. POST creates or advances a durable
job, and GET returns administrator-only status. Client requests advance bounded
chunks until completion. A closed browser does not discard the job; retry the
same class deletion to resume. This is not an autonomous background scheduler.

The runtime is disabled unless `FIREBASE_CLASS_DELETION_ENABLED=true`. Do not
enable it until matching Firestore and Storage rules are published and server
credentials configured. See `docs/class-deletion-operations.md` for release and
recovery instructions. No production purge is part of implementation testing.

## Maintenance and Image Retention

`system/classDeletionLock` blocks all client writes, including administrative
writes, while deletion is active. Reads retain their existing permissions.
Run deletion only outside student use. Do not run migrations, imports, Firebase
console edits, or other Admin SDK writers concurrently: they bypass rules and
cannot be made atomic with Storage deletion. Snapshot consistency checks detect
changes before file deletion but are not a lock on out-of-band privileged tools.

Jobs enumerate the database before deleting class-owned documents, then verify
residual data and retained-reference snapshots before deleting files. Storage
deletes use generation preconditions. External URLs and other classes' prefixes
are not deletion targets. Shared or unrecognized object names are retained and
recorded in `classStorageRetentions`; completion reports the retained count
instead of claiming every image was removed. There is no automatic garbage
collector for these retention records in this release.

The engine uses SDK `listDocuments()` to discover missing parent documents.
Writes and document reads are chunked, but enumerating one extremely large
collection can exceed a server request budget. Repeated timeouts at the same
collection require operator attention, not a success status.

Bucket versioning, soft-delete retention and database backups have independent
retention policies. Application deletion does not promise immediate erasure of
backup or historical object versions.

## Follow-up Cleanup

Only after deletion behavior is covered by regression tests: inventory static
and dynamic imports, remove confirmed unreachable source files, and update stale
development documentation. Do not assume the reported count of 18 is correct.
The explicit /board and /report 404 routes can remain until route behavior is
locked by tests. Correct CLAUDE.md's obsolete /admin description.
