# Viewport State v1 / Revised Renderer Data Profile v1 Qualification Ledger

> 层级：Implementation / Qualification Ledger（**唯一 Core live status**）  
> 状态：**Core Docs Frozen / Not Implemented / Not Qualified**；2026-09-16。项目负责人已确认 npm 无消费者，并在同一日确认非 npm 无混配义务与统一修正后 `/1` cohort；npm consumer 验证不再构成 Freeze gate。  
> Decision：[ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)；Contract：[Viewport v1](../15-contracts/viewport-state-v1.md) · [corrected Profile `/1`](../15-contracts/renderer-data-profile-v1.md)；Conformance：[Viewport](../15-contracts/viewport-state-conformance-v1.md) · [Profile `/1` fixture revision3](../15-contracts/renderer-data-profile-conformance-v1.md)。  
> Reviews：[独立 Docs Freeze 签署](./viewport-core-docs-freeze-independent-review-2026-09-16.md) · [本轮 Core 技术终审与修复逐项证据](./viewport-core-final-review-2026-09-16.md) · [历史 Core review](./viewport-core-docs-freeze-review-2026-09-16.md) · [业务归属](./viewport-business-boundary-review-2026-09-16.md) · [整改历史](./viewport-v1-final-freeze-closure-2026-09-16.md) · [范围收缩及完整原文 crosswalk](./viewport-scope-repair-2026-09-16.md)。Map [实施主合同](../../examples/essentials-v21.1-local/MAP_DYNAMIC_VIEWPORT_PERFORMANCE_REFACTOR_DRAFT.md)和[PR0 evidence](../../examples/essentials-v21.1-local/MAP_VIEWPORT_PR0_EVIDENCE.md)单独拥有状态。

**Docs Frozen ≠ implemented ≠ qualified/closed。** `/2`由ADR0037取消；旧三-child`/1` executable PASS不可转给新四-child`/1`。正式冻结只覆盖 docs-only subject `4cbf620ebe8aec0e7fb33743813c5d1f2885e6a9`。记录该批准的 commit 不是新的规范 subject。不查询 npm，不以 npm 消费者核查阻塞。

## 1. Current snapshot

```text
ADR0037 direction                  Accepted; npm no-consumer owner attestation RECORDED
Revised Profile /1 + Viewport v1   Core Docs Frozen; Not Implemented; Not Qualified
Old 3-child /1 source              historical executable; still current production code until C1
/2                                 superseded proposal; never shipped/implemented
Main/Renderer/Subsystem/Desktop    revised four-child NOT IMPLEMENTED
Profile /1 fixtureSetRevision      3 spec Frozen; NOT EXECUTED
npm consumer compatibility         OWNER CONFIRMED / NON-BLOCKING; no npm lookup
GitHub Releases channel           API returned [] on 2026-09-16; other channels not implied
Other non-npm compatibility        OWNER ATTESTED no mixed-binary / no independent old /1 peer, 2026-09-16
Connection projection              corrected 9fb2c72; technical text review complete
Phase plan current route           corrected eb518d6; M1–M17 detail retained
Original governance/platform/     old source restored; affected architecture/module/Data now
architecture/module/Data text      have narrow additive projection, NOT all byte-identical
Original Profile/Conformance       warning wrappers + verbatim original blob copies verified
Data /1 new API                     additive packages/data/VIEWPORT_V1_IMPLEMENTATION_DELTA.md
CR-01/02/04/05 technical repairs   TEXT VERIFIED; see final review, subject 7db45f29
Independent final reviewer         Cursor Grok 4.6 / 2026-09-16 / APPROVED
Product coherent cohort           strategy APPROVED; actual artifact manifest NOT YET BUILT
Core Docs Freeze approved SHA      4cbf620ebe8aec0e7fb33743813c5d1f2885e6a9
Executable subject + raw tests     NOT RUN (after Docs Freeze)
Map Docs Freeze / PR0 evidence     separate Map-owned HOLD / NOT RUN
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

This does not defer npm verification. Actual *future* artifact SHAs and per-component manifest remain a separate **C1 implementation qualification**.

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
- [x] Revision3 and Viewport conformance specify executable-ready assertions and preserve original revision2 suite. **Not executed**; executable qualification follows Docs Freeze.
- [x] npm consumer requirement removed on owner attestation; no npm verification.

**Formal Freeze gate:**

- [x] §2 non-npm compatibility / no real old `/1` mixed-binary requirement concluded by release/deployment owner, with date and assumption/evidence; coherent strategy agreed. **Do not require actual future artifact manifest before implementation.**
- [x] A reviewer independent of the ChatGPT technical-review author checked the **final post-fix docs-only SHA** `4cbf620ebe8aec0e7fb33743813c5d1f2885e6a9`, recorded identity/date, and confirmed cross-file normative navigation. Evidence: [independent review](./viewport-core-docs-freeze-independent-review-2026-09-16.md).
- [x] Approved final Docs Freeze subject SHA and signoff entered here. Registration commit SHA is **not** the frozen subject.

```text
Technical review subject: 7db45f29e1bf30261468ef03ec7acd80ae3b8b8d
Final docs-only SHA / independent reviewer / approval date:
  4cbf620ebe8aec0e7fb33743813c5d1f2885e6a9 / Cursor Grok 4.6 / 2026-09-16
Formal Core Docs Freeze: APPROVED for that subject
Freeze-registration commit: the commit that adds this ledger/signoff; not a new protocol SHA
```

## 4. Product rollout & physical source（不是通用协议）

当前产品预定所有本次实际部署的DataAuthority由Main选择同一**修正后** `loomrealm.renderer-data/1`。Main独占profile选择；Broker `(Session,Renderer,S,G,P)` exact matching只有**逻辑 authority**、没有build fingerprint，不能识别旧三-child与四-child二进制。必须在连接前协调Main、Data peer、Renderer、Subsystem、Desktop/PWA相应adapter同一受治理release/build cohort，不允许混配。Owner 已确认无 rolling/rollback 混配需求，不得加隐式feature flag或双解析器。

```text
Single-cohort rollout design: specified in ADR0037; owner-approved 2026-09-16
Release cohort artifact manifest and SHA: PENDING (C1 implementation evidence)
Main/Data/Renderer/Subsystem/adapter inventory: PENDING (C1)
No-mixed-version executable proof: PENDING (C1)
Rollout owner/signoff on no mixed requirement: APPROVED (C0 owner attestation, 2026-09-16)
```

Desktop/PWA physical composition指定document layout viewport，采用`Window.innerWidth/innerHeight` CSS logical px floor；实际业务 content box/center/letterbox、hidden→visible、fresh source fence和DPR-only属于产品实现/验收，不是通用 child wire。其他平台须指定自己的唯一稳定 logical surface及消费端证据。

## 5. Docs Freeze后实施与资格路线

Current plan：[phase plan ADR0037 route](./phase-1-delivery-plan.md)；[independent freeze review](./viewport-core-docs-freeze-independent-review-2026-09-16.md)与[technical review](./viewport-core-final-review-2026-09-16.md)与[scope repair](./viewport-scope-repair-2026-09-16.md)存放设计验收；Map每刀/性能精确规范只看[Map主合同](../../examples/essentials-v21.1-local/MAP_DYNAMIC_VIEWPORT_PERFORMANCE_REFACTOR_DRAFT.md)。

```text
C0 bounded non-npm owner decision + independent docs approval → Core Docs Freeze SHA 4cbf620
C1 build coherent corrected /1 executable → revised fixture3 + Viewport + Frozen regressions
Map PR0 production-zero hosted/local exact dense1080 + Core/M13 residual + Chromium stacking/memory
        → Map Docs Freeze SHA
Map PR1 fixed640 chunks/raster/paired-stage function + performance
Map PR2 dynamic viewport/resize/720/1080 function + pixels + performance
Map PR3 same executable/cohort SHA M11/M13/M14/M15/product qualification
```

PR0不要求尚未实施的 PR1/2 优化结果；Map 证据仍 NOT RUN。C1最小 Core 实现：`@loomrealm/data` 唯一`/1` codec/demux/viewport diagnostic/bounded sender，Renderer trusted source，Subsystem retained readonly capability，coordinated product deployment；不发布 `/2`、双parser、generic Environment/map special route或改 Frozen limits。C1须记录 actual artifacts、Node/Chromium/Hostra、命令/logs/new SHA，执行 revision3、Viewport、旧 Input/Render/Connection 回归、Main/Broker currentness、受影响 M13/M14/M15 和 Desktop；PWA在所属 milestone验收。

```text
Executable subject SHA: PENDING / NOT RUN
```

## 6. Evidence table

| Gate | Subject | Result |
|---|---|---|
| npm consumer | Owner's explicit statement, 2026-09-16 | CLOSED NON-BLOCKING; no npm verification |
| GitHub Releases | Public REST `GET /releases`, 2026-09-16 | `[]`, no Releases in that channel |
| Non-npm compatibility / no-mixed requirement | Project owner attestation, 2026-09-16 | CLOSED; unified corrected `/1` cohort; no mixed binaries |
| Connection composition projection | `9fb2c72` and technical review | TEXT VERIFIED; Frozen mechanics preserved |
| Protocol-layer / Subsystem / Renderer / Data status and seam | `ce57cf1` / `feb1054` / `ccb5304` / `2556dfc` | TEXT VERIFIED; no code |
| Original Profile/fixture preservation and wrapper navigation | original blob SHAs + `047e4ba` / `eb2e488` / `66b2009` | HISTORICAL ORIGINAL INTACT / TEXT VERIFIED |
| Viewport terminal contract + fixture | `b896173` / `a8ff94e` | TEXT VERIFIED / NOT RUN |
| Protected normative crosswalk | [scope repair](./viewport-scope-repair-2026-09-16.md), [final technical review](./viewport-core-final-review-2026-09-16.md) | TECHNICAL REVIEW COMPLETE |
| Independent Docs Freeze signoff | [independent review](./viewport-core-docs-freeze-independent-review-2026-09-16.md) of `4cbf620` | APPROVED 2026-09-16; Frozen ≠ Implemented ≠ Qualified |
| Product cohort manifest/verification | future C1 executable | NOT BUILT / NOT VERIFIED; not preimplementation doc PASS |
| Core Docs Freeze docs SHA + valid signoff | `4cbf620ebe8aec0e7fb33743813c5d1f2885e6a9` | FROZEN |
| Four-child executable/fixture3/old regression | future C1 | NOT RUN |
| Map PR0 / Map Docs Freeze | separate Map ledger | NOT RUN / HOLD |

Normative schema/currentness/diagnostic change→new docs-only SHA review；code change→new executable SHA + affected rerun。
