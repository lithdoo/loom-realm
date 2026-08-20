# `loom.map` 地图 Subsystem 模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Phase 1 地图 Subsystem business definition；作为 `@loomrealm/subsystem` 的普通 platform-neutral author consumer  
> 依赖：[Subsystem 模型](../../10-architecture/subsystem-model.md)、[User Input v1](../../15-contracts/user-input-v1.md)、[Render Update v1](../../15-contracts/render-update-v1.md)  
> 最近复核：2026-08-20

核心原则：

> **`loom.map` 只实现地图业务。它不读取 Game/Platform launch config，不包含 Runtime/Transport mechanics；Hostra/PWA launchers各自选择满足同一 SubsystemDefinitionFactory ABI的 build artifact。**

---

## 1. Business Shape

```text
loom.map source
├── SubsystemDefinitionFactory
├── Runtime-level business state
├── Frame handlers/coordinators
├── Catalog/Repositories
├── World state
├── Input consumers
├── Render projectors
└── Pokémon Essentials compatibility compiler
```

不实现 Control/Data carrier、JSON-RPC、Activation bookkeeping、Platform provisioning、WebSocket/MessagePort、Process/Worker bootstrap。

---

## 2. Definition ABI

```ts
import { defineSubsystem, completed } from "@loomrealm/subsystem";

export default defineSubsystem(scope => ({
  async initialize() {},
  async frame(frame) {
    return completed(null);
  },
  async shutdown() {},
}));
```

Hostra/PWA platform bindings MAY都指向同一构建 artifact，也 MAY指向不同 platform build artifact；两者必须保持同一 author API与 observable business semantics。

Game Entry只声明：

```json
{ "key": "loom.map" }
```

---

## 3. Frame / Outcome

业务参数来自 `frame.params`。Handler显式返回 `completed/cancelled/failed`。

Child completed/cancelled/failed正常 resolve `frame.call()`；仅明确 pre-commit recoverable call rejection可 catch并继续 current Activation。Runtime-fatal/ambiguous绝不重新进入 map continuation。

---

## 4. Input / Render / Content

InputListener由 SDK处理 Frame owner、Interest aggregation、Activation/mutation/current Data gate和 reconnect republish。

RenderDomain由 SDK处理 protocol domainId、registry/snapshot/patch/event与 fresh-carrier baseline。Frame close/suspend/Data retire不自动销毁 authoritative Domain。

地图只通过 logical `ContentClient`读取 maps/tilesets/resources，不知道 Desktop HTTP/filesystem或 PWA Fetch/SW/OPFS。

---

## 5. Platform Independence

依赖固定：

```text
@loomrealm/map → @loomrealm/subsystem
```

禁止：

```text
read launch.hostra.json / launch.pwa.json
@loomrealm/subsystem/host
transport-websocket/messageport
game-launcher-hostra/pwa
Hostra/Worker APIs
```

若确实需要不同 bundling/packaging，由 build + Platform Launch Manifest解决，而不是在业务语义中 `if (platform)`。

---

## 6. Cross-platform Test

同一 logical scenario必须比较：

```text
Frame outcomes/calls
business world state
Input logical delivery
Render authoritative state
Content logical results
failure/reconnect behavior
```

不比较具体 module file path/bytes。

---

## 7. Final Goal

> **`loom.map` 证明业务 portability来自稳定 author contract和 observable semantics，而不是来自 Game Package强制两个物理平台加载同一个文件路径。**
