# M12–M15 qualification execution

## Pull requests: one independent suite per milestone

`.github/workflows/m12-m15-pr.yml` runs seven parallel matrix jobs and a fail-closed summary:

| Job | Nodes | Commands | Coverage |
| --- | --- | --- | --- |
| M12 | 20, 24 | `npm run test:m12`, `node --test test/ci-pr-coverage.test.mjs` | Original regression suite, M10/M11 qualifications and boundaries, fixture tree, M12 boundary, FSDB packaging |
| M13 delta | 20, 24 | `npm run test:m13:pr` | Clean build of the desktop dependency stack; web qualification including Chromium, M13 boundary and renderer pack; **not** M12 again |
| M14 delta | 20, 24 | `npm run test:m14:pr` | Clean M14 build, projection, map and example tests, M14 boundary/vertical and map pack; **not** M12/M13 again |
| M15 delta | 24 | `npm run test:m15:pr` under `xvfb-run` | Clean M15 build, Desktop and frozen Hostra E2E; **not** M12/M13/M14 again |
| Summary | n/a | `needs: [m12, m13, m14, m15]`, `if: always()` | Fails if **any** constituent job fails, is skipped or cancelled; there is no `continue-on-error` |

M13, M14 and M15 run their own clean builds because GitHub Actions jobs do not share a filesystem; no unverified cross-job artifact sharing is assumed. Browser/Hostra setup and Node versions are unchanged. Each job still uploads a report even after test failure. The original M15 `--test-concurrency=1` is preserved for Electron isolation. The PR workflow cancels superseded runs of **the same PR only**.

The M12–M15 PR suite remains complete as a **union** of tests, not as four independent full-closure test executions. A new invariant test (`test/ci-pr-coverage.test.mjs`) checks the stage suffixes, exact Node matrices, workflows, Hostra pin, and summary's failure propagation to prevent silent coverage erosion.

## Full canonical qualifications

`.github/workflows/m12.yml` through `m15.yml` still execute the unchanged nested qualification contract on `push` to `main` and `workflow_dispatch` (M12/M13/M14: Node 20 and 24; M15: Node 24). The public `npm run test:m12`, `test:m13`, `test:m14`, `test:m15` entry points preserve the M12→M13→M14→M15 dependency chain, with M14's exclusive suffix factored into `test:m14:pr`. M15 no longer invokes `build:m15` a second time after M14 has already built the same workspace. Manual/release consumers of the canonical entry points are not changed to the PR-only alternatives.

**Required-check migration:** if branch protection or a ruleset requires any old `M12 Content qualification / Node ...` through `M15 Desktop full E2E qualification / Node ...` PR contexts, replace those PR requirements with the `M12-M15 PR qualification / M12-M15 PR qualification` summary job **as part of enabling this change**. Keep any other repository checks intact. A workflow summary cannot enforce merging on an unprotected branch by itself: a repository administrator must configure the required status check. Do not delete an existing check requirement without adding its replacement.

## Validation and measurement

Run `node --test test/ci-pr-coverage.test.mjs` without game assets. The new workflow must complete successfully on its exact HEAD before declaring it qualified. Compare the actual Actions wall time, runner-minutes and per-job duration against the prior PR runs before publishing an acceleration claim. The old configuration executes M12 7 times, M13 5 times, M14 3 times and M15 once across the four milestone workflows; the PR workflow performs M12 twice, M13 twice, M14 twice and M15 once. These are counts inferred from the scripts and matrices, **not** a measured speedup. Full main/dispatch qualification is intentionally unchanged apart from removal of a redundant M15 build.
