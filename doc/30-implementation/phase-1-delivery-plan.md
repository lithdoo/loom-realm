# 第一阶段交付计划

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Evolving  
> 主要定义：第一阶段实施顺序、里程碑和关闭条件  
> 依赖：[仓库与分包方案](./repository-layout.md)、[测试策略](./testing-strategy.md)  
> 最近复核：2026-08-08

## 里程碑 0：文档与契约基线

已收敛：

- Game Package v2 / Desktop Node.js Launcher v1；
- Subsystem Control Protocol v1；
- Frame / Call Protocol v1 A-F 全部 Frozen，整体 Active / Normative / Frozen；
- Frame v1 Suspend Semantics Clarification；
- 每 Subsystem一个 Runtime Container / 最多一个 current Renderer Data Connection；
- Render ownership=Subsystem；当前架构进一步收敛为 `0..N` Render Domains / Runtime。

Frame v1 completion profile：

```text
protocol loomrealm.frame-call / 1
no JSON-RPC Batch
Request ID positive safe integer / sender Connection lifetime no reuse
message <= 1 MiB / depth <=64 / business JsonValue <=512 KiB
frameId/activationId <=128 UTF-8 bytes
targetSubsystemKey <=256 UTF-8 bytes
seven method deadlines 1s..5min sender-local monotonic
Desktop WebSocket / PWA MessagePort same application semantics
no Frame handshake/downgrade/partial-v1 claim
```

后续新增 Frame / Call 不兼容语义必须进入新版本，而不是继续追加 Batch。

## 里程碑 1：Game Package v2 与 Desktop Runtime Bootstrap / Control

目标：零 Frame 条件下完成 Runtime Bootstrap、Control identity、ready、normal shutdown 与 failure convergence。

实现 Descriptor Loader / Entry Resolver / Node Launcher / Bootstrap Context / Supervisor / Control carrier / hello/status/shutdown / semantic errors / wire limits / cleanup。

后续跨 Desktop/PWA 的 Runtime lifecycle 收敛方向使用 Subsystem Control v2；v1保持 Frozen historical/Desktop-compatible baseline。

## 里程碑 2：Frame / Call v1 实现与 Conformance

目标：实现 Frozen Frame / Call v1，并把 Conformance Profile 落成 executable fixtures。

实现 Main-owned Frame/Stack/Activation/InputTarget、Subsystem Context、exact seven Requests、closed schema、Outcome、transaction barriers、timeout/no-retry、lowest-root fixed-point unwind、accepted outcome preservation 与 fresh final Caller resume。

关闭条件：Main、Subsystem SDK、适用 Transport adapter通过对应 Frame v1 fixtures，包括 same-Subsystem recursion、limits/ID/deadline、Desktop/PWA semantic equivalence 和 suspend clarification。

## 里程碑 3：Main ⇄ Renderer Control

状态：**协议 Draft 已建立，InputTarget lease语义已闭合，继续 review/closure。**

目标：冻结 Main向 Renderer发布 committed Runtime / Frame / Activation / InputTarget / DataAuthority 的最小 authority-replication contract。

当前模型：

```text
renderer.hello
renderer.state(full Snapshot)
Session-local monotonic revision
revision gap/coalescing allowed
no replay / no patch
```

必须保持：

```text
activate/resume ACK-before-publication
revoked Activation never republished
normal/recovery InputTarget=null legal
published InputTarget lease revoke后 same frameId+activationId never re-granted
Renderer不计算failure unwind
Control loss/replacement撤销Renderer input/Data authority
```

## 里程碑 4：Renderer ⇄ Subsystem Data Connection + User Input

状态：

```text
Data Connection Contract v1    Draft / lifecycle closed
User Input v1                  Core Draft / semantic closure reviewed
```

### Data Connection Contract

目标不是增加第三套业务消息，而是冻结 current carrier authority：

```text
identity
    Session
    + current Renderer participant
    + subsystemKey
    + generation

lifecycle
    current → retired

cardinality
    at most one current carrier per subsystem
```

`generation` 是 Main-owned Data authority epoch，不是 reconnect counter。

Host/Platform WebSocket/MessagePort establishment细节不属于 Connection Core。

Data loss：

```text
!= Runtime failure
!= Frame unwind
```

### User Input Core

v1 trust boundary：

```text
Main
    owns InputTarget / Activation

Renderer Core
    trusted sender-side InputTarget enforcement point

Subsystem
    validates local Frame/Activation + local Interest
```

User Input domain：

```text
Subsystem → Renderer
    Input Interest

Renderer → Subsystem
    State / Event / Reset
```

Interest是 full replacement exact set、fresh Data Connection default empty、no wildcard、not authority。

统一派生状态：

```text
Effective(C)
=
current matching Data Connection
∧ Main current InputTarget matches
∧ active/current Activation matches
∧ C is interested
∧ Producer(C) available
```

必须保持 State/Event/Reset、Producer-loss teardown 与 InputTarget one-shot lease语义。

Standard Input Mapping exact payload、message/Channel/Event queue limits与 text/IME细节延后到具体开发阶段继续收敛，不再阻塞下一协议设计。

## 里程碑 5：Render Update + Render Tree + Web Renderer

**当前下一主要 Data protocol 目标。**

### Render Domain Architecture

每个 Subsystem Runtime MAY拥有：

```text
0..N Render Domains
```

Domain：

```text
domainId
zIndex
0..N ordered roots
```

Node：

```text
key
    current Domain Tree-wide unique reconciliation identity

tag
    logical Renderer Component type

attrs
    string→string declarative attributes

data
    JSON object component state

children
    ordered child nodes
```

Domain identity：

```text
subsystemKey + domainId
```

Domain是：

```text
Render lifecycle unit
atomic authoritative state unit
global composition unit
```

Domain Host不是 Node，因此轻量 Domain不需要 fake container root。

### Render Update v1 关闭目标

冻结：

```text
Domain Registry / lifecycle
Domain current-state publication
atomic commit boundary
zIndex composition / equal-zIndex rules
fresh Data reconnect recovery
backpressure/coalescing
error model
wire limits
```

当前优先方向：

```text
full current Domain State
+ ordered carrier
+ Renderer local key-based reconciliation
+ fresh reconnect state
```

不要在没有证明必要性前引入：

```text
revision
Tree Patch
operation log
resume cursor
cross-Domain transaction
Renderer→Subsystem resync RPC
```

### Render Tree Contract v1 关闭目标

冻结：

```text
roots[] / children[] ordering
Node key uniqueness
same-key tag continuity/replacement semantics
attrs/data plain-data model
Subsystem-scoped tag → Renderer Component resolution
unknown/unavailable tag handling
tree depth/node-count/data/message limits
```

`tag` 不得退化成任意 DOM tag；`attrs/data` 不得成为 executable callback 或 remote DOM command surface。

### Web Renderer 实现

实现：

```text
Render Domain Registry
Domain Store
Domain Host
Renderer Component Registry
Domain Tree Reconciler
Global Domain Composer / Scheduler
```

Renderer MAY按 stable Node key对 full Domain State做本地 diff/reconciliation；内部 diff不产生 wire Tree Patch兼容承诺。

必须保持：

```text
Frame suspend != Domain hidden
Frame close/unwind != Domain destroy
Activation replacement != Domain lifecycle
Data Connection retire != Domain destroy
Domain/Node != Input authority
```

Component MAY提供 custom `x.*` Input Channel Producer，但仍服从 User Input Effective Channel gate。

里程碑 5 最终关闭条件至少覆盖：

```text
zero-domain
single-domain-single-root
single-domain-multi-root
empty-domain-roots
multiple-domains-one-subsystem
multiple-subsystems-domains
zIndex-ordering
equal-zIndex-determinism
node-key-domain-wide-unique
same-key-tag-rule
ordered-root/children
unknown-component-tag
full-domain-atomic-replace
local-key-reconciliation-does-not-change-wire-semantics
frame-close-does-not-destroy-domain
data-retire-does-not-authoritatively-destroy-domain
fresh-connection-domain-recovery
```

## 里程碑 6：Content API 与游戏内容

实现 Safe Package Root、Catalog / Package Index、Readonly Content Service、resource/MIME/ETag/Content Version 与 validate。

Content API只定义读取语义；Content capability distribution使用独立 Bootstrap/Profile。

## 里程碑 7：`loom.map` 最小运行时

实现 Subsystem Control Adapter；完整 Frame v1 Adapter；JSON/limit validator；Request ID/deadline handler；mutation gate；initialize rejection；timeout/divergence reporting；healthy doomed Frame close；Runtime Core/Loop、移动/碰撞/Portal、Render Manager/Projector。

Render Manager至少能发布适用的 map/world/hud 等 Render Domains，Domain内使用 Renderer Component tags与 Domain-wide stable Node keys。

同时实现适用的 Data Connection / User Input / Render Update adapter，但不能把 Frame authority搬到 Data Plane。

## 里程碑 8：Pokémon Essentials 兼容工具链

定义中间 JSON、导入 Tile/Autotile/Passage/Priority/Character、Golden fixture，受限素材不进入公共仓库。

## 里程碑 9：Hostra Desktop 闭环

Main 与 Hostra 分离；Desktop Host建立 per-Subsystem Control/Data carrier；Renderer reload只恢复 Main committed control state；Domain恢复通过 Render Update独立完成；finite shutdown/force termination。

WebSocket endpoint/ticket等属于 Desktop Host binding，不进入 Data Connection Core。

## 里程碑 10：PWA Bootstrap / 闭环

Main/Subsystem Dedicated Worker；冻结 Descriptor→Worker / credential / Control MessagePort establishment；Port建立后直接使用已 Frozen Frame v1 application mapping；Window⇄Subsystem Data carrier由 Host安全建立；Service Worker Content API / OPFS。

PWA Bootstrap Profile MUST NOT重新定义 Frame version、Frame JSON type、Data generation authority、User Input recovery或 Render Domain authority semantics。

## 第一阶段最终验收

- Launcher / Runtime Control符合适用 Normative Contract；
- Frame / Call v1适用角色通过 Conformance Profile；
- exact seven Frame RPC across Desktop/PWA；
- stale Activation永久拒绝；
- Main⇄Renderer Control完成；
- InputTarget one-shot lease完成；
- Data Connection current/retired authority闭合；
- Data loss不触发 Runtime failure/Frame unwind；
- User Input Core authority/Interest/Effective Channel闭合；
- Render Update / Render Tree Contract完成；
- 每 Subsystem支持 `0..N` Domains；
- Domain zIndex / multi-root / Domain-wide Node key闭合；
- Renderer Component tag resolution边界完成；
- Frame不拥有 Domain；zero-frame Domain可工作；
- Content API只读且路径安全；
- Hostra不承载 Main authority。

## 暂缓

Save System、不可信 executable Sandbox、第二 Launcher、automatic Runtime recovery/restart、Control heartbeat、lazy/idle recycle、多 Runtime per key、Publisher Trust/signing、多主栈/Frame Graph、Frame migration、Activation reuse、caller-driven Frame cancellation、Frame RPC replay/resync、transparent partial-Runtime recovery、Frame runtime downgrade/capability negotiation、完整菜单/战斗/任务、多人同步、高级渲染优化、ZIP/ASAR/remote package。
