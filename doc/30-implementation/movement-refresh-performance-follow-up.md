# 1080p tile-refresh performance follow-up

> Status: **DRAFT / NOT ACCEPTED / NO IMPLEMENTATION AUTHORITY.** This document records the current failure and the minimum evidence needed for a later design decision. It does not authorize a cache, protocol change, scheduler, background refresh, dynamic margin, scene/actor split or backing-canvas redesign.

## Trigger

Current subject `8131f6dd140ac21edb52879eb9ec1fd1a8cd7ba9` completed two canonical native full profiles. At 1920×1080, tile-window refresh P95 was `62.1ms` and `50.5ms`; both exceed the frozen uniform `<=50ms` movement threshold. Ordinary P95 remained `16.3ms` and `15.5ms`; both runs passed M15's separate 100ms 1080p refresh threshold. Correctness, pixel stacking, camera-only zero-draw and memory gates passed.

Raw artifact identity, environment, all viewport rows and the legal conclusion are in the [current qualification ledger](./final-performance-terrain-qualification.md). No best-of-two selection is permitted.

## Known diagnostic facts

- The current `RenderDomain.update` full-refresh diagnostic, including its qualification snapshot probe, reaches 1080p P95 `26.5192ms`; camera-only reaches `13.4111ms`.
- A production-schema browser receive-to-paint diagnostic recorded `21.5ms` for its sample.
- The canonical e2e harness proves 1080p size dependence and zero ordinary tile redraw, but currently exposes only Window-side `input-captured`, `presentation-received` and `browser-first-motion-paint` records.
- These independently sampled percentiles are not additive and do not establish causal percentages.

## Required measurement before design

Extend only the qualification path needed to report §7.3's existing stages, without production-default logging or public APIs:

1. `RenderDomain.update` author commit.
2. RenderManager materialize plus Data encode.
3. Data decode plus Renderer Store atomic commit.
4. Web Projector reevaluation plus `receiveRenderData` delivery.
5. Browser receive through first changed pixel.

For ordinary and refresh buckets, record P50/P95/max, message bytes, sample count, invalid count and the same subject/environment identity. Each duration uses its own process monotonic clock; cross-process absolute timestamps are diagnostic only and must not be subtracted. Retain the existing 3 × (100 ordinary + 30 refresh) contract and raw samples.

## Decision boundary

After the segmented run, classify the dominant cost as retained-state validation/copy, materialization/codec, Renderer candidate work, projector delivery, canvas preparation/paint scheduling, transport, or a measured combination. The next proposal must name the measured cause and preserve:

- public API and strict input acceptance/rejection;
- wire schema, role direction, hard limits and atomic convergence;
- Map authority, collision, transfer, motion and projection correctness;
- fixed sampling, validator and 50ms movement threshold.

If the cause is an already-accepted optimization that is not active, a narrowly scoped defect fix may proceed with a pre-fix regression. Any member-metadata cache, wire/protocol change, new scheduler, predictive/background refresh, dynamic margin, scene/actor split or canvas architecture requires its own ADR and maintainer acceptance before implementation.

## Closure condition

Route 4 may close only when a new behavior/qualification subject has complete segmented evidence and all authoritative gates pass on canonical native full-profile samples. M15's viewport-specific PASS cannot substitute for this condition.
