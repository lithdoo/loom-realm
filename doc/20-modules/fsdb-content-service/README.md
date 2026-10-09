# Content 与 FSDB：当前实现

Content 是 **readonly installation definition authority**。本文描述 Current implementation ownership；正式 observable semantics 见 [Content API v1](../../15-contracts/content-api-v1.md)，system placement 见[存储系统](../../10-architecture/storage-system.md)。FSDB physical format reference 见 [FSDB layout](./fsdb-layout.md)。

## Logical structure

```text
Platform PREPARE
→ immutable prepared installation
→ platform-specific Content realization
→ Subsystem ContentClient / trusted Renderer resource client
→ game business / presentation
```

Desktop 的 readonly storage core 使用 `@loomrealm/fsdb`；`@loomrealm/fsdb-http` 只做 `/fsdb/v1` HTTP projection。Core ownership amendment 见 [`packages/fsdb-http/CORE_OWNERSHIP_AMENDMENT.md`](../../../packages/fsdb-http/CORE_OWNERSHIP_AMENDMENT.md)。它不是第二套 scanner，也不是 generic application repository/storage authority。

PWA 使用 browser-native physical composition（Service Worker/private installation/runtime-info boundary）提供同一 logical Content contract；Node-only FSDB mechanics 不被提升为 universal framework ABI。

Content capability != executable resolver，URL != filesystem path。Content failure 按 contract 投影，不自动结束 Runtime/Frame；mutable Realm State 与 Render replica 也不能借 Content 建立第二份 truth。

## Ownership / validation

主要实现位于 `packages/fsdb/`、`packages/fsdb-http/`、`packages/subsystem/`、`packages/renderer/` 以及 concrete platform/app composition。验证包含 FSDB/core/http conformance、Content integration、fixture importer 与 Desktop/PWA product tests。

现有 `test:m12` 等名字是历史兼容的 command alias。资格 currentness 由[subject/staleness](../../30-development/qualification.md)判断，而不是由阶段编号决定。Historical ownership decision 见 [ADR0030](../../decisions/0030-freeze-m12-content-preimplementation-closure.md)。
