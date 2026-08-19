# 游戏包与内容模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Manifest / Entry / Descriptor Loader、Subsystem Definition Module 校验、Catalog、Repository、资源和 Validator 的模块边界  
> 依赖：[存储与内容系统](../../10-architecture/storage-system.md)、[Game Package v1](../../15-contracts/game-package-v1.md)  
> Desktop realization：[Desktop Node.js Launcher / Runner Profile v1](../../15-contracts/nodejs-launcher-profile-v1.md)  
> 最近复核：2026-08-19

## 1. 建议模块

```text
Game Package
├── Safe Package Root / Installation Namespace
├── Manifest Loader
├── Entry Loader
├── Subsystem Descriptor Loader / Validator
├── Definition Module Resolver Interface
├── Catalog Builder
├── Repository Toolkit
├── Resource Metadata Service
└── Package Validator
```

Game Package模块不创建 Process/Worker，不打开 Control/Data连接，也不选择 Desktop/PWA Runner。

---

## 2. Descriptor Model

Game Package v1：

```ts
interface SubsystemDescriptorV1 {
  readonly key: string;
  readonly module: string;
}
```

其中：

```text
key
    application Subsystem identity

module
    package-local .mjs Subsystem Definition Module
```

旧的：

```text
launcher.type
launcher.entry
env
```

已从 Game Package v1 删除。

---

## 3. Descriptor Validator

负责：

```text
closed Descriptor schema
key validity / uniqueness
initial target reference
module logical-path syntax
module .mjs requirement
module length/segment bounds
```

Descriptor集合级校验 MUST在任何 business Runtime side effect前完成。

不负责：

```text
Node executable
Worker constructor
Process env/argv
Runtime bootstrap token
Control/Data carrier
```

---

## 4. Definition Module Resolution

Game Package只拥有 logical module identity；具体 Platform resolver把它映射到当前 installation中的 executable module target。

共同边界：

```text
logical descriptor.module
→ validated installation resolver
→ current installation executable target
→ Platform Subsystem Runner imports module
```

Desktop resolver处理 filesystem containment/symlink/reparse safety；PWA resolver处理 same-origin/installation registry/module URL安全。

absolute path/URL只允许存在于 host-private realization，不进入 Descriptor或业务状态。

---

## 5. Subsystem Definition Module ABI

模块必须是 `.mjs` ESM，并 default export `@loomrealm/subsystem` 可接受的 `SubsystemDefinitionFactory`。

业务 module 不应该有 module-load platform side effect：

```text
no WebSocket
no MessagePort
no Worker/process creation
no Hostra bootstrap
no platform detection business branch
```

Module load/default-export validation由 Platform Runner + `@loomrealm/subsystem` host integration完成。

---

## 6. Safe Package Root / Installation Namespace

安全模块解析与普通 Content path policy是不同能力：

```text
Executable Module Resolver
    may load declared business executable module

Readonly Content API
    reads logical content only
```

可以复用底层安全路径/installation primitive，但不得因为 module可执行就扩大 Content客户端权限。

---

## 7. Manifest / Entry Loader

Manifest Loader负责读取/校验 Manifest公共字段。

Entry Loader负责：

```text
initial target
complete subsystems[]
business initial params
```

Entry Loader不解释 map/battle等业务字段，不创建 Runtime。

---

## 8. Catalog / Repository

Catalog建立 logical ID → validated content location index；Repository提供 async readonly fetch、parse/local validation、same-ID concurrent dedup、immutable cache、close/cancel。

这些能力不承担 Subsystem executable module resolution。

---

## 9. Resource Metadata

只处理 logical resource metadata、MIME、Content Version、Package Index。资源 body由 Content API交付。

Render State只携 logical resource reference，不携 physical module/content path。

---

## 10. Package Validator

```text
Manifest / Entry
→ Descriptor closed schema
→ duplicate key
→ initial target references
→ Definition Module syntax/type
→ current Platform module resolution safety
→ required content references
→ Catalog / Package Index
```

`validate` SHOULD尽量在 Session前验证所有 required modules/content。

任何 Descriptor集合级错误都必须零 Runtime side effect。

---

## 11. Cross-platform Boundary

同一：

```json
{
  "key": "loom.map",
  "module": "subsystems/loom-map/subsystem.mjs"
}
```

同时供：

```text
Hostra Desktop Node Subsystem Runner
PWA DedicatedWorker Subsystem Runner
```

使用。

Game Package不维护 Desktop/PWA两套业务 Descriptor。

---

## 12. Trust Boundary

```text
validated module path
!= executable sandbox
```

Desktop Node业务 module仍属于 trusted executable code；PWA Worker有不同物理隔离。签名/Publisher Trust/untrusted sandbox不在 Phase 1。

---

## 13. Tests

至少覆盖：

```text
manifest/entry valid-invalid
duplicate descriptor key
undeclared initial target
closed descriptor schema
absolute/traversal/url/backslash module
valid .mjs module
.js/.cjs rejection
module missing/outside installation
invalid/missing default export
same descriptor resolves under Desktop/PWA fixture
catalog does not eagerly read large bodies
repository concurrent dedup
validate aggregates errors
descriptor-set failure has zero Runtime side effects
```

---

## 14. Core Invariants

- Game Entry一次性声明完整 Subsystem Descriptor set；
- Descriptor identity=`key`；
- Descriptor v1=`key + module`；
- `module`是 platform-neutral package-local `.mjs` Definition Module；
- Game Package不声明 Node/Worker/env/argv/transport；
- Definition Module与 Runtime Runner分离；
- Module executable capability与 Content capability分离；
- physical target不进入业务协议；
- current Platform必须在 Runtime执行前验证 module属于当前 installation；
- same Descriptor/module应可供 Hostra/PWA realization使用。
