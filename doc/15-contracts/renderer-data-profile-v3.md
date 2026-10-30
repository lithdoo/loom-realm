# Renderer Data Application Profile v3

> 状态：Proposed pre-release capacity-cap correction in PR #135; implementation and qualification pending
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

unknown type、wrong direction、额外字段或 closed-schema violation 都使 current Data peer `protocol-fatal`。实际 Host / carrier / Runtime operation failure 按其真实 local 或 transport error 处理，不得伪装为 peer protocol violation。`render.*` 与 `viewport.state` 的既有语义不变；本次移除框架自行设定的容量门槛，不改变 `/3` message set。

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

Renderer 的 Presentation logical queue 不定义框架容量，也不得因为 queue 达到某个数字而丢弃新 Event。保留单 serialized writer、FIFO 和既有 once-settle 语义；Presentation Event 只有在其既定 applicability 规则不满足或 current carrier 终止时才不交付，不因人为 queue cap 丢失。

DataRuntime generic outbound queue 不定义 pending count 或 retained encoded-byte 上限。单 writer 按 FIFO 处理 send；调用者可 await 对应 send completion。实际 carrier.send rejection 按 transport failure 传播；不得以框架 queue cap 拒绝 send 或终止 Data peer。单 writer、FIFO、terminal first-wins、pending once-settle/no replay/retry/migration 保持不变。

fresh carrier 不继承 Interest、队列或 in-flight publication。Subsystem 自动重发 full desired Interest；旧 Event 不重放。

## 4. Failure family

Data protocol family 增加 `presentation`。well-formed 但 stale/ineligible 的 Frame Event 只丢弃；malformed JSON / unknown type / wrong direction / closed-schema violation 才使 current peer protocol-fatal。

Developer-owned input、getter/Proxy、JSON serialization 或普通本地 handler operation 抛出的异常，应在对应 API / role boundary 报告，不得自动升级为 peer protocol-fatal 或关闭整个 Data peer。已通过 schema 检查的 inbound authoritative message 若在 candidate mutation 中发生意外本地异常，必须丢弃 candidate；如果无法继续证明 revision continuity，可以以 local implementation failure 退休当前 Data peer，但不得归咎于远端协议。真实 carrier.send / receive failure 按 transport failure 处理。

本 Profile 不定义 common message-byte/depth、candidate、retained-state、queue count 或 queue-byte budget，也不引入 local-resource-exhaustion / ResourceBudgetExceeded。所有失败仍须遵守 no-partial-commit、no-partial-send 和 once-settle；不新增 wire message 或 `/4` identity。业务 handler throw/reject 仍在本地 role boundary 隔离，不得变成 Data protocol-fatal。
