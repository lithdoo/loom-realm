# 第一阶段交付计划

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Evolving  
> 主要定义：第一阶段实施顺序、里程碑和关闭条件  
> 依赖：[仓库与分包方案](./repository-layout.md)、[测试策略](./testing-strategy.md)  
> 最近复核：2026-08-05

## 里程碑 0：文档与契约基线

已收敛：

- Game Package v2 / Desktop Node.js Launcher v1；
- Subsystem Control Protocol v1；
- **Frame / Call Protocol v1 A-F 全部 Frozen，整体 Active / Normative / Frozen**；
- A：identity / authority / lifecycle / Activation；
- B：exact seven RPC wire / local semantics；
- C：transaction / acceptance / InputTarget publication / rollback boundary；
- D：semantic error / finite deadline / ambiguous result / no-retry / cancellation boundary；
- E：Runtime failure lowest-root suffix unwind / fixed-point recovery / outcome preservation / fresh Caller resume；
- F：JSON/Request-ID/wire limits、deadline profile、Desktop/PWA application mapping、version binding、Conformance Profile；
- Render=Subsystem-owned Context；每 Subsystem一个 Runtime Container / 最多一个 Renderer Data Connection。

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

里程碑 0 的协议设计基线现在关闭。后续新增 Frame / Call 不兼容语义必须进入新版本，而不是 Batch G。

## 里程碑 1：Game Package v2 与 Desktop Runtime Bootstrap / Control

目标：零 Frame 条件下完成 Runtime Bootstrap、Control identity、ready、normal shutdown 与 failure convergence。

实现 Descriptor Loader / Entry Resolver / Node Launcher / Bootstrap Context / Supervisor / Control WebSocket / hello/status/shutdown / semantic errors / wire limits / cleanup。

## 里程碑 2：Frame / Call v1 实现与 Conformance

目标：实现 Frozen Frame / Call v1，并把 [Conformance Profile](../15-contracts/frame-call-conformance-v1.md) 落成 executable fixtures。

### Authority / Wire

实现 Main-owned Frame/Stack/Activation/InputTarget、Subsystem Context、exact seven Requests、closed schema、Outcome。

### Transaction

```text
initial: initialize ACK → activate ACK → commit/publish
call: acceptance → call Success → Child init/activate → ACK/publish
return: acceptance → return Success → close ACK/pop → resume ACK/publish
```

### Error / Failure

```text
Success        → known commit
Explicit Error → known no-commit
Timeout/loss   → ambiguous → Runtime failure
```

No retry/replay；recoverable rejection vs divergence/protocol fatal；lowest-root whole-suffix fixed-point unwind；accepted outcome preservation；fresh final Caller resume。

### Completion Profile Implementation

实现：

```text
shared JSON validator
Reference Compact JSON size accounting
Request ID allocator / no reuse
FrameCallDeadlineProfileV1 / monotonic clock
Desktop WebSocket mapping
PWA MessagePort mapping
A-F conformance harness / golden traces
```

里程碑 2 关闭条件：Main、Subsystem SDK、适用 Transport adapter通过全部对应 Frame v1 fixture；same-Subsystem recursion、timeout/no-retry、divergence、multi-Frame unwind、limits/ID/deadline、Desktop/PWA semantic equivalence均自动验证。

> 协议已经 Frozen；里程碑 2 跟踪的是实现/conformance，不是继续设计 Batch F。

## 里程碑 3：Main ⇄ Renderer Control

**当前下一协议设计目标。**

目标：冻结 Main向 Renderer发布 Runtime State / Frame Stack / lifecycle / current Activation / InputTarget 的 wire与 revision模型，并服从 Frame v1 causal/recovery barrier。

必须支持：

```text
activate/resume ACK-before-publication
revoked Activation never republished
normal/recovery InputTarget=null gap
no two InputTargets
failure unwind期间 Renderer不猜测 root
Renderer reconnect只恢复 Main current committed authority
```

## 里程碑 4：Renderer ⇄ Subsystem Connection + User Input

冻结 per-Subsystem Data Connection authentication/Grant/lifecycle，然后冻结 `subsystemRef + frameId + activationId` User Input；只接受 Main-authorized active/current Activation；定义 continuous/discrete/reset/ordering/backpressure。

## 里程碑 5：Render Update 与 Web Renderer

冻结独立 Render identity/lifecycle/state/event/revision/recovery；支持 zero-frame Render、Frame close/unwind后 Render独立、Renderer reload独立恢复。

## 里程碑 6：Content API 与游戏内容

实现 Safe Package Root、Catalog / Package Index、Readonly Content Service、resource/MIME/ETag/Content Version 与 validate。

## 里程碑 7：`loom.map` 最小运行时

实现 Subsystem Control Adapter；完整 Frame v1 Adapter；JSON/limit validator；Request ID/deadline handler；mutation gate；initialize rejection；timeout/divergence reporting；healthy doomed Frame close；Runtime failed时不本地恢复 lower map Frame；Runtime Core/Loop、移动/碰撞/Portal、Render Manager/Projector。

## 里程碑 8：Pokémon Essentials 兼容工具链

定义中间 JSON、导入 Tile/Autotile/Passage/Priority/Character、Golden fixture，受限素材不进入公共仓库。

## 里程碑 9：Hostra Desktop 闭环

Main 与 Hostra 分离；per-Subsystem Control/Data WebSocket；Desktop adapter通过 Frame v1 transport conformance；Renderer reload只恢复 Main committed state；finite shutdown/force termination。

## 里程碑 10：PWA Control Bootstrap / 闭环

Main/Subsystem Dedicated Worker；冻结 Descriptor→Worker / credential / Control MessagePort establishment；Port建立后直接使用已 Frozen Frame v1 MessagePort mapping；Window⇄Subsystem Data MessagePort；Service Worker Content API / OPFS。

PWA Bootstrap Profile MUST NOT重新定义 Frame version、Frame JSON type或 retry semantics。

## 第一阶段最终验收

- Launcher / Subsystem Control v1符合 Normative Contract；
- Frame / Call v1 Main/Subsystem/Desktop/PWA适用角色通过 Conformance Profile；
- exact seven RPC across Desktop/PWA；
- JSON/ID/limit/deadline profile一致；
- same-Subsystem recursion无 nested-handler requirement；
- ACK-before-publish；post-commit no rollback；
- finite deadline/no retry/ambiguous Runtime failure；
- lowest-root whole-suffix fixed-point unwind；
- accepted outcome preservation / `SUBSYSTEM_RUNTIME_FAILED` / fresh Caller resume；
- no caller-driven cancel / recovery abort-unwind/replay；
- stale Activation永久拒绝；
- Main⇄Renderer Control与Data/User Input/Render协议完成；
- Frame不拥有 Render；zero-frame Render可工作；
- Content API只读且路径安全；Hostra不承载 Main。

## 暂缓

Save System、不可信 executable Sandbox、第二 Launcher、automatic Runtime recovery/restart、Control heartbeat、same-attempt reconnect、lazy/idle recycle、多 Runtime per key、Bootstrap Token exact entropy、Publisher Trust/signing、多主栈/Frame Graph、Frame migration、Activation reuse、caller-driven Frame cancellation、Frame RPC replay/resync、transparent partial-Runtime recovery、Frame v1 runtime downgrade/capability negotiation、完整菜单/战斗/任务、多人同步、高级渲染优化、ZIP/ASAR/remote package。
