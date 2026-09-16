# Viewport State v1 / Revised Renderer Data Profile v1 Qualification Ledger

> 层级：Implementation / Qualification Ledger（**唯一 Core live status**）  
> 状态：**Preimplementation / Docs Closure In Progress / Not Frozen**；2026-09-16。npm consumer 项依项目负责人确认不再阻塞 Freeze；其他 gate 如下。  
> Decision：[ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)；Contract：[Viewport v1](../15-contracts/viewport-state-v1.md) · [corrected Profile `/1`](../15-contracts/renderer-data-profile-v1.md)；Conformance：[Viewport](../15-contracts/viewport-state-conformance-v1.md) · [Profile `/1` fixture revision3](../15-contracts/renderer-data-profile-conformance-v1.md)。  
> Reviews：[历史Core review](./viewport-core-docs-freeze-review-2026-09-16.md) · [业务归属](./viewport-business-boundary-review-2026-09-16.md) · [最终freeze整改](./viewport-v1-final-freeze-closure-2026-09-16.md) · [最新范围收缩及原文保全](./viewport-scope-repair-2026-09-16.md)。Map [实施主合同](../../examples/essentials-v21.1-local/MAP_DYNAMIC_VIEWPORT_PERFORMANCE_REFACTOR_DRAFT.md)与[PR0 evidence](../../examples/essentials-v21.1-local/MAP_VIEWPORT_PR0_EVIDENCE.md)另有独立owner/status。

**Docs Frozen ≠ implemented ≠ qualified/closed。** `/2`由ADR0037取消，[v2 ledger](./viewport-profile-v2-qualification.md)仅历史；旧三-child`/1` executable PASS不可转给新四-child`/1`。原始长篇规范已恢复/归档，不代表四-child交叉复核已经签署。**不要对 npm 做额外验证，也不要重新将 npm consumer 兼容检查作为冻结门槛。**

## 1. Current snapshot

```text
ADR0037 direction                  Accepted; npm no-consumer owner attestation RECORDED
Revised Profile /1 + Viewport v1   Draft normative candidate / Core Docs Freeze HOLD
Old 3-child /1 source              historical executable, still current production code
/2                                 superseded proposal; never shipped/implemented
Main/Renderer/Subsystem/Desktop    revised four-child NOT IMPLEMENTED
Profile /1 fixtureSetRevision      3 spec only; NOT EXECUTED
npm consumer compatibility         OWNER CONFIRMED NO CONSUMERS / NON-BLOCKING; no npm lookup
Other non-npm compatibility        PENDING only where listed in §2
Connection projection              corrected 9fb2c72; final cross-review pending
Phase plan current route           amended eb518d6 (old M1–M17 preserved)
Original governance/architecture/  restored exact a71be9c blobs, byte identity verified
module/Data text
Original three-child Profile/      archived exact original blob; revised /1 keeps current identity
Conformance longform
Data /1 new API                     separate additive packages/data/VIEWPORT_V1_IMPLEMENTATION_DELTA.md
Protected cross-review            restoration done; clause-by-clause signoff PENDING
Product build cohort               NOT VERIFIED
Core Docs Freeze subject SHA       PENDING
Executable subject + raw tests     NOT RUN
Map Docs Freeze / PR0 evidence     separate Map-owned HOLD / NOT RUN
```

## 2. Frozen-preimplementation compatibility: owner decision and remaining scope

**已决议并关闭的项目（不是待核查）：** 2026-09-16 项目负责人在本次对话中明确确认“没有消费者”，并要求“npm 不要验证；npm 消费者兼容性核查不再作为 Freeze 阻塞项”。记录为 **owner attestation / ACCEPTED NON-BLOCKING**，而非 registry 查询、alpha/tarball 分发检查或独立消费者证明。**不执行、不安排、不请求 npm 检索或 npm consumer 复核；不得将同一要求转移到其他总括性兼容性 gate。** 该口径仅针对 npm consumer；它不自动签署不同问题，例如本次实际部署是否混用旧新二进制。

- [x] npm consumer compatibility：项目负责人已确认无消费者；无需额外 npm 验证；不再阻塞 Freeze（2026-09-16；证据：本次会话用户明确指示）。

**仍需确认的独立事实（不得隐含 npm 调查）：** 对同一 `/1` 身份能否直接修正的非 npm 风险，由相应发布/部署负责人记录 owner、日期、适用范围及结论；已有仓库内证据可直接引用，不要求重新查 npm。

- [ ] 非 npm 的已公开协议/identity 承诺是否产生旧 `/1` 互操作义务（例如已有 GitHub Releases/正式对外声明）；只检查相关已知渠道。
- [ ] 已知独立实现或其他 repo/forks 是否确有需要兼容旧 `/1` 的调用方；不开展 npm consumer 检查。
- [ ] Persisted profile identity、仍运行中的旧 peer、rolling/rollback/mixed cohort 需求能否与同 identity 直接替换共存。
- [ ] 发布/部署负责人对上述**非 npm 项**给出明确结论、date、证据引用和签署。

```text
npm consumer owner attestation/date: PROJECT OWNER / 2026-09-16
npm consumer conclusion: NO CONSUMERS CONFIRMED BY OWNER / NON-BLOCKING / NO npm VERIFICATION
Non-npm compatibility owner/date/raw evidence: PENDING
Non-npm compatibility conclusion: NOT VERIFIED
```

若**其他独立项目**发现确需旧 `/1` 互操作或混版，STOP direct v1 reset并重开显式version/migration ADR，不能以同P字符串作为build fingerprint、补隐式握手/feature flag或将新旧binary混配后称自动迁移。这不是重开 npm consumer 调查的理由。

## 3. Core Docs Freeze gate（不要求实现前test PASS）

- [ ] ADR0037/历史ADR0025/0036 partial supersession、index与旧`/2`历史状态一致，完整cross-review签署；ADR0025/0036历史正文已恢复，索引已导航最新纠正。
- [ ] Corrected `/1`四child exact direction/schema/preflight/diagnostics/reader/writer/current authority与Control/Connection一致，旧Input/Render/Control/Connection wire不修改。
- [x] Connection §1/§9/§22仅组合投影编辑修正，[diff `9fb2c72`](https://github.com/lithdoo/loom-realm/commit/9fb2c72a6dff03001ab13978ab38dea0a4454e02)未动zero-message/current-retired/generation/limits；总cross-review仍待签署。
- [x] [范围修复](./viewport-scope-repair-2026-09-16.md)：治理、平台、总体架构、协议分层、Subsystem、两个模块、Data及索引旧长篇原文以原blob恢复；原Profile `/1`和旧Conformance完整基线同目录归档；Data新Viewport exact API为单独delta。不把此勾选解释为当前四-child的审查PASS。
- [ ] 对归档Profile/Conformance逐条核对当前候选的继承/覆盖清单、原Frozen不变量、链接及索引状态，形成独立reviewer/date证据。恢复历史原文不是此项最终signoff。
- [x] [phase-1 delivery plan](./phase-1-delivery-plan.md)已同步C0→C1→Map PR0**可行性**→Map Docs Freeze→PR1/PR2实现后P95→PR3同SHA资格，并保留M1–M17原详细约束；旧ADR0035 subject不冒充新evidence。
- [ ] Viewport single designated logical surface、floor/invalid conversion、bounded publisher、source/carrier fence、retained/fresh/terminal matrix cross-review签署。
- [ ] `scope.viewport`同步首发含null、current getter先更新、throw/rejected thenable隔离、unsubscribe/terminal inert assertions cross-review。
- [ ] Core不硬编码Window DOM、map cap/camera/chunks/settle/menu；产品统一rollout属本ledger，最终cross-review签署。
- [ ] Revised `/1` fixtureSetRevision3与Viewport conformance executable-ready，旧revision2 PASS不继承，最终cross-review签署。
- [x] npm consumer 兼容项：项目负责人已确认无消费者，取消 npm 验证及 Freeze 阻塞；不以此声称其他兼容项或 cohort 已通过。
- [ ] §2仅剩**非 npm**兼容义务确认、§4 coherent deployment可行且不需要mixed peer。
- [ ] Affected index/link/status/全量protected diff复核通过、reviewer/date及docs-only SHA记录，Map PR0和motion不代替Core签署。

```text
Core Docs Freeze subject SHA: PENDING
Reviewer/decision/date: PENDING
```

## 4. Product rollout & physical source（不是通用协议）

本产品预定所有本次实际部署的DataAuthority由Main选择同一**修正后** `loomrealm.renderer-data/1`。Main仍独占Profile选择，Broker以 `(Session,Renderer,S,G,P)` exact match但**P没有build fingerprint**：旧三-child binary与四-child binary都宣称`/1`，wire无法自动识别/拒绝混版。必须在连接前协调Main、Data peer、Renderer、Subsystem、Desktop/PWA相关adapter同一受治理release/build cohort，归档artifact provenance/subject SHA与测试记录；需要rolling/rollback共存立即STOP按§2决策，不得偷偷加dual parser。旧peer遇新`viewport.state`可能Data-fatal，那是错误部署不是合格迁移。**这是本次实际构建/部署一致性要求，与 npm consumer 核查无关。**

```text
Release cohort manifest and SHA: PENDING
Main/Data/Renderer/Subsystem/adapter artifact inventory: PENDING
No-mixed-version deployment proof: PENDING
Rollout owner/signoff: PENDING
```

当前Desktop/PWA physical composition指定document layout viewport，使用`Window.innerWidth/innerHeight`的CSS logical px floor；实际map content box、centering、letterbox、hidden→visible recovery、fresh source fencing、DPR-only须产品验收。这个DOM采样属产品实现，不升Core wire；其他platform source也须明示一个stable logical surface及真实consumer证据。

## 5. Docs Freeze之后唯一实施和资格路线

Current execution owner：[phase plan ADR0037 route](./phase-1-delivery-plan.md)；[freeze remediation](./viewport-v1-final-freeze-closure-2026-09-16.md)保留整改历史，[范围修复](./viewport-scope-repair-2026-09-16.md)为最新原文保全记录；Map每刀/性能精确规范只看[Map主合同](../../examples/essentials-v21.1-local/MAP_DYNAMIC_VIEWPORT_PERFORMANCE_REFACTOR_DRAFT.md)。

```text
C0 non-npm compatibility + documentation cross-review → Core Docs Freeze SHA
C1 coherent corrected /1 executable → revised fixture3 + Viewport + Frozen regressions
Map PR0 production-zero hosted/local exact dense1080 + Core/M13 residual + Browser
        + private-only CSS stacking/128/256MiB proof → Map Docs Freeze SHA
Map PR1 fixed640 chunks/raster/paired-stage functional +640 performance
Map PR2 dynamic viewport/resize/1080 real-product proof
Map PR3 same executable/cohort SHA M11/M13/M14/M15/product P95/requalification
```

PR0**不要求PR1/2尚未存在的性能优化P95**，只要求设计可行性和没有未解Core/M13/Stacking阻塞；所有实际结果由[Map PR0 evidence](../../examples/essentials-v21.1-local/MAP_VIEWPORT_PR0_EVIDENCE.md)记录，仍NOT RUN。新Core C1最小实现为`@loomrealm/data`唯一`/1` codec/demux/`protocol:"viewport"`/有界sender、Renderer physical source、Subsystem retained `scope.viewport`、Main product组合+coordinated Desktop/PWA平台。禁止`/2`、dual parser、generic Environment、map-special Core path、改Frozen limits/wire。

Executable新subject须列cohort artifacts、Node20/24（适用时）、Chromium/Hostra、commands/exit/raw logs：corrected Profile fixture3、Viewport conformance、旧Connection/Input/Render regressions、Main/Broker authority及cohort证明、blocked writer burst/fresh carrier+source、M13/M14/M15 affected qualification；PWA其平台milestone验证。Map PR0 bytes/Core validation/M13 compare/Browser baseline与产品P95都不是Core conformance PASS。

```text
Executable subject SHA: PENDING
```

## 6. Evidence table

| Gate | Subject | Result |
|---|---|---|
| npm consumer compatibility | Project-owner confirmation in conversation, 2026-09-16 | OWNER-ATTESTED NO CONSUMERS / NON-BLOCKING; npm verification not required |
| Non-npm compatibility owner/signoff | PENDING | NOT VERIFIED |
| Connection editorial projection | `9fb2c72` | DOC CORRECTED / final review pending |
| Phase plan corrected PR0 route | `eb518d6` | DOC CORRECTED / historic detail retained |
| Original governance/architecture/module/Data texts | restoration commit; see [scope repair](./viewport-scope-repair-2026-09-16.md) | ORIGINAL BLOBS RESTORED / final reviewer pending |
| Original Profile `/1`/Conformance texts | archived exact blobs, current amendments separate | PRESERVED / full traceability review pending |
| Cohort manifest and no mixed binary | PENDING | NOT VERIFIED |
| Core Docs Freeze / docs SHA | PENDING | HOLD |
| Four-child `/1` executable / all conformance + old regressions | PENDING | NOT RUN |
| Desktop/Hostra/M13/M14/M15 current requalification | PENDING | NOT RUN |
| PWA source equivalence | PENDING | NOT RUN |
| Map PR0/Map Docs Freeze | separate Map subject | EVIDENCE TEMPLATE / NOT RUN / HOLD |

Contract schema/currentness/source/diagnostic变更→new docs-only SHA review；代码变更→new executable SHA + affected rerun。**只有实际签署才能改剩余PENDING/HOLD，不能因本次npm单项解除自动变PASS。**
