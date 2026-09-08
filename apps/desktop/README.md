# `@loomrealm/desktop` Physical Platform Composition

> 状态：M9 Data + M12 Content **Implemented / Qualified**（2026-09-08）

This private workspace owns the M9 session-scoped Desktop `DataConnectionBroker`, two-sided loopback Data WebSocket relay, finite buffering policy and Renderer-side `RendererDataBinding` delivery cells.

It also owns the M12 prepared-installation Content view and loopback readonly Content Service：deterministic public manifest bytes, immutable FSDB logical index, exact-byte SHA-256 versions, scoped/expiring bearer grants, bounded request admission, and lifecycle closure. `prepareDesktopContentView(prepared)` consumes the genuine Hostra-prepared truth through its trusted integration subpath, derives the unique in-installation `[FSDB]*` root, and never re-reads `game.json` or accepts independently supplied roots. The public prepared-view handle exposes no filesystem path, FSDB handle, or Content Index.

It is not the full Desktop product shell. BrowserWindow and physical Renderer hosting remain M14 responsibilities；Input/Render publication baselines remain M10/M11。

```powershell
npm test -w @loomrealm/desktop
npm run test:m9
npm run test:m12
```
