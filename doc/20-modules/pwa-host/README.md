# PWA 宿主模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Window、Main Runtime Worker、Subsystem Worker、MessagePort、Service Worker 和 OPFS 的平台适配  
> 依赖：[运行承载系统](../../10-architecture/runtime-hosting-system.md)、[通信系统](../../10-architecture/communication-system.md)、[Subsystem Control Protocol v1](../../15-contracts/subsystem-control-lifecycle-protocol.md)、[Frame / Call Protocol v1](../../15-contracts/frame-call-protocol-v1.md)、[Content API v1](../../15-contracts/content-api-v1.md)  
> 最近复核：2026-08-03

## 1. 模块结构

```text
PWA
├── Window Host Adapter
├── Web Renderer
├── Main Runtime Dedicated Worker
├── Subsystem Worker Registry
├── Control MessageChannel Factory
├── System Data MessageChannel Factory
├── Service Worker Content Service
├── Package Installer
├── OPFS Package Store
└── Page Lifecycle Coordinator
```

## 2. Window Host Adapter

Window 负责浏览器必须绑定页面/用户手势的能力，并承载 Web Renderer。

Window 不拥有 Frame Stack、Activation authority、Subsystem business state 或 Render authority。

## 3. Main Runtime Dedicated Worker

Main Worker 是 Desktop Main 的 PWA 对应物：

```text
Session
Subsystem Descriptor / Worker Registry
Runtime shutdown intent
Frame Registry / Stack
Frame lifecycle / outcome bookkeeping
Activation / Input Target
Frame / Call Coordinator
System Data Connection Authority
```

它不承载 DOM，也不转发 ordinary User Input / Render Update payload。

## 4. One Subsystem → One Dedicated Worker

```text
loom.map      → one Worker
loom.menu     → one Worker
loom.battle   → one Worker
```

每个 Worker 可维护：

```text
0..N Frame/Input Context
0..N Render Context
one Renderer System Data MessagePort
shared Content Client / cache / business state
```

平台不要求 per-Frame Runtime Core / Loop / Projector / Render。

## 5. PWA Bootstrap Boundary

PWA Descriptor → Worker script/module、Bootstrap Credential transfer、Control MessagePort bootstrap 尚未冻结。

当前固定：

- eager create all required Subsystem Workers；
- per-Subsystem Main Control MessagePort；
- per-Subsystem Renderer Data MessagePort；
- one Runtime Container per Subsystem；
- future PWA Control Profile MUST preserve Subsystem Control v1；
- future PWA Frame mapping MUST preserve Frame Batch A。

Transport/Profile 差异不得静默改变协议语义。

## 6. Subsystem Worker Registry

概念记录：

```ts
interface SubsystemWorkerRecord {
  readonly subsystemKey: string;
  readonly worker: Worker;
  readonly controlPort: MessagePort;
  readonly rendererDataPort: MessagePort | null;
  readonly frameIds: ReadonlySet<string>;
  readonly shutdownIntent: null | {
    readonly reason: "session-end" | "bootstrap-abort";
  };
  readonly status:
    | "declared"
    | "starting"
    | "connected"
    | "identified"
    | "ready"
    | "stopping"
    | "stopped"
    | "failed";
}
```

Worker Registry 不拥有 Frame lifecycle state 本身；Frame state 由 Main Frame Registry 权威维护。

## 7. Control MessagePort

未来 PWA Control Transport 映射两个独立协议域：

```text
Subsystem Control Protocol v1
    Frozen

Frame / Call Protocol v1
    Batch A Frozen
    Batch B-F Draft
```

Subsystem Control 保持：

```text
connected ≠ identified ≠ ready
Main-owned shutdown intent
stopped only from actual Worker termination observation
no application heartbeat / same-attempt reconnect / resume
```

Frame Batch A 保持：

```text
frameId Main-generated / Session unique / never reused
Frame permanently bound to descriptor.key
callerFrameId immutable
lifecycle = starting / active / suspended / closing / closed
completed / cancelled / failed = outcome
no Frame ready / initialized / frame.status
only active Frame owns current Activation
activationId unique / never reused / never rolls back
```

PWA MUST NOT 因 MessagePort API 便利而自行创建/复用 Frame identity 或 Activation。

## 8. System Data MessagePort

Window 与每个 Subsystem Worker 最多一条 Data Port：

```text
Window Renderer
    ⇄ per-Subsystem MessagePort
Subsystem Worker
    ├── Connection Layer
    ├── Render Update
    └── User Input
```

物理 Port 与 Frame 数量无关，可以在 zero Frame 时继续服务 Render。

## 9. Frame Input Context

Subsystem Worker 内部 Frame Context 由 Main Frame identity 驱动。

ordinary User Input 至少要求：

```text
Frame lifecycle == active
provided activationId == currentActivationId
Frame == current Main Input Target
```

revoked Activation MUST permanently reject。

Frame `suspended / closing / closed`：

- no current Activation；
- no ordinary input；
- 不关闭 System Data Port；
- 不自动销毁 Render；
- 不自动删除 shared business state。

## 10. Render Context

Subsystem Worker 完全控制 Render create/update/visibility/order/event/destroy/recovery。

Render 可以 zero Frame 存在。Window Renderer 不能从 Frame Stack 推导 Render lifecycle。

## 11. Service Worker Content Service

Service Worker 提供统一 Readonly Content API，不承载 Frame Stack、Runtime Tick、User Input authority 或 Render lifecycle。

## 12. OPFS Package Store / Installer

Installer 负责临时安装、校验、complete 标记和原子 installation registration。未完成安装不得被 Content API 服务。

Installer 是写能力，不暴露给 ordinary Runtime Container。

## 13. Page Lifecycle

页面隐藏：

```text
visibilitychange:hidden
→ Window stops raw ordinary input capture
→ Main/Renderer input state resets as future User Input Contract defines
→ Frame / Activation authority remains Main-owned
→ Subsystem presentation/business policy remains independent
```

页面恢复：

```text
restore Main / Workers
→ restore Runtime Control State
→ restore Frame Stack/current Activation/Input Target
→ restore authorized Data Ports
→ only current Activation may receive ordinary input
→ Render independently restores
```

不得让页面恢复重新激活已经 revoked 的 Activation。

Window reload / Worker recreation 的 Session recovery 属于未来 PWA Session/Checkpoint 设计，不等于 same-attempt Control resume。

## 14. Worker Resource Policy

当前：

```text
one Subsystem → one Worker
all required Workers eager during Bootstrap
```

lazy / idle recycle / composite Container 需要新契约，不能作为实现优化静默加入。

## 15. Failure / Termination

- Worker error / unexpected termination → Runtime failure；
- Runtime failure → revoke affected current Activation；
- Frame lifecycle MUST NOT be set to `failed`；failed 是 outcome，cleanup 按 `closing → closed`；
- Main shutdown intent 下 Worker termination observation → stopped；
- terminal failed 不因后续 Worker termination 改回 stopped；
- Data Port failure → ordinary input stop, Render recovery independent；
- 单 Frame User Input error 不直接污染其他 Frame；
- 单 Render error 不修改 Frame lifecycle；
- Timer throttle recovery 不无限补跑 Tick。

具体 multi-Frame Runtime failure unwind 由 Frame Batch E 冻结。

## 16. Security

- Worker script 必须来自受信任启动边界；
- Game Package 不获得任意 eval；
- Data Port 只转移给目标 Worker / Window；
- User Input 校验 active/current Activation；
- Render Update 限制 Subsystem Render namespace；
- Content API 只访问已登记 installation；
- Service Worker 不暴露任意 OPFS path。

## 17. Core Invariants

- one Subsystem = one Dedicated Worker；
- no lazy-on-first-Frame in current model；
- one Main Control Port per Worker；
- at most one Renderer Data Port per Worker；
- Subsystem Control v1 semantics preserved；
- Frame Batch A semantics preserved；
- frameId / activationId never reuse；
- no Frame ready/status；
- outcome ≠ lifecycle；
- stale Activation never becomes valid again；
- Frame lifecycle does not control Render/Data Port；
- PWA Transport differences do not redefine ownership/lifecycle。
