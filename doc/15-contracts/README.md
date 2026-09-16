# LoomRealm 正式契约目录

> 层级：正式契约索引 · 状态：Active Design  
> 重点：Renderer Data Profile **首次发布前直接修正 v1**；旧三-child Frozen executable为 historical baseline，新四-child `/1` Docs Freeze HOLD、尚未实现；`/2` Superseded/never implemented。  
> Decision：[ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)；governance：[Document Governance](../00-overview/document-governance.md)  
> 最近复核：2026-09-16

契约层只规定跨角色互操作 observable semantics；物理 Window/Port/Process来源、产品选择与地图政策下沉到 composition/consumer。Docs Frozen ≠ Implemented ≠ Qualified；本索引不维护第二份 live milestone状态。

## 1. Current contract map

| Contract | Current maturity |
|---|---|
| Frame / Call v1 | Active / Normative / Frozen |
| Main ⇄ Renderer Control v1 | Active / Normative / Frozen |
| Renderer ⇄ Subsystem Data Connection v1 | Active / Normative / Frozen |
| **Renderer Data Application Profile v1 (revised four-child)** | **Normative Candidate / Docs Freeze HOLD / Not Implemented**（old three-child executable historical） |
| User Input v1 | Active / Normative / Frozen |
| Render Update v1 | Active / Normative / Frozen |
| **Viewport State v1** | Draft / Normative Candidate / Not Implemented |
| Readonly Content API v1 | Active / Normative / Evolving |
| Hostra Game Launcher / Node Runner v1 | Active / Normative / Frozen M6 slice |
| Web Presentation Config v1 | Active / Normative / Frozen |
| Web Presentation API v1 | Active / Normative / Frozen |

唯一目标 Data Profile：

```text
loomrealm.renderer-data/1 (revised first-version candidate)
  = Data Connection v1 + User Input v1 + Render Update v1 + Viewport State v1
```

原 [Profile v2](./renderer-data-profile-v2.md)及 [v2 Conformance](./renderer-data-profile-conformance-v2.md) **Superseded historical only**；不发布、不实现、不 advertise `/2`、不保留旧三-child `/1` dual parser或 optional mode。Frozen Control v1的 `dataProfile:string`和 Connection v1的 fresh-generation replacement机制不需要 wire 修改；旧三-child Profile v1是历史实现，不与 revised `/1`混配。直接纠正以 ADR0037的真实兼容义务核查为 Freeze 前提。

## 2. Viewport & revised profile current sources

- [ADR0037：为什么修正首版/兼容性 gate](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)
- [Viewport architecture：Core ownership](../10-architecture/viewport-capability.md)
- [Profile v1：唯一完整组合、routing、terminal](./renderer-data-profile-v1.md)
- [Profile v1 Conformance fixtureSetRevision 3](./renderer-data-profile-conformance-v1.md)
- [Viewport State v1：exact child、retention、author API](./viewport-state-v1.md)
- [Viewport State v1 Conformance](./viewport-state-conformance-v1.md)
- [唯一 live qualification ledger](../30-implementation/viewport-profile-v1-qualification.md)
- [历史 ADR0036（v2 identity部分已被替代）](../decisions/0036-viewport-state-and-renderer-data-profile-v2.md)

Viewport是 Renderer→Subsystem的 readonly retained geometry，不属于 InputTarget/Activation/Interest。一个由 Renderer physical composition指定的 single logical surface，CSS logical size；per-carrier one-admitted + one-latest bounded publication，fresh carrier baseline，Subsystem Runtime `scope.viewport`保留last。Main仅拥有 DataAuthority而不保留尺寸。Desktop/PWA当前物理 source指定 document layout viewport/`innerWidth`/`innerHeight`，是 platform/product realization而不是通用 wire ABI。Map的 default/cap/settle/camera/chunk/raster/menus/latency属于 game consumer。

Core Docs Freeze只需兼容性证据+完整 cross-review+可执行测试规范+docs SHA，不要求实施前 executable PASS；后续实现与测试建立新 SHA。原 Core Freeze Review与 Business Boundary Review为历史 issues，其 disposition以当前 ledger和 ADR0037的修正为准。

## 3. Frozen M13 presentation authority（未改变）

```text
Main: committed Session/DataAuthority topology
Renderer Store: current per-subsystem authoritative Render replica
Web Projector: sole LoomRealm managed DOM mutation from current Control + Render
Business WC: readonly managed projection; owns private ShadowDOM/Canvas/resources/retry
```

只有 committed Control/current Render Store变化触发 Projector reevaluation；Viewport observation不是第三 desired-state owner。fresh generation退役旧 element universe；same G carrier loss保留/冻结 affected DOM，fresh complete baseline reconcile一次；structurally equal RenderData重连不保证重新 `receiveRenderData()`，WC retry自理。

## 4. Web Presentation Config/API frozen pointers

[Config v1](./web-presentation-config-v1.md)：product-private config source→prepared Content→exact Window-level `{formatVersion,scripts,styles}` ordered refs→JS/CSS MIME validation→ordered link/script→window.onload once。Hostra physical ownership不修改其 contract。

[API v1](./web-presentation-api-v1.md)：optional `receiveRenderContext`每 element最多一次/首次插入前；optional `receiveRenderData` initial + retained structural JSON变化才投递；identity `(Session,subsystemKey,generation,domainId,key)`，fresh Session/G fresh universe。WC只处理 own ShadowDOM/Canvas，不向 Store回写；Window teardown的 resource calls沿 Frozen cancellation rule。

## 5. Failure/currentness frozen anchors

```text
DataAuthority removed → affected subsystem DOM remove without waiting Render
fresh G → old universe retire; new awaits matching carrier+complete Render baseline
same G carrier loss → affected DOM retain/freeze; partial baseline hidden
Control transport loss without replacement → preserve last, not invent empty authority
```

Viewport独立 retaining last observation；非null不等于现有 Renderer/carrier/paintability，fresh matching baseline最终收敛。M15 reload=fresh Renderer；Data-only reconnect=same Renderer/new carrier。Core protocol invalid→Data terminal而非自动 Runtime/Frame terminal。

## 6. Qualification/governance

当前改正 `/1` maturity唯一状态见 [v1 ledger](../30-implementation/viewport-profile-v1-qualification.md)；M11/M14/M15仍看各自 qualification ledgers。旧三-child `/1`历史 PASS不可转给 revised four-child executable；历史 `/2` ledger已退役。兼容核查如发现外部义务，应停止 direct reset并制定新迁移决定；不得借未发布假设静默破坏真实连接。

禁止因本修正添加 per-Subsystem feature negotiation、generic Environment manager、Main width mirror、map Render fast path、Input bypass、cross-child ACK/transaction、multi-surface routing或人为扩张 Frozen Input/Render wire与 representation limits。