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
- Frame / Call Batch A：identity / authority / lifecycle / Activation；
- Frame / Call Batch B：exact seven RPC wire surface / local semantics；
- Frame / Call Batch C：transaction / acceptance barrier / InputTarget publication / rollback boundary；
- Frame lifecycle=`starting/active/suspended/closing/closed`，outcome=`completed/cancelled/failed`；
- Frame/Activation Session 内不复用，Activation never rolls back；
- Caller relationship 只属于 Main，不下发给 Subsystem Frame wire；
- ordinary call 不发送 reverse `frame.suspend`；
- `frame.call` success 先于 dependent Child initialize/activate；
- `frame.return` success 先于 dependent close/resume；
- activate/resume ACK 先于对应 InputTarget publication；
- post-commit failure 只能 forward recovery；
- Render = Subsystem-owned context；
- 每 Subsystem 一个 Runtime Container / 最多一个 Renderer Data Connection。

当前下一冻结目标：

```text
Frame / Call Batch D
    semantic error model
    timeout / ambiguous delivery
    retry / idempotency
    cancellation scope
```

之后：

```text
Batch E  Runtime failure unwind
Batch F  limits / fixtures / profile completion
Main ⇄ Renderer Control
Renderer ⇄ Subsystem Connection
User Input
Render Update
Render State
```

里程碑 0 关闭条件：Launcher、Subsystem Control、Frame Batch A/B/C 均已有权威 Contract / ADR / conformance target；Legacy Frame lifecycle 与 Frame-owned Render 契约不再作为实现入口。

## 里程碑 1：Game Package v2 与 Desktop Runtime Bootstrap / Control

目标：零 Frame 条件下完成 Runtime Bootstrap、Control identity、ready、normal shutdown 与 failure convergence。

实现 Descriptor Loader / Entry Resolver / Node Launcher / explicit env / Bootstrap Context / Launch Attempt / Supervisor / Control WebSocket / hello/status/shutdown / semantic errors / wire limits / cleanup。

关闭条件：全部 required Runtime supervised + hello/identified/ready；normal shutdown = Main intent → `subsystem.shutdown` → Supervisor observation → stopped。

## 里程碑 2：Frame / Call Control

目标：在 ready Runtime 上实现 Frozen Frame A/B/C，不重新定义 Subsystem Control v1。

### Batch A — Frozen

实现必须保证：

- `frameId` Main-generated / Session unique / never reused；
- permanent Frame→subsystemKey；Main-owned immutable caller；
- lifecycle only `starting / active / suspended / closing / closed`；
- outcome 与 lifecycle 分离；
- no Frame ready/status；
- active ↔ current Activation；
- fresh Activation on first active / every reactivation；
- revoked Activation permanently invalid；
- stable Stack Top active / lower live Frames suspended；
- Frame lifecycle 不控制 Runtime / Render / Data Connection。

### Batch B — Frozen

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

全部为 JSON-RPC Request / closed schema；`completed.value` REQUIRED；Caller 不在 wire；close 无 reason；resume=outcome+new Activation；无 `system.call/system.return/frame.result`。

### Batch C — Frozen

#### Initial Frame

```text
allocate starting Frame
→ initialize ACK
→ activate(new Activation) ACK
→ commit active
→ publish InputTarget
```

activate ACK 前不得发布新 Activation。

#### Child Call

```text
frame.call Request
→ validate
→ Call Acceptance Commit:
     Caller suspended
     old Activation revoked
     Child starting/pushed
     InputTarget=null
→ frame.call Success
→ Child initialize
→ Child activate ACK
→ commit Child active
→ publish Child InputTarget
```

ordinary call 不额外发送 `frame.suspend`。Main 必须先完成 call Response 再依赖 Child initialize/activate，因此 same-Subsystem recursion 不要求 nested request-handler reentrancy。

call success 后 Child startup failure属于 post-commit failure：不得恢复 Caller old Activation；必须以 failed Child outcome + fresh Activation forward-resume Caller。

#### Return / Resume

```text
frame.return Request
→ Return Acceptance Commit:
     terminal outcome accepted
     Child old Activation revoked
     Child closing
     InputTarget=null
→ frame.return Success
→ frame.close Child ACK
→ closed/pop
→ frame.resume Caller(new Activation + outcome) ACK
→ commit Caller active
→ publish Caller InputTarget
```

return success 不表示 Child closed / Caller resumed。close ACK 前不得 pop；resume ACK 前不得发布 Caller new Activation。

#### Failure boundary

```text
Pre-commit  → abort allowed
Post-commit → forward recovery only
```

accepted outcome 与 revoked Activation 不可 rollback。

### Batch D — Next

冻结：

- initialize business rejection；
- semantic error registry；
- state/authority divergence classification；
- request timeout 与 Response-loss ambiguity；
- no-retry / idempotency strategy；
- caller cancellation scope；
- Batch C mutation gate 在 timeout/cancel 下如何收敛。

### Batch E

冻结 Runtime failure multi-Frame suffix-unwind、transaction 中 Runtime crash、initial Frame failure、best-effort close、surviving caller failed outcome + fresh Activation resume。

### Batch F

冻结 wire numeric limits、完整 conformance fixture、Desktop/PWA transport-independent profile/version completion，并把 Frame / Call v1 整体转为 Active / Normative / Frozen。

里程碑 2 关闭条件：Batch A-F Frozen，并通过 same-Subsystem recursion、no-reentrant-handler、post-commit recovery、stale Activation、multi-Frame failure unwind conformance。

## 里程碑 3：Renderer Control 与 System Data Connection

目标：建立 Main-authorized per-Subsystem Data Transport，并严格服从 Batch C causal barrier。

必须实现：

- Runtime State / Frame Stack/lifecycle/current Activation/InputTarget publication；
- activate/resume ACK 前不发布新 Activation；
- revoked Activation 不重新发布；
- `InputTarget=null` transaction gap；
- no two ordinary InputTargets；
- Renderer Control MAY coalesce intermediate Stack states，但不能越过 commit barrier；
- Data Connection identity/auth/version、Grant/Registry/reconnect；
- zero-Frame Subsystem 可保持 Data Connection。

## 里程碑 4：User Input Protocol

- 冻结 `subsystemRef + frameId + activationId`；
- 只接受 Main-authorized active/current Activation；
- stale/revoked Activation 永久拒绝；
- outbound call/return mutation gate 期间 ordinary input 不再进入业务 Handler；
- continuous intent / discrete action / reset / UI interaction / ordering/backpressure；
- 同 Subsystem 多 Frame 输入隔离。

## 里程碑 5：Render Update 与 Web Renderer

冻结独立 Render identity/lifecycle/state/event/revision/recovery；实现 Render Registry/Store/Scheduler/Reconciler；支持 zero-frame Render、Frame close 后 Render 保留、Renderer reload 独立恢复 Render。

## 里程碑 6：Content API 与游戏内容

实现 Safe Package Root、Catalog / Package Index、Repository Toolkit、Readonly Content Service、resource/MIME/ETag/Content Version 与 validate。

## 里程碑 7：`loom.map` 最小运行时

- Subsystem Control Adapter；
- Batch A/B/C Frame Adapter；
- outbound call/return mutation gate；
- call success 本地 commit Caller suspended/revoked；
- return success 本地 commit Child closing；
- 不要求入站 handler pending 时处理 reverse Frame Request；
- resume 同时接收 Child Outcome + replacement Activation；
- active/current Activation ordinary input routing；
- Runtime Core/Loop、移动/碰撞/Portal、Render Manager/Projector；
- 一个 Process 服务多个 Frame，Frame lifecycle 不隐式销毁 Render。

## 里程碑 8：Pokémon Essentials 兼容工具链

定义中间 JSON、导入 Tile/Autotile/Passage/Priority/Character、Golden fixture，受限素材不进入公共仓库。

## 里程碑 9：Hostra Desktop 闭环

- Main 与 Hostra 分离；
- Subsystem⇄Main per-Subsystem Control WebSocket，共享 Subsystem Control v1 + Frame / Call v1；
- Desktop adapter 保持 Response-before-dependent-RPC ordering；
- Renderer⇄Subsystem per-Subsystem Data WebSocket；
- Renderer reload 只恢复 committed Main Activation/InputTarget；
- finite shutdown / force termination。

## 里程碑 10：PWA Transport Profile

- Main/Subsystem Dedicated Worker；
- 冻结 Descriptor→Worker / credential / Control MessagePort；
- 精确映射 Subsystem Control v1 与 Frame Batch A/B/C；
- MessagePort adapter 不得依赖 nested reverse-request handler reentrancy；
- Window⇄Subsystem Data MessagePort；Service Worker Content API / OPFS / page lifecycle。

Transport 差异不得改变 Frozen application transaction semantics。

## 第一阶段最终验收

- Launcher / Subsystem Control v1 符合 Normative Contract；
- Frame / Call v1 完成 A-F 并整体 Frozen；
- Frame/Activation 不复用；Caller Main-owned；outcome/lifecycle 分离；
- exact seven RPC methods across Desktop/PWA；
- same-Subsystem recursive call 无 nested-handler requirement；
- activate/resume ACK before publish；
- post-commit no rollback；
- stale Activation 永久拒绝；
- Frame 不拥有 Render；zero-frame Render 可工作；
- Content API 只读且路径安全；Hostra 不承载 Main。

## 暂缓

Save System、不可信 executable Sandbox、第二 Launcher、automatic Runtime recovery、Control heartbeat、same-attempt reconnect、lazy/idle recycle、多 Runtime per key、Host timeout defaults、Bootstrap Token exact entropy、Publisher Trust/signing、多主栈/Frame Graph、Frame migration、Activation reuse、完整菜单/战斗/任务、多人同步、高级渲染优化、ZIP/ASAR/remote package。
