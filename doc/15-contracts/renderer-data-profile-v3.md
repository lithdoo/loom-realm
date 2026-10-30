# Renderer Data Application Profile v3

> 状态：Active / Normative / local resource-policy correction proposed in PR #135; implementation and qualification pending
> Identity：`loomrealm.renderer-data/3`
> 组成：Render Update v1 + Viewport State v1 + Frame-targeted Presentation Event v1
> 历史 profile：[Renderer Data Profile v2](./renderer-data-profile-v2.md)
> 最近复核：2026-10-30

## 1. Closed message set

Subsystem → Renderer：

```text
render.domains
render.snapshot
render.patch
render.event
presentation.interest
```

Renderer → Subsystem：

```text
viewport.state
presentation.event
```

unknown type、wrong direction、额外字段或 closed-schema violation 都使 current Data peer `protocol-fatal`。超过 Host / Product / Runtime 的 local resource budget 属 `local-resource-exhaustion`，不得归类为 peer protocol violation。`render.*` 与 `viewport.state` 的 v2 语义不变；本次容量策略修订不改变 `/3` identity 或 wire message set。

## 2. Binding 与部署

```ts
interface DataCurrentBindingV3 {
  readonly carrier: MessageCarrier;
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: "loomrealm.renderer-data/3";
}
```

当前仓库只运行 `/3`，不协商或兼容 `/2`。Main、Renderer、Subsystem、Desktop、PWA 与 Hostra 必须作为同一 cohort 部署；错配在占用 reader 前 fail closed。

Renderer Control 的 protocolVersion 仍为 2。Control v2 的 `dataProfile: string` 发布 `/3` identity，不改变 Control wire schema。其冻结文档中 `/2` 是旧部署事实，本文件取代当前部署 identity。

## 3. 单 reader / 单 writer

一个 Data peer 继续只占用一个 reader 和一个串行 writer。Presentation 不创建第二 carrier/writer；Render、Viewport 与 Presentation 都调用同一个 DataRuntime。

Renderer 的 Presentation logical queue 每 target peer 必须有有限容量；当前实现默认最多 256 个未开始 Event、最多一个 Presentation send in flight。满载丢弃新 Event；已接纳 Event 保持 FIFO。该 256 是本地 producer policy，不是跨实现 wire cap，可按产品容量调整，但必须保持有限队列与既有 drop/FIFO 语义。

DataRuntime generic outbound queue 也必须有有限的 pending count + retained encoded-byte budget。当前实现的 1024 pending-send 数量是 implementation default，不是 Profile `/3` 的固定要求；预算耗尽应走 local resource failure，不得报告为 peer protocol-fatal。单 writer、FIFO、terminal first-wins、pending once-settle/no replay/retry/migration 保持不变。

fresh carrier 不继承 Interest、队列或 in-flight publication。Subsystem 自动重发 full desired Interest；旧 Event 不重放。

## 4. Failure family

Data protocol family 增加 `presentation`。well-formed 但 stale/ineligible 的 Frame Event 只丢弃；malformed JSON / unknown type / wrong direction / closed-schema violation 才使 current peer protocol-fatal。local inbound / candidate / retained-state / queue / outbound serialization budget exhaustion 属 `local-resource-exhaustion`，映射到现有 Data `local-fatal` terminal family：PWA Carrier / Codec 传递带类型的 resource-budget cause，DataRuntime 必须识别并映射为 local-fatal（不能误报为 carrier-lost 或 protocol-fatal）；入站 no-partial-commit 并 retire 当前 carrier；出站不得发送部分 application unit。RenderManager pending-work admission failure 由 Subsystem 本地诊断并 retire 当前 publication peer，不得归咎于远端 peer。它不是 peer protocol violation，也不新增 wire message 或 `/4` identity。业务 handler throw/reject 仍在本地 role boundary 隔离，不得变成 Data local-fatal。
