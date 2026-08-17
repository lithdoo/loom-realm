# 第一阶段交付计划

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Evolving  
> 主要定义：第一阶段实施顺序、里程碑和关闭条件  
> 依赖：[独立分包与发布架构](./package-architecture.md)、[仓库与目录方案](./repository-layout.md)、[测试策略](./testing-strategy.md)、[正式契约目录](../15-contracts/README.md)  
> 最近复核：2026-08-17

第一阶段采用“**协议足够成熟后进入开发，在实现中继续细化非核心 wire 边界**”的节奏。协议设计不再要求先达到纸面 100% 才允许实现。

## 里程碑 0：文档、契约与分包基线

已确认协议：

```text
Game Package v1
Desktop Node.js Launcher v1
Subsystem Control v1
Runtime Control Profile v1 = Control v1 + Frame v1
Frame / Call v1 Frozen
Renderer Control v1 near closure
Data Connection v1 lifecycle closed
User Input v1 Core closure candidate
Render Update v1 single canonical closure candidate
Content API v1
```

已确认分包：

```text
能力一包
角色一包
技术 Adapter 一包
Desktop/PWA 作为 composition root
protocol version != package semver
```

不再采用：

```text
协议一文档一 npm package
host-desktop / host-pwa 万能公共包
历史未实现协议正文
Renderer Component Profile
Standard Input Mapping Profile
Content Access/Range/Event FIFO Profile
Desktop/PWA Data Bootstrap application protocol
```

---

## 里程碑 1：Workspace + Game Package + Runtime Control 基础

优先创建实际需要的 workspace：

```text
@loomrealm/wire
@loomrealm/game-package
@loomrealm/runtime-control
@loomrealm/main
@loomrealm/subsystem
@loomrealm/launcher-node
@loomrealm/transport-websocket
```

实现：

```text
Descriptor Loader / Validator
Entry Resolver
Node Launcher
Launch Attempt / Bootstrap Context
Runtime Supervisor
Control carrier adapter
Subsystem Control v1 hello/status/shutdown
Runtime Control Profile dispatcher/shared ID namespace
```

关闭：

```text
hello selects Control v1
spawn != connected != identified != ready
ready has no Data endpoint
stopped only from Supervisor
unexpected exit/control loss fails Runtime
no automatic restart / same-attempt reconnect
package dependency direction可执行检查
```

---

## 里程碑 2：Frame / Call v1 Vertical Slice + Conformance

实现 Frozen Frame v1：Main-owned Frame/Stack/Activation/InputTarget、exact seven Requests、closed schema、commit barriers、timeout/no-retry、lowest-root fixed-point unwind、accepted outcome preservation、fresh final Caller resume。

`@loomrealm/runtime-control` 内部保持：

```text
control/
frame/
profile/
testing/
```

包合并不得合并协议 version/authority/lifecycle。

关闭：Main、Subsystem、WebSocket adapter 通过适用 Frame fixtures，并跑通 initial Frame → nested call → return/resume → shutdown。

---

## 里程碑 3：Main ⇄ Renderer Control

新增：

```text
@loomrealm/renderer-control
@loomrealm/renderer
```

实现 Main 向 Renderer 复制 committed authority：

```text
full Snapshot
Runtime projection
Frame Stack / Activation
InputTarget
DataAuthority
```

必须保持：

```text
ACK-before-publication
InputTarget one-shot
DataAuthority has no endpoint/token/Port
Control loss revokes Renderer input/Data authority
Renderer does not compute failure unwind
```

Frozen review 与实现/conformance 并行，不阻塞 package skeleton 和基本 snapshot path。

---

## 里程碑 4：Data Connection + Carrier Adapters

新增：

```text
@loomrealm/data
@loomrealm/transport-websocket
```

`@loomrealm/data` 内部保持：

```text
connection/
input/
render/
testing/
```

Data Connection 只实现：

```text
identity = Session + current Renderer + subsystemKey + generation
lifecycle = current → retired
max one current carrier per Renderer/subsystem
```

Desktop composition 用 WebSocket adapter 建立 actual carrier；adapter 不拥有 Data authority。

后续 PWA 再接 `@loomrealm/transport-messageport`，不建立第二套 application protocol。

---

## 里程碑 5：User Input v1 实现驱动细化

先实现已闭合 Core：

```text
Main InputTarget/Activation authority
∩ Subsystem Interest
∩ Producer availability

Subsystem → Renderer  Interest
Renderer → Subsystem  State / Event / Reset
```

standard keyboard/pointer/gamepad canonical payload、identifier/coordinate/button semantics 与 hard limits **在真实输入实现和 fixture 中同步细化**，直接回写 User Input v1，不另建 Mapping Profile。

不要求该 payload 在开始 Renderer/Input 实现前一次性纸面冻结。

---

## 里程碑 6：Render Update v1 + Renderer

实现：

```text
render.domains
render.snapshot(revision)
render.patch(baseRevision, revision)
render.event
```

关键 correctness：

```text
Domain one-shot lifecycle
Node key one-shot
same live key stable opaque tag
fresh connection Registry + Snapshots
baseline后 exact R→R+1
Patch atomic insert/remove/move/update
continuity failure → retire carrier → fresh baseline
no ACK/NACK/replay/resync
```

message/tree/node/op/attrs/data/key/tag/zIndex 等 hard limits 在 Patch engine、fixtures、实际 map state 中同步收敛，再完成 Frozen review。

Renderer内部 Registry/Factory/DOM/Canvas/WebGL/scheduler/cache 不属于 protocol conformance。

---

## 里程碑 7：Content 能力与 Desktop Adapters

新增：

```text
@loomrealm/content
@loomrealm/content-service
@loomrealm/content-fs
@loomrealm/content-http
```

实现：

```text
Safe Package Root
Package Index
Readonly Content Service
manifest/record/group/resource GET+HEAD
MIME / ETag / contentVersion / integrity
Desktop bearer request authorization
```

filesystem 与 HTTP 是独立技术 adapter；credential injection 留在 Desktop composition，不建立 Content Access Profile。

---

## 里程碑 8：`@loomrealm/map` 最小 Runtime

`loom.map` 必须是普通 Subsystem consumer：

```text
@loomrealm/map
    → @loomrealm/subsystem
```

实现：

```text
Frame handlers
business Runtime Core / Loop
movement / collision / Portal
Render Manager / Projector / Diff Engine
User Input consumer
Content client
```

Core/Main/Renderer 不得反向依赖 `@loomrealm/map`。

---

## 里程碑 9：Pokémon Essentials / RMXP 兼容能力

兼容逻辑独立于 Core 发布周期。初始可使用：

```text
@loomrealm/map-essentials
```

如果实现证明更适合格式导向，可以调整为类似 `@loomrealm/rmxp-content`；这属于 package design，不改变协议。

定义中间 JSON、导入 Tile/Autotile/Passage/Priority/Character、Golden fixtures；受限素材不进入公共仓库。

---

## 里程碑 10：`apps/desktop` 闭环

Desktop 是 composition root，不是万能 library package。

组合：

```text
main
renderer
launcher-node
transport-websocket
content-service
content-fs
content-http
map
```

闭环：

```text
Control carrier
Renderer Control bootstrap internal flow
per-Subsystem Data carrier
Content bearer injection
Renderer reload recovery
finite shutdown/force termination
```

平台 glue 只有证明跨产品复用时才进一步抽 package。

---

## 里程碑 11：PWA Adapters + `apps/pwa`

按实际需要新增：

```text
@loomrealm/transport-messageport
@loomrealm/content-service-worker
```

PWA composition：

```text
Main/Subsystem Dedicated Worker
Control MessagePort
Control v1 + Frame v1 application semantics
Renderer⇄Subsystem Data MessagePort
Service Worker Content API / OPFS
```

Worker/Port creation 是 composition/adapter implementation，不定义额外 application protocol，也不默认创建 `@loomrealm/host-pwa`。

---

## 第一阶段最终验收

- monorepo dependency graph 与 package public surfaces 清晰；
- package semver 与 protocol version 没有错误绑定；
- Game Package / Launcher / Control / Runtime Profile 实现；
- Frame v1适用角色通过 Conformance；
- Renderer Control authority闭合；
- Data Connection current/retired闭合且 carrier adapter 不污染 logical authority；
- User Input Core 跑通，canonical payload 由实现/fixture 驱动形成稳定 v1；
- Render Update Registry/Snapshot/Patch/Event 跑通，limits 由实现/fixture 驱动关闭；
- Content API只读/路径安全/鉴权正确；
- `@loomrealm/map` 只依赖 Subsystem-facing capability；
- Desktop/PWA共享 application semantics，平台差异留在 Adapter + composition root。

## 暂缓

Save System、不可信 executable Sandbox、第二 Launcher、automatic Runtime recovery/restart、Control heartbeat、lazy recycle、多 Runtime per key、Publisher signing、多主栈/Frame Graph、Frame migration、Activation reuse、caller-driven cancellation、Frame replay/resync、完整菜单/战斗/任务、多人同步、高级渲染优化、ZIP/ASAR/remote package、Render history replay、cross-Domain transaction，以及预测性创建但暂无真实消费者的 adapter package。
