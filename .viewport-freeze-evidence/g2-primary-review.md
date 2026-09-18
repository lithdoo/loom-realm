# G2 Primary Independent Technical Review — record

- Reviewed exact subject SHA: `5d74590fcde6d79d815f774cc1c6cffe33fd2952`
  (clean checkout verified at `E:\Repo\lithdoo-lab\loom-realm-freeze-subject`, HEAD == subject)
- Reviewer identity: Independent subagent session `ses_f4cd29ebfffe78EO4fjbYgqACQ`
  (general-purpose agent, fresh context; no role in authoring the reviewed documents,
  and distinct from the implementing agent of this branch)
- Date: 2026-09-18
- Method: read-only tree inspection at the exact SHA + `git cat-file`/`git diff`/`git grep`
  against baseline `ae7b149b9f4e18312dd44762ae943d7a68648acb`; reviewer-side
  `npm run docs:check-links` at that SHA → exit 0, "Documentation links OK: 523 relative
  link(s) across 102 Markdown file(s)".

## Verdict: REQUEST CHANGES (two blocking defects; zero semantic defects in the formal contracts)

Checklist outcomes recorded by the reviewer:

| Item | Result |
|---|---|
| (a) Self-contained contracts; old §1–14 / revision2 obligations preserved | PASS (blob-level comparison `1a8aaefe` / `ebe88c11` at `ae7b149`) |
| (b) P3-02 / V-04 classification (profile vs viewport vs local-fatal; no inherited/getter wire fixture) | PASS |
| (c) `publishState` void / §4 publisher algorithm (A→B→A, admitted B, terminal, blocked writer, bounds) | PASS |
| (d) Participant/source lifecycle; platform-agnostic RendererViewportSource | PASS |
| (e) Scope semantics vs V-09..V-13 | PASS |
| (f) Cross-document consistency | FAIL → D1, D2 (below) |
| (g) Implementability in data/renderer/subsystem within forbidden zones | PASS |

## Blocking defects and resolution status

- **D1 — ledger candidate SHA mismatch at subject tree.** At `5d74590` the ledger still
  recorded candidate `f938fb7d15f6d101ea43bf6e155deb3f16e43661`. Resolution: BASE commit
  `72de3efbb6ffffafdecefd6224273edb12ee02ed` is exactly the prescribed metadata-only
  re-pin — `git diff --stat 5d74590 72de3ef` touches only
  `doc/30-implementation/viewport-core-freeze-ledger.md` (33/33), and the BASE ledger
  records candidate `5d74590...`. The docs body is byte-identical between subject and
  pin, so reviewed semantics == pinned semantics == owner-approved SHA.
- **D2 — `doc/10-architecture/renderer-subsystem-protocol-layers.md` asserted the old
  three-child composition as current/Frozen with no mitigation.** Resolution: branch
  commit `dd3856908ab129a6a4f6e0791434ddd05ab10375` applies the narrow
  caveat/ledger-pointer pattern of `communication-system.md` §6; no formal contract
  touched; `npm run docs:check-links` on the branch → exit 0 (528 links / 102 files).
  Delta re-verification: independent subagent session
  `ses_f4cbc8abfffecRw3TAazW4uspn` (foreground retry after the first background
  attempt `ses_f4cbe39bbffeoOGPJ4fYb8zFH6` was interrupted before producing output)
  → **APPROVE**:
  - D1: `git diff --name-only 5d74590 72de3ef` → only the freeze ledger; BASE ledger
    records candidate `5d74590...`; docs body byte-identical.
  - D2: `git show --stat dd38569` → only the architecture doc (18+/8-); whole-file
    re-read confirms no residual three-child current assertion (layer map, §4 equation,
    demux line, invariant 3 all four-child); `git diff 5d74590 HEAD -- doc/15-contracts/
    doc/decisions/ doc/20-modules/ VIEWPORT_CORE_INTERFACE_DESIGN_DRAFT.md
    packages/data/VIEWPORT-V1-CORRECTION.md doc/30-implementation/` → only the ledger
    (D1's own prescribed re-pin); new text consistent with Profile §14, Viewport
    status header, and communication-system.md §6 pattern.
  - `npm run docs:check-links` on branch → exit 0 (528 links / 102 files).

## Non-blocking observations (recorded, intentionally not applied)

1. V-06 fixture wording compresses the admission interleaving; §4 algorithm is
   unambiguous. Fixing conformance wording would reopen the frozen subject — declined.
2. Agent-entry allowlist phrasing broader than ledger §3 exact files; precedence already
   defined (entry item 6 defers to the ledger). Declined to avoid subject delta.
3. `doc/20-modules/README.md` does not index `viewport-core.md`; no three-child
   assertion exists there. Declined to avoid subject delta.
4. Preflight sub-order nuance (doc lists representation before depth; code checks depth
   first): same family and same fail-closed result; informational only.

Reviewer's explicit statement: "The four formal contract texts (Profile v1, Viewport
State v1, Profile conformance rev 3, Viewport conformance) are technically sound,
self-contained, mutually consistent, and implementable within the stated forbidden
zones; I found no semantic defect in the formal contracts themselves."

Full review text preserved verbatim in this session record; key sections reproduced
above. (The review was delivered as the subagent's final response on 2026-09-18.)
