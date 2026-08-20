# 游戏包模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Game Entry Loader/Validator、logical Subsystem topology、initial target/input、Catalog/Repository 与 Platform Launcher 的连接边界  
> 依赖：[Game Package v1](../../15-contracts/game-package-v1.md)、[存储与内容系统](../../10-architecture/storage-system.md)  
> 最近复核：2026-08-20

## 1. 模块定位

```text
Game Package
├── Game Entry Loader
├── Logical Topology Validator
├── Catalog Builder
├── Repository Toolkit
├── Resource Metadata Service
└── Package/Common Validator
```

Game Package不再拥有 executable Definition Module resolver。

---

## 2. Game Entry Model

```ts
interface GameEntryV1 {
  readonly formatVersion: 1;
  readonly initial: {
    readonly subsystem: string;
    readonly input: JsonValue;
  };
  readonly subsystems: readonly {
    readonly key: string;
  }[];
}
```

Descriptor v1精确只有 `{key}`。

---

## 3. Validator

负责：

```text
closed Game Entry/initial/descriptor schema
formatVersion
JsonValue initial input
key validity/uniqueness
initial target reference
```

不负责：

```text
module path
Hostra/PWA manifest
Definition Module ABI
Node/Worker
Runtime bootstrap
```

Game common validation是 pure/deterministic，零 Runtime side effect。

---

## 4. Platform Launch Boundary

输出：

```text
ValidatedGameEntryV1
```

随后：

```text
Hostra launcher + launch.hostra.json
    OR
PWA launcher + launch.pwa.json
```

执行 exact key-set join与 executable resolution。

Game Package不提供“统一 launcher option bag”。

---

## 5. Installation / Content

Game Package与 Content subsystem仍可以处理 Catalog/Repository/Resource metadata，但 ordinary Content capability 与 Platform executable capability严格分离。

```text
Game logical topology
!= Platform executable binding
!= ordinary Content resource
```

---

## 6. Package Validator Closure

完整 Session preflight由 Platform Composition协调：

```text
Game common validation
→ Platform manifest validation
→ exact key join
→ executable resolution
→ PlatformLaunchPlan
```

Game Package本身只对 common portion负责，不跨层执行 Platform resolver。

---

## 7. Tests

```text
valid/invalid game entry
closed schema
formatVersion
initial input JsonValue
empty/duplicate key
undeclared initial target
module/launcher/env rejected
no I/O/runtime side effect
same validated Game Entry feeds Hostra/PWA planners
catalog/repository ordinary content behavior
```

---

## 8. Core Invariants

- Game Package只拥有 logical topology与 initial business input；
- Descriptor v1=`{key}`；
- module/executable authority属于 Platform Launcher；
- Game Package不创建 Process/Worker或打开 Control/Data；
- common validator不理解 Hostra/PWA；
- executable capability与 Content capability分离；
- Platform exact-set/preflight失败在任何 business Runtime side effect前收敛。
