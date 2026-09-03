# M7 Renderer Control Qualification Record

> Status: **Qualified**
> Date: 2026-09-03
> Evidence source: [`M7_05_QUALIFICATION_CLOSURE.md`](https://github.com/lithdoo/loom-realm/blob/main/M7_05_QUALIFICATION_CLOSURE.md)

## Qualified implementation

- `@loomrealm/renderer-control`: exact v1 model/validation, asymmetric peers, exact hello preparation, lazy initial handoff, terminal first-wins, retirement, and `0..1 inFlight + 0..1 pendingLatest` publication.
- `@loomrealm/platform-ports`: direct `OpaqueMaterialGenerator` migration and optional `RendererControlBinding` candidate-slot contract.
- `@loomrealm/main`: Session identity/revision, pure committed authority projection, optional bounded candidate loop, protocol-owned negotiation, atomic hello/current switch, replacement identity safety, and Session-terminal retirement.
- `@loomrealm/renderer`: atomic `{peer,snapshot}|null` holder with whole-Snapshot replacement and stale-peer identity protection.
- Deterministic production-path vertical using `RendererControlBinding` and Foundation `MemoryCarrier` without authority bypass.

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
