# M14 Map Game Qualification Record

## Status

**Requalification Pending — current implementation subject `c642cda9cee2b318b3aa8f6285de05d6b6ed6bea`.**

The previous Closed decisions remain historical records for subjects `fd1df5872d4310e268857e700a067f4e0b9e75d1` and `a838a4fa43fc57bdaaf4f52bf7bc076bb4771e9f`; neither qualifies the changed executable subject. The latter had hosted `test:m14` Node 24 evidence, but its dedicated M14 Node 20 run was cancelled after a Chromium hang. Current-subject closure therefore requires a new complete same-subject evidence set.

The M14 architecture and consumer contract remain frozen. The current implementation is complete, while same-subject qualification is pending under the rule below.

This file is the **single source of truth** for M14 formal qualification status and evidence. `M14_01`–`M14_04` freeze implemented contracts/behavior; `M14_05` defines the closure gate. Those documents must not independently mirror a live `Qualified / Closed` claim.

## Qualification subject

Current qualification subject：

```text
c642cda9cee2b318b3aa8f6285de05d6b6ed6bea
fix(render): preserve update closure invariants
```

A qualification subject is the last commit that changes M14 executable behavior or qualification inputs. Later docs-only commits that only record/explain evidence do **not** create a new subject.

Any later change to M14 Runtime/importer/browser behavior, prepared Content, fixture, test/harness, workflow/execution configuration, or consumed M10–M13 behavior creates a new qualification subject and invalidates the current formal-closure decision until requalified.

## Current-subject evidence

| Gate | Required evidence | Status |
| --- | --- | --- |
| Local map/vertical/boundary/projection | `npm test -w @loomrealm-game/map`, `test:m14:vertical`, `test:m14:boundary`, `test:m14:projection` on `c642cda9cee2b318b3aa8f6285de05d6b6ed6bea` | **PASS — local Windows `npm run test:m14`, 2026-09-16** |
| Exact Essentials v21.1 local | `npm run test:m14:essentials-local` against exact corpus | **FAIL — import + FSDB validation PASS；qualification script expects obsolete Tileset shape without `autotile_names`** |
| Hosted Node 20 | `npm run test:m14` on the current subject | **PENDING** |
| Hosted Node 24 | `npm run test:m14` on the current subject | **PENDING** |
| Formal M14 closure | all required rows target the same qualification subject | **Requalification Pending** |

Previous-subject hosted evidence remains historically valid only for `fd1df5872d4310e268857e700a067f4e0b9e75d1` ([M14 run 34621763706](https://github.com/lithdoo/loom-realm/actions/runs/34621763706)) and `a838a4fa43fc57bdaaf4f52bf7bc076bb4771e9f` ([M14 run 34998417357](https://github.com/lithdoo/loom-realm/actions/runs/34998417357)); it must not be promoted to the current subject.

### Current exact-local blocker — 2026-09-16

The exact corpus run used the frozen Map066 selection (`mapId=66`, `x=8`, `y=7`, `characterName=trainer_POKEMONTRAINER_Red`) and the existing local Essentials v21.1 archive. Import completed with `7677/7677` physical files classified and FSDB validation PASS. The run then failed in `scripts/m14-essentials-local.mjs` before gameplay because the assertion expected：

```text
[id, tileset_name, passages, priorities]
```

while the current `struct.Tileset` record correctly exposed：

```text
[id, tileset_name, autotile_names, passages, priorities]
```

That script is outside the frozen movement-refactor file list. Do not hide this by filtering `autotile_names` or weakening closed-shape evidence. A separately authorized qualification-input correction must align the exact-local assertion with the current Tileset contract, establish a new subject `S`, and rerun the complete downstream evidence chain。

## Why requalification was required

Review of the earlier closure found two exact-local shortcuts weaker than the frozen claim：

1. directional input did not fully traverse the canonical RendererInputSource → M10 → Frame-bound InputListener path；
2. exact-local Content/resource evidence did not fully traverse the Desktop FSDB HTTP service + standard bound ContentClient, including MIME evidence from that seam.

The hardened subject closes both gaps without adding a second Runtime path or reopening M10–M13 public contracts. The hardening also strengthened passability branch evidence, author-API surface discipline, Custom Element conflict handling, projected-Table fail-closed validation and renderer-internal qualification boundaries.

## Current exact-local evidence

Exact-source compatibility for the hardened subject is recorded as PASS.

Source fingerprint：

```text
sha256:da0a34ec81ed40a4346fe6101debd7d938cbeadd43ff0aad87c3e388392a1665
```

Selection：

```text
map: 1
spawn: (10,8)
character: trainer_POKEMONTRAINER_Red
projected tileset: Poke Centre interior
```

Observed importer/content evidence：

- 7,677 / 7,677 physical objects classified；
- 110 Marshal roots decoded；
- 49 RMXP classes encountered；
- zero discarded Marshal nodes or RMXP ivars；
- production FSDB validation PASS；
- real Tileset and Character resources resolved from the local prepared FSDB；
- exact records/resources traversed the production Desktop FSDB HTTP service and bound Subsystem ContentClient；
- observed MIME/contentVersion came from that Content seam, not direct filesystem reads or hard-coded MIME.

Exact v21.1 exposed unreferenced non-null editor placeholders 24 and 25 with empty `tileset_name`. The consumer projection was minimally refined to omit only unreferenced empty-name placeholders；a referenced empty-name entry still fails closed.

## Current exact-local input evidence

The selected non-repeat ArrowRight traversed：

```text
synthetic RendererInputSource
→ Renderer Input Gate
→ Data
→ Subsystem InputManager
→ Frame-bound InputListener
→ @loomrealm-game/map handler
```

The local qualification no longer invokes a captured listener handler directly.

Observed result：

```text
world position: (10,8) → (10,8)
facing: 2/down → 6/right
```

The persisted passability facts blocked movement while the frozen attempted-facing rule still committed direction before Render replacement.

The same map Runtime/browser artifacts started in Chromium；the browser observed a 640×480 viewport, real non-transparent regular-tile pixels, a real player sprite and the required `lr-map-view > lr-map-sprite` managed light DOM.

Third-party source bytes and generated local FSDB remain under ignored local paths and are not recorded in the repository.

## Canonical synthetic behavior retained by the hardened subject

The canonical fixture continues to define：

```text
initial:
  world=(10,8)
  facing=2/down
  camera=(16,32)
  screen=(304,224)

first ArrowRight:
  world=(11,8)
  facing=6/right
  camera=(48,32)

second ArrowRight:
  blocked by tile 385 reverse-entry passage bit
  world/camera unchanged
  facing remains 6/right
```

The gameplay Frame remains pending until cancellation and owns one Frame-bound `keyboard.event` listener. The map business path owns one SDK-assigned opaque RenderDomain.

Chromium qualification is expected to continue proving the frozen M14/04 evidence：640×480 Canvas rendering, regular tile 384/385 source selection, 4×4 player direction-row crop, managed DOM identity retention, full-state stale-pixel clearing, delayed same-resource currentness and fail-closed foreign Custom Element conflicts.

## Historical evidence — not current closure evidence

Earlier qualified implementation：

```text
d415742f337ff8613c2e349cebb9a820dc0bda72
```

Historical hosted run：

```text
GitHub Actions run 34446050878
Node 20.20.2 M14-specific suite: 18/18 PASS, including Chromium
Node 24.20.0 M14-specific suite: 18/18 PASS, including Chromium
full canonical CI: PASS
```

Historical local canonical runtime recorded Node `22.12.0`, npm `10.9.0`, with `npm run test:m14` PASS.

This evidence demonstrates that the pre-hardening implementation was healthy, but it does **not** satisfy hosted Node 20/24 evidence for subject `fd1df5872d4310e268857e700a067f4e0b9e75d1`.

## Formal closure rule

M14 may return to `Closed` only when this record contains hosted Node 20 and Node 24 PASS evidence for the current subject in addition to the current exact-local PASS：

```text
current subject S
+
exact v21.1 local PASS
+
hosted Node 20 npm run test:m14 PASS
+
hosted Node 24 npm run test:m14 PASS
→ M14 Closed
```

The resulting status is：

```text
architecture / contracts     frozen
implementation               complete + hardened
exact-local qualification    FAIL — stale qualification assertion
current hosted qualification PENDING — Node 20 + Node 24
formal M14 milestone         Requalification Pending
```

No M14 architecture or consumer redesign is authorized merely to change the status label. Run the frozen local and hosted gates on the current subject；if they expose a real behavioral failure, fix that concrete failure and establish a new qualification subject. Only after all same-subject evidence passes may this ledger and repository projections return to `Closed`.
