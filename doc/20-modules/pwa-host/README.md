# PWA 宿主模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Window、Main Runtime Worker、Subsystem Worker、MessagePort、Service Worker 和 OPFS 的平台适配  
> 依赖：[运行承载系统](../../10-architecture/runtime-hosting-system.md)、[通信系统](../../10-architecture/communication-system.md)、[Subsystem Control Protocol v1](../../15-contracts/subsystem-control-lifecycle-protocol.md)、[Frame / Call Protocol v1](../../15-contracts/frame-call-protocol-v1.md)、[Content API v1](../../15-contracts/content-api-v1.md)  
> 最近复核：2026-08-04

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

## 2. Window / Main Worker Authority

Window 只拥有浏览器 UI/gesture 能力和 Web Renderer，不拥有 Frame Stack、Activation authority、Subsystem business state 或 Render authority。

Main Runtime Worker 是 Desktop Main 的 PWA 对应物：

```text
Session
Subsystem Descriptor / Worker Registry
Runtime shutdown intent
Frame Registry / Stack / caller relationship
Activation / Input Target
Frame / Call Coordinator
System Data Connection Authority
```

它不承载 DOM，也不转发 ordinary User Input / Render Update payload。

## 3. One Subsystem → One Dedicated Worker

当前：每个 declared Subsystem 一个 Dedicated Worker；每个 Worker 可维护 0..N Frame/Input Context、0..N Render Context、一个 Renderer Data MessagePort、共享 Content Client/cache/business state。

平台不要求 per-Frame Runtime Core / Loop / Projector / Render。

## 4. PWA Bootstrap Boundary

PWA Descriptor→Worker script/module、Bootstrap Credential transfer、Control MessagePort bootstrap 尚未冻结。

已经固定：

- eager create all required Workers；
- per-Subsystem Main Control MessagePort；
- per-Subsystem Renderer Data MessagePort；
- one Runtime Container per Subsystem；
- future PWA Control Profile MUST preserve Subsystem Control v1；
- future PWA Frame mapping MUST preserve Frame Batch A/B exact application semantics。

Transport/Profile 差异不得静默改 method name、field、identity 或 lifecycle。

## 5. Subsystem Worker Registry

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

Worker Registry 不拥有 Frame lifecycle；Frame state/caller relationship 由 Main Frame Registry 权威维护。

## 6. Control MessagePort Protocol Mapping

未来 PWA Control Transport 映射两个独立协议域：

```text
Subsystem Control Protocol v1
    Frozen

Frame / Call Protocol v1
    Batch A Frozen
    Batch B Frozen
    Batch C-F Draft
```

Subsystem Control 保持 connected≠identified≠ready、Main-owned shutdown intent、stopped only from termination observation、no app heartbeat/reconnect/resume。

Frame Batch A 保持 identity/lifecycle/Activation；Batch B 必须原样映射：

```text
Main → Subsystem Worker
    frame.initialize({ frameId, input })
    frame.activate({ frameId, activationId })
    frame.suspend({ frameId, activationId })
    frame.resume({ frameId, activationId, returnedFrameId, result })
    frame.close({ frameId })

Subsystem Worker → Main
    frame.call({ frameId, activationId, targetSubsystemKey, input })
        → { childFrameId }
    frame.return({ frameId, activationId, result })
        → {}
```

PWA adapter MUST NOT：

- 增加 `callerFrameId` 到 initialize/return；
- 使用 `system.call / system.return`；
- 添加 `frame.result`；
- 给 close 增加 reason；
- 拆分 resume 与 activation；
- 允许 `completed` 省略 value；
- 因 MessagePort API 便利自行生成/复用 frameId 或 activationId。

MessagePort envelope、transfer list、Port identity 不进入 Frame application Schema。

## 7. Frame Input Context

Subsystem Worker 内部 Context 由 Main Frame identity 驱动。

ordinary User Input 至少要求：

```text
Frame lifecycle == active
provided activationId == currentActivationId
Frame == current Main Input Target
```

revoked Activation MUST permanently reject。

suspended/closing/closed Frame 无 current Activation、无 ordinary input，但这不关闭 Data Port、不 destroy Render、不删除 shared business state。

## 8. Frame Resume / Call / Return

`frame.resume` 在 Worker 内必须一次完成 Child outcome delivery + replacement Activation installation。

`frame.call` 只建立 Child call，success 返回 `childFrameId`；不保持 Request 等待 Child 业务结束。

`frame.return` 只提交 outcome，不携带 Caller/receiver；Main 决定 receiver 并通过 Caller `frame.resume` 交付结果。

## 9. System Data MessagePort

Window 与每个 Subsystem Worker 最多一条长期 Data Port：

```text
Connection Layer
Render Update Protocol
User Input Protocol
```

Port 与 Frame 数量无关，可以 zero Frame 服务 Render。

## 10. Render Context

Subsystem Worker 完全控制 Render create/update/visibility/order/event/destroy/recovery。Render 可以 zero Frame 存在，Renderer 不能从 Frame Stack 推导 Render lifecycle。

## 11. Service Worker / OPFS

Service Worker 提供 Readonly Content API，不承载 Frame Stack、Runtime Tick、User Input authority 或 Render lifecycle。

Installer 负责临时安装、校验、complete 标记和原子 installation registration；写能力不暴露给 ordinary Runtime Container。

## 12. Page Lifecycle

页面隐藏只停止 raw ordinary input capture / reset local input state，不改变 Main-owned Frame/Activation authority。

恢复：

```text
restore Main / Workers
→ restore Runtime Control State
→ restore Frame Stack/current Activation/Input Target
→ restore authorized Data Ports
→ only current Activation may receive ordinary input
→ Render independently restores
```

不得让页面恢复重新激活 revoked Activation。

Window reload / Worker recreation 的 Session recovery 属于未来 PWA Session/Checkpoint，不等于 same-attempt Control resume。

## 13. Worker Resource Policy

当前 one Subsystem → one Worker、全部 required Workers eager。lazy / idle recycle / composite Container 需要新契约，不能作为实现优化静默加入。

## 14. Failure / Termination

- Worker error/unexpected termination → Runtime failure；
- Runtime failure → revoke affected current Activation；
- Frame lifecycle 不设置为 failed；failed 是 outcome，cleanup 仍 `closing → closed`；
- shutdown intent 下 actual Worker termination observation → stopped；
- terminal failed 不因后续 termination 改回 stopped；
- Data Port failure → stop ordinary input，Render recovery independent；
- multi-Frame Runtime failure unwind 等 Batch E。

## 15. Security

- Worker script 来自受信任启动边界；
- Data Port 只转移给目标 Worker/Window；
- User Input 校验 active/current Activation；
- Render Update 限制当前 Subsystem Render namespace；
- Content API 只访问登记 installation；
- Service Worker 不暴露任意 OPFS path。

## 16. Core Invariants

- one Subsystem = one Dedicated Worker；
- one Main Control Port / at most one Renderer Data Port per Worker；
- Subsystem Control v1 semantics preserved；
- Frame Batch A/B application semantics preserved；
- Batch B exactly seven JSON-RPC Requests，即使底层 Transport 是 MessagePort；
- Caller relationship Main-owned，不进入 Subsystem wire；
- `frame.call` 非 long-running result RPC；
- `frame.resume` 同时 outcome + replacement Activation；
- frameId/activationId never reuse；
- Frame lifecycle 不控制 Render/Data Port；
- PWA Transport differences do not redefine application protocol。
