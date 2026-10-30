# Render Data Runtime correction ledger

> Status: implementation and qualification ledger  
> Protocol identity: unchanged (`loomrealm.render-update/1`, `loomrealm.renderer-data/1`, `loomrealm.renderer-data/3`, Frame-targeted Presentation Event v1)  
> Correction date: 2026-10-30  
> Design SSOT: [Render Data Runtime Refactor Plan](./render-data-runtime-refactor-plan.md)  
> Decision: [ADR 0038](../decisions/0038-render-data-runtime-pre-release-correction.md)

This is a first-substantive-public-release correction, not a compatibility migration. Raw command/results and performance artifacts name the executable/qualification-input subject exactly. A later evidence-only commit may advance the PR head without making those executable results stale.

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
| Presentation queue | 256 pending Events could be silently dropped | normal offer validates only the new Event and appends in O(1); head-index FIFO dequeue is amortized O(1), with lifecycle-only eager prune and lazy currentness recheck | one in-flight send, source/target/Activation gates, FIFO/no replay | Presentation frame-gate tests |
| PWA MessagePort | repeated `Array.shift()` or historical waiter slots could make receive cost/storage grow | one reusable two-stack FIFO abstraction for message backlog and legally concurrent pending `next()` calls; amortized O(1), no compaction threshold, terminal clears references | one logical reader, string unit and per-direction order | PWA unit/E2E |
| Product policy | generic and product limits were conflated | Map guards/projection window remain explicit product policy | no silent truncation/partial logical commit | Map unit/product/perf qualification |

## Final structural review closure

- Presentation normal `offer()` no longer scans existing backlog. It performs one current-Event applicability check and one append; dequeue rechecks currentness and lazily discards stale entries. Activation, Interest and peer lifecycle changes remain the only eager O(N) prune points. A 10,001-Event blocked-send regression recorded 10,002 checks before release, zero offer-time queue scans, 20,002 checks after full drain, exact FIFO delivery and maximum physical concurrency 1.
- MessagePort keeps the Foundation one-logical-reader contract while preserving legal concurrent `next()` calls. Both waiters and received-message backlog use the same two-stack FIFO, so retained storage represents only active entries rather than receive history. The regressions ran 200,000 sequential queue cycles with high-water 1 and zero retained after clear, plus 20,002 real MessagePort receives, two concurrent waiters and terminal settlement.
- Render schema validation no longer walks a nested generic subtree. Wire parse/stringify exposes a string-only semantic hook inside its already-required iterative traversal; it does not expose a trusted bypass and still rejects sparse/augmented arrays, accessors, symbols, exotic objects, cycles, non-finite and unsupported values. A 2,000-row instrumented payload recorded zero codec full-generic traversals and one final serialization traversal. RenderManager author acceptance remains a separate synchronous detach/freeze proof.
- RenderManager attrs/data delta mechanics share one local `Set`-based helper. A 10,000-member attrs object plus 10,000-member data object, each removing 5,000 members, recorded 20,000 current members, 10,000 removed members and exactly 20,000 membership probes: O(N+M), not O(N×M). Renderer Store already applies indexed set/remove operations without the repeated-membership pattern.
- The structural review added no resource cap, workload retirement, cleanup timer, serializer bypass, public qualification counter or authority/identity/generation/revision change. No known correctness or performance blocker remains.

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

### Closed executable subject

- subject: `0bec1c548f904b29ca5d6a2a4f839ce29847c43b`;
- environment: Windows `10.0.26300`, Node `v24.19.0`, npm `11.17.0`, AMD Ryzen AI 9 365;
- frozen Hostra source: `d863beab3c59c3bd4f271514a228fa8fee0bf5b6`, Electron `44.1.1`;
- implementation branch was created from current `origin/main`; only the accepted planning commits from PR #136 were replayed before implementation. No PR #135 implementation commit was imported.

The evidence commit that contains this ledger and the raw artifacts changes documentation/evidence only. Therefore the executable subject above remains the qualification subject.

### Correctness and regression

- `npm run test:regression`: PASS for all 17 selected workspaces;
- `npm run test:m11:qualification`: 10/10 PASS, including the historical Render-cap matrix;
- `npm run test:frame-targeted-presentation:qualification`: 51/51 core, 1/1 Hostra and 1/1 PWA PASS;
- `npm test -w @loomrealm/pwa`: 44/44 unit and 17/17 real Chromium E2E PASS;
- `node --test test/map-viewport-pr0.test.mjs`: 9/9 PASS, including stacking and 1080p pixel `[0,128,0,255]`;
- `npm run docs:check-links`: 812 links across 175 Markdown files; `npm run docs:build`: PASS.

Package and qualification fixtures cover former message/data/tree/Patch/Presentation queue thresholds, very deep iterative traversal, same/fresh generation, peer-protocol versus local-mechanics failure, FIFO terminal settlement and caller detachment/freeze.

### Full/native Hostra evidence

Command: `LOOMREALM_M15_FULL_QUALIFICATION=1 npm run test:m15:hostra:full` with the frozen Hostra source above. Result: 17/17 PASS.

| Viewport | Ordinary p50 / p95 / max (ms) | Refresh p50 / p95 / max (ms) | Samples | Round attempts | Invalid | Camera-only / zero tile draw |
| --- | --- | --- | --- | --- | --- | --- |
| 640x480 | 26.20 / 33.90 / 46.20 | 11.30 / 19.20 / 24.40 | 300 / 90 | 166, 170, 193 | 0, 0, 2 | 300 / 300 |
| 1280x720 | 26.60 / 34.20 / 36.50 | 12.50 / 20.70 / 22.80 | 300 / 90 | 170, 171, 212 | 0, 1, 1 | 300 / 300 |
| 1920x1080 | 25.70 / 32.80 / 35.40 | 13.00 / 20.10 / 23.30 | 300 / 90 | 170, 170, 232 | 0, 0, 1 | 300 / 300 |

The product-policy resource guard stayed within both ceilings: maximum visible backing bytes `124,502,016 <= 128 MiB`; maximum live plus decode bytes `249,167,872 <= 256 MiB`. Stacking passed and the Chromium 1080p raster pixel was `[0,128,0,255]`.

### Issue #133 PWA diagnostic

The opt-in diagnostic ran the real PokeMan Map 7 Worker -> Data -> Renderer -> browser route at 1920x1080 for 70 movements, two projection shifts and 3,049 tiles. The full movement action includes the intentional approximately 250 ms game animation and is not the callback gate.

- browser Long Tasks: 0; frame gaps over 50 ms: 1; maximum frame gap: `66.80 ms`, p95 `16.80 ms`;
- main tasks: 8,132, tasks at least 50 ms: 1, p95 `2.040 ms`, max `78.946 ms`; tasks at least 100 ms: 0;
- Worker tasks: 14,988, tasks at least 50 ms: 0, p95 `0.443 ms`, max `27.377 ms`; tasks at least 100 ms: 0;
- sampled CPU: `37,578,541 us`; validation `0.01616%`, stringify `0.04858%`.

### Indexed update and queue evidence

`node --expose-gc --test packages/subsystem/test/render-probe-equivalence.test.mjs` passed 9/9 on a 142,518-byte dense fixture. Snapshot acceptance was `10.302 ms`; legacy whole probe p95 was `39.475 ms`, optimized probe p95 `17.148 ms`, and motion-only indexed update p95 `0.0691 ms`. The update performed two operations, three path visits, five index lookups, two structural node clones, one child-array clone and one root-array clone; it performed zero whole-Snapshot traversals, parse calls or stringify calls. Delta mechanics recorded 26 current members and 26 membership probes. Explicit-GC retained delta was `110,080` bytes.

Renderer Store used 4,097 nodes and 200 update-only samples: p50 `0.1242 ms`, p95 `0.1462 ms`, p99 `0.1854 ms`, versus `10.6991 ms` for structural Patch; all 4,096 unchanged nodes retained identity. Data writer queued 1,100 operations in `7.176 ms` (`6.523 us/item`), kept exactly one physical send in flight, terminal-settled the remaining 1,099 operations, and released the queue under explicit GC.

### Raw artifact digests

- `artifacts/map-viewport-pr3-hostra.json`: `34d40330e13f51de5423795c862a3ad2c7956c63dccebdfa69f10d26f143d184`;
- `artifacts/map-viewport-pr0-node.json`: `9b05b0ed1a491338ea305b3cfd2b12b99daea3d588bf778cff019bfe05855794`;
- `artifacts/render-data-runtime-pwa-diagnostic.json`: `4f260e6ff47c4d368589b0fce0ccfc038c29ef4f5904574790b80aa77ded8649`.
