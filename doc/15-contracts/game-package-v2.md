# LoomRealm Game Package v2 Bootstrap / Descriptor Contract

> 层级：正式契约  
> 状态：Active / Normative  
> 契约版本：2  
> 稳定程度：Frozen for Desktop Bootstrap  
> 主要定义：当前 Game Entry 中 Subsystem Descriptor、Descriptor 集合校验与 Desktop Bootstrap 所需的声明语义  
> 依赖：[运行时启动与连接建立系统](../10-architecture/runtime-bootstrap-system.md)、[Desktop Node.js Launcher Profile v1](./nodejs-launcher-profile-v1.md)  
> 最近复核：2026-08-03

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

本文只冻结第一阶段 **Subsystem Bootstrap 所需的 Game Package v2 边界**。Manifest 的其他产品元数据、未来安装签名、PWA Launcher 映射等不属于本文范围。

## 1. 核心模型

Game Entry MUST 在任何业务 Subsystem 启动前一次性声明本次会话的完整 Subsystem 集合：

```text
Game Entry
├── initial target
└── subsystems[]
    └── SubsystemDescriptor
        ├── key
        ├── launcher
        │   ├── type
        │   └── entry
        └── env?
```

当前 Desktop MVP：

```text
all declared Subsystems = eager + required
```

MVP 不定义 `lazy`、optional Subsystem 或首次调用时启动。

## 2. Subsystem Descriptor

Normative TypeScript 形状：

```ts
interface SubsystemDescriptor {
  readonly key: string;
  readonly launcher: NodejsLauncherDescriptor;
  readonly env?: Readonly<Record<string, string>>;
}

interface NodejsLauncherDescriptor {
  readonly type: "nodejs";
  readonly entry: string;
}
```

Descriptor MUST NOT 使用额外的 `id` 或 `name` 作为运行身份来源。显示名称、本地化标签等未来元数据 MUST NOT 改变 `key` 的协议身份。

## 3. `key`

`key` 是当前会话中的稳定 Subsystem identity。

要求：

- MUST 是非空字符串；
- MUST 在同一个 Game Entry 的 `subsystems[]` 中唯一；
- 比较 MUST 大小写敏感、逐字符精确；
- initial target MUST 引用已声明的 `key`；
- Main、Launcher 与 Control Bootstrap MUST 使用同一个 `key`；
- PID、Process Handle、Launch Attempt ID、端口号 MUST NOT 代替 `key`。

第一阶段不进一步冻结显示元数据或本地化命名规则。

## 4. Launcher Type

Desktop v1 唯一支持：

```text
launcher.type = "nodejs"
```

出现任何其他 Launcher Type 时，当前 Desktop Host MUST 以 `LAUNCHER_TYPE_UNSUPPORTED` 拒绝该 Game Bootstrap。

当前 MVP 不允许把 unsupported Subsystem 降级成 unavailable 后继续会话。

## 5. `launcher.entry`

`launcher.entry` 是相对于当前 Installation Root 的 package-relative executable logical path。

例如：

```json
{
  "key": "loom.map",
  "launcher": {
    "type": "nodejs",
    "entry": "subsystems/loom-map/main.mjs"
  }
}
```

### 5.1 语法

`entry` MUST：

1. 非空；
2. 使用 ASCII 字符；
3. 使用 `/` 作为唯一目录分隔符；
4. 不以 `/` 开头或结尾；
5. 不包含空 segment；
6. 不包含 `.` 或 `..` segment；
7. 不包含 `\\`；
8. 不包含 `:`；
9. 不包含 NUL 或控制字符；
10. UTF-8 编码长度不超过 512 bytes。

每个 segment MUST 匹配：

```text
^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$
```

以下形式 MUST 被拒绝：

```text
../main.mjs
./main.mjs
/main.mjs
C:/game/main.mjs
file:///main.mjs
https://example/main.mjs
foo\\main.mjs
foo//main.mjs
```

### 5.2 文件类型

Desktop Node.js Profile v1 只接受：

```text
.js
.mjs
.cjs
```

最终目标 MUST 存在且为 regular file。

Launcher 不执行 TypeScript 转译、Shell 包装、shebang interpreter discovery 或其他隐式编译步骤。

### 5.3 文件系统安全

从 Installation Root 到最终 Entry 的路径链中 MUST NOT 出现 symbolic link、junction、reparse-point redirect 或平台等价的路径重定向对象。

最终 canonical target MUST 位于 Installation Root 内。简单字符串前缀比较不足以满足此要求。

安装/校验阶段 MUST 拒绝可执行 namespace 中仅大小写不同的路径冲突，避免跨平台解析差异。

具体解析算法与 Process Spawn 行为由 [Desktop Node.js Launcher Profile v1](./nodejs-launcher-profile-v1.md) 冻结。

## 6. Descriptor `env`

`env` 是 Game Package 声明的额外启动环境，不是 Main 父进程环境的继承请求。

限制：

```text
最多 64 项
总 UTF-8 大小 <= 32 KiB
```

Key MUST 匹配：

```text
^[A-Za-z_][A-Za-z0-9_]{0,127}$
```

Value：

- MUST 是 string；
- MUST NOT 含 NUL；
- UTF-8 大小 MUST <= 4096 bytes。

Descriptor MUST NOT 声明：

```text
LOOMREALM_*
NODE_OPTIONS
NODE_PATH
```

Windows Host MUST 额外检测环境变量 Key 的 ASCII case-insensitive collision。

保留字段冲突 MUST 产生 `LAUNCH_ENV_RESERVED` 并使 Game Bootstrap 失败。

## 7. 完整 Descriptor 集合校验

Main MUST 在启动任何业务 Subsystem 前完成全部 Descriptor 的结构与集合级校验，至少包括：

```text
Descriptor Schema
key uniqueness
initial target reference
Launcher Type support
launcher.entry syntax
Descriptor env syntax
reserved env collision
```

任何上述错误发生时：

```text
MUST NOT spawn any business Subsystem Process
```

需要访问文件系统的 Entry existence / regular-file / symlink / containment 校验可以由 Game Package Validator 或 Launcher Target Resolver 执行，但 MUST 在对应 Subsystem Process spawn 前完成。

## 8. Eager / All-required Bootstrap

Desktop MVP：

```text
read all descriptors
→ validate complete descriptor set
→ resolve all required launcher targets
→ start all declared subsystems
→ wait until all declared subsystems are ready
→ bootstrap complete
```

Main MAY 并行启动多个 Subsystem。

任意 required Subsystem：

- Launcher Target 无效；
- spawn 失败；
- 无法建立 Control Bootstrap；
- 无法进入 `ready`；

都 MUST 使整个 Game Bootstrap 失败，并进入统一清理流程。

## 9. Launcher 与 Content 能力分离

Launcher Entry 是 Main 的特权可执行入口，不是普通 Content API Resource。

因此：

- Renderer MUST NOT 通过 Content API 执行 Launcher Entry；
- Subsystem MUST NOT 通过 Content API 请求启动另一个 Runtime；
- Render State MUST NOT 携带 Entry 的物理路径；
- Bootstrap Credential MUST NOT 与 Content Grant 复用。

## 10. Trust Model

Desktop `nodejs` Profile 中，被 Launcher 执行的 Subsystem JavaScript 属于 **trusted executable code**。

Game Package v2 的路径约束只保证 Main 不会把 `launcher.entry` 解释成任意宿主路径；它不构成 Node.js OS sandbox。

因此：

```text
safe launcher.entry != sandboxed Node.js code
```

第三方不可信可执行代码 Sandbox、权限 Broker、签名与 Publisher Trust 均为暂缓能力。

## 11. 错误类别

本契约冻结与 Descriptor / Entry 声明相关的机器可识别错误类别：

```text
DESCRIPTOR_INVALID
DESCRIPTOR_KEY_DUPLICATE
INITIAL_TARGET_UNDECLARED
LAUNCHER_TYPE_UNSUPPORTED
LAUNCH_ENTRY_INVALID
LAUNCH_ENTRY_NOT_FOUND
LAUNCH_ENTRY_TYPE_UNSUPPORTED
LAUNCH_ENTRY_REDIRECTED
LAUNCH_ENTRY_OUTSIDE_INSTALLATION
LAUNCH_ENV_INVALID
LAUNCH_ENV_RESERVED
```

具体 Host API Error Envelope 可以由调用层统一承载，但实现 MUST 保留上述稳定语义类别。

## 12. 暂缓项

以下内容不属于当前冻结范围，当前实现 MUST NOT 自行引入隐式语义：

- PWA Descriptor → Worker Script Profile；
- 第二种 Launcher Type；
- `lazy` / optional Subsystem；
- 一个 `key` 多 Runtime instance；
- remote Subsystem；
- Game-supplied Node executable / Node flags / argv；
- 不可信 executable code Sandbox；
- Game Package 签名 / Publisher Trust；
- executable integrity/signature verification；
- ZIP / ASAR / remote package 执行 Profile。

## 13. Conformance Requirements

至少 MUST 覆盖：

- duplicate key；
- undeclared initial target；
- unsupported Launcher；
- absolute / parent traversal / URL / backslash Entry；
- missing / directory / unsupported-extension Entry；
- symlink Entry 与 symlink ancestor；
- Installation Root escape；
- case-collision；
- `LOOMREALM_*` / `NODE_OPTIONS` / `NODE_PATH` env；
- invalid env key/value；
- Descriptor 集合校验失败时零 Process side effect。

## 14. 核心不变量

```text
Game Entry declares complete Subsystem topology.
Descriptor key is the runtime identity.
Desktop v1 Launcher is nodejs only.
All declared Subsystems are eager and required.
launcher.entry is Installation-relative and path-safe.
Descriptor env cannot alter LoomRealm or Node bootstrap semantics.
Launcher capability is distinct from Content capability.
Safe Entry resolution does not imply Node.js sandboxing.
```
