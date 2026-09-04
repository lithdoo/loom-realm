# `@loomrealm/desktop` M9 Physical Data Core

> 状态：Implemented / Qualified（2026-09-04）

This private workspace owns the M9 session-scoped Desktop `DataConnectionBroker`, two-sided loopback Data WebSocket relay, finite buffering policy and Renderer-side `RendererDataBinding` delivery cells.

It is not the full Desktop product shell. BrowserWindow and physical Renderer hosting remain M14 responsibilities；Input/Render publication baselines remain M10/M11。

```powershell
npm test -w @loomrealm/desktop
npm run test:m9
```
