# Current performance and Terrain qualification evidence

> Recorded 2026-10-09 from base `365912076e1541307189ad20eb36c654ef357541`. The current executable and qualification-input subject is `8131f6dd140ac21edb52879eb9ec1fd1a8cd7ba9`. Original Essentials v21.1 dynamic evidence is now available and the observed 500ms Ledge timing has been implemented. The strict movement refresh gate is **not closed** because 1920×1080 refresh P95 was `62.1ms` and `50.5ms` in two complete runs against a `<=50ms` requirement. M15's separate viewport-specific 50/75/100ms product gate passes. FG-05 still needs the maintainer's Policy B approval and FG-06 still needs an authorized reviewer; this ledger does not create `TERRAIN_BEHAVIOR_CONTRACT_V1.md`.

## Qualification subjects

`BASE_MAIN=365912076e1541307189ad20eb36c654ef357541`

| Commit | Relevant changed paths | Performance executable | Terrain executable/input | Disposition |
| --- | --- | --- | --- | --- |
| `344f9b60e798574872881fb66338fb2be2dd9ffb` | Desktop input/viewport, Renderer adapters, Data/Input | Yes | Product path only | Last pre-branch product movement change |
| `90e64f4` through `a5e4068` | M14 exact-local workflow, adapters and boundary assertions | Qualification input | Yes | Previous Terrain qualification-input subject |
| `6ade9506f0ef459e30e610505f4a788434b1e5f4` | `test/map-viewport-pr0.test.mjs` | Qualification input | No | Previous performance subject; historical after the Ledge fix |
| `c3e0cd6` | Qualification ledgers only | No | No | Evidence-only; not a subject |
| `8131f6dd140ac21edb52879eb9ec1fd1a8cd7ba9` | Map jump duration, Browser acceptance and regressions | Yes | Yes | Current `PERF_SUBJECT` and `TERRAIN_SUBJECT` |
| `d9d59c6741127a1e0cfdf3ff619d79b4c4074b01` | Qualification evidence and follow-up documentation | No | No | Hosted CI evidence checkout; not a new executable/input subject |

Changing jump from 400ms to the original-observed 500ms changes the current movement executable, so the former performance result cannot be inherited. M14 and M15 were requalified in dependency order. M11 and M13 were not reopened because their executable and qualification input did not change. Evidence-only documentation commits do not create another subject.

## Hosted CI evidence

Evidence checkout `d9d59c6741127a1e0cfdf3ff619d79b4c4074b01` passed every reported PR check:

- [M12–M15 qualification run 37901294648, attempt 2](https://github.com/lithdoo/loom-realm/actions/runs/37901294648/attempts/2): M12 Node 20/24, M13 Node 20/24, M14 Node 20/24, M15 Node 24 and the aggregate all PASS.
- [PWA M16–M17 run 37901294663](https://github.com/lithdoo/loom-realm/actions/runs/37901294663): PASS.
- [M9 run 37901294679](https://github.com/lithdoo/loom-realm/actions/runs/37901294679): Node 20/24 PASS.
- [RPGMap run 37901294678](https://github.com/lithdoo/loom-realm/actions/runs/37901294678): Node 24 PASS.
- [Documentation run 37901294683](https://github.com/lithdoo/loom-realm/actions/runs/37901294683): PASS.

Attempt 1 of run 37901294648 was not concealed: M14 Node 24 exceeded the existing fixed 30-second timeout in the real Chromium vertical (the Map suite had passed 106/106), while M12 Node 20 stopped making progress in its closure step. The stuck workflow was cancelled and only failed/incomplete jobs were rerun on the same checkout. No source, test, timeout, threshold, sample count or validator changed. Attempt 2 completed M12 Node 20 in about 62 seconds and M14 Node 24 in about 66 seconds; all jobs passed.

## Performance acceptance matrix

| Metric | Authority | Current threshold/sample contract | Environment |
| --- | --- | --- | --- |
| Ordinary input-captured to first-motion-paint P95 | [movement specification](./render-movement-latency-spec.md) | `<=50ms`; 3 rounds × 100 valid samples per viewport | Same Browser Window `performance.now()` in frozen Hostra |
| Tile-window refresh first-motion-paint P95 | [movement specification](./render-movement-latency-spec.md) | Strict movement close: `<=50ms`; 3 rounds × 30 valid samples per viewport | 640×480, 1280×720, 1920×1080 |
| M15 refresh product gate | [M15 ledger](./m15-qualification.md) | 640/720/1080: `<=50/75/100ms` | Same canonical full profile |
| Invalid samples | Canonical Hostra full profile | At most 5% per round; retained in raw report | Same run |
| Camera-only work | Frozen implementation contract | At least 95%; ordinary moves add zero tile draws | 300 ordinary samples per viewport |
| Visual correctness | Current pixel oracle | All priority/equal-depth/tall-sprite cases pass | Chromium pixel oracle |
| Memory | Current viewport probe | Visible backing `<=128MiB`; live backing + decode `<=256MiB`; current view JSON `<192KiB` | Current production payload and dense bounded fixture |

No gate, timeout, sample count, validator or failure filter was changed. The wider M15 thresholds are reported separately and do not replace the strict movement requirement.

## Native performance results

Canonical command, run twice from an installed clean frozen Hostra source:

```text
HOSTRA_SOURCE_DIR=<clean d863beab3c59c3bd4f271514a228fa8fee0bf5b6 checkout>
GITHUB_SHA=8131f6dd140ac21edb52879eb9ec1fd1a8cd7ba9
npm run test:m15:hostra:full
```

Both executions completed 16/16 tests. The test suite passes because its current product assertions use M15's viewport-specific refresh limits; the strict movement conclusion is evaluated independently below.

| Run | Viewport | Ordinary n / P50 / P95 / max | Refresh n / P50 / P95 / max | Invalid / attempts | Camera-only; zero draw | Strict movement | M15 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 640×480 | 300 / 12.9 / 15.5 / 16.2ms | 90 / 29.0 / 35.9 / 43.0ms | 2 / 529 | 300/300; 300/300 | PASS | PASS |
| 1 | 1280×720 | 300 / 14.5 / 15.6 / 21.4ms | 90 / 42.1 / 46.9 / 52.6ms | 5 / 556 | 300/300; 300/300 | PASS | PASS |
| 1 | 1920×1080 | 300 / 15.0 / 16.3 / 21.6ms | 90 / 53.5 / **62.1** / 71.6ms | 3 / 574 | 300/300; 300/300 | **FAIL** | PASS |
| 2 | 640×480 | 300 / 12.0 / 15.3 / 15.6ms | 90 / 27.7 / 29.8 / 32.4ms | 1 / 528 | 300/300; 300/300 | PASS | PASS |
| 2 | 1280×720 | 300 / 12.3 / 15.3 / 21.4ms | 90 / 36.1 / 41.6 / 43.2ms | 1 / 552 | 300/300; 300/300 | PASS | PASS |
| 2 | 1920×1080 | 300 / 14.8 / 15.5 / 22.7ms | 90 / 48.9 / **50.5** / 50.9ms | 1 / 572 | 300/300; 300/300 | **FAIL** | PASS |

Gitignored raw reports:

- Run 1: `.local/qualification/final/map-viewport-pr3-hostra-8131f6d-run1.json`, SHA-256 `d83be71bbd66cbdd1a884f7a8ce54f4a9327b2d53b9cc91939f5f43cb89e60bc`.
- Run 2: `.local/qualification/final/map-viewport-pr3-hostra-8131f6d-run2.json`, SHA-256 `37e059c3959b3859c43a6c0f072640d0ed84d075af25b143bf895f9aca06875c`.

The current pixel/memory probe passed 9/9. Raw report `.local/qualification/final/map-viewport-pr0-node-8131f6d.json`, SHA-256 `7ab41a407dce91993fc0709eee4cfbd7b90566183cf1e1569793a31d3d5b1c98`:

- Pixel stacking: 4/4 PASS (priority 0, priority 5, equal depth and tall sprite).
- Maximum visible backing: `124,502,016` bytes (`<=128MiB`).
- Maximum live backing plus decode: `249,167,872` bytes (`<=256MiB`).
- Ordinary camera-only behavior: 900/900 samples and zero tile draw 900/900 across each full run.

### Failure diagnosis and follow-up boundary

The second run misses the strict limit by 0.5ms and the first by 12.1ms. A best-of-two result is forbidden, so route 4 remains open. The current probes localize the size-dependent cost without pretending that independently sampled percentiles are additive:

| Existing measured segment | 640 P95 | 720 P95 | 1080 P95 | Interpretation |
| --- | ---: | ---: | ---: | --- |
| Real `RenderDomain.update` full visual refresh, including current qualification snapshot probe | 9.5112ms | 16.2718ms | 26.5192ms | Grows with retained tile payload; validation/snapshot work remains |
| Same probe, camera-only | 5.1777ms | 9.7505ms | 13.4111ms | Ordinary product e2e still passes, but stable data is still examined by this diagnostic |
| Browser receive-to-paint raster diagnostic | — | — | 21.5ms for its recorded production-schema sample | Canvas preparation/paint is material; not the same sample population as the e2e table |
| Native end-to-end refresh run 2 | 29.8ms | 41.6ms | 50.5ms | Input through first changed pixel; authoritative failure result |

The current canonical product harness records only `input-captured`, `presentation-received` and `browser-first-motion-paint`; it does not expose the full §7.3 per-process author/materialize/encode/decode/store/projector breakdown. Therefore no unsupported subtraction or cross-process clock comparison is reported. The evidence points to size-dependent retained-state validation/projection plus browser preparation/paint rather than ordinary camera redraws or transport alone, but exact attribution remains unresolved. The correctness implementation is preserved and [Issue #80](https://github.com/lithdoo/loom-realm/issues/80) tracks a separate follow-up that must add the missing qualification-only stage measurements before considering any cache, protocol, scheduling or canvas redesign. Such a design is not accepted by this PR.

Historical `42.9/96.3ms`, PR0–PR3, remediation and the former `6ade950` 50.0ms result remain history only.

### Measurement environment

- Windows 11 Home build 26300 x64; Balanced power scheme.
- AMD Ryzen AI 9 365 with Radeon 880M; 10 physical / 20 logical processors.
- 25,359,659,008 bytes physical RAM.
- AMD Radeon 880M Graphics driver `32.0.31021.1015`.
- Display 1600×2560 at 144Hz; logical DPI 192×192 (200%).
- Node `v24.19.0`; npm `11.17.0`.
- Hostra `1.0.1-beta.1`, source `d863beab3c59c3bd4f271514a228fa8fee0bf5b6`.
- Electron `44.1.1`; Chromium `152.0.7977.65`.
- Current subject was clean before each formal run apart from the expected generated report, which was copied to `.local/`, hashed and restored.

## Original Essentials v21.1 dynamic evidence

### Provenance and capture method

The repository-provided `examples/essentials-v21.1-local/reimport.bat` / `scripts/init-fsdb.mjs` route identified the official v21.1 download. The archive and runtime stayed under gitignored `.local/`; no original binary, data, image, audio, screenshot or raw trace is committed.

| Object | Identity |
| --- | --- |
| Essentials | v21.1, source tag `v21.1`, commit `ea7b5d56d2436591160983c4e641a2ceee2d875a` |
| Official archive | 61,987,094 bytes; SHA-256 `da0a34ec81ed40a4346fe6101debd7d938cbeadd43ff0aad87c3e388392a1665` |
| `Game.exe` | 14,732,288 bytes; SHA-256 `5c75e92fcbb6ec50b9f8fc61913d751a8945d6a1fc69c3017c7b8686b532bf04` |
| `Scripts.rxdata` | SHA-256 `18a4c75d26d0cf8437a0dba38a441719c9c039fd3f94f77cf13a71c44e7bb1af` |
| `Map021.rxdata` | SHA-256 `cd226a09dbf5cbfd2207edd44fb7dd419327ae901a1f1c0f6ad35601df85c575` |
| `Map047.rxdata` | SHA-256 `5f4ee232e4f4b8b44950f826b13cd601ffecb87e455c1dda92c5908152df043e` |
| `Tilesets.rxdata` | SHA-256 `433033b45527c0f07b781c862724df64d6a416c0ac2ed71907f645c0b2219fa6` |
| `mkxp.json` | SHA-256 `90a3aee82895e48e6c767f973b637d27856cccfd575f48b78d04191cb3e7d35f` |

A local observation-only Ruby plugin was installed after setup (SHA-256 `87818d3191c9558ff55a78588812467bfcfca474053666346d38a86c079df1af`). It records only frame/timing, coordinates, direction/input, motion/jump, event start/execute, bridge state and display depth. It does not override Input, movement, scheduling, state or speed. An external PowerShell driver (SHA-256 `c112bc58d33a189ab5acacc8f3bdf3d8901ee6a012602cb34cf3e67fc5cac1de`) sends real Windows arrow-key events. Both helpers and all raw logs remain local-only.

### Map21 Bridge observations

All four data-derived On/Off pairs were observed. “Admission” is the first logical coordinate commit; the event starts after movement settles; the interpreter executes and changes the bridge state on the next observed frame. The move was admitted before the event change and was never replanned.

| Pair | On input / admission / start / execute | On state/depth | Off input / admission / start / execute | Off state/depth | Result |
| --- | --- | --- | --- | --- | --- |
| 25 On / 23 Off | 930 / 941 `(14,69→14,68)` / 977 / 978 | `0→2`; bridge z `225..289→0` | 1939 / 1950 `(14,68→14,69)` / 1983 / 1984 | `2→0`; z `0→193..257` | PASS |
| 22 On / 20 Off | 1305 / 1308 `(22,58→22,57)` / 1315 / 1316 | `0→2` | 1869 / 1872 `(22,57→22,58)` / 1879 / 1880 | `2→0` | PASS |
| 10 On / 7 Off | 1151 / 1154 `(14,31→14,32)` / 1161 / 1162 | `0→2`; z `449..513→0` | 1378 / 1381 `(14,32→14,31)` / 1388 / 1389 | `2→0`; z `0→481..545` | PASS |
| 4 On / 28 Off | 619 / 622 `(19,46→20,46)` / 629 / 630 | `0→2`; z `161..257→0` | 1382 / 1385 `(20,46→19,46)` / 1392 / 1393 | `2→0`; z `0→161..257` | PASS |

Held-input observation from `(14,70)` retained actual `Input.dir4=8`: event 23 start/execute was frame 122/123, movement continued immediately to y68; event 25 start/execute was 159/160, movement continued to y67 and ended at y65 with bridge state 2. One continuous hold did not duplicate an event action on the same occupied event cell.

Sanitized local trace SHA-256 values: south canal `e4f7df9b2c711385c0528b839dfdfa6fb25d8b2889121eab0133278532245d7e`; mid-south `a006cac5d8c2daca2034d086bceae567070dd99a5be1a05890a006a857018fd7`; mid-north `bced9de3feb62df7348c7b600bae541afc2f75e37a3d8cb74eda5a0d67233d02`; north span `40f273cfdc5327abee063b4b79b1a16373e9d8693f8ca32354a9f6fe0fec7d38`; held south `c6d635f6f3f8250aae5bef9962b17c3c8f39236b2a82ef3f2cc516550d70ce96`. The mid-north target pair completed; its driver timed out only in the post-target route tail, so no full-route completion claim is made for that file.

### Map47 Ledge observations

- Forward real input was direction 2 on frames 77–98. Jumping began at frame 88 and ended at 156: 68 observed jumping frames, timer samples up to 494ms against the original defined 500ms duration.
- Coordinates changed once from `(16,9)` to `(16,11)` over `(16,10)`; peak vertical offset was 24px and the player sprite z was 240 during the jump. No event script started or executed.
- Input remained held through frames 88–98 without producing a second movement or event.
- Reverse real input direction 8 on frames 75–189 remained at `(16,11)`, with zero jump frames and no movement.
- Sanitized trace SHA-256: forward `f55c4c05bc2a1292d246c16601d8cc5a24ababc75718756ba7f4d0dc5f1e5e9d`; reverse `1c779b2adedcd23bbedfea44d35aa94408dd29d4060040a294e74fb9c76e408b`.

The real Map47 corpus contains no source-blocked, destination-blocked, boundary or event-on-skipped-cell Ledge examples. Those general safety cases remain explicitly synthetic and redistributable; they are not relabelled as original observations.

## Original-versus-product comparison

| Scenario | Original v21.1 observation | LoomRealm current result | Classification / impact |
| --- | --- | --- | --- |
| Map21 four Bridge pairs | Arrival starts the event after the admitted move; execute/state transition follows; bridge depth switches with level 0/2 | Same ordering, one admitted action, level 0/2 and atomic depth reprojection | `OBSERVABLY_EQUIVALENT`; engine frame numbers need not match |
| Held Bridge input | Continues into following legal cells without duplicate action on one occupancy | Focused held-input/runtime tests pass | `OBSERVABLY_EQUIVALENT` |
| Map47 forward Ledge | One two-cell jump, 500ms definition, 24px peak, no intermediate arrival/event | One motionId, two-cell jump, 500ms, 24px peak, arrival only at destination | `EXACT` for contracted observables |
| Map47 reverse | Blocked with no jump | Blocked | `EXACT` |
| Previous 400ms product jump | Original observation is 500ms | Fixed to 500ms in `8131f6d` after a pre-fix regression failed `400 !== 500` | `BUG FIXED` |
| Blocked destination/boundary/skipped-cell event | No real Map47 corpus sample | Fail-closed synthetic coverage | `INTENTIONAL_SCOPE_DIFFERENCE` in evidence source, not a claimed original fact |
| Arbitrary RGSS interpreter, NPC terrain, water/ice/bike/surf, cross-map jump | Outside the qualified slice | Unsupported | `INTENTIONAL_SCOPE_DIFFERENCE` |

## FG, contract and decision disposition

| Gate | Current disposition |
| --- | --- |
| FG-01 original facts | **TECHNICAL PASS / AUTHORIZED SIGN-OFF PENDING.** Exact runtime/data identity, observation-only capture and sanitized dynamic traces are recorded. |
| FG-02 data/import | **TECHNICAL PASS / SIGN-OFF PENDING.** Current schema, migration, importer, live FSDB and producer/consumer tests pass on the current subject. |
| FG-03 event state | **TECHNICAL PASS / SIGN-OFF PENDING.** Original start/execute/state/held ordering plus product front/here/blocked regressions are covered. |
| FG-04 motion/display | **TECHNICAL PASS / SIGN-OFF PENDING.** Original duration/path/depth and current product behavior align after the 500ms fix. |
| FG-05 license/CI | **POLICY B DRAFTED / MAINTAINER APPROVAL REQUIRED.** Synthetic-only CI + legal-local original qualification + repository-only sanitized facts/digests; no redistribution permission was found. |
| FG-06 formal contract | **READY FOR AUTHORIZED SIGN-OFF.** No authorized approval exists; no V1 contract was created. |

C-01 through C-07 are technically supported by current code, static/live data and original dynamic observations within the declared slice. C-08 remains pending on FG-05/06. DEC-01 through DEC-07 remain `UNSIGNED / REVIEW REQUIRED`; observations resolve the technical questions but do not manufacture governance approval.

## Regression record

- Pre-fix regression: expected original 500ms and failed against the former 400ms implementation.
- `npm test --workspace=@loomrealm-game/map`: 106/106 PASS.
- `node --test test/terrain-behavior-live-product.test.mjs test/map-layering-browser.test.mjs`: 61/61 PASS; live FSDB 3/3, not skipped.
- `npm run test:m14:pr`: PASS, including Map 106/106, live FSDB product 3/3 and vertical Chromium 3/3.
- `npm run test:m15:desktop`: 15/15 PASS.
- `npm run test:m15:hostra:full`: two complete 16/16 executions; M15 gate PASS, strict 50ms refresh assessment FAIL as documented above.
- `node --test test/map-viewport-pr0.test.mjs`: 9/9 PASS.
- Focused Map evidence/Map21/Map47 suite: 54/54 PASS, 0 fail/skip.
- `npm run test:fixtures`: 117/117 PASS, 0 fail/skip; legal local corpus tests executed rather than skipping.
- `npm run test:regression`: PASS. Hostra reported five existing Windows symlink/POSIX skips and fsdb-http one unavailable-symlink skip; skips are recorded as skips, not passes.
- `npm run docs:check-links`: 771 relative links across 137 Markdown files PASS.
- `git diff --check`: PASS after documentation edits.

The final documentation/link checks, focused fixtures and repository diff checks are recorded on the final PR head. Any GitHub result is reported only from that exact head.

## Legal and closure boundary

No original `.rxdata`, PBS, Graphics, Audio, `Game.exe`, RGSS DLL, complete event text, screenshot, dynamic raw log, browser cache, `node_modules` or raw machine artifact is committed. CI remains synthetic and redistributable; original qualification is legal-local and the repository stores only sanitized facts and digests.

Current closure statement:

- M14 and the separate M15 product gate are reclosed on the current subject.
- Strict performance route 4 remains open on 1920×1080 refresh P95 and the missing complete §7.3 stage breakdown.
- Terrain technical qualification FG-01 through FG-04 is complete; FG-05 policy approval and FG-06 authorized review remain external.
- Issue #42 must remain open, and `TERRAIN_BEHAVIOR_CONTRACT_V1.md` must not be created until the external approvals exist.
