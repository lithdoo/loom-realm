# RPGMap Projection Cache v1.2 — Fixed-World Chunks and Ring-Buffer Evaluation

> Status: **Design proposal — not frozen, not implementation-ready**
>
> Scope: follow-up optimization proposal after Map v1.1 landed in PRs #126/#127.
>
> Related design: [75-map-presentation-v1.1.md](./75-map-presentation-v1.1.md)
>
> Related issue: [#124 — eliminate periodic stutter when projection window refreshes](https://github.com/lithdoo/loom-realm/issues/124), closed by [PR #127](https://github.com/lithdoo/loom-realm/pull/127).
>
> This document does not reopen #124 and does not claim that a performance regression has been measured. It records a follow-up design for removing the remaining large-overlap pixel-copy path, subject to profiling and qualification.

---

## 1. Summary

Map v1.1 establishes persistent, bounded depth surfaces and incremental projection rasterization. It removes the former pattern of allocating detached canvases for every projection refresh and rebuilding the target projection before committing it.

One cost remains in the current implementation of `_rasterIncremental()`: when the projection window shifts, it can read the overlapping pixels through `getImageData()`, clear the layer canvas, and restore the overlap through `putImageData()` before drawing dirty cells.

This path can still do work proportional to the overlap area and may force a synchronous Canvas readback. The existing CI verifies surface reuse and rasterization counters, but those counters do not prove that pixel-copy time is negligible on real devices.

The design objective is therefore stronger than “replace one Canvas API”:

> **A same-scene projection shift must not copy or reraster the whole overlapping projection. Existing world content stays in place; only newly required or invalidated tile content is rasterized.**

The proposed direction is a bounded cache of fixed-world-coordinate tile chunks. A tile-aligned ring buffer remains an alternative only if its wrap-aware presentation can avoid materializing or copying the whole visible projection on every shift. The implementation choice must be supported by a real-map benchmark; this proposal does not freeze the ring-buffer backend prematurely.

## 2. Current behavior and remaining cost

The current v1.1 path is in `game-libs/map/browser/map.browser.js`, primarily `_rasterIncremental()`, `_resizeLayer()`, and `_blitTile()`.

On a same-scene projection shift, the implementation currently:

1. Computes the intersection between the previous and next projection windows.
2. Reads the overlap from a reused depth canvas using `getImageData()`.
3. Updates the layer bounds, clears the canvas, and restores the overlap with `putImageData()` when possible.
4. Walks the incoming tile payload and redraws cells that cannot be reused.
5. Commits the updated depth surfaces while preserving the accepted scene.

The existing design already avoids creating a new Canvas for every shift in the stable path, but overlap preservation still incurs pixel-copy work. Clearing a large surface also touches more pixels than the dirty-cell set alone would require.

Potential costs to measure—not assumptions of an already-proven regression—include:

- synchronous Canvas readback latency from `getImageData()`;
- allocation and garbage-collection pressure from temporary `ImageData` buffers;
- overlap-copy cost proportional to the number of copied pixels and active depth surfaces;
- full-surface clear cost during a shift;
- work repeated when the same visible cells are prepared again.

The 20-shift counter test is useful evidence for bounded allocations and dirty-cell counts, but it does not directly measure these costs.

## 3. Goals and non-goals

### Goals

- Remove `getImageData()` / `putImageData()` from the normal projection-shift hot path.
- Avoid copying the entire overlap area just to preserve unchanged world tiles.
- Keep unchanged tile pixels at stable world-coordinate locations.
- Rasterize only entering cells, changed cells, and cells whose animated visual frame is due.
- Keep memory, Canvas count, cache entries, and staging work bounded independently of total travel distance.
- Preserve v1.1 authority boundaries, camera-only fast path, scene continuity, and atomic map-transfer presentation.
- Add timing and pixel-work evidence that can distinguish lower raster work from a genuine frame-time improvement.

### Non-goals

- Increasing the projection prefetch margin as the primary fix.
- Loading or rasterizing the entire map regardless of viewport.
- Weakening the existing projection payload byte guard.
- Changing gameplay movement duration or Runtime movement authority.
- Adding PokeMan-only caching behavior.
- Moving Map-specific behavior into the generic Renderer or WebProjector.
- Claiming that `drawImage()` is free or that replacing `ImageData` alone proves the issue resolved.

## 4. Design constraints inherited from v1.1

The following remain authoritative and are not changed by this proposal:

- Runtime owns logical map state, movement, projection bounds, and desired tile data.
- Map Browser Presentation owns accepted visual pixels, visual resources, and the presentation update lifecycle.
- Same-scene projection changes are visual revisions, not scene replacements.
- `acceptedVisualScene` remains the last complete visual scene accepted for display.
- `stagingVisualScene` is reserved for scene replacement; same-scene updates must not repeatedly stage the entire scene.
- A map transfer keeps the old accepted tiles, player, and NPC visuals complete until the target scene is ready for atomic promotion.
- Browser presentation failure never rolls Runtime state back.
- Surface reuse and cache retention must remain bounded.
- Camera-only movement stays on the lightweight path.
- The current 4-tile prefetch preference and projection byte-budget fallback remain policy inputs, not knobs to increase to hide the hitch.

## 5. Candidate backends

### 5.1 Candidate A — fixed-world-coordinate chunk cache (preferred default)

Rasterize tiles into small, fixed-size surfaces anchored to world coordinates. A chunk is identified by map, depth, chunk coordinates, and the resource/geometry identity required to render its pixels.

A candidate starting size is 8×8 or 16×16 tiles; the exact size must be selected by profiling. At the current 32-pixel tile size, these correspond to 256×256 or 512×512 pixel surfaces before any optional gutter.

Conceptually:

~~~text
chunk key
= map identity
+ depth
+ chunkX / chunkY
+ tileset / autotile resource identity
+ raster geometry version

chunk canvas world origin
= chunkX * chunkWidthPixels
  chunkY * chunkHeightPixels
~~~

Each chunk canvas is positioned at its fixed world coordinate, adjusted only by the existing camera transform. It is not translated to a new logical origin when the projection window moves.

Why this fits the current renderer:

- Current depth canvases are already DOM-positioned using world coordinates and camera offsets.
- Current tile drawing uses 32×32 tile cells; autotile quarters are drawn within the same cell.
- Separate depth ordering can be preserved through the existing depth-to-z-index rule.
- Existing chunks remain where they are; a window shift does not need to move their pixels.
- Only newly visible chunks and dirty cells need raster work.

The cache should operate at chunk granularity for surface allocation and eviction, while retaining per-cell fingerprints inside each chunk for precise invalidation. A changed tile must not force every cell in the chunk to be redrawn.

#### Same-scene projection shift

~~~text
previous accepted projection
  ├─ chunks still visible ───────── keep the same surfaces
  ├─ chunks newly required ──────── prepare offscreen
  └─ chunks no longer required ──── retain until commit, then evict if over budget

all required entering chunks ready
  → atomically update accepted projection membership / camera transform
  → old-only chunks become evictable
~~~

The incoming chunk set is a bounded same-scene projection revision, not a new full-scene staging transaction. Existing accepted chunk surfaces are reused directly. If any newly required visible chunk is not ready, the implementation must not expose a blank or partially rasterized region; it should keep the previous accepted projection until the required additions are ready, while coalescing newer desired revisions.

#### Cell invalidation

For each tile cell in a chunk, retain a compact fingerprint of the visual stack and relevant resource/frame identity. When a new tile payload arrives:

- unchanged cell fingerprint: keep existing pixels;
- changed or newly known cell: clear only that cell rectangle and redraw its current stack;
- removed cell: clear its old rectangle;
- animated autotile frame change: redraw only the affected animated cells;
- resource or geometry identity change: invalidate the affected chunk or the smallest safely invalidatable unit.

Payload absence must not automatically mean “empty” unless the cell is known to be inside the authoritative projection data or outside map bounds. The cache must distinguish unknown cells from known-empty cells.

#### Chunk-edge correctness

Current `_blitTile()` draws tile and autotile pixels within a 32×32 cell. The implementation must keep this property explicit. If future map visuals may overdraw into adjacent cells, use a documented gutter or invalidate neighboring chunks; never silently clip or wrap visual pixels across a chunk edge.

Sprites remain owned by the v1.1 accepted visual scene and are not baked into tile chunks by this proposal.

### 5.2 Candidate B — tile-aligned ring buffer

A ring buffer can store fixed world-tile slots in a bounded backing surface. World coordinates map to physical slots using a modulo mapping. When a new tile enters the cache, its slot is cleared and redrawn; unchanged slots are not moved.

This backend can reduce the number of Canvas elements compared with one Canvas per chunk, but it has a non-trivial presentation constraint: the current renderer places each Canvas as one linear world-coordinate rectangle. A wrapped ring surface is not itself a linear world-coordinate rectangle.

Therefore, a ring-buffer implementation is acceptable only if it provides a wrap-aware display path that:

- presents the visible tiles in correct world order;
- does not call `getImageData()` / `putImageData()`;
- does not copy or reraster the whole visible projection on every shift;
- preserves depth ordering and alpha;
- keeps backing surfaces and slot metadata bounded;
- can commit the visible slot mapping without exposing mixed old/new content.

If the ring buffer requires a full-window materialization pass on each shift, it has not met the design objective. A single `drawImage()` overlap copy is a useful tactical experiment, but it is not equivalent to zero-copy world-anchored caching and must be benchmarked rather than assumed faster.

### 5.3 Decision rule

Start with the fixed-world chunk prototype because it matches the existing DOM-positioned layer model directly. Compare it with a ring-buffer prototype only if reducing Canvas/DOM surface count is necessary.

Choose the ring-buffer backend only if the measured results are better without introducing full-window blits or compromising correctness. The final backend choice is intentionally left open until the benchmark evidence is available.

## 6. Cache ownership, lifetime, and memory budget

The cache belongs to Map Browser Presentation. Runtime sends canonical tile facts and exact projection bounds; it does not own Canvas objects, chunk coordinates, cache eviction, or pixel lifetime.

A cache entry must have enough identity to prevent stale reuse. At minimum:

- map identity;
- depth;
- fixed world chunk coordinates;
- tileset and relevant autotile resource identities;
- raster geometry / tile-size version;
- per-cell visual fingerprints and animation-frame identity.

Do not key reusable pixels solely by `visualEpoch`: a new revision can contain many unchanged cells. Use revision data to determine what changed, not as a blanket cache invalidation key.

### Budget rules

- Keep only chunks intersecting the accepted visible projection, the bounded guard area needed for near-future movement, and a fixed-size LRU reuse allowance.
- Apply an explicit pixel-byte budget across all depths and both accepted/staging ownership.
- Compute approximate surface memory from width × height × 4 bytes, while treating browser/GPU overhead as additional measured cost.
- Count live surfaces, pooled surfaces, cache hits/misses, evictions, and peak estimated bytes.
- Never let cache size grow with total traversal distance.
- Do not evict a chunk still referenced by the accepted visual scene or an in-progress projection transaction.
- If staging a target scene cannot fit within the budget, preserve the last-good accepted scene and follow the existing presentation failure/retry policy; do not evict visible pixels early just to make room.

The current surface-pool budget of four was designed for whole-depth surfaces. It must not be copied blindly as a chunk-count limit. Derive the chunk budget from the maximum supported projection dimensions, depth count, guard area, and measured device memory.

## 7. Animated tiles and depth ordering

Autotile animation must remain incremental. A timer tick must not redraw every chunk or the full projection. It should identify cells whose animation frame changed and redraw those cell rectangles only.

Depth ordering remains the existing contract:

- cache identity includes depth;
- each chunk surface uses the existing depth stacking value;
- a cell-stack change invalidates only the corresponding cell/depth content;
- map bridge and priority behavior must match the current renderer;
- chunk boundaries must not change z-order or alpha blending.

The implementation must test both ordinary tiles and quarter-based autotiles at chunk edges, including animated transitions.

## 8. Accepted projection continuity

A same-scene projection update must not become a scene replacement merely because the viewport crossed a boundary.

The transaction should be:

1. Compute the desired projection bounds and the set of chunks needed to cover it.
2. Reuse accepted chunks whose identity and cell fingerprints remain valid.
3. Prepare only missing chunks and invalidated cells offscreen.
4. Coalesce newer same-scene revisions into the in-progress work without restarting unchanged chunk preparation.
5. When all required visible content is ready, commit the new camera/projection membership atomically.
6. Release old-only chunks after the accepted projection no longer references them.

For a map transfer, keep the existing v1.1 full target-scene staging and atomic promotion. The chunk cache may reuse compatible resources, but it must not weaken the rule that old accepted tiles, player, and NPC visuals remain complete until the target scene is ready.

## 9. Instrumentation and benchmark requirements

Add timing around the actual work, not just counters for the intended algorithm.

For every projection shift, record at least:

- Runtime projection-window refresh and tile-payload revision;
- Browser receipt time and raster start/end;
- number of entering chunks and dirty cells;
- chunk cache hit/miss/eviction counts;
- full-raster pass count;
- Canvas allocations, resizes, and estimated peak bytes;
- any overlap-copy / full-window-blit count;
- time spent preparing entering chunks and committing the projection;
- frame duration distribution and long-task observations where available.

For the proposed cache, the normal shift path must report:

~~~text
ImageData readbacks for overlap preservation = 0
ImageData writes for overlap restoration = 0
full-overlap pixel copies = 0
tile raster work = entering cells + invalidated cells + due animated cells
canvas allocation / resize = bounded by cache warm-up and budget eviction
~~~

A full-window `drawImage()` pass must be counted separately from tile rasterization; it must not be hidden behind a “full raster = 0” counter.

### Benchmark workload

- Use a real PokeMan map large enough to cross many projection-window boundaries.
- Include multiple active depths, ordinary tiles, animated autotiles, bridges/priority cases, and NPC/player motion.
- Walk continuously for at least 100 tile steps, including repeated crossings of the old refresh cadence.
- Run a cold-cache pass and a warmed-cache pass.
- Compare current v1.1 against each prototype on the same browser/device and map seed.
- Include a lower-performance Android/Chromium device, not only desktop CI.
- Report median, P95, and P99 projection-update duration and frame duration; report sample count and device/browser version.

The benchmark must first establish a v1.1 baseline. If no measurable hitch or meaningful overlap-copy cost can be reproduced, do not merge a more complex cache solely on theoretical grounds.

## 10. Automated qualification

Required tests for an implementation PR:

- [ ] Repeated one-tile shifts preserve all unchanged cell pixels without overlap readback/copy.
- [ ] Moving right, left, up, down, and diagonally across cache wrap/chunk boundaries produces pixel-correct output.
- [ ] The first and last tile rows/columns do not show seams, stale pixels, or transparent gaps.
- [ ] New, changed, removed, and known-empty cells invalidate correctly.
- [ ] Unknown cells outside a payload are not mistaken for empty cells.
- [ ] Animated autotiles redraw only affected cells and remain phase-correct.
- [ ] Depth ordering, bridges, alpha, and sprite/camera synchronization match the pre-change output.
- [ ] A stale async chunk cannot overwrite a newer desired projection.
- [ ] A failed chunk preparation keeps the old accepted projection complete.
- [ ] Same-scene updates coalesce without restarting valid work.
- [ ] Scene transfer still uses the v1.1 accepted/staging scene contract.
- [ ] Surface and byte budgets remain bounded over long travel and repeated map visits.
- [ ] No generic Renderer/WebProjector special cases are introduced.
- [ ] Existing Map, PokeMan, Essentials, PWA, and Hostra qualification remains green where applicable.

## 11. Implementation sequence

### Phase 0 — measure v1.1

Add or use timing instrumentation to measure projection shifts, pixel-copy time, clear time, dirty-cell raster time, frame-time percentiles, and memory estimates. Capture a reproducible baseline before changing the rendering algorithm.

### Phase 1 — prototype the cache backend

Implement a private prototype behind Map Browser Presentation. Do not change public Render ABI or Runtime semantics. Compare fixed-world chunks with a ring-buffer prototype only if needed.

### Phase 2 — select based on evidence

Choose the backend that reduces P95/P99 frame time and worst projection-boundary latency without exceeding memory or DOM-surface budgets. If the prototype does not improve measured latency, stop and investigate the actual bottleneck.

### Phase 3 — land implementation separately

The implementation PR must contain the chosen backend, deterministic regression tests, pixel correctness checks, and benchmark evidence. It must not bundle unrelated movement, controls, Renderer, or gameplay changes.

### Phase 4 — real-product qualification

Repeat the long-walk workload on PokeMan PWA/staging and a lower-performance device. Confirm that old visual content never disappears early and that projection boundaries no longer produce a repeatable visible hitch.

## 12. Exit criteria

The follow-up is ready to land only when all of the following are true:

- The normal same-scene shift path performs no `getImageData()` / `putImageData()` overlap preservation.
- Unchanged overlapping world tiles are neither rerasterized nor copied as one large overlap bitmap.
- Raster work scales with entering/invalidated cells or chunks, not with total traversal distance.
- Camera-only movement remains lightweight.
- Surface count, estimated pixel bytes, and cache entries remain bounded.
- Animated tiles, depth/bridge behavior, and scene atomicity remain correct.
- Real-map measurements show a meaningful improvement over the v1.1 baseline, including P95/P99 and boundary-update latency.
- Existing platform qualification remains green.

## 13. Relationship to Issue #124

Issue #124 was closed by PR #127, which landed the v1.1 persistent/incremental projection design and its current qualification. This proposal is a follow-up performance hardening design, not a claim that the merged fix failed.

The distinction is:

~~~text
v1.1
→ persistent bounded surfaces
→ incremental dirty-cell rendering
→ atomic visual-scene continuity

v1.2 proposal
→ keep unchanged world pixels in stable cache locations
→ remove large overlap pixel movement/copy from projection shifts
→ prove the real-device frame-time effect before implementation
~~~

Do not increase the prefetch margin to postpone the hitch. Do not treat `drawImage()` alone as proof of a fix. Keep the existing v1.1 contracts and select the cache backend using measured performance and correctness evidence.
