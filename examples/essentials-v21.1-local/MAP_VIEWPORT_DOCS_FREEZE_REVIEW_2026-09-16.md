# Map Docs Freeze Review — 2026-09-16

> 状态：**APPROVED as design/test contract only**. Not Implemented. Not 640/720/1080 product performance PASS. Not PWA.

## Identity

```text
Date: 2026-09-16
Owner: project owner continuation after PR0 STOP (“继续”)
Reviewer: Cursor Grok 4.6
Contract: MAP_DYNAMIC_VIEWPORT_PERFORMANCE_REFACTOR_DRAFT.md
Motion child: MAP_VIEW_SPRITE_MOTION_STAGE_CLOSURE.md
Evidence: MAP_VIEWPORT_PR0_EVIDENCE.md
Production subject: 4cbf620ebe8aec0e7fb33743813c5d1f2885e6a9 (zero production diff)
docs-only SHA: freeze-registration commit after this review is landed
```

Conflict: this reviewer authored the revised §5 accepted-vs-live sentence in the same session. Owner “继续” is the design authority for that split. This review independently checks PR0 measurements and the remainder of the original contract. It does not invent a second author for the §5 paragraph.

## Checks

| Item | Result |
|---|---|
| §4 closed MapView/MapSprite keys, chunk 8×8×3, overscan 1, tileVisual tuples | PASS on PR0 projector vs exact keys / max 61296 B < 196608 |
| 640 camera anchors 304/224 | PASS |
| Local Map002/066 real FSDB + checksum | RECORDED `f49cf7267c9f920ca52eceb1a5017eee56b9c472b5e97fdde3f77aed8ebba7ed` |
| §5 accepted canvas ≤128MiB | PASS maxVisible 124502016 (118.7 MiB) at dense 1080 |
| §5 live canvases + decode ≤256MiB | PASS maxLivePlusDecode 249167872 (237.6 MiB) |
| Fixture/packing not thinned; 128 cap not lowered | PASS |
| Private `::slotted` stacking pixel oracle | PASS priority0/5/equal/tall; host style empty |
| Core `RenderDomain.update` residual vs refresh gates 50/75/100 | PASS; 1080 full p95 42.8 ms; not an independent Core STOP |
| M13 camera-only structural equality | PASS p95 0.009 ms |
| Current Hostra 640 baseline | RECORDED ordinary p95 21.3 / refresh p95 41.8; not PR1 PASS |
| Walking 250ms / transfer same-Frame / no `/2` / no Core fast path | No conflict with Frozen walking/transfer or Core `/1` |
| §8 earliest-receipt clock and first-stage-without-old-pose | Design consistent with motion child; not yet implemented |
| §11 PR0 file boundary | Held: tests + evidence + this review only; production still `4cbf620` |

## What this freeze does not authorize

- Claiming Map product P95, camera-only zero tile draws, or dynamic 720/1080 product PASS
- Changing Frozen Render/M13/Core, lowering byte/memory gates, or thinning the dense fixture
- PWA / M16 / M17 work
- Skipping PR1 640 pixel/guard/camera-only/refresh gates before PR2

PR1 may now change only `game-libs/map/src/runtime.ts`, `game-libs/map/src/semantics.ts`, `game-libs/map/browser/map.browser.js`, `game-libs/map/browser/map.css`, plus the allowed test set.
