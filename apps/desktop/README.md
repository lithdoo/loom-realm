# `@loomrealm/desktop` Hostra-owned product composition

> 状态：M15 Hostra recomposition implemented；formal closure仍由 `doc/30-implementation/m15-qualification.md` 管理，并等待同一 subject 的 hosted qualification。

Canonical Desktop topology：

```text
frozen Hostra shell
└─ HOSTRA_SUBCMD plain Node apps/desktop/dist/main-entry.js
   ├─ Main + RuntimeHosting-owned Runner
   ├─ prepared readonly Content service
   ├─ navigation-only trusted document route
   ├─ one-shot loopback Renderer Control capability
   └─ document-scoped loopback Data settlement
      └─ existing Data application WebSocket pair
```

Hostra exclusively owns Electron、BrowserWindow、preload and direct subprocess lifecycle。Desktop consumes only `HOSTRA_RPC_PORT`、`HOSTRA_RPC_TOKEN` and the bounded `openWindow`/`closeWindow`/`hostra.event` JSON-RPC surface。

The canonical LoomRealm Hostra composition requires a non-empty `HOSTRA_RPC_TOKEN` as a concrete product security policy, even though Hostra itself also supports unauthenticated RPC deployments。

The existing Main、M9 Broker、Content、M10 Input、M13 Presentation and M14 game contracts remain unchanged。Reload creates a fresh Renderer identity while preserving Hostra `windowId` and Main/Runner/game truth；same-generation Data replacement preserves the Renderer identity。

Canonical gates：

```powershell
npm run build:m15
npm run test:m15:desktop
npm run test:m15:hostra
npm run test:m15
```

The Hostra qualification requires the exact frozen source：

```text
hostra@1.0.1-beta.1
d863beab3c59c3bd4f271514a228fa8fee0bf5b6
Electron 44.1.1
```

Locally it is discovered at `../hostra`，or supplied through `HOSTRA_SOURCE_DIR`。The hosted workflow checks out that exact commit rather than following a moving package or branch。
