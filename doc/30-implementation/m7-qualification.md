# M7 Renderer Control Qualification Record

> Status: **Closed**
> Date: 2026-09-03
> Evidence source: [`M7_05_QUALIFICATION_CLOSURE.md`](https://github.com/lithdoo/loom-realm/blob/main/M7_05_QUALIFICATION_CLOSURE.md)

Baseline implementation: [`016721b`](https://github.com/lithdoo/loom-realm/commit/016721bfed31f7d64b902619ebf533fd6b03a382). Clean-run CI qualification: [`72e435d`](https://github.com/lithdoo/loom-realm/commit/72e435d38498afc8370249c44daa925145d89594).

## Qualified implementation

- `@loomrealm/renderer-control`: exact v1 model/validation, asymmetric peers, exact hello preparation, lazy initial handoff, terminal first-wins, retirement, and `0..1 inFlight + 0..1 pendingLatest` publication.
- `@loomrealm/platform-ports`: direct `OpaqueMaterialGenerator` migration and optional `RendererControlBinding` candidate-slot contract.
- `@loomrealm/main`: Session identity/revision, pure committed authority projection, optional bounded candidate loop, protocol-owned negotiation, atomic hello/current switch, replacement identity safety, and Session-terminal retirement.
- `@loomrealm/renderer`: atomic `{peer,snapshot}|null` holder with whole-Snapshot replacement and stale-peer identity protection.
- Deterministic production-path vertical using `RendererControlBinding` and Foundation `MemoryCarrier` without authority bypass.
- Main retains only bounded live opaque authority material; retired Renderer token history is not stored.
- The Renderer holder makes its single-attempt precondition executable: concurrent `connect()` on one holder fails fast, while sequential replacement remains atomic.
- Renderer-connected verticals cover root active → `frame.call` → suspended caller/active child → `frame.return` → fresh caller activation, plus Runtime failure → fixed-point unwind → fresh healthy caller activation.
- Representation isolation covers an exact-1-MiB healthy current, an unrepresentable replacement candidate that cannot evict it, and a later unrepresentable current publication that terminalizes only Renderer Control.
- Profile boundary evidence explicitly covers JSON depth 65 and 16,385-member containers.
- The package root exports only frozen consumer types, peer constructors, and exact hello preflight; package-private validation/state-encoding mechanics are not public API.

## Baseline CI evidence

- [Renderer Control conformance](https://github.com/lithdoo/loom-realm/actions/runs/33735973610)
- [Renderer package](https://github.com/lithdoo/loom-realm/actions/runs/33735973455)
- [Main package](https://github.com/lithdoo/loom-realm/actions/runs/33735973718)
- [Hostra cross-platform regression](https://github.com/lithdoo/loom-realm/actions/runs/33735973434)
- [Documentation](https://github.com/lithdoo/loom-realm/actions/runs/33735973454)

The clean-run commit triggered 14 push workflows; all completed successfully.

The subsequent review-closure changes listed above are verified by the qualification commands in the next section; their clean-run status is tracked by the current `main` workflow runs.

## Qualification commands

```text
npm run test:m7
npm run docs:check-links
npm pack --dry-run -w @loomrealm/renderer-control
npm pack --dry-run -w @loomrealm/platform-ports
npm pack --dry-run -w @loomrealm/main
npm pack --dry-run -w @loomrealm/renderer
```

The M1–M6 workspace regression and Hostra Runtime-only E2E remain green after the opaque-material provider migration. Hostra remains Renderer-capability absent; no fake Binding was introduced.

## Deliberately deferred

M7 does not qualify Hostra Renderer WebSocket, PWA Renderer MessagePort, physical stalled-write timeout policy, Main DataAuthority policy/Data Broker, User Input, Render, Content, or cross-platform equivalence. Those remain assigned to later milestones by the frozen delivery plan.
