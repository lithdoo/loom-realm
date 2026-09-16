# Viewport scope repair — protected documentation restored

> Status: **scope remediation committed; protected Profile/conformance crosswalk recorded; npm consumer gate owner-confirmed non-blocking; Core/Map Docs Freeze still HOLD; no executable changes or qualification evidence**. 2026-09-16.
> Before-change reference: `a71be9c46c7eb70c335246f87282ef545d364e19`; source of truth for live progress: [Core qualification](./viewport-profile-v1-qualification.md), [Map PR0 evidence](../../examples/essentials-v21.1-local/MAP_VIEWPORT_PR0_EVIDENCE.md).

## 1. Why this repair exists

A narrow Renderer→Subsystem `viewport.state` addition had caused whole-file replacement and deletion of unrelated Frozen/governance implementation details. Restoring those exact earlier Git blobs is safer than regenerating paraphrases. This remediation preserves historical documents verbatim and places new capability differences in independent, explicitly linked documents. A restored pre-Viewport document is **not** evidence that revised four-child `/1` is already Frozen or implemented.

## 2. Exact original blobs restored at original paths

All of the following were restored to `a71be9c` exact source text and contain **no new viewport normative requirement**: `doc/00-overview/document-governance.md`; `doc/10-architecture/platform-composition-system.md`; `renderer-subsystem-protocol-layers.md`; `subsystem-model.md`; `system-overview.md`; `doc/README.md`; `doc/decisions/README.md`; `doc/decisions/0025-renderer-data-profile-v1-preimplementation-closure.md`; `doc/20-modules/web-renderer/README.md`; `doc/20-modules/loom-map/README.md`; `doc/15-contracts/README.md`; `packages/data/DESIGN.md`. ADR0036 was restored byte-identically to its original Accepted decision for historical accuracy; [ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md) explicitly supersedes only its v2 choice. Never interpret the older ADR's acceptance as an active `/2` implementation instruction. Subsequent contract/ADR indexes have **small additive navigation edits**, rather than retaining byte identity; those current indexes must be checked as deltas, not falsely reported as pristine originals.

Original Data package details remain in `packages/data/DESIGN.md`; the pending **additive only**, not-implemented four-child peer/API changes are [VIEWPORT_V1_IMPLEMENTATION_DELTA.md](../../packages/data/VIEWPORT_V1_IMPLEMENTATION_DELTA.md). Unchanged exact Input/Render public API and terminal semantics MUST be preserved; do not replace them with a summary.

## 3. Profile preservation without reintroducing `/2`

The current [Profile v1 candidate](../15-contracts/renderer-data-profile-v1.md) and [revision-3 conformance candidate](../15-contracts/renderer-data-profile-conformance-v1.md) remain the **only live four-child target**. The complete original 2026-09-07 Frozen three-child texts are archived intact at [old Profile baseline](../15-contracts/renderer-data-profile-v1-previewport-baseline.md) and [old conformance baseline](../15-contracts/renderer-data-profile-conformance-v1-previewport-baseline.md), in the same directory so their original relative links continue to resolve. Archived headers describe **their historical subject only**, NOT current target or release compatibility.

The revised `/1` is a governed correction, not a new wire identity. Baseline obligations are inherited under the explicit narrow exception list in current Profile v1's **原文保全规则** and current conformance's revision-2 inheritance paragraph. ADR0037 supersedes the old baseline's categorical prohibition on same-identity first-release correction. **The project owner confirmed no npm consumers on 2026-09-16; npm consumer verification is not a Freeze gate.** Remaining non-npm compatibility/mixed-cohort conditions are separately listed in the [sole ledger §2](./viewport-profile-v1-qualification.md); do not reconstruct an npm investigation under another name. Any apparent specification conflict outside enumerated deltas is **STOP + design review**, not license for an implementer to guess. No `/2`, dual parser, handshake, Main geometry mirror or Map-special Core route.

**Packaging remains an independent-review item:** A restoration archive plus the mapping below preserves the information, but a reviewer must still check that canonical Profile/conformance documentation is unambiguous for a low-judgment implementation agent and sign the docs-only SHA. The author cannot self-certify Freeze. Do not mark F-04 PASS solely because old text is available.

### Protected Profile v1 baseline → current source crosswalk (document-level check)

| Original baseline section | Current normative disposition | What must not silently disappear |
|---|---|---|
| §1 Composition/identity; §14 final invariants | Current Profile §1 and ADR0037 replace **only** three-child closed set with four-child `/1` | Same literal identity, complete binding, no partial implementation; old executable remains historical. |
| §2 Selection/authority | Current Profile §2 + Frozen Connection; original rules retained | Main `S/G/P`, preflight/paired current, unsupported→Data absent; genuinely different profile identity still requires fresh G. |
| §3 Unit/preflight | Current Profile §3 + original §3 inherited | Hostra text/PWA string, real UTF-8 ≤1MiB, depth64, Wire parser, forbidden values and duplicate-member observable before child effects. |
| §4 Kinds/direction | Current Profile §4 only adds Renderer→Subsystem `viewport.state` | All eight original exact Input/Render kinds and direction remain unchanged; unknown/wrong-role fatal, not optional. |
| §5 Reader/dispatcher | Current Profile §5 only adds Viewport dispatch | Exactly one `carrier.messages()`, ordered disposition and each original Input/Render role handler unchanged; not a JSON-RPC parser. |
| §6 Writer | Current Profile §6 and Viewport §3 only add a bounded preadmission producer | One FIFO serialized writer, max one physical send, no retract/reorder/retry/duplication or fresh-carrier migration; child barriers still own their ordering. |
| §7 Child outcome; §8 ordering | Current Profile §7–8 inherit both sections | Accepted includes contract-permitted well-formed stale drop; child fatal vs local business failure; no cross-child revision/transaction/ACK or Control/Data total order. |
| §9 Fresh carrier | Current Profile §8 adds an **independent** Viewport baseline | Original Input fresh Interest/State and Render first domains/snapshots preserved; same-G reconnect does not restart Runtime/Frame or replay old unsent work. |
| §10 Terminal; §11 backpressure | Current Profile §9; Data delta §4/§7 | First-wins Data-local terminal, once-only settlement, no Runtime/Frame failure promotion, finite queues; Viewport burst bounded before writer. |
| §12 Version evolution | ADR0037 + current Profile §1/§2/§10 overrides the **single pre-release `/1` correction only** | Any subsequent genuine changed identity must be explicitly versioned/migrated; no silent future extension or negotiation. |
| §13 Conformance | Current Profile §10 + revision-3 conformance + original revision-2 archived fixture | Revision-2 Input/Render tests all retained; new tests cannot borrow old PASS or skip Hostra/PWA equivalence. |

### Protected Conformance revision-2 baseline → revision-3 crosswalk

| Original section | Current disposition |
|---|---|
| §1–2 binding/claims | Revision-3 §1 changes complete combination to four child, preserves old Connection/Input/Render claims and requires coordinated deployment proof; old fixture revision number is historical. |
| §3 observables | Revision-3 §2–3 + §6 inherit original call counts, physical send concurrency, order, dispatch, terminal/close, pending settlement and fresh baselines. |
| §4 identity/direction | Revision-3 §1–2 adds Viewport inbound type only; unsupported profile must still reject before side effects; wrong direction fatal. |
| §5 dispatcher | Revision-3 §2/§5 preserve one reader, once dispatch, child fatal vs locally contained business handler exception. |
| §6 writer; §7 ordering | Revision-3 §3/§5 retain serialized writer, first-wins, no retry, Input/Render barriers and independent child ownership; add pre-writer bounded Viewport producer only. |
| §8 fresh carrier | Revision-3 §4 retains Input/Render fresh baselines and runtime/Frame continuity; adds independent Viewport baseline/currentness. |
| §9 terminal | Revision-3 §2/§5 preserves original profile/input/render families and once-only terminal; adds explicit `viewport` family, no authority mutation. |
| §10 Hostra/PWA | Revision-3 §2/§6 retains WebSocket text vs MessagePort string trace equivalence; PWA evidence stays with its platform milestone. |
| §11 revision-2 corrections | Revision-3 opening paragraph/§3/§6 preserve Input gate convergence, callback containment and bounded Input backlog before generic writer. |

This is a **normative-text crosswalk, not a test execution or independent approval**. Only the explicitly enumerated deltas override historical three-child statements. If an executable fixture is discovered missing or an unchanged rule cannot be located, STOP and restore the exact clause into the canonical file before Freeze; do not silently waive it.

## 4. Intended minimal change ownership

Core only: [Viewport State v1](../15-contracts/viewport-state-v1.md), [Viewport conformance](../15-contracts/viewport-state-conformance-v1.md), [revised Profile v1](../15-contracts/renderer-data-profile-v1.md) and [its conformance](../15-contracts/renderer-data-profile-conformance-v1.md), [viewport capability](../10-architecture/viewport-capability.md), the minimal Data/Renderer/Subsystem seam, ADR0037, editorial current-composition link in Frozen Connection and test/qualification ledger. Product owns Desktop/PWA `innerWidth/innerHeight` selection and coordinated build cohort. Map alone owns [dynamic viewport/performance draft](../../examples/essentials-v21.1-local/MAP_DYNAMIC_VIEWPORT_PERFORMANCE_REFACTOR_DRAFT.md), [private motion staging](../../examples/essentials-v21.1-local/MAP_VIEW_SPRITE_MOTION_STAGE_CLOSURE.md) and PR0 evidence; Map P95/Canvas/autotile/chunks are NOT Core Docs Freeze conditions.

No edits to Frozen Control/Input/Render wire, M13 Projector, Main `S/G/P` authority, Frame lifecycle, generic Environment service, or new protocol versions. Restore history rather than rewrite an old decision to disguise supersession. The phase plan's small C0/C1/PR0–PR3 insert is the only intended global schedule delta.

## 5. Remaining gates — never invent a PASS

- **Closed/non-blocking:** Project owner attested no npm consumers on 2026-09-16. Do not perform npm verification, require npm consumer evidence or reintroduce that item as a Freeze blocker.
- **Core C0:** Record only independent **non-npm** old-`/1` identity/consumer commitments and persisted/mixed-deployment questions, with relevant owner/date/decision; actual need to interoperate with old binary means STOP direct identity replacement and revisit ADR0037.
- **Core docs:** Independent reviewer verifies this crosswalk, current canonical spec clarity, Frozen Connection editorial diff, current index references and document links, then signs exact docs-only SHA.
- **Core C1:** Implement/requalify new cohort on executable SHA; do not inherit old three-child PASS.
- **Map:** PR0 empirical payload/validation/M13/Chromium stacking/memory/local FSDB evidence, then separate Map Docs Freeze; PR1/PR2 after Freeze; postimplementation P95 and product qualification in PR3.

This change restores source text and records the old→new clause map; it does not run tests, perform npm verification, confirm other distribution channels, prove CSS stacking, modify production code, or authorize a low-judgment implementation agent to bypass remaining open gates.
