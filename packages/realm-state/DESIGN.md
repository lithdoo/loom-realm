# `@loomrealm/realm-state`

Realm State v1 的平台中立实现。包内包含确定性验证/计量、参考内存 Authority、Runtime-scoped logical client、可替换 binding 与独立 carrier protocol。规范语义以 `doc/15-contracts/realm-state-v1.md` 为准。

Carrier realization uses a private transparent framing layer for logical results larger than one WebSocket or MessagePort unit; framing does not change logical JSON accounting or impose an aggregate `scan()` limit. Per-carrier outbound work is serialized and bounded, incomplete inbound framing is bounded, and a subscription event remains logically pending until its complete physical send is accepted.

本包不拥有 Main 生命周期、Frame/Activation、Renderer、Save/Load 或平台 executable policy。
