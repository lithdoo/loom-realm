# ADR 0038: Render Data Runtime pre-release same-identity correction

> Status: Accepted  
> Date: 2026-10-30  
> Scope: Wire JSON, Renderer Data profiles `/1` and `/3`, Render Update v1, Frame-targeted Presentation Event v1  
> Plan SSOT: [Render Data Runtime Refactor Plan](../30-development/render-data-runtime-refactor-plan.md)

## Context

Issue #133 device profiling showed that ordinary Render updates paid repeated whole-value validation, byte/depth/member accounting, stringify probes and whole-tree work unrelated to the touched node. The same implementation history had turned arbitrary capacity numbers into protocol failure, queue drop and peer-retirement rules.

The project has not reached a compatibility boundary requiring those values to remain externally stable. They are not required for authority, identity, lifecycle, continuity, atomicity or Wire correctness. Retaining them would transfer application schema and scale ownership from Developer/Product to Framework and would preserve the measured hot path.

## Decision

Before first substantive public release, correct the existing identities in place. There is no protocol version bump, migration, feature bit, dual mode or compatibility fallback.

Framework continues to enforce:

- exact plain-JSON Wire representation and exact closed schemas;
- direction, authority, generation, lifecycle, revision and one-shot identity;
- ordered Patch preconditions, reachability, acyclicity, stable tag and atomic commit;
- caller/framework ownership isolation, one reader, single serialized writer and terminal first-wins;
- Event applicability, FIFO/barrier/no-replay and Viewport latest-value semantics.

Framework no longer defines fixed message/depth/member/string/Domain/Node/tree/Patch/data/Interest/Event/queue capacity gates. Removed limits are not replaced by configurable budgets or a new resource-exhaustion error family. `zIndex` is a signed safe integer; revision/baseRevision remain positive safe integers.

Developer/Product retains application schema and resource policy. In particular, Map `VIEW_DATA_GUARD`, tile-band/projection-window policy and product payload optimization remain owned by Map and are not generic protocol limits.

## Runtime realization

- Wire outbound validation and serialization use one strict stack-safe traversal; parse performs only the representation work not guaranteed by `JSON.parse`.
- Async Render author acceptance fuses representability, detach and freeze before success; coalescing precedes final serialization.
- RenderManager and Renderer Store keep per-node/location indexes. Update-only work uses target-to-root COW; structural Patch uses an isolated candidate and one final structural validation.
- DataRuntime, Render publication, Presentation and MessagePort queues use head-index/O(1) drains, transport Promise backpressure and terminal reference release without fixed admission counts.
- Same-generation carrier replacement keeps Domain/Node identity history. Fresh DataAuthority generation resets the wire identity universe and re-exports live business Domains through Registry plus Snapshots. Old Events never migrate.

## Failure ownership

Peer Wire/schema/authority/revision violations are protocol-fatal. Unexpected local candidate clone/index/freeze mechanics failures leave committed state and revision unchanged, propagate their local cause and use the existing Data local-fatal recovery. Developer authoring errors fail only the current API call and do not retire a healthy peer. Presentation business handler failures remain locally contained.

## Consequences and qualification

All observable accept/reject/drop corrections are catalogued in the [Render Data Runtime correction ledger](../30-development/render-data-runtime-refactor-ledger.md). Conformance revisions add historical-threshold, generation, local-failure, deep-stack and backlog fixtures. Current native performance qualification and the Issue #133 diagnostic route are release gates; deleting code alone is not performance evidence.

The correction supersedes capacity-specific wording in ADR 0022, ADR 0025, ADR 0035 and ADR 0037 while preserving their authority/lifecycle and product-boundary decisions.

## Reopen conditions

Reopen only for a demonstrated correctness/security contradiction, a conflict with another current contract, or a real compatibility boundary that requires explicit versioning. Implementation convenience, generic budgeting, future speculation or queue-size preference are insufficient.
