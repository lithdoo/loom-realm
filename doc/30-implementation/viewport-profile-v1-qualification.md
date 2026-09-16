# Viewport State v1 / Revised Renderer Data Profile v1 Qualification Ledger

> 层级：Implementation / Qualification Ledger（**唯一 Core live status**）  
> 状态：**Core Docs Frozen / Core Implemented / Core Qualified (Desktop + shared `/1` contracts)**；2026-09-16。PWA / M16 / M17 = **OUT OF SCOPE**（不是 PASS，也不是本次失败）。项目负责人已确认 npm 无消费者，并在同一日确认非 npm 无混配义务与统一修正后 `/1` cohort；npm consumer 验证不再构成 Freeze gate。  
> Decision：[ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)；Contract：[Viewport v1](../15-contracts/viewport-state-v1.md) · [corrected Profile `/1`](../15-contracts/renderer-data-profile-v1.md)；Conformance：[Viewport](../15-contracts/viewport-state-conformance-v1.md) · [Profile `/1` fixture revision3](../15-contracts/renderer-data-profile-conformance-v1.md)。  
> Reviews：[独立 Docs Freeze 签署](./viewport-core-docs-freeze-independent-review-2026-09-16.md) · [本轮 Core 技术终审与修复逐项证据](./viewport-core-final-review-2026-09-16.md) · [历史 Core review](./viewport-core-docs-freeze-review-2026-09-16.md) · [业务归属](./viewport-business-boundary-review-2026-09-16.md) · [整改历史](./viewport-v1-final-freeze-closure-2026-09-16.md) · [范围收缩及完整原文 crosswalk](./viewport-scope-repair-2026-09-16.md)。Map [实施主合同](../../examples/essentials-v21.1-local/MAP_DYNAMIC_VIEWPORT_PERFORMANCE_REFACTOR_DRAFT.md)和[PR0 evidence](../../examples/essentials-v21.1-local/MAP_VIEWPORT_PR0_EVIDENCE.md)单独拥有状态。

**Docs Frozen ≠ implemented ≠ qualified/closed。** `/2`由ADR0037取消；旧三-child`/1` executable PASS不可转给新四-child`/1`。正式冻结只覆盖 docs-only subject `4cbf620ebe8aec0e7fb33743813c5d1f2885e6a9`。记录该批准的 commit 不是新的规范 subject。C1 production executable 与本页证据 commit 也不是新的 Frozen docs subject。不查询 npm，不以 npm 消费者核查阻塞。

## 1. Current snapshot

```text
ADR0037 direction                  Accepted; npm no-consumer owner attestation RECORDED
Revised Profile /1 + Viewport v1   Core Docs Frozen; Core Implemented; Core Qualified (Desktop)
Old 3-child /1 source              superseded on this branch by four-child /1; do not mix binaries
/2                                 superseded proposal; never shipped/implemented
Main/Renderer/Subsystem/Desktop    four-child /1 IMPLEMENTED on feat/core-viewport-v1
Profile /1 fixtureSetRevision      3 EXECUTED on Node 24 and portable Node v20.19.5
npm consumer compatibility         OWNER CONFIRMED / NON-BLOCKING; no npm lookup
GitHub Releases channel           API returned [] on 2026-09-16; other channels not implied
Other non-npm compatibility        OWNER ATTESTED no mixed-binary / no independent old /1 peer, 2026-09-16
Connection projection              corrected 9fb2c72; technical text review complete
CR-01/02/04/05 technical repairs   TEXT VERIFIED; see final review, subject 7db45f29
Independent final reviewer         Cursor Grok 4.6 / 2026-09-16 / APPROVED
Core Docs Freeze approved SHA      4cbf620ebe8aec0e7fb33743813c5d1f2885e6a9
Freeze-registration commit         171e58cd0885edc8fa21a4b2b4558245045eda1d
C1 production executable SHA       dc024e8963cf6970cca8b28a9de396ee9d0f203c
Qualification harness SHA          f159b80bab595f4c9a5d8521f271452fa618ad88
Evidence/ledger commit             3aca363ce410adccf708aba1ee3df82667917413
Product cohort                     workspace 0.1.0-alpha.0 from the same git tree; no renderer-data/2
Map Docs Freeze / PR0 evidence     Map-owned HOLD; PR0 RAN on feat/map-viewport-pr0 `7718446`/`af4ad51`; dense 720/1080 canvas STOP
PWA                                OUT OF SCOPE for this Desktop/Map task; not PASS; not a Core Qualified blocker
Node 20                            PASS portable v20.19.5 (not the host PATH Node 24)
Core executable qualification      Qualified for Desktop + shared four-child `/1` contracts
```

## 2. Frozen-preimplementation compatibility: owner decision and remaining scope

**Closed, not pending:** 2026-09-16 project owner expressly confirmed no npm consumers and instructed no npm verification or npm-consumer Freeze blocker. Record this as **owner attestation**, not registry query, prerelease download audit or external third-party proof. No future task or generalized wording may silently reinstate npm consumer checks.

- [x] npm consumer compatibility: OWNER ATTESTED NO CONSUMERS / NON-BLOCKING, 2026-09-16; no npm lookup performed or required.
- [x] GitHub Releases channel: REST `GET /repos/lithdoo/loom-realm/releases` returned `[]` on 2026-09-16. **Only** this channel checked; does not establish absence of all public identity commitments.

**Non-npm compatibility (closed by owner attestation, 2026-09-16):** Same-identity pre-release `/1` correction is unsafe if any real other old-binary interoperability requirement exists. The project owner, in the Core Viewport delivery conversation of 2026-09-16, attested that there is no known non-npm published identity promise, independent old `/1` peer, persisted profile identity, still-running old peer, or rolling/rollback/mixed-binary requirement. The product must use one unified corrected four-child `/1` build/deployment cohort. Old three-child `/1` binaries MUST NOT be mixed with new four-child `/1` binaries. This is owner fact, not a disguised npm check, Releases scan, or mixed-peer runtime result.

- [x] Non-npm explicit profile/identity commitments and any known independent implementations: owner conclusion 2026-09-16 — none attested; no mixed-peer obligation.
- [x] Persisted identity, current old peers, rolling/rollback/mixed cohort requirements: owner conclusion 2026-09-16 — none; design permits only a coherent new cohort.
- [x] Owner records the combined **non-npm** compatibility decision and exact evidence/assumptions: delivery conversation 2026-09-16 + [independent review §3](./viewport-core-docs-freeze-independent-review-2026-09-16.md).

```text
npm owner/date: project owner / 2026-09-16 / non-blocking
GitHub Releases: [] / 2026-09-16 / this channel only
Non-npm compatibility owner/decision/date: project owner / unified corrected /1 cohort, no mixed binaries / 2026-09-16 / owner attestation
```

This does not defer npm verification. Actual artifact SHAs and per-component manifest are recorded in §7–§9 of this ledger.

## 3. Core Docs Freeze checklist — technical fixes vs formal approval

**Text/design verification performed (not code PASS):**

- [x] ADR0025→0036→0037 supersession; current sole revised `/1`, no `/2` or dual parser; v2 proposal remains historical. See [technical review](./viewport-core-final-review-2026-09-16.md).
- [x] Corrected four-child direction/schema/preflight/diagnostic/reader/writer and authority checked against unchanged Control/Connection/Input/Render contracts and protected Profile crosswalk. Only viewport-state child added.
- [x] Frozen Connection §§1/9/22 only editorial composition/fresh-boundary projection; [`9fb2c72`](https://github.com/lithdoo/loom-realm/commit/9fb2c72a6dff03001ab13978ab38dea0a4454e02) preserves zero-message/currentness/terminal.
- [x] Historical governance/platform/system/modules/Data bodies restored before targeted edits. [Scope repair](./viewport-scope-repair-2026-09-16.md) now names the edited files explicitly; compares show protocol layers +36/-20, Subsystem +27/-3, Renderer +10/-3 and Data +14/-7 vs pre-Viewport baseline, not a whole-file rewrite.
- [x] Exact 528-line original Profile and 206-line conformance preserved under original blob SHAs and linked from explicit **NOT CURRENT** wrappers; [crosswalk](./viewport-scope-repair-2026-09-16.md) maps old §1–14/§1–11. Old fixture revision2/old PASS not current.
- [x] Phase-plan C0→C1→Map PR0 feasibility→Map Freeze→PR1/PR2→PR3 retains historical milestones; Map PR0/P95 NOT Core freeze dependency.
- [x] Viewport single designated CSS logical surface, raw positive fraction floor/invalid discard, bounded producer, fresh baseline, source/carrier fence, retained value/non-paintability and terminal matrix inspected; Runtime post-terminal subscribe newly closed by contract + fixture.
- [x] `scope.viewport` initial null, synchronous first callback while Runtime alive, getter-before-callback, exceptions/rejections containment, unsubscribe and terminal inert, frame/input independence checked in formal contract/conformance.
- [x] No Window DOM API elevated to universal Core, Main size mirror, Map cap/chunks/settle/menu, generic Environment, ACK, or new M13 reevaluation trigger; product rollout/source stay in ledger.
- [x] Revision3 and Viewport conformance specify executable-ready assertions and preserve original revision2 suite. Executable results are in §8; they do not change this freeze-time text check.
- [x] npm consumer requirement removed on owner attestation; no npm verification.

**Formal Freeze gate:**

- [x] §2 non-npm compatibility / no real old `/1` mixed-binary requirement concluded by release/deployment owner, with date and assumption/evidence; coherent strategy agreed.
- [x] A reviewer independent of the ChatGPT technical-review author checked the **final post-fix docs-only SHA** `4cbf620ebe8aec0e7fb33743813c5d1f2885e6a9`, recorded identity/date, and confirmed cross-file normative navigation. Evidence: [independent review](./viewport-core-docs-freeze-independent-review-2026-09-16.md).
- [x] Approved final Docs Freeze subject SHA and signoff entered here. Registration commit SHA is **not** the frozen subject.

```text
Technical review subject: 7db45f29e1bf30261468ef03ec7acd80ae3b8b8d
Final docs-only SHA / independent reviewer / approval date:
  4cbf620ebe8aec0e7fb33743813c5d1f2885e6a9 / Cursor Grok 4.6 / 2026-09-16
Formal Core Docs Freeze: APPROVED for that subject
Freeze-registration commit: 171e58cd0885edc8fa21a4b2b4558245045eda1d
```

## 4. Product rollout & physical source（不是通用协议）

当前产品预定所有本次实际部署的DataAuthority由Main选择同一**修正后** `loomrealm.renderer-data/1`。Main独占profile选择；Broker `(Session,Renderer,S,G,P)` exact matching只有**逻辑 authority**、没有build fingerprint，不能识别旧三-child与四-child二进制。必须在连接前协调Main、Data peer、Renderer、Subsystem、Desktop/PWA相应adapter同一受治理release/build cohort，不允许混配。Owner 已确认无 rolling/rollback 混配需求，不得加隐式feature flag或双解析器。

```text
Single-cohort rollout design: specified in ADR0037; owner-approved 2026-09-16
Release cohort artifact manifest and SHA: C1 production dc024e8963cf6970cca8b28a9de396ee9d0f203c
Main/Data/Renderer/Subsystem/adapter inventory: see §7
No-mixed-version executable proof: same git tree / 0.1.0-alpha.0 workspaces; Main selects only /1; no /2 identity
Rollout owner/signoff on no mixed requirement: APPROVED (C0 owner attestation, 2026-09-16)
Desktop physical source: document layout viewport via Window.innerWidth/innerHeight (adapter only)
PWA physical source: NOT RUN (no PWA application in this repository)
```

Desktop physical composition指定document layout viewport，采用`Window.innerWidth/innerHeight` CSS logical px floor。Window 不是通用 Core 依赖。hidden→visible 强制重采样；DPR-only 且 CSS logical size 不变时 Desktop adapter 不重复 emit。

## 5. Docs Freeze后实施与资格路线

Current plan：[phase plan ADR0037 route](./phase-1-delivery-plan.md)；[independent freeze review](./viewport-core-docs-freeze-independent-review-2026-09-16.md)与[technical review](./viewport-core-final-review-2026-09-16.md)与[scope repair](./viewport-scope-repair-2026-09-16.md)存放设计验收；Map每刀/性能精确规范只看[Map主合同](../../examples/essentials-v21.1-local/MAP_DYNAMIC_VIEWPORT_PERFORMANCE_REFACTOR_DRAFT.md)。

```text
C0 bounded non-npm owner decision + independent docs approval → Core Docs Freeze SHA 4cbf620
C1 coherent corrected /1 executable on feat/core-viewport-v1 → Implemented; Node 24 executed; Node 20 NOT RUN
Map PR0 / Map Docs Freeze / PR1–PR3 remain Map-owned HOLD
```

PR0不要求尚未实施的 PR1/2 优化结果；Map 证据仍 NOT RUN，且 M15 Hostra 产品 PASS **不得**写成 Map Docs Freeze 或 Map PR0 PASS。

```text
C1 production executable SHA: dc024e8963cf6970cca8b28a9de396ee9d0f203c
Core executable qualification: NOT Qualified
```

## 6. Freeze evidence table

| Gate | Subject | Result |
|---|---|---|
| npm consumer | Owner's explicit statement, 2026-09-16 | CLOSED NON-BLOCKING; no npm verification |
| GitHub Releases | Public REST `GET /releases`, 2026-09-16 | `[]`, no Releases in that channel |
| Non-npm compatibility / no-mixed requirement | Project owner attestation, 2026-09-16 | CLOSED; unified corrected `/1` cohort; no mixed binaries |
| Connection composition projection | `9fb2c72` and technical review | TEXT VERIFIED; Frozen mechanics preserved |
| Protocol-layer / Subsystem / Renderer / Data status and seam | `ce57cf1` / `feb1054` / `ccb5304` / `2556dfc` | TEXT VERIFIED at freeze |
| Original Profile/fixture preservation and wrapper navigation | original blob SHAs + `047e4ba` / `eb2e488` / `66b2009` | HISTORICAL ORIGINAL INTACT / TEXT VERIFIED |
| Viewport terminal contract + fixture | `b896173` / `a8ff94e` | TEXT VERIFIED at freeze; executable in §8 |
| Protected normative crosswalk | [scope repair](./viewport-scope-repair-2026-09-16.md), [final technical review](./viewport-core-final-review-2026-09-16.md) | TECHNICAL REVIEW COMPLETE |
| Independent Docs Freeze signoff | [independent review](./viewport-core-docs-freeze-independent-review-2026-09-16.md) of `4cbf620` | APPROVED 2026-09-16; Frozen ≠ Implemented ≠ Qualified |
| Core Docs Freeze docs SHA + valid signoff | `4cbf620ebe8aec0e7fb33743813c5d1f2885e6a9` | FROZEN |
| Map PR0 / Map Docs Freeze | separate Map ledger | NOT RUN / HOLD |

## 7. C1 implementation — branch, files, cohort

Branch: `feat/core-viewport-v1` from freeze subject `4cbf620ebe8aec0e7fb33743813c5d1f2885e6a9`.

| Step | Commit | Purpose |
|---|---|---|
| C0 | `171e58cd0885edc8fa21a4b2b4558245045eda1d` | Register real independent Docs Freeze; not a protocol SHA |
| C1-A | `b0dd5386051139b077e31ea3cc6ba64bac01f7e9` | Data ViewportStateV1 codec, family, demux, bounded latest sender |
| C1-B | `d4359c203e57e381ee59191f4371206f60fbea7f` | Runtime-scoped readonly `scope.viewport` |
| C1-C | `7cb819cbe49f19977fde9181defc83529dbba962` | Renderer source/publisher + Desktop document-layout adapter |
| C1-D | `45dd70068b61160df21b7e8f2621ff5e40e2ef13` | Desktop `renderer-entry` composes Data+Input+Viewport on one holder |
| C1-C fix | `dc024e8963cf6970cca8b28a9de396ee9d0f203c` | Skip resize samples that do not change CSS logical size |
| Qualification harness | `f159b80bab595f4c9a5d8521f271452fa618ad88` | Profile fixture revision 3 + Viewport v1 executable catalog |
| Evidence | `3aca363ce410adccf708aba1ee3df82667917413` | Records commands/exits; not a Frozen docs subject |

**Production executable SHA** for the four-child Core is `dc024e8963cf6970cca8b28a9de396ee9d0f203c`. Later harness/ledger commits add tests and status only.

**Cohort:** all workspace packages remain `0.1.0-alpha.0` from that git tree. Main selects only `loomrealm.renderer-data/1`. No `/2`, dual parser, handshake, or feature flag. Data, Renderer, Subsystem, Desktop adapter, and Main were built together via `npm run build:desktop-stack` before the product tests below.

### File necessity (production)

| File | Why required |
|---|---|
| `packages/data/src/model.ts`, `viewport-codec.ts`, `viewport-sender.ts`, `profile-codec.ts`, `peers.ts`, `runtime.ts`, `index.ts` | Exact Viewport type, `"viewport"` family, demux, bounded latest sender, renderer `viewport.sendState` |
| `packages/subsystem/src/viewport.ts`, `internal/viewport-manager.ts`, `model.ts`, `host/run-subsystem.ts`, `index.ts` | Runtime `scope.viewport` retain/notify/terminal isolation |
| `packages/renderer/src/viewport.ts`, `internal/viewport-publisher.ts`, `control.ts`, `index.ts` | Optional construction-time source, floor/discard, attach/detach, fencing |
| `apps/desktop/src/renderer-viewport-source.ts` | Product document-layout CSS logical source; not a Core Window dependency |
| `apps/desktop/src/renderer-entry.ts` | Unified `/1` holder: Data + Input + Viewport; Main does not hold size |

Handler stubs in existing Input/Render/Data tests are required so four-child peers construct. Main is unchanged except it already selected `/1`; C1-D verifies it still has no width/height and does not relay `viewport.state`.

## 8. Executable evidence (do not treat historical PASS as current)

Common environment unless noted:

```text
OS: win32 10.0.26200
Node: v24.19.0
npm: 11.17.0
cwd: loom-realm worktree feat/core-viewport-v1
Hostra (M15 pin / product): HOSTRA_SOURCE_DIR=.qualification/hostra at d863beab3c59c3bd4f271514a228fa8fee0bf5b6 (1.0.1-beta.1)
```

| Item | Command | Env / SHA | Exit | Raw result | Conclusion |
|---|---|---|---|---|---|
| Data + Foundation + Wire | `npm run test:data` | Node 24 / production `dc024e8` tree | 0 | foundation 15, wire 38, data 33 pass | PASS |
| Subsystem | `npm test -w @loomrealm/subsystem` | Node 24 | 0 | 61 pass | PASS |
| Renderer | `npm test -w @loomrealm/renderer` | Node 24 | 0 | 51 pass | PASS |
| Main | `npm test -w @loomrealm/main` | Node 24 | 0 | 32 pass | PASS |
| Renderer Control | `npm test -w @loomrealm/renderer-control` | Node 24 | 0 | 11 pass | PASS |
| game-launcher-hostra | `npm test -w @loomrealm/game-launcher-hostra` | Node 24 | 0 | 33 pass / 5 skip (symlink privilege / POSIX) | PASS (skips pre-existing) |
| Desktop package | `npm test -w @loomrealm/desktop` | Node 24 | 0 | 28 pass including M9/M10/M11/M12 vertical | PASS |
| Viewport + Profile r3 | `npm run test:viewport:qualification:run` | Node 24 / harness `f159b80` | 0 | 11 pass | PASS |
| User Input r2 | `npm run test:m10:qualification:run` | Node 24 | 0 | 16 pass | PASS regression |
| Render Update r1 | `npm run test:m11:qualification:run` | Node 24 | 0 | 10 pass | PASS regression |
| Web Presentation | `npm run test:m13:qualification:run` | Node 24 + Chromium/Playwright | 0 | 5 pass | PASS |
| M9 Broker vertical | `npm run test:m9` | Node 24 | 0 | 10 pass | PASS |
| M10/M11/M13 boundary | `node --test test/m10-boundary.test.mjs test/m11-boundary.test.mjs test/m13-boundary.test.mjs` | Node 24 | 0 | 8 pass | PASS |
| M14 vertical | `node --test test/m14-vertical.test.mjs` | Node 24 + Chromium | 0 | 3 pass | PASS (consumer still 2-arg holder) |
| M15 desktop + pin | `npm run test:m15:desktop` with frozen Hostra SHA | Node 24 / `HOSTRA_SOURCE_DIR` | 0 | 14 pass | PASS |
| M15 Hostra product | `npm run test:m15:hostra` | Node 24 / frozen Hostra + Electron | 0 | 10 pass, ~291s | PASS Desktop/Hostra product; **not** Map Docs Freeze |
| Node 20 matrix | portable `.qualification/node-v20.19.5-win-x64/node.exe -v` → `v20.19.5`; then `node --test` on Viewport+Profile r3, data, subsystem, renderer, M10/M11 qualification, desktop viewport tests | Node 20.19.5 / production `dc024e8` tree | 0 | viewport 11, data 33, subsystem 61, renderer 51, m10 16, m11 10, desktop-viewport 2; all pass | **PASS** |
| PWA CSS logical source | n/a | no PWA app; this Desktop/Map task forbids PWA work | — | — | **OUT OF SCOPE** (not PASS, not FAIL) |
| Umbrella `npm run test:m15` | includes full `test:m14`/`test:m13`/`test:m12`/`test:regression` | not invoked as one command | — | slices above ran | **NOT RUN** as umbrella |
| npm consumer re-query | forbidden | — | — | — | NOT PERFORMED |

Viewport catalog executed on `f159b80`: exact wire/diagnostics, retained API, blocked-writer 1200-resize latest coalescing with interleaved Input, fresh carrier/Renderer fencing, InputTarget independence, Desktop document-layout / hidden→visible / DPR-only. Profile catalog executed fixtureSetRevision **3** four-child identity, one reader, ordered disposition, one writer, viewport diagnostic family, Main without size, Desktop unified holder.

M15 Hostra movement P95 on this host is a **product residual**, not Map qualification and not a substitute for Map PR0.

## 9. Completion vs remaining blockers

| Surface | Status |
|---|---|
| Data four-child `/1` | Implemented |
| Subsystem `scope.viewport` | Implemented |
| Renderer physical source + send | Implemented |
| Desktop product composition | Implemented |
| Main profile-only, no size relay | Verified; no Main width/height added |
| Core Docs Frozen | Yes (`4cbf620` + independent review) |
| Core Implemented | Yes (`dc024e8`) |
| Core Qualified | **Yes — Desktop + shared four-child `/1` contracts** (PWA OUT OF SCOPE) |
| Map Docs Freeze | HOLD; PR0 RAN (`7718446`) with dense 720/1080 128MiB canvas STOP; this ledger does not freeze Map |

**Core Qualified for this Desktop task:** Node 20 portable v20.19.5 executed the Viewport/Profile r3 catalog and the Data/Subsystem/Renderer/M10/M11/Desktop viewport slices with exit 0. PWA is **OUT OF SCOPE** and is not recorded as PASS. Umbrella `npm run test:m15` as one nested command remains unused; affected Desktop slices already ran on Node 24.

Map PR1/PR2/PR3 remain stopped until a design owner revises the 128MiB backing rule against the dense 720/1080 fixture and an independent reviewer signs Map Docs Freeze.

Normative schema/currentness/diagnostic change→new docs-only SHA review；code change→new executable SHA + affected rerun。
