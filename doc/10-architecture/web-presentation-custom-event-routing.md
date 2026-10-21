# Web Presentation Custom Event Routing

> 状态：Implemented / Current architecture
> 正式化：[Web Presentation API v2](../15-contracts/web-presentation-api-v2.md)、[Session Events v1](../15-contracts/session-events-v1.md)
> 更新：2026-10-21

Web Presentation Custom Event 是通用可信发布能力。Framework 不拥有 Keyboard、Pointer 或 Gamepad schema。

```text
Business Web Component
  → WebProjector live Context
  → Renderer currentness + provenance binding
  → Desktop WebSocket / PWA MessagePort publication lane
  → Host current authority validation
  → SessionEventHub exact-channel routing
```

四个字段正交：

```text
options.channel   exact Session Event channel
name              Session Event type
data              payload.data
options.broadcast owner-only / Session-scope path
```

省略 channel 时才使用 `x.loomrealm.web-presentation.event`。不得使用旧的“固定广播 Channel + `data.channel` + 消费端过滤”模型。

Renderer 从 live RenderNode 绑定 session、owner、generation、domainId 和 targetKey；平台入口再次验证当前 authority。业务只能提供 name、data 和 options，不能伪造 source 或底层身份。两条路径均保持 FIFO、currentness-first、stale Context 丢弃和 exact-channel routing。

设备组件由 [Game Common Controls Input v1](../15-contracts/game-common-controls-input-v1.md) 拥有。Framework 的 RendererInputSource、InputGate、InputManager、`createInputListener`、Data `input.*` 与 Renderer Control `inputTarget` 已退役；Frame 参数、Activation、Viewport、Render、Shared State 和 Session Events 保持独立。
