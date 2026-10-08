# Current performance and Terrain qualification evidence

> Recorded 2026-10-09 from base `365912076e1541307189ad20eb36c654ef357541`. Performance is formally qualified on `PERF_SUBJECT=6ade9506f0ef459e30e610505f4a788434b1e5f4`. Terrain product/static evidence is current on `TERRAIN_SUBJECT=a5e406827d0e3814dad3ac797c4b5f13015173a0`; original RGSS dynamic qualification and authorized sign-off remain external gates. This ledger does not create `TERRAIN_BEHAVIOR_CONTRACT_V1.md` or claim `DYNAMIC-OBSERVED` evidence.

## Qualification subjects

`BASE_MAIN=365912076e1541307189ad20eb36c654ef357541`

The audit classified the relevant descendants as follows:

| Commit | Relevant changed paths | Performance executable | Qualification input | Disposition |
| --- | --- | --- | --- | --- |
| `344f9b60e798574872881fb66338fb2be2dd9ffb` | Desktop input/viewport sources; shared Renderer browser adapters; Data/Input surfaces | Yes | Yes, through the product path | Last product behavior change in the audited performance path |
| `199bfe9c8b527f86a7be2a342f49650875a9ca1e` | Desktop viewport composition test and qualification docs | No | Boundary regression only | Does not replace the full performance subject |
| `dc798c7a0c088d221beb62398238951266ee3050` | M13 Chromium fixture teardown | No | M13-only | Not a movement-performance subject |
| `d9a9cad230a47d101733b5d5777af2392b4606f6` | PWA workflow | No | No Desktop/native input change | CI-only |
| `90e64f4` through `a5e4068` | M14 exact-local workflow, adapter and boundary assertions | No current movement-path change | Yes, M14/Terrain exact qualification | Final Terrain qualification-input subject is `a5e4068` |
| `6ade9506f0ef459e30e610505f4a788434b1e5f4` | `test/map-viewport-pr0.test.mjs` | No production change | Yes, current performance probe now uses the production `layout + tiles` schema | Final performance subject |

The commits after `a5e4068` on `main` were documentation/governance descendants or unrelated qualification work. This branch changes no production executable. The `6ade950` probe correction is performance-only and does not reopen the frozen M11, M14, or M15 contract subjects. The final evidence/documentation commit is not an executable subject.

## Performance acceptance matrix

| Metric | Authority | Threshold and sample contract | Environment |
| --- | --- | --- | --- |
| Ordinary input-captured to first-motion-paint P95 | [movement specification](./render-movement-latency-spec.md) | `<=50ms`; three rounds, 100 valid samples per viewport per round | Same Browser Window `performance.now()` in frozen Hostra |
| Tile-window refresh first-motion-paint P95 | [movement specification](./render-movement-latency-spec.md) and M15 product profile | Movement close requires `<=50ms`; M15 per-viewport ceilings remain 50/75/100ms; three rounds, 30 valid samples per viewport per round | 640×480, 1280×720, 1920×1080 |
| Invalid samples | Canonical Hostra full profile | At most 5% per round; invalid attempts are retained in the report | Same run |
| Camera-only work | Frozen performance implementation contract | At least 95% camera-only; ordinary moves must not add tile draws | 300 ordinary samples per viewport |
| Visual correctness | Current pixel oracle | All priority/equal-depth/tall-sprite cases pass | Repository Chromium pixel oracle |
| Memory | Current viewport probe | visible backing `<=128MiB`; live backing + decode `<=256MiB`; current view JSON `<192KiB` | Current production payload and bounded dense fixture |

No threshold, sample count, timeout, validator, or failure filter was changed.

## Formal native performance result

Canonical command:

```text
HOSTRA_SOURCE_DIR=<clean checkout d863beab3c59c3bd4f271514a228fa8fee0bf5b6>
GITHUB_SHA=6ade9506f0ef459e30e610505f4a788434b1e5f4
npm run test:m15:hostra:full
```

The command passed 16/16 tests, with no failures or skips. Statistics use the harness's nearest-rank percentile calculation.

| Viewport | Ordinary n / P50 / P95 / max | Refresh n / P50 / P95 / max | Invalid / attempts | Camera-only and zero tile draw | Result |
| --- | --- | --- | --- | --- | --- |
| 640×480 | 300 / 12.1 / 14.9 / 17.3 ms | 90 / 25.9 / 29.3 / 32.1 ms | 1 / 528 (0.19%) | 300/300; 300/300 | PASS |
| 1280×720 | 300 / 12.2 / 15.0 / 16.4 ms | 90 / 37.3 / 40.9 / 43.2 ms | 1 / 552 (0.18%) | 300/300; 300/300 | PASS |
| 1920×1080 | 300 / 12.3 / 15.2 / 19.7 ms | 90 / 46.7 / 50.0 / 53.6 ms | 1 / 572 (0.17%) | 300/300; 300/300 | PASS |

The raw full-profile artifact is stored only in gitignored `.local/qualification/final/map-viewport-pr3-hostra-6ade950.json`; SHA-256 `72a3a1db4b5db9b75abd5a4724673a81b481f98972d782b5e39b9b5d7bf07502`.

The current-schema pixel/memory probe passed 9/9. Its gitignored raw artifact is `.local/qualification/final/map-viewport-pr0-node-6ade950.json`; SHA-256 `60bd09d4b6b5164670b74cf2ade24d34a3c5199333af878a82885d68a5775e23`.

- Pixel stacking oracle: 4/4 PASS, including priority 0, priority 5, equal depth and tall-sprite cases.
- 1280×720: view JSON 73,762 bytes; backing 34,320,384 bytes; camera-only delta +1 with zero draw delta.
- 1920×1080: view JSON 146,209 bytes; backing 68,628,480 bytes; camera-only delta +1 with zero draw delta.
- Maximum bounded visible backing: 124,502,016 bytes, below 128MiB.
- Maximum bounded live backing plus decode: 249,167,872 bytes, below 256MiB.

Historical `42.9ms / 96.3ms`, PR0–PR3 and remediation figures remain historical only. They were not used to qualify this subject.

### Measurement environment

- Windows 11 Home, build 26300, x64.
- AMD Ryzen AI 9 365 with Radeon 880M, 10 physical / 20 logical processors.
- 25,359,659,008 bytes physical RAM.
- AMD Radeon 880M Graphics, driver `32.0.31021.1015`.
- Active display 1600×2560 at 144Hz; logical DPI 192×192 (200% scaling).
- Node `v24.19.0`; npm `11.17.0`.
- Hostra `1.0.1-beta.1`, source `d863beab3c59c3bd4f271514a228fa8fee0bf5b6`.
- Electron `44.1.1`; Chromium `152.0.7977.65` (reported by the frozen Electron executable).
- Worktree was clean at measurement subject except for the expected generated tracked artifact, which was copied to `.local/` and restored immediately after hashing.

## Terrain and original RGSS evidence

No `Game.exe`, `RGSS*.dll`, mkxp runtime, or another original executable was present in the repository-adjacent legal search scope. The available source copy contains legal local data/resources but is not the repository-pinned exact M14 source package: after excluding an extraneous `.desc.meta`, exact-source identity correctly rejected it for missing `mkxp.json`. Therefore this run cannot produce original `DYNAMIC-OBSERVED` traces. Static replay and LoomRealm product observations below are deliberately not relabelled as original RGSS behavior.

The legal local FSDB fingerprints match the recorded corpus:

| File | SHA-256 |
| --- | --- |
| `Map007.rxdata` | `c34ddaaec265241fd35149d6d3758f8f08a5503b057c891e396c39b08518c6b7` |
| `Map021.rxdata` | `cd226a09dbf5cbfd2207edd44fb7dd419327ae901a1f1c0f6ad35601df85c575` |
| `Map047.rxdata` | `5f4ee232e4f4b8b44950f826b13cd601ffecb87e455c1dda92c5908152df043e` |
| `MapInfos.rxdata` | `8ed090fb27db75e046755896e0d4dbb53fa6de6279d21865315dd60f868d5007` |
| `Tilesets.rxdata` | `433033b45527c0f07b781c862724df64d6a416c0ac2ed71907f645c0b2219fa6` |
| `CommonEvents.rxdata` | `196c5ee7f51e656b79514ce203f4077f4b12ff55192ebdf4dd0aefdd7734de12` |

Sanitized extractor artifacts remain gitignored. Their SHA-256 values are:

- Map7: `7b3eafaf743f232fa781e7c82f27d6af7507a90467b10b70c5c7c847f712d9e8`.
- Map21: `55d5c50f85a77817f9929f5a5c8e5384f64b3a5547b36f9b48babda35c7a9159`.
- Map47: `f22a03f9be4541bbbae4a34ad8222fc57c69f05767daae6e082f0f46548a4ae3`.
- Independent recount: `ea195b176db54bc7940015d923fd47921050c061df75f04f9a97a9e2b7ec9891`.

Static findings remain: Map7 is a complete negative in the declared scan; Map21 has 93 placed/unique tag-15 cells and eight confirmed events. The four static On/Off adjacency groups are `(4 On, 28 Off)`, `(10 On, 7 Off)`, `(22 On, 20 Off)`, and `(25 On, 23 Off)`. Four continuous live static replays walk real tag-15 cells and return to Map7 with `bridgeLevel=0`. Map47 has 30 placed/unique Ledge cells (tile IDs 1194/1198/1212, bounding box x=14–45/y=10–18); `(16,9)` down crosses `(16,10)` and lands at `(16,11)`, while reverse movement is blocked.

Current LoomRealm product observations passed on the legal local FSDB: Map21 On changes `bridgeLevel`, and Map47 performs one product jump from `(16,9)` to `(16,11)`. The current product's 400ms jump remains a product fact, not a proven original timing. Source-blocked, destination-blocked, boundary and intermediate-event cases are covered by redistributable synthetic tests only because the real Map47 corpus does not contain all such cases.

### FG disposition

| Gate | Current disposition |
| --- | --- |
| FG-01 original facts | **BLOCKED — EXTERNAL ORIGINAL RUNTIME REQUIRED.** No original RGSS frame trace was available. |
| FG-02 data/import | **TECHNICAL PASS / SIGN-OFF PENDING.** Current schema, migration, importer, live FSDB and producer/consumer tests pass on `a5e4068`. |
| FG-03 event state | **PRODUCT/STATIC PASS; ORIGINAL DYNAMIC BLOCKED.** Start/execute/held-input/blocked/here product coverage passes, but original per-frame ordering is unobserved. |
| FG-04 motion/display | **PRODUCT/STATIC PASS; ORIGINAL DYNAMIC BLOCKED.** Jump/depth/occlusion product and pixel coverage passes, but original timing/interpolation is unobserved. |
| FG-05 license/CI | **POLICY B DRAFTED; MAINTAINER APPROVAL REQUIRED.** Use synthetic-only CI + legal local original qualification + repository-only sanitized facts/digests. No redistribution permission was found. |
| FG-06 formal contract | **READY FOR AUTHORIZED SIGN-OFF AFTER FG-01/03/04 AND FG-05.** No authorized approval exists; no V1 contract was created. |

For C-01 through C-08: C-01 and C-07 are technically satisfied; C-02/C-03/C-05 have current product/static coverage but retain their original-dynamic caveat; C-04/C-06 require original timing/order evidence; C-08 remains blocked on FG-01/05/06. DEC-01 through DEC-07 remain `UNSIGNED / REVIEW REQUIRED`; historical alternatives are not converted into approvals by this run.

## Regression record

- `npm ci`: PASS (206 packages; audit findings were not auto-fixed).
- `npm run build:m15`: PASS.
- `npm run test:m14:pr`: PASS, including Map 106/106, local live-FSDB product 3/3 and Chromium vertical 3/3; 0 fail/skip in those suites.
- `npm run test:m15:desktop`: 15/15 PASS, 0 fail/skip.
- `npm run test:m15:hostra:full`: 16/16 PASS, 0 fail/skip.
- `node --test test/map-viewport-pr0.test.mjs`: 9/9 PASS, 0 fail/skip.
- `npm test --workspace=@loomrealm-game/map`: 106/106 PASS, 0 fail/skip.
- Focused Map evidence/Map21/Map47 suite: 54/54 PASS, 0 fail/skip.
- `npm run test:fixtures`: 117/117 PASS, 0 fail/skip.
- `node --test test/terrain-behavior-live-product.test.mjs`: 3/3 PASS, 0 fail/skip; the local corpus was present, so these were not skips.
- `npm run test:regression`: PASS. The Hostra and fsdb-http packages reported their existing Windows symlink-privilege/POSIX-only skips (5 and 1 respectively); they are recorded as skips, not passes. No test failed.

The exact-local command was also attempted against the discovered source directory. It stopped before product execution because the directory is not an identity-valid exact source (`.desc.meta`, then missing `mkxp.json` in a filtered mirror). This is an unavailable legal input, not a product PASS or failure, and does not supersede the already-closed M14 subject.

## Legal and closure boundary

This branch commits no original `.rxdata`, PBS, Graphics, Audio, `Game.exe`, RGSS DLL, complete event text, screenshot, dynamic log, browser cache, `node_modules`, or raw machine artifact. CI remains synthetic and redistributable. Original dynamic capture must occur only in a legal local environment and commit only sanitized structural facts.

Performance route 4 is closed by current native evidence. Terrain route 5 remains open for an original RGSS runtime/corpus and authorized maintainer decisions/sign-off. No product divergence requiring a code change was observed.
