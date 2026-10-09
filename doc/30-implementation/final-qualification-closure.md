# Final project qualification closure

> Current closure record, 2026-10-09. This file supersedes the status conclusions in earlier qualification snapshots without rewriting their raw measurements or historical gate results.

## Qualification subject

Current executable / qualification-input subject: `8131f6dd140ac21edb52879eb9ec1fd1a8cd7ba9`.

The Ledge duration changed from 400ms to 500ms after original Pokémon Essentials v21.1 dynamic observation. M14 and M15 were requalified for this subject; exact-head PR CI is green.

## Performance — Closed

Current performance qualification uses `performance-qualification-profile-v1.md`:

- ordinary movement first-motion-paint P95: `<=50ms` at every qualified viewport;
- refresh P95: `<=50ms` at 640x480, `<=75ms` at 1280x720, `<=100ms` at 1920x1080.

The former uniform refresh `<=50ms` rule is historical and is not the current qualification gate.

Two complete native frozen-Hostra runs were retained. Their 1920x1080 refresh P95 values were 62.1ms and 50.5ms. Both pass the current 100ms ceiling. Ordinary latency, 640/720 refresh latency, invalid-sample limits, camera-only/zero-draw behavior, pixel stacking, memory limits and all related regressions pass. No measured result was deleted or rewritten.

Result: **Performance Qualified / Closed**.

## Terrain Behavior v1 — Closed

Original v21.1 dynamic observations cover all four declared Map21 Bridge On/Off pairs and the Map47 forward/reverse Ledge behavior. The original runtime observation established the 500ms Ledge duration and exposed the former 400ms product divergence, which was fixed in the current subject.

The repository policy is:

`synthetic-only CI + legal-local original qualification + sanitized repository facts/digests`.

Original restricted runtime/data/assets and raw observation logs remain outside the repository.

`game-libs/map/TERRAIN_BEHAVIOR_CONTRACT_V1.md` is the frozen contract for the declared Neutral(13), Bridge(15), Ledge(1) slice. FG-01 through FG-06, C-01 through C-08, and DEC-01 through DEC-07 are closed for that declared scope. Synthetic-only Map47 edge cases remain explicitly distinguished from original observations.

Result: **Terrain Behavior v1 Frozen / Qualified / Closed**.

## Project result

All previously tracked project-level qualification routes are closed for the current subject and declared product scope. Future behavior or qualification-input changes must follow the existing subject/staleness and requalification rules; this closure does not waive future qualification.
