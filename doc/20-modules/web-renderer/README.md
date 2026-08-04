# Web 渲染端模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Web Renderer 内部模块、Render 下行、User Input 上行和 Main committed control state  
> 依赖：[渲染系统](../../10-architecture/rendering-system.md)、[通信系统](../../10-architecture/communication-system.md)、[Frame / Call Protocol v1](../../15-contracts/frame-call-protocol-v1.md)、[Renderer–Subsystem 协议分层](../../10-architecture/renderer-subsystem-protocol-layers.md)  
> 最近复核：2026-08-04

## 1. 模块结构

```text
Web Renderer
├── Main Control Connection
├── Control State Store
├── System Data Connection Registry
├── Connection Protocol Adapter
├── Render Registry / Store / Scheduler
├── Scope / Scene Reconciler
├── Node Registry
├── Frame Input Registry
├── Input Router
├── Resource Client
└── Presentation State
```

Render 与 User Input 是独立协议域。

## 2. Renderer 不是 Frame RPC Participant

Frame / Call 七个 RPC 只存在于 Main⇄Subsystem Control Connection。Renderer MUST NOT 直接发送或处理 `frame.initialize/activate/suspend/resume/close/call/return`。

Renderer 只接收 Main 已 commit 后的 Frame Stack/lifecycle/current Activation/InputTarget 投影。

## 3. Control State Store

Renderer 保存 Main read-only mirror：Session、Runtime State、Frame Stack/order/lifecycle、current Activation、InputTarget、Data Grant、diagnostics。

稳定状态：

```text
Stack Top = active + current Activation
lower live Frames = suspended
```

transaction gap 可观察：

```text
InputTarget = null
Top = starting or closing
```

Renderer 必须接受这种合法过渡，不得把它解释为连接失败或自行恢复旧 target。

## 4. Batch C Publication Barrier

Renderer Control implementation MUST 保持：

```text
frame.activate ACK
    happens-before Child Activation/InputTarget publication

frame.resume ACK
    happens-before Caller replacement Activation/InputTarget publication

old Activation revoke commit
    happens-before all later revisions stop advertising it
```

因此：

- Main 生成 activationId ≠ Renderer 立即可使用；
- activate/resume ACK 前不得看到对应新 Activation 为 current；
- revoked Activation 不得被后续 revision 恢复；
- Main MAY coalesce intermediate Stack revisions，但不能越过 causal barrier；
- MUST NOT 同时暴露两个 ordinary InputTargets。

## 5. Frame Input Registry

```ts
type FrameLifecycleState =
  | "starting"
  | "active"
  | "suspended"
  | "closing"
  | "closed";

interface FrameInputRecord {
  readonly frameId: string;
  readonly subsystemRef: string;
  readonly lifecycle: FrameLifecycleState;
  readonly activationId: string | null;
}
```

active → activationId != null；其他 lifecycle → activationId == null。

`completed/cancelled/failed` 若显示，只能作为 outcome/diagnostic，不是 lifecycle。

## 6. Input Router

```text
raw input
→ normalize
→ read Main current InputTarget
→ if null: do not route ordinary input
→ require target Frame active
→ require activationId == mirrored current Activation
→ choose Subsystem Data Connection
→ User Input Protocol
```

Renderer MUST NOT：

- 在 transaction gap 沿用旧 target；
- 为 suspended/closing/closed Frame 路由 ordinary input；
- 使用历史/revoked Activation；
- 根据 Render focus/z-index 改变公共 InputTarget。

Input reset / continuous intent clearing 的具体 wire 由 User Input Protocol 冻结。

## 7. Call / Return 对 Renderer 的可见性

Batch C 允许 Renderer 不看到全部内部事务阶段。

例如 Main MAY 把：

```text
F1/A1
→ F1 suspended + F2 starting + null target
→ F2/A2
```

coalesce 为：

```text
F1/A1
→ F2/A2
```

前提是 F2/A2 只有在 Child `frame.activate` ACK 后才发布，且 F1/A1 在 revoke commit 后不再发布。

Return 同理：Caller replacement Activation 只有 `frame.resume` ACK 后才可见。

## 8. System Data Connection Registry

每 Subsystem 最多一条有效 Data Transport，根据 Main Grant 建立/认证/替换/关闭。Connection 与 Frame 数量无关。

Data Connection failure 使 ordinary input 停止，但不修改 Main Frame lifecycle；Render recovery 独立。

## 9. Render Registry / Store

Render Record 不包含 Frame ownership。Frame suspended/closing/closed 不自动删除 Render Store；Scheduler 不读取 Stack 决定 Render visibility/order/destroy。

## 10. Renderer Reload

```text
reconnect Main
→ restore current committed Runtime/Stack/lifecycle
→ restore current Activation/InputTarget
→ rebuild Data Connections
→ restore Frame Input Registry
→ each Subsystem independently restores Render State
```

不得恢复本地 cached old Activation，也不得恢复曾经只存在于未 commit transaction 的本地状态。

## 11. Core Invariants

- Renderer 不参与 Frame RPC；
- Renderer 只镜像 Main committed authority；
- transaction gap `InputTarget=null` 是合法状态；
- activate/resume ACK precedes publication；
- revoked Activation never reappears；
- no two ordinary InputTargets；
- Frame lifecycle/outcome 与 Render lifecycle 独立；
- Data Connection granularity = Subsystem；
- DOM/Canvas/WebGL not authority。
