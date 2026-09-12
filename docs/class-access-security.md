# Class Access Security Migration

## Scope

- Only the system administrator can read the raw participation-code documents.
- Participants submit a six-digit code explicitly. Automatic first enrollment and participant-initiated sibling-class enrollment are disabled.
- Archived classes deny participant access to their own records, group cards, and direct/collection-group reads. System administrators retain archive viewing and restoration in the app. Legacy owning-teacher permissions remain in the rules; this change does not expand the app's administrator-only operator role.
- Existing membership identities, projects, responses, and attachments are preserved.

## Document Contract

| Path | Data | Participant access |
| --- | --- | --- |
| `classes/{classId}` | Public metadata, `accessVersion: 2`, explicit `archived`, no `joinCode` | Active version-2 metadata only |
| `classJoinSecrets/{classId}` | `{ joinCode }` | None |
| `classJoinLookup/{submittedCode}` | `{ classId }`, no code field | Exact document lookup only, while that code is current and joining is enabled; no list |
| `classJoinClaims/{uid}` | Validated code submission and timestamp | Own validated writes only; no reads |
| `memberships/{uid}_{classId}` | Membership metadata, `accessVersion: 2`, no code | Own membership in an active class |

The lookup is a code-redemption endpoint, not a public code directory. The request already contains the entered code; its response contains only the class ID. A batch writes a validated private claim and the membership. Rules require a claim from the same request time and validate the active class and current secret again.

## Deploy Together, During Maintenance

Do not publish the new rules alone while assuming the old app will keep working. The old app downloads class codes and uses cross-class membership queries; both are intentionally denied by the new policy.

1. Back up Firestore and pause participant usage. Prepare the new application deployment.
2. Install the existing tooling dependencies with `npm --prefix tests/rules ci` if needed. Authenticate Application Default Credentials for an authorized administrator outside the browser. Never paste service-account keys into client source, chat, or the console rules editor.
3. Review a read-only migration report:

   ```powershell
   node scripts/migrate-class-access.mjs --project dev-for-teachers
   ```

4. Run the migration with an unused, private backup-file path outside the repository:

   ```powershell
   node scripts/migrate-class-access.mjs --project dev-for-teachers --apply --backup C:\PrivateBackups\class-access-before.json
   ```

   The parent directory must already exist. The backup contains private data, including old codes. The script refuses to overwrite it. Each class is migrated transactionally, and membership updates do not resurrect deleted records. A retry uses a new backup path and skips already migrated classes.

   Legacy codes are rotated because they were previously readable. Redistribute the new codes from the administrator interface. Already enrolled users do not need to enroll again.

5. Publish the tested `firestore.rules` and deploy the new app as one maintenance rollout. Do not restore the old client or permissive rules as a workaround for a failed migration.
6. Verify with an administrator and a participant: explicit correct/wrong-code joining, disabled joining, code rotation, archive, denied direct record reads, and administrator restoration. Check the browser for permission errors before ending maintenance.

The repository changes and clipboard operation do not themselves deploy the app, publish Firebase rules, authenticate an administrator, or migrate production data.

## Verification and Limits

- Run Firestore emulator tests with `npm run test:rules` and the migration unit tests with `node --test tests/migrateClassAccess.test.mjs`.
- The existing `tests/rules/deleteClass.test.mjs` imports the absent `functions/purgeClass.js`; the complete default suite cannot pass until that separate server module is restored. It is not part of this migration.
- The live subscription assertion completes, but Firebase leaves test-process handles open in this environment. The verification run uses Node's `--test-force-exit` after completed tests, with `--test-timeout=60000` still enforcing assertion deadlines. This is a test-runner workaround, not a claimed SDK teardown fix.
- The migration script defaults to read-only. Emulator execution requires an explicit `demo-` project ID.
- Six-digit codes are bearer enrollment secrets, not strong passwords. Exact lookup prevents directory enumeration but does not provide server-side rate limiting against repeated guesses. For higher-risk use, add an authenticated, rate-limited server redemption endpoint and App Check.
- Security rules do not erase data already downloaded, screenshots, browser caches, or previously shared Storage download-token URLs. This change controls new Firestore access. Revoking previously shared image links requires a separate Storage-token policy.
- Administrative server SDKs bypass Firestore rules. Their credentials and IAM roles must remain restricted.
