# Viewport State v1 / Revised Renderer Data Profile v1 Qualification Ledger

> 层级：Implementation / Qualification Ledger（**唯一 Core live status**）  
> 状态：**Preimplementation / Docs Closure In Progress / Not Frozen**；2026-09-16。  
> Decision：[ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)；Contract：[Viewport v1](../15-contracts/viewport-state-v1.md) · [corrected Profile `/1`](../15-contracts/renderer-data-profile-v1.md)；Conformance：[Viewport](../15-contracts/viewport-state-conformance-v1.md) · [Profile `/1` fixture revision3](../15-contracts/renderer-data-profile-conformance-v1.md)。  
> Reviews：[历史Core review](./viewport-core-docs-freeze-review-2026-09-16.md) · [业务归属](./viewport-business-boundary-review-2026-09-16.md) · [当前freeze整改](./viewport-v1-final-freeze-closure-2026-09-16.md)；[Map机械实施主合同](../../examples/essentials-v21.1-local/MAP_DYNAMIC_VIEWPORT_PERFORMANCE_REFACTOR_DRAFT.md)与[Map PR0 evidence](../../examples/essentials-v21.1-local/MAP_VIEWPORT_PR0_EVIDENCE.md)另有独立owner/status。

**Docs Frozen ≠ implemented ≠ qualified/closed。** `/2`已由ADR0037取消，旧[v2 ledger](./viewport-profile-v2-qualification.md)仅历史；旧三child`/1` executable PASS不能充当新四child`/1`证据。

## 1. Current snapshot

```text
ADR0037 direction                  Accepted; external compatibility evidence PENDING
Revised Profile /1 + Viewport v1   Draft normative candidate / Core Docs Freeze HOLD
Old 3-child /1 source              historical executable, still current production code
/2                                 superseded proposal; never shipped/implemented
Main/Renderer/Subsystem/Desktop    revised four-child NOT IMPLEMENTED
Profile /1 fixtureSetRevision      3 spec only; NOT EXECUTED
Compatibility assessment           NOT VERIFIED
Connection projection              corrected 9fb2c72; final cross-review pending
Phase plan current route           amended eb518d6 (preserved old M1–M17 detail)
Data/Subsystem exact API           restored 5b1eb1d / 488fa34; broader diff audit pending
Product build cohort               NOT VERIFIED
Core Docs Freeze subject SHA       PENDING
Executable subject + raw tests     NOT RUN
Map Docs Freeze / PR0 evidence     separate Map-owned HOLD / NOT RUN
```

## 2. Frozen-preimplementation external compatibility investigation

发布负责人核证各来源并记录owner/date/raw source/signoff，不能仅因产品未发布或Repo没有GitHub Releases就推断`/1`无现实兼容义务：

- [ ] GitHub Releases及其他已公开的协议/身份承诺（Releases只覆盖该渠道）。
- [ ] npm alpha/prerelease、private registry、tarball及其他分发/下游consumer。
- [ ] 独立实现、第三方或其他repo/forks使用。
- [ ] Persisted profile identity、仍运行中的旧peer、rolling/rollback/mixed cohort需求。
- [ ] 发布负责人给出明确无真实义务结论、date、证据引用和签名。

```text
Compatibility owner/date/raw evidence: PENDING
Compatibility conclusion: NOT VERIFIED
```

若发现任何真实外部/混版义务，**STOP direct v1 reset并重开显式version/migration ADR**，不能用同P字符串作build fingerprint、补隐式握手/feature flag或将新旧binary混配后称自动迁移。

## 3. Core Docs Freeze gate（不要求实现前test PASS）

- [ ] ADR0037/历史ADR0025/0036的partial supersession、index与旧`/2`历史状态一致，完整cross-review签署。
- [ ] Corrected `/1`四child exact direction/schema/preflight/diagnostics/reader/writer/current authority与Control/Connection一致，旧Input/Render/Control/Connection wire不修改。
- [x] Connection §1/§9/§22仅组合投影编辑修正，[diff `9fb2c72`](https://github.com/lithdoo/loom-realm/commit/9fb2c72a6dff03001ab13978ab38dea0a4454e02)未动zero-message/current-retired/generation/limits；总cross-review仍待签署。
- [ ] [Protected semantics](./viewport-v1-final-freeze-closure-2026-09-16.md)最终逐文件旧→新SSOT审计：Data exact peer/terminal restored、Subsystem author projection restored，但governance/platform/overview/index/其他module的完整diff检查仍PENDING。
- [x] [phase-1 delivery plan](./phase-1-delivery-plan.md)已同步C0→C1→Map PR0**可行性**→Map Docs Freeze→PR1/PR2实现后P95→PR3同SHA资格，并保留既有M1–M17详尽历史实施约束；旧ADR0035 subject不冒充新evidence。
- [ ] Viewport single designated logical surface、floor/invalid conversion、bounded publisher、source/carrier fence、retained/fresh/terminal matrix cross-review签署。
- [ ] `scope.viewport`同步首发含null、current getter先更新、throw/rejected thenable隔离、unsubscribe/terminal inert的assertions完成cross-review。
- [ ] Core不硬编码Window DOM、map cap/camera/chunks/settle/menu；产品统一rollout属本ledger，最终cross-review签署。
- [ ] Revised `/1` fixtureSetRevision3与Viewport conformance executable-ready，旧revision2 PASS不继承，最终cross-review签署。
- [ ] §2 compatibility evidence签署，§4 coherent deployment可行且不需要mixed peer。
- [ ] Affected index/link/status/全量protected diff复核通过、reviewer/date及docs-only SHA记录，Map PR0和motion不代替Core签署。

```text
Core Docs Freeze subject SHA: PENDING
Reviewer/decision/date: PENDING
```

## 4. Product rollout & physical source（不是通用协议）

本产品预定所有本次实际部署的 DataAuthority由Main选择同一**修正后** `loomrealm.renderer-data/1`。Main仍独占Profile选择，Broker以 `(Session,Renderer,S,G,P)` exact match但**P没有build fingerprint**：旧三child binary与四child binary都宣称`/1`，wire无法自动识别/拒绝混版。必须在连接前协调Main、Data peer、Renderer、Subsystem、Desktop/PWA相关adapter同一受治理release/build cohort，归档artifact provenance/subject SHA与测试记录；需要rolling/rollback共存立即STOP按§2决策，不得偷偷加dual parser。旧peer遇新`viewport.state`可能Data-fatal，那是错误部署不是合格迁移。

```text
Release cohort manifest and SHA: PENDING
Main/Data/Renderer/Subsystem/adapter artifact inventory: PENDING
No-mixed-version deployment proof: PENDING
Rollout owner/signoff: PENDING
```

当前Desktop/PWA physical composition指定document layout viewport，使用`Window.innerWidth/innerHeight`的CSS logical px floor；实际map content box、centering、letterbox、hidden→visible recovery、fresh source fencing、DPR-only须产品验收。这个DOM采样属产品实现，不升Core wire；其他platform source也须明示一个stable logical surface及真实consumer证据。

## 5. Docs Freeze之后唯一实施和资格路线

Current execution owner：[phase plan ADR0037 route](./phase-1-delivery-plan.md)；[freeze remediation](./viewport-v1-final-freeze-closure-2026-09-16.md)记录历史diff；Map每刀/性能精确规范只看[Map主合同](../../examples/essentials-v21.1-local/MAP_DYNAMIC_VIEWPORT_PERFORMANCE_REFACTOR_DRAFT.md)。

```text
C0 external compat / documentation + cross-review → Core Docs Freeze SHA
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
| External compatibility owner/signoff | PENDING | NOT VERIFIED |
| Connection editorial projection | `9fb2c72` | DOC CORRECTED / final review pending |
| Phase plan corrected PR0 route | `eb518d6` | DOC CORRECTED / historic detail retained |
| Data/Subsystem exact API | `5b1eb1d` / `488fa34` | KEY SURFACES RESTORED / broader audit pending |
| Cohort manifest and no mixed binary | PENDING | NOT VERIFIED |
| Core Docs Freeze / docs SHA | PENDING | HOLD |
| Four-child `/1` executable / all conformance + old regressions | PENDING | NOT RUN |
| Desktop/Hostra/M13/M14/M15 current requalification | PENDING | NOT RUN |
| PWA source equivalence | PENDING | NOT RUN |
| Map PR0/Map Docs Freeze | separate Map subject | EVIDENCE TEMPLATE / NOT RUN / HOLD |

Contract schema/currentness/source/diagnostic变更→new docs-only SHA review；代码变更→new executable SHA + affected rerun。**只有实际签署才能改PENDING/HOLD，不能因本次文档修改自动变PASS。**
