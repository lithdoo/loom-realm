# Game Common Controls Input v1 Qualification

> 状态：Qualified
> Subject：当前 PR head（2026-10-21）
> Contracts：[Game Common Controls Input v1](../15-contracts/game-common-controls-input-v1.md)、[Web Presentation API v2](../15-contracts/web-presentation-api-v2.md)、[Renderer Data Profile v2](../15-contracts/renderer-data-profile-v2.md)、[Renderer Control v2](../15-contracts/main-renderer-control-v2.md)

## Executable entry

```text
npm run test:game-common-controls-input:qualification
```

该入口构建相关 Framework、Desktop/PWA、game-lib 与业务包，然后执行：

- common-controls Playwright：Keyboard/Pointer/Gamepad payload、六个 exact channels、State-before-Event、repeat/cancel/threshold、duplicate、refresh、disconnect；
- Fresh State tracker：stale neutral fallback 与 close fencing；
- Renderer Presentation Event：channel/type/payload/broadcast 分离、owner/default channel、currentness、FIFO；
- Desktop/PWA bridge：当前 authority、专用 publication lane 与 stale generation fencing；
- Desktop 产品回归与 PWA M17 真 Chromium E2E：默认 Demo、essentials 与 PokeMan 的组件装载、精确 Channel 输入、跨安装同内容启动资源复用；
- Data Profile v2 / Renderer Control v2：`input.*` fail-closed、无 `inputTarget`；
- Framework source boundary：无 InputManager、InputGate、RendererInputSource 或 `createInputListener`，同时保留 Frame ownership/stack/activation validation；
- Map、Dialogue、Schema Form：通过 Session Events 消费输入或 owner-only Presentation Event。

历史 User Input v1 qualification 已退役，不再作为 current test entry。冻结历史文档保留，不把旧 PASS 冒充为当前实现证据。
