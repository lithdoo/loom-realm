# Web 渲染端模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Web Renderer 内部模块、Render 下行、User Input 上行和呈现依赖方向  
> 依赖：[渲染系统](../../10-architecture/rendering-system.md)、[通信系统](../../10-architecture/communication-system.md)、[Frame / Call Protocol v1](../../15-contracts/frame-call-protocol-v1.md)、[Renderer–Subsystem 协议分层](../../10-architecture/renderer-subsystem-protocol-layers.md)  
> 最近复核：2026-08-03

## 1. 建议模块

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
├── Presentation Clock
└── Presentation State
```

Render 与 User Input 是独立协议域，不建立统一 `Frame Stream Registry`。

## 2. Main Control Connection

接收 Main 的只读控制状态：

- Session；
- Subsystem Runtime State；
- Frame Stack；
- Frame lifecycle mirror；
- current Activation；
- Input Target；
- Data Connection Grant / revoke / replace；
- session errors / diagnostics。

不接收 ordinary User Input payload 或 Render Update。

Renderer MUST NOT 创建公共 `frameId` / `activationId` 或修改 Frame lifecycle。

## 3. Control State Store

保存 Main 的只读镜像：

```text
Session State
Subsystem Runtime State
Stack Revision
Frame descriptors / order
Frame → Subsystem mapping
Frame lifecycle
current Activation
Input Target
System Data Grants
```

Frame Batch A 不变量必须保持：

```text
stable Stack Top = active
lower live Frames = suspended
only active Frame has current Activation
no Frame ready / initialized / frame.status
```

Renderer 不保存 Frame visibility，也不从 Stack 推导 Render visibility/z-order。

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

职责：

- 每 Subsystem 最多一条有效 Data Transport；
- 根据 Main Grant 建立/认证/替换/关闭；
- 下行 Render → Render domain；
- 上行 User Input → Input domain；
- Transport 断开时停止 ordinary input 并进入 Connection recovery；
- 不根据 Frame 数量决定 Connection 是否存在。

## 5. Render Registry / Store

Render Registry 管理 Subsystem-owned Render Context：

```text
Subsystem Connection
└── Render identity
    └── Render Store / Scope / Node
```

Render Record 不包含 `frameId` ownership。

Frame `suspended / closing / closed` 不删除 Render Store。只有 Render Protocol 显式 lifecycle 可以改变 Render Context。

## 6. Render Validation / Scheduler

Render 消息至少校验：

- correct Subsystem Data Connection；
- Render identity；
- Revision；
- tree/schema/size limits；
- node/tag/event validity。

Render 错误不得自动修改 Frame Stack / Activation / Input Target。

Scheduler 不读取 Frame Stack 来决定 Render visibility/order/destroy。

## 7. Frame Input Registry

Frame Input Registry 只镜像输入域。

概念记录：

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

Renderer 实现必须验证 Main snapshot 自洽：

```text
active
    activationId != null

starting / suspended / closing / closed
    activationId == null
```

Renderer 不需要、也不得创建 lifecycle `failed`。`completed / cancelled / failed` 如果未来需要呈现在 Renderer Control State，只能作为 call outcome / diagnostic，不是 Frame lifecycle。

## 8. Input Router

ordinary input 路由：

```text
raw browser input
→ normalize
→ read Main-declared current Input Target
→ verify target Frame mirror is active
→ verify target activationId == Frame current Activation
→ choose target Subsystem Data Connection
→ User Input Protocol
```

Renderer MUST NOT：

- 为 suspended/closing/closed Frame 发送 ordinary input；
- 使用历史 Activation；
- 在 Main 没有发布新 Activation 时自行恢复旧 Activation；
- 根据 Render focus/z-index 改变公共 Input Target。

Input Target / Activation 改变时需要释放持续输入；具体 reset wire 语义由 User Input Protocol 冻结。

## 9. Stale Activation

Frame Batch A 冻结：revoked Activation 永久无效。

因此 Renderer reload / reconnect 后：

```text
MUST restore only current Activation from Main
MUST NOT revive cached historical Activation
```

本地缓存可以用于诊断，但不能成为输入 authority。

## 10. Render 与 Frame Independence

以下全部禁止：

```text
active Frame → only visible Render
suspended Frame → hide Render
closed Frame → delete Render Store
Frame Stack order → Render z-order
Activation replacement → Render resync
```

Render 与 Input 只共享 physical Data Connection。

## 11. Resource Client

通过只读 Content API 获取逻辑资源。资源 cache 生命周期不按 Frame close 自动清空。

## 12. Presentation State

Presentation State 只保存 DOM/Canvas/GPU refs、animation、interpolation、focus/scroll/hover、audio/particle 等非权威表现状态。

不得成为 Frame / business / Render protocol authority。

## 13. Renderer Reload

```text
reconnect Main
→ restore Runtime State
→ restore Stack / lifecycle / current Activation / Input Target
→ rebuild authorized Data Connections
→ restore Frame Input Registry
→ each Subsystem independently restores Render State
```

关键：

```text
current Main state is authority
cached Activation is not authority
Render Store is not Frame authority
```

## 14. Core Invariants

- Renderer only mirrors Frame authority；
- frameId / activationId 只能来自 Main；
- Frame lifecycle mirror = `starting / active / suspended / closing / closed`；
- no Frame ready/status；
- only active Frame has current Activation；
- revoked Activation never reactivates；
- outcome ≠ lifecycle；
- at most one ordinary Input Target；
- System Data Connection granularity = Subsystem；
- Render Store independent from Frame Stack；
- DOM / Canvas / WebGL not authority。
