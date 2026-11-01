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
