# Web 渲染端模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Web Renderer 内部模块、Render 下行、User Input 上行和呈现依赖方向  
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

Render 与 User Input 是独立协议域，不建立统一 Frame Stream Registry。

## 2. Renderer 不是 Frame / Call RPC Participant

Frame / Call Batch B 的七个 RPC 只存在于：

```text
Main ⇄ Subsystem Control Connection
```

Renderer MUST NOT 直接发送或处理：

```text
frame.initialize
frame.activate
frame.suspend
frame.resume
frame.close
frame.call
frame.return
```

Renderer 从 **Main ⇄ Renderer Control** 接收这些 RPC 执行后的权威投影：Frame Stack / lifecycle / current Activation / Input Target。

因此 Batch B 不得被实现成 Renderer ⇄ Subsystem Data method namespace。

## 3. Main Control Connection / Store

Renderer 接收 Main 的只读控制状态：

- Session；
- Subsystem Runtime State；
- Frame Stack / order；
- Frame lifecycle mirror；
- current Activation；
- Input Target；
- Data Grant / revoke / replace；
- session diagnostics。

不接收 ordinary User Input payload 或 Render Update。

```text
stable Stack Top = active
lower live Frames = suspended
only active Frame has current Activation
```

Renderer 不创建公共 `frameId / activationId`，不修改 lifecycle，不恢复 revoked Activation。

Caller relationship 如果未来出现在 Renderer Stack descriptor，只能是 Main 的只读投影；Renderer 不需要它执行 `frame.return`，因为 Renderer 根本不是该 RPC 的参与方。

## 4. System Data Connection Registry

按 Subsystem 管理长期 Data Transport：

```ts
interface SystemDataConnectionRecord {
  readonly subsystemRef: string;
  readonly connectionId: string;
  readonly transport: RendererSystemDataTransport;
  readonly status: "connecting" | "ready" | "closed" | "failed";
}
```

每 Subsystem 最多一条有效 Data Transport，根据 Main Grant 建立/认证/替换/关闭，不根据 Frame 数量决定 Connection 是否存在。

## 5. Render Registry / Store

Render Registry 管理 Subsystem-owned Render Context。Render Record 不包含 frameId ownership。

Frame `suspended / closing / closed` 不删除 Render Store；只有 Render Protocol 显式 lifecycle 改变 Render Context。

Render Scheduler 不读取 Frame Stack 决定 visibility/order/destroy。

## 6. Frame Input Registry

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

Renderer 必须验证：active → activationId != null；其他 lifecycle → activationId == null。

Renderer 不创建 lifecycle `failed`。`completed / cancelled / failed` 如果未来需要显示，只是 outcome/diagnostic。

## 7. Input Router

```text
raw browser input
→ normalize
→ read Main current Input Target
→ require mirrored Frame active
→ require target activationId == current Activation
→ choose Subsystem Data Connection
→ User Input Protocol
```

Renderer MUST NOT 为非 active Frame 发送 ordinary input，不使用历史 Activation，不根据 Render focus/z-index 改变 Input Target。

Input Target/Activation 改变时的 input reset 由 User Input Protocol 冻结。

## 8. Batch C Interface

Batch B 已保证 Subsystem 侧：

```text
frame.activate success
    first Activation installed

frame.resume success
    Child outcome delivered + replacement Activation installed
```

Renderer 何时看到该 Activation 仍由 Batch C + Main ⇄ Renderer Control 冻结。

因此当前实现 MUST NOT 假设：

```text
Main generated activationId
    ⇒ Renderer immediately may send input
```

必须等待未来冻结的 Main publish commit point。

## 9. Render / Frame Independence

禁止：

```text
active Frame → only visible Render
suspended Frame → hide Render
closed Frame → delete Render Store
Frame Stack order → Render z-order
Activation replacement → Render resync
```

Render 与 Input 只共享 physical Data Connection。

## 10. Renderer Reload

```text
reconnect Main
→ restore Runtime State
→ restore Stack / lifecycle / current Activation / Input Target
→ rebuild authorized Data Connections
→ restore Frame Input Registry
→ each Subsystem independently restores Render State
```

current Main state 是 Frame authority；cached Activation / Render Store 都不是。

## 11. Core Invariants

- Renderer 不参与 Batch B Frame RPC；
- Renderer only mirrors Frame authority；
- frameId / activationId 只能来自 Main；
- no Frame ready/status；
- only active Frame has current Activation；
- revoked Activation never reactivates；
- outcome ≠ lifecycle；
- at most one ordinary Input Target；
- System Data Connection granularity = Subsystem；
- Render Store independent from Frame Stack；
- DOM / Canvas / WebGL not authority。
