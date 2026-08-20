# 仓库与目录方案

> 层级：实施计划  
> 状态：Draft / Tracking  
> 稳定程度：Experimental  
> 主要定义：monorepo物理目录、Game/Platform launch packages、Subsystem author/host surface、Runner/provisioning与测试布局  
> 依赖：[独立分包与发布架构](./package-architecture.md)、[平台组合系统](../10-architecture/platform-composition-system.md)  
> 最近复核：2026-08-20

---

## 1. Top-level

```text
packages/
├── foundation/
├── wire/
├── game-package/
├── game-launcher-hostra/
├── game-launcher-pwa/
├── runtime-control/
├── renderer-control/
├── data/
├── content/
├── main/
├── subsystem/
├── renderer/
├── content-service/
├── launcher-node/
├── transport-websocket/
├── transport-messageport/
├── content-fs/
├── content-http/
├── content-service-worker/
└── map/

apps/
├── desktop/
├── pwa/
└── cli/

tests/
├── fixtures/
├── subsystems/
├── integration/
├── platform/
└── e2e/
```

---

## 2. `packages/game-package`

目标：

```text
src/
├── model.ts
├── parse.ts
├── validate.ts
└── errors.ts

test/
```

只处理 `game.json` logical data；无 filesystem/Fetch/module resolution依赖。

---

## 3. `packages/game-launcher-hostra`

目标：

```text
src/
├── manifest/
├── planner/
├── module-resolver/
├── runtime-hosting/
├── runner/
│   ├── entry.ts
│   ├── bootstrap.ts
│   ├── control-binding.ts
│   ├── provisioning.ts
│   └── data-binding.ts
└── supervision/
```

拥有 Hostra Subsystem Runtime launch capability，不包含 Renderer/DataBroker/Content完整 composition。

---

## 4. `packages/game-launcher-pwa`

目标：

```text
src/
├── manifest/
├── planner/
├── module-resolver/
├── runtime-hosting/
├── runner/
│   ├── worker-entry.ts
│   ├── bootstrap.ts
│   ├── control-binding.ts
│   ├── provisioning.ts
│   └── data-binding.ts
└── supervision/
```

Worker Runner与 PWA executable resolution在这里；Renderer/SW/Data Broker仍留在 composition/adapters。

---

## 5. `packages/subsystem`

仍保持：

```text
@loomrealm/subsystem       author exports
@loomrealm/subsystem/host  trusted Runner integration
```

Launcher packages依赖 `/host`；business package不得依赖 `/host`。

---

## 6. Business Definition Build

业务 source：

```text
packages/map/src/subsystem.ts
```

可能构建输出：

```text
subsystems/hostra/loom-map/subsystem.mjs
subsystems/pwa/loom-map/subsystem.mjs
```

也可两个 manifest指向同一 portable artifact。目录/bytes不是 cross-platform identity；Subsystem key + ABI/semantics才是。

---

## 7. Desktop Composition Root

`apps/desktop` 组合：

```text
@loomrealm/game-launcher-hostra
Main/Renderer roles
Renderer Hosting/Control
DataConnectionBroker/Data WS
Content HTTP/fs
Hostra Shell/product UI
```

不要在 app重复 Hostra manifest/planner/Runner semantics。

---

## 8. PWA Composition Root

`apps/pwa` 组合：

```text
@loomrealm/game-launcher-pwa
Main/Renderer roles
Renderer Control
DataConnectionBroker/MessageChannel
Content SW/Fetch
browser product UI
```

---

## 9. Technical Adapters

`launcher-node`、transport-*、content-*仍为单一技术能力。Launcher packages可组合它们，但不反向修改其 authority。

---

## 10. Test Layout

```text
tests/fixtures
    game entries
    hostra launch manifests
    pwa launch manifests
    business Definition Modules

tests/integration
    game-package
    Runtime Control / Frame
    Subsystem SDK

tests/platform/hostra
    manifest/join/preflight
    Node Runner/supervision
    provisioning

tests/platform/pwa
    manifest/join/preflight
    Worker Runner/supervision
    provisioning/Port transfer

tests/platform/equivalence
    same logical Game/scenario, platform-specific bindings

tests/e2e
    desktop/
    pwa/
```

---

## 11. Typical Dependencies

```text
main → runtime-control / renderer-control / game-package
map → subsystem
game-launcher-hostra → game-package + subsystem/host + adapters
game-launcher-pwa → game-package + subsystem/host + adapters
apps/* → roles + matching launcher + adapters + business
```

禁止 `main → game-launcher-*`、`map → game-launcher-*`。

---

## 12. Creation Order

```text
foundation + wire
→ game-package
→ runtime-control
→ subsystem author/host + main
→ game-launcher-hostra
→ Frame Desktop vertical slice
→ renderer-control/data
→ Desktop Broker/Input/Render/Content
→ map
→ Desktop E2E
→ game-launcher-pwa
→ PWA E2E
→ cross-platform equivalence
```

---

## 13. Final Rules

1. repository layout只实现 package architecture；
2. Game common与 Platform launch config物理/逻辑分开；
3. two launcher packages各自拥有 schema/planner/resolver；
4. Runner进入统一 subsystem/host surface；
5. apps仍是完整 platform composition roots；
6. exact preflight tests显式证明 zero Runtime side effect；
7. business source无 Platform launch依赖。
