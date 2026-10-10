# `@loomrealm/desktop` — Hostra-owned product composition

Canonical Desktop topology：

```text
Hostra shell
└─ HOSTRA_SUBCMD plain Node apps/desktop/dist/main-entry.js
   ├─ Main + RealmStateAuthority + RuntimeHosting-owned Runner
   ├─ prepared readonly Content service
   ├─ navigation-only trusted document route
   ├─ one-shot loopback Renderer Control capability
   └─ document-scoped loopback Data settlement
      └─ Hostra-owned BrowserWindow trusted Renderer
```

Hostra exclusively owns Electron、BrowserWindow、preload and direct subprocess lifecycle. Desktop consumes only the bounded Hostra host-control surface；application Control/Data/Content/Input/Render remain LoomRealm contracts and do not travel over Hostra RPC。

LoomRealm Desktop requires a non-empty `HOSTRA_RPC_TOKEN` as concrete product security policy. Reload creates a fresh Renderer identity while preserving Hostra `windowId` and Main/Runner/game truth；same-generation Data replacement preserves Renderer identity。

Current architecture/module docs：[`doc/20-modules/desktop-host`](../../doc/20-modules/desktop-host/README.md)。Existing `build:m15` / `test:m15:*` / `test:m15` commands remain compatibility CI/release aliases, not a project stage. Frozen Hostra baseline and historical exact-subject results remain in the legacy qualification ledger；future currentness follows [`doc/30-development/qualification.md`](../../doc/30-development/qualification.md).
