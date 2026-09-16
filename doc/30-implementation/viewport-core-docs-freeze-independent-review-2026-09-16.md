# Viewport / revised Renderer Data Profile v1 — independent Core Docs Freeze review

> **Formal independent review of the final post-fix docs-only subject. This page is the Freeze signoff evidence, not a second wire SSOT and not an executable PASS.**  
> Date: 2026-09-16.  
> Approved subject SHA: [`4cbf620ebe8aec0e7fb33743813c5d1f2885e6a9`](https://github.com/lithdoo/loom-realm/commit/4cbf620ebe8aec0e7fb33743813c5d1f2885e6a9) (`origin/main` HEAD at review time).  
> Technical-repair contract subject (byte-identical normative contracts): [`7db45f29e1bf30261468ef03ec7acd80ae3b8b8d`](https://github.com/lithdoo/loom-realm/commit/7db45f29e1bf30261468ef03ec7acd80ae3b8b8d).  
> Reviewer: Cursor Grok 4.6, acting as a reviewer independent of the ChatGPT author of [`viewport-core-final-review-2026-09-16.md`](./viewport-core-final-review-2026-09-16.md). Git commits on the subject were authored as `lithdoo`; this reviewer did not write those CR repair documents and does not re-sign them under another name.  
> Unique live status after this registration: [Core qualification ledger](./viewport-profile-v1-qualification.md).

This review inspects the **docs-only** tree at `4cbf620`. It does not execute tests, does not scan npm, and does not claim Core Implemented or Core Qualified.

## 1. Subject identity

```text
origin/main HEAD reviewed     4cbf620ebe8aec0e7fb33743813c5d1f2885e6a9
technical repair subject      7db45f29e1bf30261468ef03ec7acd80ae3b8b8d
7db45f29..4cbf620             only ledger/review/closure status prose
                              (3 files; no contract/schema/currentness/diagnostic change)
```

Compared `7db45f29..4cbf620`: `viewport-core-final-review-2026-09-16.md`, `viewport-profile-v1-qualification.md`, `viewport-v1-final-freeze-closure-2026-09-16.md`. Normative Profile, Viewport, Connection, Input, Render, and conformance files are unchanged after `7db45f29`. Freeze therefore attaches to the complete documented tree `4cbf620` without treating later status edits as a new protocol subject.

## 2. CR disposition

| ID | Independent check | Result |
|---|---|---|
| CR-01 Current architecture conflict | `doc/10-architecture/renderer-subsystem-protocol-layers.md` projects four-child `/1` and `viewport.state` demux; Input/Render/Control/Connection chapters remain the Frozen bodies. Commit [`ce57cf1`](https://github.com/lithdoo/loom-realm/commit/ce57cf1d95bf0713a4f9675a53676a899c18c8cf). | **Closed in final docs.** |
| CR-02 Module-entry omission | Subsystem model Runtime `scope.viewport` API present; Renderer module projects typed sender + product source and states Viewport is not an M13 trigger; Data DESIGN retains M8 API and links additive [`VIEWPORT_V1_IMPLEMENTATION_DELTA.md`](../../packages/data/VIEWPORT_V1_IMPLEMENTATION_DELTA.md). Commits [`feb1054`](https://github.com/lithdoo/loom-realm/commit/feb10549acb384a33a2fedd2ab24361d4ab07bda), [`ccb5304`](https://github.com/lithdoo/loom-realm/commit/ccb53047a0cb29b1ee8ac52ca5ea2d19e511ab19), [`2556dfc`](https://github.com/lithdoo/loom-realm/commit/2556dfc8d4b1db645970f113e8927dd84d30e66f). | **Closed in final docs.** |
| CR-03 Non-npm compatibility / mixed-binary | Owner attestation recorded in §3 of this review. npm consumer already owner-closed and was not re-queried. GitHub Releases `[]` remains a single-channel fact from 2026-09-16, not proof of all channels. | **Closed by owner fact, not by channel scan.** |
| CR-04 Post-terminal subscribe | Viewport v1 §6 and conformance §2 require inert post-terminal `subscribe` with zero callbacks. Commits [`b896173`](https://github.com/lithdoo/loom-realm/commit/b896173949819ea9da612b8ba31ec6bf12b3a7ad), [`a8ff94e`](https://github.com/lithdoo/loom-realm/commit/a8ff94e1d62e10dbdff58848f39f094b76947b5b). | **Closed in final docs; not executed.** |
| CR-05 Historical Frozen misuse | Original 528-line Profile and 206-line revision-2 conformance retained as NOT CURRENT wrappers + verbatim blobs; current entry is four-child `/1` + fixture revision 3. Commits [`047e4ba`](https://github.com/lithdoo/loom-realm/commit/047e4ba5934c6ad45a154dbc19a51a4a8c9c507d), [`eb2e488`](https://github.com/lithdoo/loom-realm/commit/eb2e488a4c31346e3897e4b1191a84c3076fb5cf), [`66b2009`](https://github.com/lithdoo/loom-realm/commit/66b20091859946c8a47feb6cd58a27cf161154d0). | **Closed in final docs.** |

No undocumented protocol conflict requiring STOP was found in the listed Current contracts, ADR0037, Data delta, or qualification ledger. This is a targeted cross-file review of the freeze subject, not an automated whole-tree URL audit.

## 3. Owner non-npm compatibility attestation (this conversation)

Project owner `lithdoo`, 2026-09-16, in the Core Viewport delivery instruction that opened this review session, confirmed the previously pending compatibility premises:

```text
Non-npm known independent /1 interoperability requirement: none attested
Persisted old-peer / rolling / rollback mixed-binary requirement: none attested
Build/deployment cohort: single unified corrected four-child /1 cohort
Old three-child /1 binary mixed with new four-child /1 binary: forbidden
Evidence type: owner attestation in the delivery conversation
Not: npm registry query, Releases/channel scan, or a running mixed-peer test
```

This closes ledger §2 CR-03 for Docs Freeze. It does not invent external-channel emptiness beyond the already-recorded GitHub Releases `[]` fact, and it does not pre-fill future C1 artifact SHAs.

## 4. Normative navigation checked

Current entries at the subject SHA:

- [ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md) — Accepted; `/2` not to be implemented.
- [Profile `/1`](../15-contracts/renderer-data-profile-v1.md) — `Connection1 + Input1 + Render1 + Viewport1`.
- [Profile conformance revision 3](../15-contracts/renderer-data-profile-conformance-v1.md) — inherits revision 2 except the enumerated four-child overlay.
- [Viewport State v1](../15-contracts/viewport-state-v1.md) and [Viewport conformance](../15-contracts/viewport-state-conformance-v1.md).
- Frozen [Connection v1](../15-contracts/renderer-subsystem-data-connection-v1.md) remaining a zero-message currentness contract.
- [Data DESIGN](../../packages/data/DESIGN.md) + additive [implementation delta](../../packages/data/VIEWPORT_V1_IMPLEMENTATION_DELTA.md).
- Historical wrappers remain NOT CURRENT.

Unchanged by this freeze: Control / Input / Render wire, limits, authority, and lifecycle; Map Docs Freeze remains independent and HOLD.

## 5. Approval

**Approved: Core Docs Frozen** for subject `4cbf620ebe8aec0e7fb33743813c5d1f2885e6a9`.

```text
Core Docs Frozen     YES (this signoff)
Core Implemented     NO
Core Qualified       NO
Map Docs Freeze      HOLD / independent
/2                   still cancelled; do not implement
```

The commit that records this approval is a **registration commit**, not a new normative subject. If later commits change schema, currentness, diagnostic family, limits, or authority, this approval does not cover them.
