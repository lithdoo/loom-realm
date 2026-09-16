# LoomRealm 正式契约目录

> 层级：正式契约索引 · 状态：Active Design  
> 稳定程度：current-v1 contracts按各自 Frozen状态；Viewport v1 / Renderer Data Profile v2 **Draft / Candidate for Freeze / Not Implemented**；M14/M15 status由各自 ledger拥有  
> 定义：cross-role contracts、version/compatibility、maturity与唯一 Freeze证据入口  
> 依赖：[System overview](../10-architecture/system-overview.md) · [Rendering](../10-architecture/rendering-system.md) · [Viewport](../10-architecture/viewport-capability.md) · [ADR0036](../decisions/0036-viewport-state-and-renderer-data-profile-v2.md)  
> 最近复核：2026-09-16

契约层仅冻结跨角色/实现必须一致的 observable semantics；physical provisioning/Process/Worker/endpoint/ticket/Port不自动形成 application protocol。本索引不维护 M14/M15 第二份 PASS/Closed。Docs Freeze只表示规范完整，不证明实现存在。

## 1. Current contract map

```text
Frame / Call v1                         Active / Normative / Frozen
Main ⇄ Renderer Control v1              Active / Normative / Frozen
Renderer ⇄ Subsystem Data Connection v1 Active / Normative / Frozen
Renderer Data Application Profile v1    Active / Normative / Frozen
User Input v1                           Active / Normative / Frozen
Render Update v1                        Active / Normative / Frozen
Viewport State v1                       Draft / Normative Candidate / Not Frozen
Renderer Data Application Profile v2    Draft / Normative Candidate / Not Frozen
Readonly Content API v1                 Active / Normative / Evolving
Hostra Game Launcher / Node Runner v1   Active / Normative / Frozen M6 slice
Web Presentation Config v1              Active / Normative / Frozen
Web Presentation API v1                 Active / Normative / Frozen
```

Profile identities：

```text
loomrealm.renderer-data/1 [Frozen compatibility]
 = Connection1 + Input1 + Render1
loomrealm.renderer-data/2 [candidate target]
 = Connection1 + Input1 + Render1 + Viewport1
```

`/2`是完整的新 compatible identity，不能把 viewport悄悄塞进 `/1`；Control v1的 `dataProfile:string`与 Connection v1的 fresh-generation profile replacement足以支持新组合，旧文“Phase 1=/1”只是当时 executable baseline，不改变 v1 acceptance。

## 2. Viewport candidate SSOT and maturity

- [ADR0036：decision/why](../decisions/0036-viewport-state-and-renderer-data-profile-v2.md)
- [Viewport architecture：ownership/lifetime](../10-architecture/viewport-capability.md)
- [Viewport State v1：exact child/author semantics](./viewport-state-v1.md)
- [Renderer Data Profile v2：exact complete composition](./renderer-data-profile-v2.md)
- [Viewport executable-ready conformance spec](./viewport-state-conformance-v1.md)
- [Profile v2 executable-ready conformance spec](./renderer-data-profile-conformance-v2.md)
- [Core Docs Freeze Review：CF-01..07 closure progress](../30-implementation/viewport-core-docs-freeze-review-2026-09-16.md)
- [唯一 Viewport/Profile v2 qualification ledger](../30-implementation/viewport-profile-v2-qualification.md)

候选设计简述：Viewport不是 User Input；Runtime-scoped readonly last observation；one Renderer document layout viewport (`innerWidth/innerHeight` CSS pixels)，per-carrier bounded latest sender，fresh carrier baseline，Main只选择所有 canonical current DataAuthorities `/2`、不保存 width/height；不谈 per-Subsystem negotiation。非法 Viewport child在 `/2`报告 `protocol:"viewport"`，retire Data而非 Frame/Runtime failure。Map的 camera/chunk/render/latency完全独立治理。

**当前状态**：原 Core review七项已作规范修订，最终 cross-review与 docs-only SHA sign-off仍待记录。Formal contract仍 Not Frozen；implementation尚未开始。Docs Freeze只要求两份完整可执行测试规范及 cross-document一致性，不能要求实现前提供 raw executable PASS；后续 qualification须新 executable subject SHA/环境/日志。Map Draft还有自己的 MF-01生命周期与 PR0性能 gate，不得借 Core Freeze宣称 map已通过。

## 3. M13 rendering authority and Web Presentation

```text
Main Control snapshot: current Session/DataAuthority topology
Renderer per-subsystem Store: current authoritative Render replica
Web Projector: current Control + eligible Store的唯一 managed DOM mutation
Business WC: read-only managed projection consumer;
             owns ShadowDOM/Canvas/WebGL/private presentation/retry
```

Presentation reevaluation只有 committed current Control topology change或 successful current Render Store commit；Viewport physical observation不是第三个 Projector authority，业务必须先通过 Render author API提交。Data generation change退役旧 element universe；same-generation Data carrier loss保留/冻结 affected DOM，fresh complete baseline reconcile一次；structurally equal RenderData重连不会自动 `receiveRenderData()`，Browser retry自己负责。

## 4. Frozen Web Presentation Config/API

[Web Presentation Config v1](./web-presentation-config-v1.md)：product-private source→exact `{formatVersion,scripts,styles}` Window ordered refs→prepared Content→JS MIME `text/javascript`、CSS MIME `text/css`→ordered link/classic script→`window.onload`→presentation starts once。Missing/unparseable/wrong MIME bootstrap failure，不 sniff/fallback。Hostra top-level trusted shell不修改此契约。

[Web Presentation API v1](./web-presentation-api-v1.md)：optional `receiveRenderContext` Window-lifetime before first managed insertion、每 HTMLElement最多一次；optional `receiveRenderData` initial+只在 retained JSON变化时交付。identity `(Session,subsystemKey,generation,domainId,key)`，same identity same HTMLElement；fresh Session/G fresh universe。PresentationResourceClient仅 logical resource/version，Window teardown后 valid `resource()` reject `CONTENT_CANCELLED`。Unregistered tag preflight结构 failure必须 reconciliation zero DOM mutation，Window-local管理失败按 frozen rule退役。

## 5. Currentness and evidence owners

```text
DataAuthority removed → affected subsystem DOM remove without Render commit
fresh generation → retire old element universe; new awaits matching carrier/baseline
same G carrier loss → retain/freeze only affected DOM; partial baseline hidden
Control transport loss without replacement snapshot → preserve last, no fake empty authority
```

Viewport last observation在 Data loss时保留，不等于 current carrier/Renderer/paintable证明；matching fresh baseline收敛，equal size不重复 author callback。M15 reload=fresh Renderer；Data-only reconnect=same Renderer。M11当前重验与 M14/M15 executable statuses只看各自 qualification ledgers，不因 docs-only修改宣称 PASS。

## 6. Freeze governance

Frozen contract只有 demonstrated correctness/security contradiction、cross-contract conflict、real consumer capability failure或real compatibility boundary才可显式 reopen。ADR0036是真实 map consumer capability gap，所以添加独立 Profile v2而不修改 Frozen `/1`。不得以 API symmetry、假想 future feature、平台物理对称或测试方便为由引入 Environment service locator、第二 Store/topology/currentness、generic component loader、layout/layer authority、DOM rollback framework或 RenderEvent WC ABI。

Review→docs-only Freeze SHA→implementation new executable SHA→conformance/v1 regression/hosted/M13/M14/M15 product evidence→ledger Qualified 是唯一有效状态链。M16/M17 PWA平台证据按后续 milestone独立取得。