# Capability-driven CI

Repository CI is impact-driven. Milestone workflow sequencing is retired.

## Daily CI

`.github/workflows/ci.yml` is the only PR/main development workflow. It resolves the diff into affected capabilities, then runs only the required evidence lanes:

- Linux / Node 24: canonical package regression, contract regression, affected content checks, publishable-surface packing, CI architecture self-test.
- Node 20 compatibility: one aggregate compatibility lane instead of a Node 20 matrix on every package workflow.
- Browser / Node 24: Web Presentation, Map/RPGMap, Schema Form, PWA and Battle browser qualification share one repository-pinned Chromium installation. Battle changes always require this lane.
- Desktop / frozen Hostra: only changes that can affect the Desktop product run the frozen Hostra/Electron product gate.
- Windows / Node 24: only platform-sensitive changes run Windows authority/launcher checks.
- Documentation: only documentation and documentation-input changes validate/build the site.
- `CI / summary`: fail-closed aggregate. A required job that fails, is cancelled or is skipped fails the aggregate.

The impact resolver is `scripts/ci/impact.mjs`. Unknown non-document paths fail closed to all code capabilities. Global CI/dependency inputs also fan out to all code capabilities.

Battle's browser E2E runs only in the Browser lane, with `LOOMREALM_CHROMIUM_PATH` pinned to Playwright's repository-installed Chromium. Its known asynchronous first-paint race gets one controlled retry; a repeated failure still fails the lane and therefore the summary.

## Full qualification

`.github/workflows/full-qualification.yml` is manual and preserves the expensive evidence that should not execute on every change:

- Linux Node 20 and 24 full capability qualification, including Battle browser qualification on repository-pinned Chromium.
- Windows Node 20 and 24 platform-sensitive qualification.
- frozen Hostra Desktop full profile on Node 24.
- optional pinned official Essentials v21.1 exact-local qualification.

Full qualification remains subject to `doc/30-development/qualification.md` subject/staleness rules. A green workflow is evidence, not an automatic migration of historical qualification to a new behavior or qualification-input subject.

## Legacy command aliases

Historical `test:mXX` package scripts and some historical test filenames remain temporarily as compatibility/local command aliases. Current workflows do not use recursive milestone closure scripts. New CI work must use capability names and must not introduce a new milestone workflow chain.

## CI maintenance rules

- Do not create one workflow per package or product milestone.
- Do not recursively invoke broad aggregate qualification commands.
- Install Chromium at most once per Browser job.
- Browser-backed tests must run in the Browser lane against the repository-pinned Chromium rather than relying on a runner-installed browser.
- Preserve frozen Hostra identity and sandbox requirements.
- Keep Node 20 compatibility and full Windows qualification in the full-qualification surface.
- Keep the impact resolver fail closed.
- Update `test/ci-architecture.test.mjs` whenever the CI architecture intentionally changes.
