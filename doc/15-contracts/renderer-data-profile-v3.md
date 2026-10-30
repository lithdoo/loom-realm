# Renderer Data Application Profile v3

> 状态：Active / Normative / Frozen
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

unknown type、wrong direction、额外字段或 Wire/schema/authority/revision violation 都使 current Data peer `protocol-fatal`。Framework capacity/backlog pressure 不是 protocol violation。`render.*` 与 `viewport.state` 的既有 correctness 语义不变。

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

Renderer 的 Presentation logical queue 每 target peer 最多一个 Presentation send in flight，使用 O(1) FIFO drain 与 transport Promise 自然 backpressure。已经接受且仍 applicable 的 Event 不因固定 pending threshold 丢弃；DataRuntime 同样不以 pending-send count 拒绝合法 application unit。terminal exactly-once settle 未开始 work 并释放 retained payload references。

fresh carrier 不继承 Interest、队列或 in-flight publication。Subsystem 自动重发 full desired Interest；旧 Event 不重放。

## 4. Failure family

Data protocol family 增加 `presentation`。well-formed 但 stale/ineligible 的 Frame Event只丢弃；malformed Wire/schema/direction/authority 才使 current peer protocol-fatal；本地 clone/index/freeze 等 unexpected mechanics failure 保持 committed state/revision 不变并传播为 existing Data local-fatal；业务 handler throw/reject 在 registration 边界隔离，不得变成 Data local-fatal。

## 5. Pre-release revision

2026-10-30 对同一 `/3` identity 作首次实质公开发布前修订：删除 common message/depth/member/string caps、Presentation Interest/Event caps、DataRuntime 1024 与 Presentation 256 pending gates；保留 one reader、single serialized writer、FIFO、terminal first-wins、fresh carrier no replay、exact closed schema 和 child authority/failure boundaries。无需 migration 或 dual mode。
