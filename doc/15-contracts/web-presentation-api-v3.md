# Web Presentation API v3

> 状态：Active / Normative / Frozen
> 取代部署事实：[Web Presentation API v2](./web-presentation-api-v2.md)
> 新增传输：[Frame-targeted Presentation Event v1](./frame-targeted-presentation-event-v1.md)
> 最近复核：2026-10-23

v3 保留 v2 的 Render Data、Render Event、Resource、currentness 与 boolean publication 语义，只新增精确 Top Frame reverse Event。

## 1. API

```ts
type WebPresentationBroadcast = false | true | "top-frame";

interface CustomEventOptions {
  readonly broadcast?: WebPresentationBroadcast;
  readonly channel?: string;
}
```

- 省略或 `false`：原 owner-only Session Events publication；
- `true`：原 Session-wide Session Events publication；
- `"top-frame"`：Renderer 内分支，经 Renderer Data `/3` 投递到接受时的 Top Active Frame。

`"top-frame"` 不进入 Platform Presentation endpoint 或 SessionEventHub。`name`、`channel`、`data` 与 options 继续使用 v2 的 closed-shape、Unicode、大小和同步校验规则。

## 2. Currentness-first 与可信字段

stale/revoked Web Presentation Context 静默丢弃，且先于业务参数校验。current source 才校验参数。

对 `"top-frame"`，Renderer 从同一 current Control v2 snapshot 的 `stack.at(-1)` 派生 `subsystemKey + frameId + activationId`。业务只能提供 `name`、`channel`、`data`；source、domain、target、destination Frame 和 Activation 都由 Framework 绑定。

Event 接受时固定 destination lease，之后只允许发送或丢弃，禁止重定向到更新后的 Top Frame。

## 3. 兼容性

v2 的 boolean wire publication 没有扩展；Desktop/PWA 的既有 Session Events routing 保持不变。v3 与 Renderer Data Profile `/3` 协同部署；Renderer Control wire 仍为 v2。
