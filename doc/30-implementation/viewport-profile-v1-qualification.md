# Viewport State v1 / Revised Renderer Data Profile v1 Qualification Ledger

> 层级：Implementation / Qualification Ledger（**唯一 Core live status**）  
> 状态：**Core Docs FROZEN 2026-09-17（docs-only subject `4cbf620`，owner 签署） / Preimplementation / Not Implemented / Not Qualified**。签署与独立性披露见[冻结登记 §4](./viewport-core-docs-freeze-registration-2026-09-17.md)。npm（2026-09-16）与非 npm 兼容前提及单 cohort 策略（2026-09-17）均由项目负责人 attestation 记录。不查询 npm。**Docs Frozen ≠ Implemented ≠ Qualified；Map Docs Freeze 独立。**  
> Decision：[ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)；Contract：[Viewport v1](../15-contracts/viewport-state-v1.md) · [corrected Profile `/1`](../15-contracts/renderer-data-profile-v1.md)；Conformance：[Viewport](../15-contracts/viewport-state-conformance-v1.md) · [Profile `/1` fixture revision3](../15-contracts/renderer-data-profile-conformance-v1.md)。  
> Reviews：[本轮 Core 技术终审与修复逐项证据](./viewport-core-final-review-2026-09-16.md) · [历史 Core review](./viewport-core-docs-freeze-review-2026-09-16.md) · [业务归属](./viewport-business-boundary-review-2026-09-16.md) · [整改历史](./viewport-v1-final-freeze-closure-2026-09-16.md) · [范围收缩及完整原文 crosswalk](./viewport-scope-repair-2026-09-16.md) · [冻结登记与签署 2026-09-17](./viewport-core-docs-freeze-registration-2026-09-17.md)。Map [实施主合同](../../examples/essentials-v21.1-local/MAP_DYNAMIC_VIEWPORT_PERFORMANCE_REFACTOR_DRAFT.md)和[PR0 evidence](../../examples/essentials-v21.1-local/MAP_VIEWPORT_PR0_EVIDENCE.md)单独拥有状态。

**Docs Frozen ≠ implemented ≠ qualified/closed。** `/2`由ADR0037取消；旧三-child`/1` executable PASS不可转给新四-child`/1`。本轮已补原文、模块接缝、历史入口和 terminal fixture，**但技术审查作者不能代替发布/部署负责人及独立签署者批准 Freeze**。不查询 npm，不以 npm 消费者核查阻塞。

## 1. Current snapshot

```text
ADR0037 direction                  Accepted; npm + non-npm owner attestations RECORDED (2026-09-16/17)
Revised Profile /1 + Viewport v1   Normative / CORE DOCS FROZEN 2026-09-17 subject 4cbf620
Old 3-child /1 source              historical executable; still current production code
/2                                 superseded proposal; never shipped/implemented
Main/Renderer/Subsystem/Desktop    revised four-child NOT IMPLEMENTED (C1 unblocked by freeze)
Profile /1 fixtureSetRevision      3 spec only; NOT EXECUTED
npm consumer compatibility         OWNER CONFIRMED / NON-BLOCKING; no npm lookup
GitHub Releases channel           API returned [] on 2026-09-16; other channels not implied
Other non-npm compatibility        OWNER ATTESTED 2026-09-17 (registration §2); no mixed-binary requirement
Connection projection              corrected 9fb2c72; technical text review complete
Phase plan current route           corrected eb518d6; M1–M17 detail retained
Original governance/platform/     old source restored; affected architecture/module/Data now
architecture/module/Data text      have narrow additive projection, NOT all byte-identical
Original Profile/Conformance       warning wrappers + verbatim original blob copies verified
Data /1 new API                     additive packages/data/VIEWPORT_V1_IMPLEMENTATION_DELTA.md
CR-01/02/04/05 technical repairs   TEXT VERIFIED; see final review, subject 7db45f29
Independent final reviewer         SIGNED 2026-09-17 — project owner lithdoo (registration §4,
                                   independence disclosure recorded; sole human approver)
Product coherent cohort            strategy specified; actual artifact manifest NOT YET BUILT
Core Docs Freeze                   FROZEN — subject 4cbf620 / owner signoff 2026-09-17 / HOLD lifted
Executable subject + raw tests     NOT RUN (C1 implementation pending on glm/main)
Map Docs Freeze / PR0 evidence     separate Map-owned HOLD / NOT RUN
```

## 2. Frozen-preimplementation compatibility: owner decision and remaining scope

**Closed, not pending:** 2026-09-16 project owner expressly confirmed no npm consumers and instructed no npm verification or npm-consumer Freeze blocker. Record this as **owner attestation**, not registry query, prerelease download audit or external third-party proof. No future task or generalized wording may silently reinstate npm consumer checks.

- [x] npm consumer compatibility: OWNER ATTESTED NO CONSUMERS / NON-BLOCKING, 2026-09-16; no npm lookup performed or required.
- [x] GitHub Releases channel: REST `GET /repos/lithdoo/loom-realm/releases` returned `[]` on 2026-09-16. **Only** this channel checked; does not establish absence of all public identity commitments.

**Closed 2026-09-17, not pending:** Same-identity pre-release `/1` correction requires a bounded owner decision about **known non-npm** published identity promises/independent peers, persisted profile identity or still-running old peer, and rolling/rollback/mixed-binary coexistence requirements. The project owner recorded that decision on 2026-09-17 in the engineering task conversation, transcribed in [freeze registration §2](./viewport-core-docs-freeze-registration-2026-09-17.md): **owner attestation** type (not registry query, channel scan, third-party proof or executed test), confirming no known commitments/peers and approving a single corrected-`/1` build/deployment cohort with no mixed old/new binaries.

- [x] Non-npm explicit profile/identity commitments and any known independent implementations: owner attested none known, 2026-09-17 (registration §2); no channel scan performed or implied.
- [x] Persisted identity, current old peers, rolling/rollback/mixed cohort requirements: owner attested none; product requires no cross-version interoperation, 2026-09-17; design permits only a coherent new cohort, no mixed peer.
- [x] Owner recorded the combined **non-npm** compatibility decision, evidence type and assumptions, 2026-09-17 (registration §2). STOP/ADR-reopen condition unchanged if real old `/1` interoperability later emerges.

```text
npm owner/date: project owner / 2026-09-16 / non-blocking
GitHub Releases: [] / 2026-09-16 / this channel only
Non-npm compatibility owner/decision/date: project owner / 2026-09-17 /
  no known commitments, peers, persisted identity or mixed-binary requirement;
  single corrected-/1 cohort (owner attestation; source = task conversation, not external scan)
```

This does not defer npm verification. Actual *future* artifact SHAs and per-component manifest are a separate **C1 implementation qualification**; before Docs Freeze only owner must approve the feasible single-cohort strategy and confirm no known mixed-binary requirement.

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

**Formal Freeze gate — CLOSED 2026-09-17:**

- [x] §2 non-npm compatibility / no real old `/1` mixed-binary requirement concluded by owner, 2026-09-17 (owner attestation, [registration §2](./viewport-core-docs-freeze-registration-2026-09-17.md)); single corrected-`/1` cohort strategy approved. No artifact manifest required before implementation.
- [x] Reviewer signoff on the **final post-fix docs-only SHA `4cbf620`**: project owner lithdoo approved 2026-09-17 (registration §4) — a real human, distinct from the AI document/repair author; independence disclosure recorded (owner is also the commissioning party; sole human approver in a single-owner project; no third-party external review claimed).
- [x] Approved Docs Freeze subject SHA and signoff entered here and reflected in current Profile/Viewport/conformance/architecture/module/Data status lines. Status flips in the signoff commit are governance metadata only; normative content remains exactly as at `4cbf620`.

```text
Technical review subject: 7db45f29e1bf30261468ef03ec7acd80ae3b8b8d
Approved docs-only subject SHA: 4cbf620ebe8aec0e7fb33743813c5d1f2885e6a9
Independent reviewer / approval date: project owner lithdoo / 2026-09-17
Signoff evidence: registration §4 + 2026-09-17 task conversation; recording commits 5a4e5fe (registration) and signoff commit (this change)
Formal Core Docs Freeze: FROZEN (subject 4cbf620) — Implemented: NO / Qualified: NO
```

## 4. Product rollout & physical source（不是通用协议）

当前产品预定所有本次实际部署的DataAuthority由Main选择同一**修正后** `loomrealm.renderer-data/1`。Main独占profile选择；Broker `(Session,Renderer,S,G,P)` exact matching只有**逻辑 authority**、没有build fingerprint，不能识别旧三-child与四-child二进制。必须在连接前协调Main、Data peer、Renderer、Subsystem、Desktop/PWA相应adapter同一受治理release/build cohort，不允许混配。需要rolling/rollback共存必须先按§2另行决策，不得加隐式feature flag或双解析器。

```text
Single-cohort rollout design: specified in ADR0037; owner approved 2026-09-17 (registration §2)
Release cohort artifact manifest and SHA: PENDING (C1 implementation evidence)
Main/Data/Renderer/Subsystem/adapter inventory: PENDING (C1)
No-mixed-version executable proof: PENDING (C1)
Rollout owner decision on no mixed requirement: RECORDED 2026-09-17 (owner attestation); independent Freeze signoff pending
```

Desktop/PWA physical composition指定document layout viewport，采用`Window.innerWidth/innerHeight` CSS logical px floor；实际业务 content box/center/letterbox、hidden→visible、fresh source fence和DPR-only属于产品实现/验收，不是通用 child wire。其他平台须指定自己的唯一稳定 logical surface及消费端证据。

## 5. Docs Freeze后实施与资格路线

Current plan：[phase plan ADR0037 route](./phase-1-delivery-plan.md)；[technical review](./viewport-core-final-review-2026-09-16.md)与[scope repair](./viewport-scope-repair-2026-09-16.md)存放设计验收；Map每刀/性能精确规范只看[Map主合同](../../examples/essentials-v21.1-local/MAP_DYNAMIC_VIEWPORT_PERFORMANCE_REFACTOR_DRAFT.md)。

```text
C0 bounded non-npm owner decision + independent docs approval → Core Docs Freeze SHA
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
| Non-npm compatibility / no-mixed requirement | Project owner attestation, 2026-09-17 ([registration §2](./viewport-core-docs-freeze-registration-2026-09-17.md)) | CLOSED (owner attestation; not an external scan); single cohort approved |
| Connection composition projection | `9fb2c72` and technical review | TEXT VERIFIED; Frozen mechanics preserved |
| Protocol-layer / Subsystem / Renderer / Data status and seam | `ce57cf1` / `feb1054` / `ccb5304` / `2556dfc` | TEXT VERIFIED; no code |
| Original Profile/fixture preservation and wrapper navigation | original blob SHAs + `047e4ba` / `eb2e488` / `66b2009` | HISTORICAL ORIGINAL INTACT / TEXT VERIFIED |
| Viewport terminal contract + fixture | `b896173` / `a8ff94e` | TEXT VERIFIED / NOT RUN |
| Protected normative crosswalk | [scope repair](./viewport-scope-repair-2026-09-16.md), [final technical review](./viewport-core-final-review-2026-09-16.md) | TECHNICAL REVIEW COMPLETE; independent signoff pending |
| Docs navigation auxiliary check | `npm run docs:check-links` @ `4cbf620`, exit 0, 2026-09-17 | 663/663 relative links OK; link reachability only, not normative review |
| Product cohort manifest/verification | future C1 executable | NOT BUILT / NOT VERIFIED; not preimplementation doc PASS |
| Core Docs Freeze docs SHA + valid signoff | subject `4cbf620`, owner signoff 2026-09-17 ([registration §4](./viewport-core-docs-freeze-registration-2026-09-17.md)) | **FROZEN** — Implemented/Qualified remain NO |
| Four-child executable/fixture3/old regression | future C1 | NOT RUN |
| Map PR0 / Map Docs Freeze | separate Map ledger | NOT RUN / HOLD |

Normative schema/currentness/diagnostic change→new docs-only SHA review；code change→new executable SHA + affected rerun。**Do not claim Frozen without owner facts and independent approval; do not turn absence of npm verification into an excuse for delaying Freeze.**
