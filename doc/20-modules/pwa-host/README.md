# PWA 产品组合

> Current product entry. 实现位于 `apps/pwa`；逻辑/物理边界见本模块 DESIGN 与正式 PWA Profile，qualification 遵循 [`30-development/qualification`](../../30-development/qualification.md)。

PWA v1 为 **Implementation Frozen / Implemented**。Browser Window 只承载 Renderer / Input / Viewport / Web Presentation；Main + RealmStateAuthority 共置独立 Session Worker；Subsystem Runtime 位于独立 Dedicated Worker；Service Worker 只承载 Content/private executable/runtime-info physical boundary。

正式边界见 [PWA Launcher / Worker Profile v1](../../15-contracts/pwa-launcher-profile-v1.md) 与 [PWA 产品组合设计](./DESIGN.md)。Current implementation root 是 `apps/pwa`，browser ownership points 为：

```text
window-entry.ts
session-worker-entry.ts
worker-runner-entry.ts
service-worker.ts
```

现有 root commands `build:m16/test:m16/build:m17/test:m17/test:pwa` 作为历史命名的 CI interface 保留；它们不再定义 Current 文档阶段。Repository-pinned Playwright Chromium 是 v1 mandatory browser qualification target。任何影响 frozen topology、authority、bootstrap、installation source、Content auth seam 或 browser target 的新 subject 必须按资格规则重新验证。
