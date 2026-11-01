# Kartoon p01 verification

Date: 2026-11-01
Confirmed project: p01
Confirmed repository: https://github.com/catdew1403-lang/cartoon.git
Confirmed branch: main

## Scope

Targeted regression/integration of the approved fixes, not an assertion that all possible failures have been eliminated. Existing user data was preserved. No schema migrations were performed. SQL inspections first verified SELECT DATABASE() matched db_std10_p01.

## Latest local results

- npm.cmd run check: passed for server.js and public/index.js.
- Editor diagnostics: no errors in the changed application files.
- npm.cmd audit --omit=dev --package-lock=false --json: zero reported vulnerabilities. This is not the platform's OSV/Semgrep/Gitleaks gate.
- GET /api/health: status ok, project p01, database ready, schema ready. Required columns across all 11 tables checked.
- Real browser registration created an isolated QA writer, user 14.
- Browser -> API -> MariaDB: created series 7 with an original generated cover; replaced the cover with explicit old-image deletion; old URL returned 404.
- Created chapter 6, staged two original generated images, cancelled metadata refresh, and verified both staged pages survived.
- Uploaded both pages, reversed their order, saved, refreshed and published. DB confirmed page IDs 8,7 at orders 1,2; image byte counts matched files.
- Found and fixed a real reader boundary regression that could save the preceding page after resume. Latest regression read page 2, refreshed, resumed, left for profile, and verified page 2 through both API and a direct DB read.
- Delayed a real profile PUT response after the server processed it, navigated to Studio, then released the response. Studio remained active; the new pen name persisted in DB.
- Created temporary QA draft chapter 7 with an image. Deleted its page and draft through the UI. Refresh, DB and filesystem confirmed removal of this test data only.
- Reader layouts checked at widths 390 and 1440: no horizontal overflow, both page images decoded.
- Read-only image audit: 10 tracked images; zero missing files, zero size mismatches, zero untracked files.

## Isolated regressions

- Frontend VM/DOM regressions: 17 groups and 5 upload-payload cases passed before the additional real-reader fix.
- Backend component regressions covered health schema rejection, batched studio mapping, trusted proxy identity and pre-buffer upload admission.
- Follow-up production-code extraction with mocked DB/filesystem: 26 tests passed for partial-write cleanup, EEXIST safety, sync/close failures, uncertain COMMIT retention and IPv6 normalization/config rejection.
- Isolated tests are not equivalent to browser/API/DB integration. They did not simulate real power loss or database failover.

## Deployment status and limits

- The updated local backend runs at http://localhost:31101/.
- No deployment of this revision, Git push, platform scan-gate pass or server URL verification has been completed.
- VS Code user MCP configuration was created outside the repository. The owner must Start/Trust classroom-student and enter the website password in the secret prompt. Classroom tools are not yet visible in this chat.
- Before deployment, verify current project listing/GitHub link, managed environment revision, actual ingress proxy/header behavior, and persistent image storage on the target. Do not copy local DB network settings over managed runtime values.
- Empty TRUSTED_PROXY_IPS remains fail-closed; do not guess ingress addresses.
- File and SQL transactions cannot be made atomic together. An uncertain COMMIT retains its possible image rather than deleting potentially committed content; crash recovery still requires owner verification.
- QA user 14, series 7 and published chapter 6 remain as evidence. No preexisting user records were removed.
- No guarantee of error-free operation under every network, resource or concurrency failure is made.

## Soft Pastel / Soft Dark UI regression (2026-11-01)

- UI-only scope: updated theme tokens, theme-color metadata and toggle accessibility. Backend, payloads and SQL unchanged; prior CRUD integration was not repeated.
- Browser checks on Discover at widths 320, 390 and 1440 verified both exact six-color palettes, card surfaces, metadata, stored preference and pressed state. Expected no horizontal overflow; actual none across all six combinations.
- Studio at widths 390 and 1440 verified both themes' panel, input, button background and text colors; no horizontal overflow. No form was submitted.
- Real toggle clicks, keyboard Enter and preference restoration after reload passed. No page errors captured during the successful regression run.
- Day desktop and night mobile screenshots visually inspected. The older hidden browser tab did not process interaction reliably; successful checks used a newly opened active tab instead.
- npm.cmd run check passed; editor diagnostics reported no errors for public/style.css, public/index.html and public/index.js.
- Theme changes are local only and have not been deployed.

## Broader real-browser acceptance (2026-11-01)

Stage: targeted UI acceptance after the theme-only change. Real local application/backend responses were used, not mocked responses. Prior verified CRUD/storage tests above were not rerun because backend, payloads and schema did not change. No SQL was run in this round.

Scenarios and actual outcomes:

- Discover/search: own QA title returned exactly one matching card; a unique nonexistent query displayed the no-results state as expected.
- Ranking: navigation loaded the ranking heading and real catalog cards.
- Series: own series 7 loaded its cover (image decoded), contents and reporting form. Empty report submission was blocked by native required validation.
- Reader: own chapter 6 rendered both images and both decoded successfully. Theme switch and return-to-contents worked. Existing reading position was not resumed or deliberately overwritten.
- Writer profile: profile form, bookshelf and reading-history section rendered. Studio loaded the saved own series title and chapter form. Empty chapter creation was blocked by native validation.
- Permissions: writer opening /admin saw the expected denied message; unknown route showed the expected fallback.
- A separate isolated guest context verified login required fields, registration email validity, writer/reader field and consent switching, Studio/profile login gates, bookmark login prompt, and reader show-controls keyboard focus. The owner's authenticated context was not logged out. No registration/login credentials were submitted.
- Initial writer navigation captured zero JavaScript page errors and zero HTTP responses with status >=500.
- Responsive matrix: Discover, series 7, reader 6, profile, Studio, login, registration and denied-admin screen at widths 320, 390, 768 and 1440, in day and night themes: 64 combinations, zero document horizontal-overflow findings and zero already-complete broken-image findings. Reader image decoding was checked separately as above. This is layout coverage, not 64 independent storage tests.

Finding: day-mode muted text #718096 has contrast 4.02:1 on white and 3.76:1 on the solid cream base, below WCAG AA's 4.5:1 threshold for normal-sized text. Decorative gradients were not exhaustively sampled. The requested exact palette was not changed during testing. Primary text/button contrast passed the same numerical threshold in both themes; this does not constitute a full WCAG audit.

Limits: actual admin moderation requires an authorized admin account and was not exercised; real login/logout, bookmark/like persistence and report moderation were not newly verified in this round. Prior creation, image upload, ordering, publishing, profile save, draft deletion and history persistence results remain the earlier DB-backed evidence, not fresh results. No production deployment, real-device browser matrix, load test or platform scan gate was performed.

## Five-feature real integration (2026-11-01, current round)

Stage: targeted local integration of avatar upload, homepage continue reading, public writer profiles/works, derived chapter notifications, and privacy/terms/contact pages. These results are newly executed browser/API/MariaDB tests, distinct from the earlier mocked frontend rendering checks. They are not production acceptance or a full regression of every existing workflow.

### Environment and schema

- Every direct SQL connection first executed SELECT DATABASE() and verified db_std10_p01. Only read-only inspections were executed directly in this round; test writes used real application APIs under newly created QA accounts.
- The parent reported applying users.avatar_image_url VARCHAR(255) NOT NULL DEFAULT ''. The column was independently observed in information_schema; no ALTER, migration file or applied-history changes were made here. Platform migration history is still unknown.
- A temporary attached server loaded the current server.js on 127.0.0.1:31109. PORT/HOST overrides existed only in that process; no managed env or .env values were changed or printed. GET /api/health returned 200 with project p01, database ready and schema ready.
- Browser tests used 127.0.0.1 to isolate cookies from the owner's localhost context. No existing user data was edited. A separate browser-context ownership test could not start because browser storage affinity disallowed context.newPage; the equivalent cross-account API test was then executed using an independent Node HTTP cookie jar.

### New scenarios and actual evidence

- Registration/setup: the real registration form created writer 16 (featureqa1793511711143). Independent API registration created reader 17. Both are newly generated QA identities; no credentials were printed.
- Avatar create/read/update: an original canvas-generated PNG was submitted through the profile upload form. Expected a sanitized, owned image persisted across refresh; actual image decoded at 96 x 96, survived a full reload, and the users.avatar_image_url value matched the images record. A second original image replaced the writer avatar through the same UI and survived another full reload. Current writer avatar: /images/3b12148c-4492-4e6b-81e4-28ce0669282d.webp, 506 bytes, WebP, no EXIF, owner 16; tracked bytes equaled filesystem bytes. Reader avatar upload returned 201 and persisted through a fresh session read; DB confirmed owner 17, WebP, no EXIF, 78 tracked/filesystem bytes.
- Image access/ownership: unauthenticated reads of the writer profile and its published avatar returned 200. Attempting to delete the original own image while referenced returned 409; a different isolated reader attempting to delete it returned 404. Its use as the QA series cover remained intact after avatar replacement. No existing user images were targeted.
- Writer projection: clicking the series writer link opened #/writer/16, decoded the avatar and displayed only the QA writer's published series 8. The real public API returned id, writer_name, avatar_image_url, donation_url, donation_qr_url and works, without email or history. The public projection matched the replacement avatar.
- Notification setup: real authenticated APIs created QA series 8 and chapters 8/9 with original generated page images. Chapter 8 was published before the real UI bookmark action; chapter 9 was initially a draft. Expected no notifications for pre-follow chapters or drafts; actual notification list was empty in both cases.
- Notification publish/read: publishing chapter 9 after bookmarking produced exactly its new-chapter notification. The real notification UI linked to #/read/9. Opening it and scrolling its page caused the reader to persist page 1. A subsequent real API read returned an empty notification list, as expected for the now-read chapter. The notification is cleared by reading history, not a separate seen marker; no push delivery or mark-all-read feature exists.
- Continue reading: after that reader action, the homepage showed the QA series/chapter and page 1, and preserved the entry after full reload. Direct DB reads confirmed reading_history(user_id=16,chapter_id=9,page_order=1), bookmark(user_id=16,series_id=8), and both chapters belonging to series 8 with published_at set.
- Policy/contact navigation: real footer clicks opened privacy, terms and contact at mobile width 320 and updated document titles. Contact explicitly states the absence of a confirmed general contact mailbox/form; it points to the existing reporting workflow rather than pretending to send a message. No new report was submitted.
- Responsive acceptance: seven affected routes (home, own profile, public writer, notifications, privacy, terms, contact) at widths 320, 390 and 1440: final 21 scenarios had zero horizontal-overflow findings. Original checks found narrow writer-name and own-profile-header overflow at 320; fixed the affected flex child sizing/wrapping in public/style.css and added a scoped profile-account hook in public/index.js. Reloaded assets before rerunning; final 21 scenarios passed. A mobile public-writer screenshot was also inspected. The layout-only fix did not alter payloads/storage, so DB workflows were not repeated solely for that CSS change.
- node --check server.js and node --check public/index.js passed; editor Problems reported no errors for those files and public/style.css. git diff --check passed (only normal LF/CRLF working-copy notices).

### Persistence and limits

- QA users 16/17, QA series 8, published chapters 8/9, their images, bookmark and chapter-9 history remain as evidence. No existing records were reset, overwritten or deleted. Successful deletion of unused replacement images, quota exhaustion, animated-image conversion and complete moderation flows were not newly exercised.
- The temporary 31109 helper was stopped after testing. No unrelated process was killed or persistent server replaced.
- The existing 127.0.0.1:31101 server responded to health with 200, but /api/writers/16, /api/continue-reading and /api/notifications all returned 404: it has not loaded these backend routes and requires an owner-controlled restart. Health alone does not establish current-code readiness. The real integration results above apply to the temporary current-code server, not that older runtime.
- No commit, push, deployment, managed-env update, platform scan gate or public route verification was performed. Platform migration history still needs reconciliation by the parent; do not rerun the already-present ALTER blindly.

## Current local runtime follow-up

- Restarted the identified old Node server on port 31101 with the current code after the integration run.
- Fresh probes on 31101: /api/health 200; /api/writers/16 200; unauthenticated /api/continue-reading and /api/notifications 401 as expected.
- Full feature integration evidence above remains from the isolated temporary server on 31109; these follow-up probes verify current route readiness, not a second full E2E run.
- No Git commit, push, or platform Deploy performed for this feature change.

