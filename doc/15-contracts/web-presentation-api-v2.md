# Web Presentation API v2

> 状态：Active / Normative / Frozen
> 依赖：[Web Presentation API v1](./web-presentation-api-v1.md)、[Session Events v1](./session-events-v1.md)
> 最近复核：2026-10-21

v2 保留 v1 的 Render Data、Render Event、Resource、currentness 与 lifecycle 语义，并把 reverse Custom Event 从 User Input 专用入口升级为通用可信发布入口。

## 1. API

```ts
interface CustomEventOptions {
  readonly broadcast?: boolean;
  readonly channel?: string;
}

interface WebPresentationContext {
  readonly resources: PresentationResourceClient;
  emitCustomEvent(
    name: string,
    data?: JsonObject,
    options?: CustomEventOptions,
  ): void;
}
```

双参数调用兼容 owner-only 行为。省略 options 或 `broadcast:false` 为 owner-only；`broadcast:true` 为 Session scope 发布。省略 channel 或显式 `undefined` 使用 `x.loomrealm.web-presentation.event`。

## 2. Orthogonal fields

```text
SessionEvent.channel = resolved options.channel
SessionEvent.type    = name
SessionEvent.payload = { domainId, targetKey, data }
```

`channel` 是 exact routing key；`name` 是业务 event type；`data` 是业务 JSON payload；`broadcast` 只选择 owner-only 或 Session-scope 路径。实现不得改用固定广播 Channel + `data.channel` + 消费端过滤。

## 3. Trust and ordering

- name、channel、data、options closed shape 必须分别同步验证。
- currentness 检查先于业务参数验证；stale Context 静默丢弃。
- Session、owner subsystem、generation、domainId、targetKey 与 source 均由可信 live RenderNode 和平台 authority 绑定，业务不可伪造。
- 同一 binding 上 accepted publication 保持 FIFO；terminal/overflow 后不得重放 Event。
- Desktop WebSocket 与 PWA MessagePort ingress 必须再次验证当前 Renderer/Session/owner/generation。

owner-only 显式 channel 仍按 exact channel 投递给 owner；broadcast 路径保持 Session Events v1 的 exact-channel recipient semantics，不增加 payload-based routing。
