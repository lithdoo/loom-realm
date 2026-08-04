# 第一阶段交付计划

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Evolving  
> 主要定义：第一阶段实施顺序、里程碑和关闭条件  
> 依赖：[仓库与分包方案](./repository-layout.md)、[测试策略](./testing-strategy.md)  
> 最近复核：2026-08-04

本计划按当前架构依赖顺序组织实施。

## 里程碑 0：文档与契约基线

已收敛：

- Game Package v2 / Desktop Node.js Launcher v1；
- Subsystem Control Protocol v1；
- `spawn success ≠ connected ≠ identified ≠ ready`；
- Frame / Call 与 Subsystem Control 是独立协议域；
- Frame / Call Batch A：identity / authority / lifecycle / Activation；
- Frame / Call Batch B：七 RPC wire surface / direction / local pre-postcondition；
- Frame lifecycle = `starting / active / suspended / closing / closed`；
- outcome = `completed / cancelled / failed`；
- Frame v1 无 `ready / initialized / frame.status`；
- Frame/Activation Session 内不复用；Activation never rolls back；
- Caller relationship 只属于 Main，不下发给 Subsystem Frame wire；
- `frame.resume` 同时交付 Child Outcome 与 replacement Activation；
- `frame.call` 只建立 Child call，不等待最终业务结果；
- Render = Subsystem-owned context；
- 每 Subsystem 一个 Runtime Container / 最多一个 Renderer System Data Connection。

当前下一冻结目标：

```text
Frame / Call Batch C
    Call/Return transaction
    commit barrier
    InputTarget publish ordering
    rollback
```

之后：

```text
Batch D  error / timeout / retry / cancellation
Batch E  Runtime failure unwind
Batch F  limits / fixtures / profile completion
Main ⇄ Renderer Control
Renderer ⇄ Subsystem Connection
User Input
Render Update
Render State
```

明确暂缓：PWA Launcher/credential/Control Transport 具体映射、第二 Launcher、Sandbox/Publisher Trust、Runtime restart/resume/checkpoint、Control heartbeat、lazy/idle recycle、多 Runtime per key、多主栈/Frame Graph、Frame migration、Activation reuse。

关闭条件：Launcher、Subsystem Control、Frame Batch A/B 均已有权威 Contract / ADR / conformance target；Legacy Frame 生命周期与 Frame-owned Render 契约不再作为实现入口。

## 里程碑 1：Game Package v2 与 Desktop Runtime Bootstrap / Control

目标：零 Frame 条件下完成完整 Runtime Bootstrap、Control identity、ready、正常 shutdown 与失败收敛。

实现：Descriptor Loader / Entry Resolver / Node Launcher / explicit env / Bootstrap Context / Launch Attempt / Supervisor / Control WebSocket / hello/status/shutdown / semantic errors / wire limits / cleanup。

关闭条件：全部 required Runtime supervised + hello/identified/ready；正常 shutdown 由 Main intent → `subsystem.shutdown` → Supervisor observation → stopped。

## 里程碑 2：Frame / Call Control

目标：在已 ready Runtime 上完成 Frame 调用栈与 ordinary input control，不重新定义 Subsystem Control v1。

### 已冻结：Batch A

实现必须遵守：

- `frameId` Main-generated / Session unique / never reused；
- permanent Frame→`subsystemKey`；
- Main-owned immutable `callerFrameId`；
- lifecycle only `starting / active / suspended / closing / closed`；
- outcome 与 lifecycle 分离；
- no Frame ready/status；
- active ↔ current Activation；
- fresh Activation on first active / every reactivation；
- revoked Activation permanently invalid；
- stable Stack Top active / lower live Frames suspended；
- Frame 只在 ready + no-shutdown-intent Runtime 上建立；
- Frame lifecycle 不控制 Runtime / Render / Data Connection。

### 已冻结：Batch B

实现 exact wire surface：

```text
Main → Subsystem
    frame.initialize({ frameId, input })
    frame.activate({ frameId, activationId })
    frame.suspend({ frameId, activationId })
    frame.resume({ frameId, activationId, returnedFrameId, result })
    frame.close({ frameId })

Subsystem → Main
    frame.call({ frameId, activationId, targetSubsystemKey, input })
        → { childFrameId }
    frame.return({ frameId, activationId, result })
        → {}
```

并实现：

- 全部七个都是 JSON-RPC Request；
- closed Schema；
- `FrameOutcome.completed.value` REQUIRED，no-value=`null`；
- `frame.initialize` / `frame.return` 不携带 `callerFrameId`；
- Main→Subsystem 不重复 source Subsystem identity；
- `frame.close` 无 reason；
- `frame.resume` 一次交付 outcome + new Activation；
- no `system.call / system.return / frame.result`；
- structural invalid params → `-32602`。

### 下一步：Batch C

冻结跨 RPC 事务：

- initial Frame transaction；
- Child call establishment；
- Caller suspend / Child initialize / Stack push / Child activate 精确顺序；
- `frame.call` success Response commit point；
- `frame.return` acceptance / close / pop / Caller resume；
- `activate/resume ACK` 与 Renderer Input Target publication 的 causal barrier；
- 每个 partial failure point 的 rollback；
- rollback 不能恢复旧 Activation。

### Batch D

冻结 initialize business rejection、control divergence、semantic error codes、timeout、retry/idempotency、cancellation scope。

### Batch E

冻结 Runtime failure multi-Frame suffix-unwind、initial Frame failure、best-effort close、surviving caller failed outcome + fresh Activation resume。

### Batch F

冻结 wire numeric limits、完整 fixture、Desktop/PWA transport-independent conformance、profile/version completion，并把整个 Frame / Call v1 转为 Active / Normative / Frozen。

里程碑 2 关闭条件：Batch A-F 全部 Frozen，并通过 nested call / same-Subsystem call / multi-Frame / stale Activation / failure unwind conformance。

## 里程碑 3：Renderer Control 与 System Data Connection

目标：建立 Main-authorized、per-Subsystem Data Transport，并严格服从 Frame Batch C 的 Input Target commit barrier。

- 冻结 Main ⇄ Renderer Control；
- 发布 Runtime State、Frame Stack/lifecycle/current Activation/Input Target；
- 不发布两个 ordinary Input Target；
- 冻结 Data Connection identity/auth/version；
- 实现 Data Grant / Registry / reconnect；
- Runtime stopping/failed 后停止新 Grant；
- zero-Frame Subsystem 仍可保持 Data Connection。

## 里程碑 4：User Input Protocol

- 冻结 `subsystemRef + frameId + activationId`；
- 只接受 Main-authorized active/current Activation；
- stale/revoked Activation 永久拒绝；
- continuous intent、discrete action、input reset、UI interaction、ordering/backpressure；
- 同 Subsystem 多 Frame 输入隔离。

关闭条件：输入只到 Main 声明的 current Input Target，且不依赖 Render identity。

## 里程碑 5：Render Update 与 Web Renderer

- 冻结独立 Render identity / lifecycle / state / event / revision / recovery；
- 实现 Render Registry / Store / Scheduler / Reconciler；
- zero-frame Render；
- Frame close 后 Render 保留；
- Renderer reload 按 Render Protocol 恢复，不按 Frame resync。

## 里程碑 6：Content API 与游戏内容

实现 Safe Package Root、Catalog / Package Index、Repository Toolkit、Readonly HTTP Content Service、resource/MIME/ETag/Content Version 与 validate。

## 里程碑 7：`loom.map` 最小运行时

- 实现 Subsystem Control Adapter；
- 实现 Batch B exact Frame Control Adapter；
- `frame.initialize` 不依赖 callerFrameId；
- `frame.resume` 同时接收 Child Outcome + replacement Activation；
- no-value completion 使用 `completed(value:null)`；
- call/return 只使用 `frame.call / frame.return`；
- Frame Input 按 active/current Activation 路由；
- 实现 Runtime Core/Loop、移动/碰撞/Portal、Render Manager/Projector；
- 验证一个 Process 服务多个 Frame，Frame lifecycle 不隐式销毁 Render。

## 里程碑 8：Pokémon Essentials 兼容工具链

定义中间 JSON、导入 Tile/Autotile/Passage/Priority/Character、Golden fixture，受限素材不进入公共仓库。

## 里程碑 9：Hostra Desktop 闭环

- Main 与 Hostra 分离；
- Subsystem ⇄ Main 每 Subsystem 一个 Control WebSocket，共享 Subsystem Control v1 + Frame / Call v1；
- Renderer ⇄ Subsystem 每 Subsystem一个 Data WebSocket，内部拆 Connection/Render/User Input；
- Frame Batch B method/field 不因 WebSocket adapter 改变；
- Renderer reload 独立恢复 Control/Input/Render；
- 有限 shutdown / force termination。

## 里程碑 10：PWA Transport Profile

- Main/Subsystem Dedicated Worker；
- 冻结 Descriptor→Worker / credential / Control MessagePort；
- 映射 Subsystem Control v1；
- 映射 Frame Batch A/B exact application semantics；
- Window⇄Subsystem Data MessagePort；
- Service Worker Content API / OPFS / page lifecycle。

Transport 差异不得改变已 Frozen method name、field、identity/lifecycle/Activation 语义。

## 第一阶段最终验收

- Launcher / Subsystem Control v1 符合 Normative Contract；
- Frame / Call v1 完成 A-F 并整体 Frozen；
- Batch B exact seven RPC methods 在 Desktop/PWA adapter 上保持一致；
- Frame/Activation 不复用；Caller relationship Main-owned；
- outcome 与 lifecycle 分离；
- stale Activation 永久拒绝；
- same-Subsystem call 建立新 childFrameId；
- `frame.call` 非 long-running result RPC；
- `frame.resume` 同时交付 outcome + replacement Activation；
- 每 Subsystem 最多一个 Runtime、最多一个 Data Transport；
- Frame 不拥有 Render；zero-frame Render 可工作；
- Content API 只读且路径安全；
- Hostra 不承载 LoomRealm Main。

## 暂缓

Save System、不可信 executable Sandbox、第二 Launcher、automatic Runtime recovery、application Control heartbeat、same-attempt Control reconnect、lazy/idle recycle、多 Runtime per key、Host timeout 默认数值、Bootstrap Token 精确熵、Publisher Trust/signing、多主栈/Frame Graph、Frame migration、Activation reuse、完整菜单/战斗/任务、多人同步、高级渲染优化、ZIP/ASAR/remote package。
