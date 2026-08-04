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
- Batch B：exact seven RPC wire surface / local semantics；
- Batch C：transaction / acceptance barrier / InputTarget publication / rollback boundary；
- Batch D：semantic error / finite deadline / ambiguous result / no-retry / cancellation boundary；
- Frame lifecycle=`starting/active/suspended/closing/closed`，outcome=`completed/cancelled/failed`；
- Frame/Activation Session 内不复用，Activation never rolls back；
- ordinary call 不发送 reverse `frame.suspend`；call/return Response先于 dependent reverse RPC；
- activate/resume ACK先于对应 InputTarget publication；
- post-commit failure只能 forward recovery；
- timeout/Response-loss 不猜测、不 retry，进入 Runtime failure；
- recoverable initialize rejection与 control divergence分离；
- no caller-driven `frame.cancel`；
- Render = Subsystem-owned context；每 Subsystem 一个 Runtime Container / 最多一个 Renderer Data Connection。

当前下一冻结目标：

```text
Frame / Call Batch E
    Runtime failure multi-Frame suffix unwind
    Runtime crash during transaction
    initial Frame failure
    best-effort cleanup
    surviving Caller failed outcome + fresh Activation resume
```

之后：Batch F limits/fixtures/profile completion → Main⇄Renderer Control → Renderer⇄Subsystem Connection → User Input → Render Update → Render State。

里程碑 0 关闭条件：Launcher、Subsystem Control、Frame Batch A/B/C/D 均有权威 Contract / ADR / conformance target；Legacy Frame lifecycle 与 retry/resync 旧模型不作为实现入口。

## 里程碑 1：Game Package v2 与 Desktop Runtime Bootstrap / Control

目标：零 Frame 条件下完成 Runtime Bootstrap、Control identity、ready、normal shutdown 与 failure convergence。

实现 Descriptor Loader / Entry Resolver / Node Launcher / explicit env / Bootstrap Context / Launch Attempt / Supervisor / Control WebSocket / hello/status/shutdown / semantic errors / wire limits / cleanup。

关闭条件：全部 required Runtime supervised + hello/identified/ready；normal shutdown = Main intent → `subsystem.shutdown` → Supervisor observation → stopped。

## 里程碑 2：Frame / Call Control

目标：在 ready Runtime 上实现 Frozen Frame A/B/C/D，不重新定义 Subsystem Control v1。

### Batch A — Frozen

Frame identity/lifecycle/Activation/Caller/Stack ownership；no ready/status；Activation fresh/never reused；Frame不控制 Runtime/Render/Data。

### Batch B — Frozen

exact seven JSON-RPC Requests / closed schema；Caller不在 wire；close无 reason；resume=outcome+new Activation；`completed.value` required；无 `system.call/system.return/frame.result/frame.cancel`。

### Batch C — Frozen

```text
initial:
    initialize ACK → activate ACK → commit/publish

call:
    acceptance commit
    → call Success
    → Child initialize/activate
    → activate ACK → publish

return:
    acceptance commit
    → return Success
    → close ACK/pop
    → resume ACK → publish
```

ordinary call不额外发送 `frame.suspend`；same-Subsystem recursion不要求 nested handler；pre-commit abort/post-commit forward recovery。

### Batch D — Frozen

#### Request result

```text
Success        → known committed
Explicit Error → known not committed
Timeout/loss   → ambiguous → Runtime failure
```

全部七方法必须 finite deadline；具体毫秒数由 Host/Profile policy。

#### No retry

不自动 retry/replay，不定义 operationId/idempotencyKey/dedup journal；迟到 Response 不恢复已失败 Runtime。

#### Recoverable errors

```text
FRAME_CALL_TARGET_NOT_FOUND
FRAME_CALL_TARGET_UNAVAILABLE
FRAME_INITIALIZE_REJECTED
```

initialize rejection 携带 `FrameFailure`，target Runtime healthy；accepted Child forward-resolve 为 failed outcome + fresh Caller Activation。

#### Fatal control errors

```text
FRAME_NOT_FOUND
FRAME_STATE_MISMATCH
ACTIVATION_MISMATCH
FRAME_STACK_MISMATCH
FRAME_OWNERSHIP_MISMATCH
```

以及 Frozen JSON-RPC/schema/method protocol error。Runtime failure diagnostics：`FRAME_CONTROL_TIMEOUT / FRAME_CONTROL_DIVERGENCE / FRAME_CONTROL_PROTOCOL_ERROR`。

#### Cancellation

v1 不支持 caller-driven Frame cancel；`FrameOutcome.cancelled` 仅由 active Frame 自行 return。

### Batch E — Next

冻结 Runtime failure deterministic suffix-unwind，包括稳定栈故障、Batch C/D transaction 中 crash/timeout/divergence、initial Frame failure、Runtime unavailable 时 best-effort cleanup、surviving Caller 的 Runtime-failed outcome + fresh Activation resume，以及 Caller-visible标准 failure code。

### Batch F

冻结 wire numeric limits、完整 conformance fixture、finite-deadline profile configuration、Desktop/PWA transport-independent profile/version completion，并把 Frame / Call v1 整体转为 Active / Normative / Frozen。

里程碑 2 关闭条件：Batch A-F Frozen，并通过 same-Subsystem recursion、timeout/no-retry、divergence、post-commit recovery、stale Activation、multi-Frame failure unwind conformance。

## 里程碑 3：Renderer Control 与 System Data Connection

目标：建立 Main-authorized per-Subsystem Data Transport，并严格服从 Batch C causal barrier。

必须实现 Runtime State / Frame Stack/lifecycle/current Activation/InputTarget publication；ACK-before-publish；revoked Activation不重新发布；`InputTarget=null` gap；no two InputTargets；Data Grant/Registry/reconnect。

Frame Control timeout/divergence 不通过 Renderer reconnect修复。

## 里程碑 4：User Input Protocol

冻结 `subsystemRef + frameId + activationId`；只接受 Main-authorized active/current Activation；stale Activation拒绝；outbound mutation gate期间普通 input不进入业务 Handler；定义 continuous/discrete/reset/ordering/backpressure。

## 里程碑 5：Render Update 与 Web Renderer

冻结独立 Render identity/lifecycle/state/event/revision/recovery；支持 zero-frame Render、Frame close 后 Render 保留、Renderer reload 独立恢复 Render。

## 里程碑 6：Content API 与游戏内容

实现 Safe Package Root、Catalog / Package Index、Readonly Content Service、resource/MIME/ETag/Content Version 与 validate。

## 里程碑 7：`loom.map` 最小运行时

实现 Subsystem Control Adapter；Batch A-D Frame Adapter；mutation gate + deadline handler；initialize business rejection；timeout/divergence Runtime failure reporting；active/current Activation input routing；Runtime Core/Loop、移动/碰撞/Portal、Render Manager/Projector；一个 Process 服务多个 Frame。

## 里程碑 8：Pokémon Essentials 兼容工具链

定义中间 JSON、导入 Tile/Autotile/Passage/Priority/Character、Golden fixture，受限素材不进入公共仓库。

## 里程碑 9：Hostra Desktop 闭环

Main 与 Hostra 分离；per-Subsystem Control/Data WebSocket；Desktop adapter保持 Batch A-D，包括 finite deadline、no retry、ambiguous Runtime failure；Renderer reload只恢复 committed Main state；finite shutdown / force termination。

## 里程碑 10：PWA Transport Profile

Main/Subsystem Dedicated Worker；冻结 Descriptor→Worker / credential / Control MessagePort；精确映射 Subsystem Control v1 与 Frame Batch A-D；MessagePort adapter不得增加 retry/replay或 nested reverse-request requirement；Window⇄Subsystem Data MessagePort；Service Worker Content API / OPFS。

## 第一阶段最终验收

- Launcher / Subsystem Control v1 符合 Normative Contract；
- Frame / Call v1 完成 A-F 并整体 Frozen；
- exact seven RPC across Desktop/PWA；
- same-Subsystem recursion无 nested-handler requirement；
- activate/resume ACK before publish；
- post-commit no rollback；
- finite deadline / no retry / ambiguous Runtime failure；
- recoverable rejection与 control divergence正确分类；
- no caller-driven Frame cancel；
- stale Activation永久拒绝；
- Frame不拥有 Render；zero-frame Render可工作；
- Content API只读且路径安全；Hostra不承载 Main。

## 暂缓

Save System、不可信 executable Sandbox、第二 Launcher、automatic Runtime recovery、Control heartbeat、same-attempt reconnect、lazy/idle recycle、多 Runtime per key、Host timeout默认数值、Bootstrap Token exact entropy、Publisher Trust/signing、多主栈/Frame Graph、Frame migration、Activation reuse、caller-driven Frame cancellation、Frame RPC replay/resync、完整菜单/战斗/任务、多人同步、高级渲染优化、ZIP/ASAR/remote package。
