# LoomRealm Game Package v1 Bootstrap / Descriptor Contract

> 层级：正式契约  
> 状态：Active / Normative  
> 契约版本：1  
> 稳定程度：Stabilizing  
> 主要定义：Game Entry 中 platform-neutral Subsystem Descriptor、Subsystem Definition Module identity、Descriptor 集合校验与 Session bootstrap 声明语义  
> 依赖：[运行时启动与连接建立系统](../10-architecture/runtime-bootstrap-system.md)  
> Desktop realization：[Desktop Node.js Launcher / Subsystem Runner Profile v1](./nodejs-launcher-profile-v1.md)  
> 最近复核：2026-08-19

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

> [!IMPORTANT]
> 当前 v1 仍处于产品实现前的规范收口期。本次复核直接以 breaking reset 替换此前 Desktop-only `launcher:{type:"nodejs",entry}` / `env` Descriptor；不保留兼容 alias。Game Package v1 从现在起声明 **业务 Subsystem 模块是什么**，不声明 **平台如何创建 Runtime Container**。

核心原则：

> **Game Package 声明 platform-neutral logical Subsystem topology；Platform Composition 选择 Process/Worker、Runner、Transport 与 bootstrap realization。**

---

## 1. 核心模型

Game Entry MUST 在任何业务 Subsystem Runtime 启动前一次性声明本次 Session 的完整 Subsystem 集合：

```text
Game Entry
├── initial target
└── subsystems[]
    └── SubsystemDescriptorV1
        ├── key
        └── module
```

当前 Phase 1：

```text
all declared Subsystems = eager + required
```

v1 不定义 `lazy`、optional Subsystem、首次调用时启动或一个 key 多 Runtime instance。

---

## 2. Subsystem Descriptor

Normative shape：

```ts
interface SubsystemDescriptorV1 {
  readonly key: string;
  readonly module: string;
}
```

Descriptor 只回答两件事：

```text
key
    this Subsystem is who

module
    which package-local Subsystem Definition Module implements it
```

Descriptor MUST NOT 声明：

```text
launcher.type
Node executable
Worker constructor
process argv / flags
process env
WebSocket URL
MessagePort
bootstrap token
Data endpoint / ticket
desktop/pwa switch
```

这些都是 Platform Composition / Runner / bootstrap implementation responsibility。

---

## 3. `key`

`key` 是当前 Session 中稳定的 Subsystem application identity。

要求：

- MUST 是非空字符串；
- MUST 在同一个 Game Entry 的 `subsystems[]` 中唯一；
- 比较 MUST 大小写敏感、逐字符精确；
- initial target MUST 引用已声明的 `key`；
- Main、Runtime bootstrap、Subsystem Control 与 Data authority MUST 使用同一个 `key`；
- PID、Worker ID、Launch Attempt ID、Port、URL、module path MUST NOT 代替 `key`。

显示名称、本地化标签等元数据不得成为第二身份来源。

---

## 4. `module`

`module` 是相对于当前 Installation Root / installation namespace 的 **package-relative executable logical module path**。

例如：

```json
{
  "key": "loom.map",
  "module": "subsystems/loom-map/subsystem.mjs"
}
```

它表示：

> 该模块实现一个 LoomRealm Subsystem Definition Module，可由当前 Platform 的 Subsystem Runner 加载。

它不表示：

```text
Node process argv entry
Worker URL
Content API Resource
physical filesystem path
HTTP URL
transport endpoint
```

### 4.1 Logical path syntax

`module` MUST：

1. 非空；
2. 使用 ASCII 字符；
3. 使用 `/` 作为唯一目录分隔符；
4. 不以 `/` 开头或结尾；
5. 不包含空 segment；
6. 不包含 `.` 或 `..` segment；
7. 不包含 `\\`；
8. 不包含 `:`；
9. 不包含 NUL 或控制字符；
10. UTF-8 编码长度不超过 512 bytes；
11. 以 `.mjs` 结尾。

每个 segment MUST 匹配：

```text
^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$
```

以下 MUST 拒绝：

```text
../subsystem.mjs
./subsystem.mjs
/subsystem.mjs
C:/game/subsystem.mjs
file:///subsystem.mjs
https://example/subsystem.mjs
foo\\subsystem.mjs
foo//subsystem.mjs
foo/subsystem.js
foo/subsystem.cjs
```

### 4.2 Why `.mjs`

v1 只允许 ECMAScript Module：

```text
.mjs
```

原因：同一业务 Definition Module 必须可由 Desktop Node Runner 与 PWA Worker Runner 使用一致的 ESM import/export 语义加载。

v1 不允许依赖：

```text
package.json.type
CommonJS require/module.exports
Node-only loader hooks
TypeScript runtime transpilation
Shell/shebang interpreter discovery
```

---

## 5. Subsystem Definition Module ABI

`module` 指向的 ESM MUST：

```text
load successfully
AND
have exactly one LoomRealm business entry through default export
AND
default export be a SubsystemDefinitionFactory accepted by @loomrealm/subsystem
```

概念示例：

```ts
import { defineSubsystem } from "@loomrealm/subsystem";

export default defineSubsystem(scope => ({
  async initialize() {
    // runtime-level business initialization
  },

  async frame(frame) {
    // business logic
  },

  async shutdown() {
    // bounded business cleanup
  },
}));
```

Definition Module MUST NOT 作为 module-load side effect：

```text
open WebSocket
create MessagePort/Worker
spawn process
read Hostra globals
read LoomRealm bootstrap token
start a second Runtime
probe desktop/pwa and branch business semantics
```

Platform-specific Runtime creation与 role-local Platform Ports 由 Runner / Composition 注入。

Module 的具体 TypeScript author API 由 `@loomrealm/subsystem` package design/public API 冻结；Game Package 只冻结该 default-export module boundary。

---

## 6. Module Resolution / Installation Safety

`module` 是 logical executable identity，不直接等于 physical path/URL。

每个平台 MUST 在 Runtime execution 前把它解析为受信任 installation 内的可加载目标：

```text
logical module
→ validated installation resolver
→ platform-local executable module target
→ Subsystem Runner import
```

共同要求：

```text
target exists
belongs to current validated installation
cannot escape installation namespace
cannot be replaced by unvalidated external URL/path
module bytes are from the selected installation
```

Desktop filesystem 的 symlink/junction/reparse/containment 细节由 Desktop Node.js Launcher / Runner Profile v1 冻结。

PWA 的 same-origin/module URL/installation registry resolution 属于 PWA Platform realization，但 MUST 保持相同 logical `module` identity。

Platform resolver 产生的 absolute path、file URL、blob URL、HTTP URL 都是 host-private implementation material，不得成为 Subsystem identity或普通业务 payload。

---

## 7. Descriptor Set Validation

Main / Game Package Validator MUST 在启动任何业务 Subsystem Runtime 前完成全部 Descriptor 的结构与集合级校验，至少包括：

```text
Descriptor closed schema
key validity / uniqueness
initial target reference
module syntax
module .mjs type
module logical-path bounds
```

任何上述错误发生时：

```text
MUST NOT create any business Runtime Container
```

需要访问安装存储的 existence / containment / integrity 校验 MAY 由 Game Package Validator 或 Platform executable-module resolver 执行，但 MUST 在对应 Runtime 开始加载业务模块前完成。

---

## 8. Eager / All-required Bootstrap

Phase 1：

```text
read all descriptors
→ validate complete descriptor set
→ resolve all required Subsystem modules for current Platform
→ create all required Runtime Containers through Platform Runtime Hosting
→ each Runtime loads its declared Definition Module through the Platform Runner
→ wait until all declared Subsystems are ready
→ bootstrap complete
```

Main MAY 并行启动多个 Subsystem。

任意 required Subsystem 的 module 无效、Platform 无法承载、Runtime launch 失败、module load/ABI validation 失败、Control Bootstrap 失败或无法进入 `ready`，都 MUST 使整个 Game Bootstrap 失败并进入统一 cleanup。

---

## 9. Business Configuration Boundary

旧 Descriptor `env` 从 Game Package v1 删除。

跨平台业务配置必须使用 platform-neutral mechanism，例如：

```text
Game Entry / Frame params
Readonly Content
Subsystem-owned business data
```

Platform/Runner 自己需要的环境变量、Worker options、bootstrap credentials 或 process configuration属于 Platform implementation，不能由 Game Package 业务 Descriptor任意注入。

因此业务不能依赖：

```text
process.env
Worker globals
Hostra-specific values
```

获得跨平台可移植语义。

---

## 10. Launcher / Runner 与 Content 能力分离

Subsystem Definition Module 是可执行能力，不是普通 Content API Resource。

因此：

- Renderer MUST NOT 通过 Content API执行 Definition Module；
- Subsystem MUST NOT 通过 Content API请求启动另一个 Runtime；
- Render State MUST NOT携带 module physical path/URL；
- Runtime bootstrap credential MUST NOT与 Content credential复用；
- Platform Runner MAY通过 host-private executable-module resolver加载 module，但这不扩大 ordinary Content API权限。

```text
allowed to read content
!=
allowed to execute Subsystem module
```

---

## 11. Platform Realization

同一个 Descriptor：

```json
{
  "key": "loom.map",
  "module": "subsystems/loom-map/subsystem.mjs"
}
```

Hostra Desktop MAY realize 为：

```text
Host-selected Node.js
→ Host-owned Node Subsystem Runner
→ resolve/import declared module
→ @loomrealm/subsystem host integration
```

PWA MAY realize 为：

```text
Dedicated Worker
→ PWA Worker Subsystem Runner
→ resolve/import same declared module
→ @loomrealm/subsystem host integration
```

Game Package 不存在 Desktop/PWA 两份 Descriptor，也不要求业务模块内平台分支。

---

## 12. Error Categories

Game Package v1 冻结 Descriptor/module declaration 相关错误类别：

```text
DESCRIPTOR_INVALID
DESCRIPTOR_KEY_DUPLICATE
INITIAL_TARGET_UNDECLARED
SUBSYSTEM_MODULE_INVALID
SUBSYSTEM_MODULE_NOT_FOUND
SUBSYSTEM_MODULE_TYPE_UNSUPPORTED
SUBSYSTEM_MODULE_OUTSIDE_INSTALLATION
SUBSYSTEM_MODULE_LOAD_FAILED
SUBSYSTEM_MODULE_ABI_INVALID
PLATFORM_RUNTIME_UNSUPPORTED
```

Platform-specific Runner/Hosting 可以定义更具体的 local diagnostic classification，但跨实现必须保留可映射到上述稳定语义类别。

用户可见错误不得泄露 bootstrap credential、host-private absolute path/URL 或内部 stack。

---

## 13. Trust Model

Game Package module path约束保证 Platform 只加载当前 validated installation 声明的 Subsystem Definition Module；它不自动构成 executable-code sandbox。

Hostra Desktop Node realization 中业务 module 仍是 trusted executable JavaScript；PWA Worker isolation提供不同物理能力边界。

```text
safe module resolution
!=
sandboxed business code
```

Publisher Trust、签名、第三方不可信 executable sandbox 属于后续能力。

---

## 14. Deferred

v1 当前不定义：

```text
lazy / optional Subsystem
multiple Runtime instances per key
remote Subsystem
runtime implementation negotiation
multiple alternative modules per platform
business-supplied process env/argv/flags
CommonJS Subsystem Definition Module
runtime TypeScript transpilation
untrusted executable sandbox
Game Package signing / Publisher Trust
remote executable module URL
```

如果新平台不能加载同一 Definition Module ABI，应重新评估 Platform Runner boundary；不得把 platform-specific launcher字段重新塞回业务 Descriptor。

---

## 15. Conformance Requirements

至少 MUST 覆盖：

```text
duplicate key
undeclared initial target
closed descriptor schema
missing/empty module
absolute / traversal / URL / backslash module
valid .mjs module
.js/.cjs rejection
module not found
module outside installation
module default export missing/invalid
complete descriptor-set failure has zero Runtime side effects
same descriptor/module is accepted by Hostra and PWA module resolvers
business module contains no required platform bootstrap surface
```

---

## 16. Core Invariants

1. Game Entry一次性声明当前 Session完整 required Subsystem topology；
2. `descriptor.key` 是 application Runtime identity；
3. Descriptor v1只有 `key + module`；
4. `module` 是 platform-neutral package-local ESM Definition Module identity，不是 process/Worker entry；
5. Definition Module固定 `.mjs` + default `SubsystemDefinitionFactory`；
6. Game Package不声明 Node/Worker/WebSocket/MessagePort/env；
7. Platform Runtime Hosting选择物理 Runtime Container；
8. Platform Runner加载同一 Definition Module并注入 role-local Platform Ports；
9. Hostra/PWA使用同一业务 Descriptor和同一 Definition Module ABI；
10. module executable capability与 ordinary Content capability分离；
11. Descriptor集合级失败在业务 Runtime side effect前收敛；
12. safe module resolution不等于 executable sandbox。
