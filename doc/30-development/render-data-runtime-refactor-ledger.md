# Render Data Runtime correction ledger

> Status: implementation and qualification ledger  
> Protocol identity: unchanged (`loomrealm.render-update/1`, `loomrealm.renderer-data/1`, `loomrealm.renderer-data/3`, Frame-targeted Presentation Event v1)  
> Correction date: 2026-10-30  
> Design SSOT: [Render Data Runtime Refactor Plan](./render-data-runtime-refactor-plan.md)  
> Decision: [ADR 0038](../decisions/0038-render-data-runtime-pre-release-correction.md)

This is a first-substantive-public-release correction, not a compatibility migration. The final implementation subject is the head SHA of the implementation PR; raw command/results and performance artifacts must name that exact subject.

## Protocol correction inventory

| Surface | Historical observable rule | Corrected observable rule | Preserved invariant | Executable evidence owner |
| --- | --- | --- | --- | --- |
| Wire JSON | Repeated validation/depth/byte scans before stringify | One strict iterative representation+serialization traversal; no inherited `toJSON` | Reject sparse/augmented arrays, accessors, symbols, exotic objects, cycles, non-finite and unsupported values | `packages/wire/test`, Data codec tests |
| Common Data gate | 1 MiB message, depth 64 and capacity preflights could retire peer | Valid application units are not rejected by framework size/depth/member counts | one JSON text unit, exact type/direction, protocol-fatal malformed peer input | `packages/data/test` |
| Render strings/data | fixed identity/tag/attrs/data byte/member/depth/array limits | Unicode-scalar/non-empty rules only where semantic; application scale belongs to Developer | exact schema and Wire representation | `render-codec.test.mjs`, `render-probe-equivalence.test.mjs` |
| `zIndex` | signed int32 | signed safe integer | deterministic zIndex/domainId order | Data/Subsystem/Renderer tests |
| Registry/tree/Patch | Domain 256, Node 16,384, depth 30, ops 4,096 | no framework count/depth cap | uniqueness, stable tag, one-shot identity, ordered preconditions, reachability/acyclicity, atomicity | Render historical-cap fixtures |
| Render author acceptance | validation, clone/freeze and whole-message probe repeated | one iterative acceptance traversal detaches/freezes; coalesce; serialize only emitted final state | caller ownership isolation and synchronous API failure | RenderManager tests |
| RenderManager update | small update could scan/clone whole tree/index | key/location index plus target-to-root COW and small index edits | failed update changes no state/history/publication | RenderManager COW/perf fixture |
| Renderer Store update | recursive/full-tree lookup and repeated candidate validation | indexed update-only COW; structural isolated candidate plus one final validation | revision, tombstone/tag history, atomic commit | Render Store tests |
| Generation | carrier/generation reset boundary incomplete | same G preserves history; fresh G resets wire metadata and re-exports live Domains by Registry+Snapshot | no stale Patch base or Event replay | generation regressions |
| Failure | broad catch could blame peer for local mechanics | only protocol violations become protocol-fatal; local mechanics propagate to existing local-fatal | current state/revision unchanged on failed candidate | Render Store/DataRuntime tests |
| Data writer | 1,024 pending sends could local-fatal | explicit FIFO serialized drain; no count admission; terminal settles and releases queued text | one physical send, FIFO, once-settle, first-wins | `writer.test.mjs` |
| Render publication | queue capacity could drop Event/invalidate peer | O(1) queue; coalesce state only; accepted applicable Event retained as barrier | ordering, applicability, no replay | RenderManager backlog tests |
| Presentation | 128 Frames, 64 Channels, 4,096 pairs, 256-byte Channel, Event size/depth/member/string caps | no capacity caps; scalar/C0/DEL and provenance/currentness remain | exact Interest, FIFO/applicability/transient/no-replay | Data/Subsystem/Renderer Presentation tests |
| Presentation queue | 256 pending Events could be silently dropped | O(1) FIFO, one in-flight send, stale/applicability pruning only | source/target/Activation gates | Presentation frame-gate tests |
| PWA MessagePort | repeated `Array.shift()` could make backlog O(N²) | head-index amortized O(1) queue/waiter drain and terminal cleanup | string unit and per-direction order | PWA unit/E2E |
| Product policy | generic and product limits were conflated | Map guards/projection window remain explicit product policy | no silent truncation/partial logical commit | Map unit/product/perf qualification |

## Failure and generation matrix

| Boundary | Outcome |
| --- | --- |
| peer malformed Wire/schema/direction/authority/revision | protocol-fatal; retire current Data carrier |
| local authoritative clone/index/freeze mechanics failure | discard candidate; preserve state/revision; propagate cause; existing local-fatal; fresh Registry+Snapshot recovery |
| developer authoring representation/getter/Proxy failure | fail current call; no desired-state acceptance/publication; healthy peer remains |
| Presentation business handler throw/reject | registration-boundary containment; no Data/Store failure |
| carrier/send failure | retire that carrier only; Runtime/Frame/Main authority and business RenderDomain remain |
| same-generation carrier replacement | keep retired Domain IDs, consumed Node keys and stable tags; reset carrier cursor/baseline/send state |
| fresh generation | reset retired/consumed/tag/revision wire metadata; strings may be fresh identities; publish Registry then current Snapshots; no old Event migration |

## Qualification record

The final PR must record:

- exact implementation subject SHA and environment;
- unit/workspace/full regression commands and pass counts;
- historical-threshold, generation, failure, deep-stack and queue results;
- Issue #133 PokeMan 1920×1080 diagnostic measurements and CPU profile attribution;
- current full/native profile from `performance.md`, including sample validity, pixels/correctness and memory guard;
- update-only visits/traversals/parse/stringify/clone-freeze counters, changed vs unchanged subtree, writer queue costs and terminal reference release.

Performance evidence must separate update-only, structural Patch, Snapshot, fresh reconnect and failure recovery. A small update must not trigger unrelated whole-Snapshot stringify/validation, and cost must follow touched path/subtree rather than unrelated tree size.
