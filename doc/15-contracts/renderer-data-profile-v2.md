# Renderer Data Application Profile v2

> 状态：Active / Normative / Frozen
> Identity：`loomrealm.renderer-data/2`
> 组成：[Render Update v1](./render-update-v1.md) + [Viewport State v1](./viewport-state-v1.md)
> Authority：[Main ⇄ Renderer Control v2](./main-renderer-control-v2.md)
> 最近复核：2026-10-21

Profile v2 是移除 Framework User Input 后的 Renderer ⇄ Subsystem Data 应用层配置。它保留 Data Connection v1 的单 reader、单 writer、终止与 fresh-carrier 语义，但不再包含 `input.*` 子协议。

## 1. Closed message set

Subsystem → Renderer：

```text
render.domains
render.snapshot
render.patch
render.event
```

Renderer → Subsystem：

```text
viewport.state
```

其他 `type`，包括 `input.interest`、`input.state`、`input.event` 和 `input.reset`，均为 Profile protocol-fatal。实现不得通过兼容分支接受 `/1` input 消息。

## 2. Binding

```ts
interface DataCurrentBindingV2 {
  readonly carrier: MessageCarrier;
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: "loomrealm.renderer-data/2";
}
```

绑定必须在占用 carrier reader 前验证。`subsystemKey`、`generation` 和 profile identity 由可信平台 authority 提供，业务消息不能覆盖。

## 3. Ordering and recovery

- 一个 peer 只占用一个 logical carrier reader，并通过一个共享 writer 串行发送。
- Render 的 ordering、baseline、patch continuity 和 event barrier 继续由 Render Update v1 拥有。
- Viewport 的合法样本、coalescing 与 fresh-carrier baseline 继续由 Viewport State v1 拥有。
- Render 与 Viewport 相互独立；Profile 不增加跨子协议 barrier。
- carrier 终止后不得继承 reader、writer、Render cursor 或 Viewport cursor。

## 4. Ownership boundary

Keyboard、Pointer、Gamepad、Input Interest、InputTarget、Frame/Activation 输入租约均不属于 Profile v2。设备输入由 [Game Common Controls Input v1](./game-common-controls-input-v1.md) 通过 Web Presentation Event 和 Session Events 发布。

Profile `/1` 与 User Input v1 文档保留为历史冻结契约；当前实现只 advertise `/2`，不进行 dual-mode negotiation。
