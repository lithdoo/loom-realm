# Session Events v1 exact-subject qualification

> Evidence date: 2026-10-15
>
> Executable / qualification-input subject: `da2ce5cbe963bb63c27604d6be15ff726812638b`
>
> Result: **Qualified**

This ledger records evidence for the exact implementation commit above. The later documentation-only qualification-signature commit does not change executable behavior or qualification inputs and does not transfer this result to future behavior or qualification-input changes. The previously qualified `5722ce56c7d9722e695ebd2e211340442acb15da` subject is historical only.

## Environment

```text
OS: Windows 10.0.26300, x64
Node.js: v24.19.0
npm: 11.17.0
Browser: Playwright 1.63.0, repository-managed Chromium 153.0.8010.12
```

## Executed gates

All commands below completed with exit code 0 against the exact subject commit.

```text
npm run test:session-events:qualification
  build:session-events-stack: PASS
  Node logical/integration/Hostra qualification: 118 pass, 1 platform skip, 0 fail
  real Chromium PWA qualification: 15 pass, 0 skip, 0 fail

npm run test:session-events:packages
  Session Events, Subsystem, Main, Hostra package suites: PASS
  PWA qualification build and unit suite: 27 pass, 0 fail

npm run test:regression
  all 17 affected workspaces: PASS
```

The single Node qualification skip is the existing POSIX-only Hostra force-termination case on Windows. Hostra Session Events child-process/WebSocket tests ran and passed; no Session Events assertion was skipped.

Additional release checks on the same implementation tree:

```text
npm pack -w @loomrealm/session-events --dry-run
node --test test/ci-architecture.test.mjs
npm run docs:check-links
npm run docs:build
git diff --check
```

## Covered subject

Evidence includes the author surface and required `SubsystemScope.events`, validation and detachment, exact-channel routing, source derivation, publish dispatch evidence and `OUTCOME_UNKNOWN`, serial/bounded subscription delivery, close and terminal reasons, explicit remote subscription retirement, request/response correlation, logical-client binding replacement/currentness fencing, Runtime and Hub lifetimes, registration-lifetime Main fatal latching, dedicated Hostra WebSocket realization, bounded generation-based PWA MessagePort provisioning/replacement across 1000+ cycles, real child-process and Dedicated Worker boundaries, and Desktop/PWA product equivalence.

Architecture review found no business truth in the Hub, no duplicated Main authority, no physical identity exposed as logical identity, no Events multiplexing into Control/Data/State, no hidden retry/replay or silent healthy drop, no unbounded queue/Promise accumulation, no stale-binding currentness bypass, no unintended business-facing implementation ABI, and no known contract/implementation divergence.

Known Session Events v1 implementation/qualification gaps: none.
