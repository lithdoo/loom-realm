# Web 渲染端模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Web Renderer 内部模块、Render 下行、User Input 上行和呈现依赖方向  
> 依赖：[渲染系统](../../10-architecture/rendering-system.md)、[通信系统](../../10-architecture/communication-system.md)、[Renderer–Subsystem 协议分层](../../10-architecture/renderer-subsystem-protocol-layers.md)  
> 最近复核：2026-08-02

## 1. 建议模块

```text
Web Renderer
├── Main Control Connection
├── Control State Store
├── System Data Connection Registry
├── Connection Protocol Adapter
├── Render Registry
├── Render Message Validator
├── Render Store
├── Render State Coalescer
├── Render Event Queue
├── Render Scheduler
├── Scope / Scene Reconciler
├── Node Registry
├── Frame Input Registry
├── Input Router
├── Resource Client
├── Presentation Clock
└── Presentation State
```

不再设置统一的 `Frame Stream Registry` 去同时管理 Render State 与 User Input。两者必须是独立协议域。

## 2. Main Control Connection

接收：

- Session；
- Subsystem Runtime 状态；
- Frame Stack / Activation / Input Target；
- System Data Connection Grant / revoke / replace；
- 会话错误和诊断。

不接收普通 User Input Payload 或 Render Update。

## 3. Control State Store

保存 Main 的只读控制镜像：

```text
Session State
Subsystem Runtime State
Stack Revision
Frame descriptors / order
Frame → Subsystem mapping
Activation
Input Target
System Data Grants
```

不保存 Frame visibility，也不从 Stack 推导 Render visibility 或 z-order。

## 4. System Data Connection Registry

按 Subsystem/System 管理长期 Data Transport：

```ts
interface SystemDataConnectionRecord {
  readonly subsystemRef: string;
  readonly connectionId: string;
  readonly transport: RendererSystemDataTransport;
  readonly status: "connecting" | "ready" | "closed" | "failed";
}
```

职责：

- 每个 Subsystem 同时最多一条有效 Data Transport；
- 根据 Main Grant 建立、认证、替换和关闭连接；
- 将下行 Render 消息交给 Render Protocol Adapter；
- 将上行 User Input 交给同一连接的 User Input Protocol；
- Transport 断开时停止该 Subsystem 的普通输入并启动连接恢复；
- 不根据 Frame 数量决定连接是否存在。

一个没有 Frame 但仍有 Render 的 Subsystem 可以继续保持 Data Connection。

## 5. Render Registry

Render Registry 管理 Subsystem-owned Render Context：

```text
Subsystem Connection
└── Render identity → Render Record
```

本文可以在示例中使用 `renderId`，但它只是概念占位名；最终 wire 字段由 Render Contract 冻结。

Render Record 可以包含：

- 当前 Render lifecycle state；
- Render / Scope Revision；
- Render Store；
- dirty Scope；
- Render Event Queue；
- 本地 Presentation resources。

不包含 `frameId` 所有权。

## 6. Render Message Validator

至少校验：

- 消息来自正确 Subsystem Data Connection；
- Render identity 合法；
- Render / Scope Revision；
- Scope 数量、树深和消息大小；
- Key 唯一性；
- Tag Registry；
- Node Data Schema；
- Event Schema。

某个 Render 验证失败时只影响该 Render 的恢复路径，不得自动修改 Frame Stack 或 Input Target。

## 7. Render Store

Render Store 保存 Renderer 对 Subsystem Render State 的非权威镜像：

```text
Render identity
└── Scope identity
    └── Node tree
```

消息必须先校验并原子提交 Store，再进入呈现阶段。

Store 是 Renderer 的恢复目标；DOM / Canvas / WebGL Scene 不是恢复源。

Frame suspend / close 不删除 Render Store。只有 Render Protocol 的显式 destroy / replace / recovery 语义可以改变对应 Render 生命周期。

## 8. Render State Coalescer 与 Event Queue

State：

- 同一 Render/Scope 在一次显示帧内可以只保留最新 dirty 标记；
- 不修改协议 Revision；
- 不跨 Render 隐式合并。

Event：

- 独立于 State latest-wins；
- 按 Render Protocol 的顺序作用域处理；
- 设置有界队列和溢出策略；
- 不因为 Frame pop 自动清空，除非 Subsystem 同时显式销毁对应 Render。

## 9. Render Scheduler

```text
读取 dirty Render / Scope
→ 读取最新 Render Store
→ 应用 Render 自己声明的 composition / visibility 语义
→ 调用 Scope Reconciler / Scene Renderer
→ 派发 Render Event
→ 更新 Presentation State
```

Render Scheduler 不读取 Frame Stack 来决定 Render 显示、隐藏、销毁或最终 z-order。

跨 Subsystem Render Composition 的最终协议尚未冻结；实现不得用 Frame Stack 临时代替公共合成规则。

## 10. Scope / Scene Reconciler

- 相同 Key + Tag 时复用对象；
- Data 变化更新节点；
- Children 顺序变化移动已有对象；
- Tag 变化销毁并重建；
- 删除节点执行 destroy；
- 未变化节点不重建；
- DOM / Scene 不能成为业务或协议恢复源。

高频 2D/3D Scene 可以由一个可信 Tag 对应一个 Canvas/WebGL surface，并在 Renderer 内管理本地表现对象。

## 11. Frame Input Registry

Frame Input Registry 只管理输入域：

```ts
interface FrameInputRecord {
  readonly frameId: string;
  readonly subsystemRef: string;
  readonly activationId: string | null;
  readonly inputEligible: boolean;
}
```

职责：

- 从 Main Control State 建立 Frame → Subsystem 映射；
- 跟踪当前 Activation；
- 拒绝旧 Activation；
- 在 Input Target 改变 / Frame suspend / 页面 blur 时释放持续输入；
- 不持有 Render State、Render Revision 或 Render identity。

## 12. Input Router

- 采集键盘、手柄、触摸和 UI Interaction；
- 归一化浏览器事件；
- 只发送给 Main 当前 Input Target；
- 根据目标 Frame 的 Subsystem 选择 System Data Connection；
- 附加 `frameId + activationId` 以及 User Input Protocol 所需顺序字段；
- 连续输入采用 latest/current-intent 语义；
- 离散输入使用有界有序队列；
- 页面失焦、目标变化、Activation 变化时发送/应用 input reset。

UI Interaction 从 Render Context 映射到 Frame/Input Context 的机制仍待 User Input Contract 冻结。Renderer 不得假设 Render identity 等于 `frameId`。

## 13. Resource Client

通过逻辑资源身份访问只读 Content API：

- Desktop localhost HTTP；
- PWA same-origin Fetch；
- 校验 MIME、Content Version 与缓存；
- 管理 Blob、ImageBitmap、AudioBuffer 和 GPU resources；
- 资源失败不破坏 Render Store。

资源缓存释放按实际引用与 Render/Presentation 生命周期处理，不按 Frame pop 自动清理全部资源。

## 14. Presentation Clock / State

Presentation Clock 提供 rAF 时间、插值 alpha、页面隐藏/恢复和呈现延迟诊断，不生成权威业务时间。

Presentation State 只保存：

- DOM / Canvas / GPU object refs；
- CSS animation；
- 插值状态；
- focus / scroll / hover；
- 音频播放和临时粒子。

不得改变 Subsystem 权威业务结果。

## 15. 完整下行流程

```text
System Data Connection
→ Render Update Protocol Adapter
→ Render identity route
→ Render Message Validator
→ Render Store atomic commit
→ State Coalescer / Event Queue
→ Render Scheduler
→ Scope / Scene Reconciler
→ DOM / Canvas / WebGL
```

## 16. 完整上行流程

```text
Browser raw input
→ normalize
→ Main-declared Input Target
→ Frame Input Registry
→ choose Subsystem Data Connection
→ User Input Protocol
→ Subsystem Frame Input Handler
```

Render 与 Input 两条链只共享物理 System Data Connection，不共享 Frame lifecycle 或 Render lifecycle。

## 17. Renderer 重载

```text
reconnect Main Control
→ restore ready Subsystem / Data Grant state
→ rebuild needed System Data Connections
→ restore Frame Input Registry from Stack / Activation
→ each Subsystem independently restores Render State
```

不得：

- 从有效 Frame 集合推导全部 Data Connection；
- 逐 Frame `state.resync` 作为 Render 恢复模型；
- Frame pop 触发 Render Store 全量删除。

## 18. 核心不变量

- System Data Connection 粒度 = Subsystem；
- Frame Input Registry 只管理输入上下文；
- Render Registry / Store 与 Frame Stack 独立；
- Frame suspend/close 不自动改变 Render；
- Renderer 不从 Stack 推导 Render z-order / visibility；
- Render identity 最终字段名仍待正式契约冻结；
- DOM / Scene 不是权威状态源。