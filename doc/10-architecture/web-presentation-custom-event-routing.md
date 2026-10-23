# Web Presentation Custom Event Routing

> 状态：Implemented / Current architecture
> 正式化：[Web Presentation API v3](../15-contracts/web-presentation-api-v3.md)、[Frame-targeted Presentation Event v1](../15-contracts/frame-targeted-presentation-event-v1.md)、[Renderer Data Profile v3](../15-contracts/renderer-data-profile-v3.md)、[Session Events v1](../15-contracts/session-events-v1.md)
> 更新：2026-10-23

Web Presentation Custom Event 是通用可信发布能力。Framework 不拥有 Keyboard、Pointer 或 Gamepad schema。

boolean 路径保持既有 Session Events 行为：

```text
Business Web Component
  → WebProjector live Context
  → Renderer currentness + provenance binding
  → Desktop WebSocket / PWA MessagePort publication lane
  → Host current authority validation
  → SessionEventHub exact-channel routing
```

`broadcast: "top-frame"` 走 Frame 精确路径，不进入 Platform Presentation publication 或 Session Events：

```text
Business Web Component
  → current RenderNode source
  → Control v2 stack.at(-1) TopFrameLease(S,F,A)
  → exact presentation.interest[S][F][channel]
  → target Renderer Data /3 peer
  → PresentationEventManager receiver gate
  → exact live Frame + Activation listener
```

`options.channel`、`name`、`data` 和 `options.broadcast` 正交；在 boolean 路径中，`name` 仍是 Session Event type。省略 channel 时使用 `x.loomrealm.web-presentation.event`。不得使用旧的“固定广播 Channel + `data.channel` + 消费端过滤”模型。

Renderer 从 live RenderNode 固定 source session、owner、generation、`domainId`、`targetKey` 和 source Data peer；平台入口或 Frame Gate 在发送前再次验证 currentness。业务不能伪造 source 或底层身份。

`false`/省略继续 owner-only，`true` 继续 Session-scope broadcast；两条路径的 Carrier、Hub 和 Client 不变。`"top-frame"` 固定接受时刻的目标 Subsystem、Frame、Activation 与 Data peer，并在出队和接收端重新 gate。Interest 缩减、lease/activation 变化、source retirement 或 peer replacement 都只会丢弃旧工作，不会 retarget 或 replay。

设备组件由 [Game Common Controls Input v1](../15-contracts/game-common-controls-input-v1.md) 拥有。Framework 的 RendererInputSource、InputGate、InputManager、`createInputListener`、Data `input.*` 与 Renderer Control `inputTarget` 已退役；Frame 参数、Activation、Viewport、Render、Shared State 和 Session Events 保持独立。
