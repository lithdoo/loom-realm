# Viewport scope repair — protected documentation restored

> Status: **scope remediation committed; Core/Map Docs Freeze still HOLD; no executable changes or qualification evidence**. 2026-09-16.
> Before-change reference: `a71be9c46c7eb70c335246f87282ef545d364e19`; source of truth for live progress: [Core qualification](./viewport-profile-v1-qualification.md), [Map PR0 evidence](../../examples/essentials-v21.1-local/MAP_VIEWPORT_PR0_EVIDENCE.md).

## 1. Why this repair exists

A narrow Renderer→Subsystem `viewport.state` addition had caused whole-file replacement and deletion of unrelated Frozen/governance implementation details. Restoring those exact earlier Git blobs is safer than regenerating paraphrases. This remediation preserves historical documents verbatim and places new capability differences in independent, explicitly linked documents. A restored pre-Viewport document is **not** evidence that revised four-child `/1` is already Frozen or implemented.

## 2. Exact original blobs restored at original paths

All of the following are byte-identical to `a71be9c` and contain **no new viewport normative requirement**: `doc/00-overview/document-governance.md`; `doc/10-architecture/platform-composition-system.md`; `renderer-subsystem-protocol-layers.md`; `subsystem-model.md`; `system-overview.md`; `doc/README.md`; `doc/decisions/README.md`; `doc/decisions/0025-renderer-data-profile-v1-preimplementation-closure.md`; `doc/20-modules/web-renderer/README.md`; `doc/20-modules/loom-map/README.md`; `doc/15-contracts/README.md`; `packages/data/DESIGN.md`. ADR0036 is restored byte-identically to its original Accepted decision for historical accuracy; [ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md) explicitly supersedes only its v2 choice. Never interpret the older ADR's acceptance as an active `/2` implementation instruction.

Original Data package details remain in `packages/data/DESIGN.md`; the pending **additive only**, not-implemented four-child peer/API changes are [VIEWPORT_V1_IMPLEMENTATION_DELTA.md](../../packages/data/VIEWPORT_V1_IMPLEMENTATION_DELTA.md). Unchanged exact Input/Render public API and terminal semantics MUST be preserved; do not replace them with a summary.

## 3. Profile preservation without reintroducing `/2`

The current [Profile v1 candidate](../15-contracts/renderer-data-profile-v1.md) and [revision-3 conformance candidate](../15-contracts/renderer-data-profile-conformance-v1.md) remain the **only live four-child target**. The complete original 2026-09-07 Frozen three-child texts are now archived intact at [old Profile baseline](../15-contracts/renderer-data-profile-v1-previewport-baseline.md) and [old conformance baseline](../15-contracts/renderer-data-profile-conformance-v1-previewport-baseline.md), in the same directory so their original relative links continue to resolve. The archived titles/statuses describe **their 2026-09-07 historical subject only**, NOT current target or release compatibility.

The revised `/1` is a governed correction, not a new wire identity. The following baseline facts cannot silently disappear merely because the new summary is shorter: exact authority/acquire/no-Data-if-unavailable; one UTF-8 JSON text unit on WebSocket and MessagePort; actual UTF-8 1MiB/depth64/Wire preflight before any mutation; duplicate JSON member parser semantics; all original Input/Render type/direction/handler outcomes; exactly one reader and one serialized writer with accepted-send order; no cross-child ACK/revision/replay/transaction; unchanged Input/Render child barrier/ordering; old-unsent never migrates to fresh carrier; Data-local first-wins terminal and bounded backpressure; Hostra/PWA abstract transport trace equivalence; all revision-2 fixtures. The revised v1 current contract overrides **only** composition and closed type set to add `viewport.state`, the matching inbound demux/role direction/diagnostic family, independent fresh Viewport baseline, bounded Viewport producer and explicit revised-v1 revision-3 qualification/cohort condition. ADR0037 supersedes the old baseline's assertion that same-identity first-release correction is categorically forbidden, subject to the outstanding actual external-compatibility investigation. All other baseline invariants remain required as regression; apparent conflicts outside this enumerated delta are **STOP + design review**, not license to guess. No `/2`, dual parser, handshake, Main geometry mirror or Map special core route.

**Open packaging issue before Freeze:** Current shorter Profile/conformance files must be cross-reviewed line-by-line against these originals and either re-incorporate unchanged obligations verbatim in canonical files or unambiguously point to the above unchanged baseline subsections. This archive alone is protected-semantic preservation, not a signed conformance audit. Do not mark F-04 PASS just because original text is available.

## 4. Intended minimal change ownership

Core only: [Viewport State v1](../15-contracts/viewport-state-v1.md), [Viewport conformance](../15-contracts/viewport-state-conformance-v1.md), [revised Profile v1](../15-contracts/renderer-data-profile-v1.md) and [its conformance](../15-contracts/renderer-data-profile-conformance-v1.md), [viewport capability](../10-architecture/viewport-capability.md), the minimal Data/Renderer/Subsystem seam, ADR0037, editorial current-composition link in Frozen Connection and test/qualification ledger. Product owns Desktop/PWA `innerWidth/innerHeight` selection and coordinated build cohort. Map alone owns [dynamic viewport/performance draft](../../examples/essentials-v21.1-local/MAP_DYNAMIC_VIEWPORT_PERFORMANCE_REFACTOR_DRAFT.md), [private motion staging](../../examples/essentials-v21.1-local/MAP_VIEW_SPRITE_MOTION_STAGE_CLOSURE.md) and PR0 evidence; Map P95/Canvas/autotile/chunks are NOT Core Docs Freeze conditions.

No edits to Frozen Control/Input/Render wire, M13 Projector, Main `S/G/P` authority, Frame lifecycle, generic Environment service, or new protocol versions. Restore history rather than rewrite an old decision to disguise supersession. The phase plan's small C0/C1/PR0–PR3 insert is the only intended global schedule delta.

## 5. Remaining gates — never invent a PASS

- **Core C0:** release owner records distribution/downstream/mixed-deployment investigation with evidence/date/signature; real old `/1` compatibility need means STOP direct identity replacement and revisit ADR0037.
- **Core docs:** reconcile shortened current v1 Profile/revision-3 conformance with archived complete baseline; check original architectural navigation/new additions, frozen Connection editorial diff, references and document links; independent reviewer signs docs-only SHA.
- **Core C1:** implement/requalify new cohort on executable SHA; do not inherit old three-child PASS.
- **Map:** PR0 empirical payload/validation/M13/Chromium stacking/memory/local FSDB evidence, then separate Map Docs Freeze; PR1/PR2 after Freeze; postimplementation P95 and product qualification in PR3.

This change restores source text; it does not run tests, investigate external distribution, prove CSS stacking, modify production code, or authorize a low-judgment implementation agent to bypass open gates.
