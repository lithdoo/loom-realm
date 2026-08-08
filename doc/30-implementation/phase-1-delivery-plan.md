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
- Render=Subsystem-owned Context；每 Subsystem一个 Runtime Container / 最多一个 current Renderer Data Connection。

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

状态：**协议 Draft 已建立，进入 review/closure。**

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
Renderer不计算failure unwind
Control loss/replacement撤销Renderer input/Data authority
```

## 里程碑 4：Renderer ⇄ Subsystem Data Connection + User Input

状态：

```text
Data Connection Contract v1    Draft / lifecycle closed
User Input v1                  Core Draft / current review
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

普通输入只在：

```text
current Data Connection
+
Main current InputTarget
+
frameId
+
current activationId
```

成立时发送。

Core三类：

```text
discrete
continuous
reset
```

冻结方向：

```text
Renderer → Subsystem only
no ACK
no replay across Activation
no broadcast
no direct Frame command
```

下一关闭项：

```text
Keyboard / Pointer / Touch / Gamepad normalized payload
message encoding / limits
queue numeric limits
discrete overflow policy
text/IME boundary
```

里程碑 4 最终关闭条件：Data Connection Contract lifecycle + User Input wire/payload/limits/conformance全部明确，且 stale Activation、Control loss、same-generation reconnect、continuous reset 都有 fixture。

## 里程碑 5：Render Update 与 Web Renderer

**下一主要 Data protocol 目标。**

冻结独立 Render identity/lifecycle/state/revision/snapshot/recovery/backpressure；支持 zero-frame Render、Frame close/unwind后 Render独立、Renderer reload/Data reconnect独立恢复。

必须保持：

```text
Frame suspend != Render hidden
Frame close/unwind != Render destroy
Activation replacement != Render epoch
Data Connection retire != Render destroy
```

Render State Contract作为 Render Update携带的声明式状态模型独立冻结。

## 里程碑 6：Content API 与游戏内容

实现 Safe Package Root、Catalog / Package Index、Readonly Content Service、resource/MIME/ETag/Content Version 与 validate。

Content API只定义读取语义；Content capability distribution使用独立 Bootstrap/Profile。

## 里程碑 7：`loom.map` 最小运行时

实现 Subsystem Control Adapter；完整 Frame v1 Adapter；JSON/limit validator；Request ID/deadline handler；mutation gate；initialize rejection；timeout/divergence reporting；healthy doomed Frame close；Runtime Core/Loop、移动/碰撞/Portal、Render Manager/Projector。

同时实现适用的 Data Connection / User Input / Render Update adapter，但不能把 Frame authority搬到 Data Plane。

## 里程碑 8：Pokémon Essentials 兼容工具链

定义中间 JSON、导入 Tile/Autotile/Passage/Priority/Character、Golden fixture，受限素材不进入公共仓库。

## 里程碑 9：Hostra Desktop 闭环

Main 与 Hostra 分离；Desktop Host建立 per-Subsystem Control/Data carrier；Renderer reload只恢复 Main committed state；finite shutdown/force termination。

WebSocket endpoint/ticket等属于 Desktop Host binding，不进入 Data Connection Core。

## 里程碑 10：PWA Bootstrap / 闭环

Main/Subsystem Dedicated Worker；冻结 Descriptor→Worker / credential / Control MessagePort establishment；Port建立后直接使用已 Frozen Frame v1 application mapping；Window⇄Subsystem Data carrier由 Host安全建立；Service Worker Content API / OPFS。

PWA Bootstrap Profile MUST NOT重新定义 Frame version、Frame JSON type、Data generation authority或 User Input recovery semantics。

## 第一阶段最终验收

- Launcher / Runtime Control符合适用 Normative Contract；
- Frame / Call v1适用角色通过 Conformance Profile；
- exact seven Frame RPC across Desktop/PWA；
- stale Activation永久拒绝；
- Main⇄Renderer Control完成；
- Data Connection current/retired authority闭合；
- Data loss不触发 Runtime failure/Frame unwind；
- User Input discrete/continuous/reset、ordering/backpressure/limits完成；
- Render Update / Render State完成；
- Frame不拥有 Render；zero-frame Render可工作；
- Content API只读且路径安全；
- Hostra不承载 Main authority。

## 暂缓

Save System、不可信 executable Sandbox、第二 Launcher、automatic Runtime recovery/restart、Control heartbeat、lazy/idle recycle、多 Runtime per key、Publisher Trust/signing、多主栈/Frame Graph、Frame migration、Activation reuse、caller-driven Frame cancellation、Frame RPC replay/resync、transparent partial-Runtime recovery、Frame runtime downgrade/capability negotiation、完整菜单/战斗/任务、多人同步、高级渲染优化、ZIP/ASAR/remote package。
