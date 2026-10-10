# Renderer 与 Web Presentation：当前实现

> 模块入口：`packages/renderer`、`packages/renderer-control`、`packages/data`。System authority 见[渲染架构](../../10-architecture/rendering-system.md)，精确协议/API 见[正式契约](../../15-contracts/README.md)。

## Responsibility chain

```text
Main current Renderer / DataAuthority
→ Renderer ControlHolder
→ per-subsystem/generation Data slot
→ Input gate + Render Store + Viewport publisher
→ presentation reevaluation
→ Web Projector
→ business-owned Custom Elements
```

Renderer 拥有 **readonly/current presentation replica** 与受控 input producer gate，不拥有 Main Session/DataAuthority、Realm State business truth 或 Subsystem RenderDomain authority。DOM/Web Component 私有状态不得 reverse-sync Store。

`PresentationResourceClient` 通过 trusted ResourceClient 获取 Content；业务元素只见 logical resource identity/version，不拿 bearer、filesystem path 或 physical endpoint。

## Currentness / synchronization

- Store 只接受 current carrier/generation 的合法 baseline/update；换 carrier 后旧异步 completion 不得提交到新 identity；
- presentation reevaluation 由已提交 Control topology 或 current Store commit 触发；Viewport 本身不成为新的 business authority；
- current `renderer-data/1` 包含 Connection、Input、Render、Viewport 四子项；历史三子项 baseline 不可与 current binary/status 混用；
- Window size 由 trusted product 通过 current Data capability 进入 bounded Viewport publisher，不修改 Main InputTarget，也不创建第二条 Data connection；
- same Session/generation/render identity 保留既有 HTMLElement；换 logical participant 时退役旧 element；Data-only reconnect 保持 Renderer identity，并在完整 baseline 后恢复。

## Validation

Normative references：[Renderer Data Profile](../../15-contracts/renderer-data-profile-v1.md) · [Viewport State](../../15-contracts/viewport-state-v1.md) · [Render Update](../../15-contracts/render-update-v1.md) · [Web Presentation Config](../../15-contracts/web-presentation-config-v1.md) · [Web Presentation API](../../15-contracts/web-presentation-api-v1.md)。

验证由 Renderer/Data workspace tests、render/presentation qualification suites 与 Chromium coverage 承担。`test:m11` / `test:m13` 是历史兼容 aliases；exact-subject PASS 不能自动迁移到新的 executable/qualification-input subject。
