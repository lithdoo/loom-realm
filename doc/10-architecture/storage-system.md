# 存储与内容系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：只读游戏包、Subsystem Descriptor 内容边界、逻辑 Content API、内容索引、Repository、资源和路径安全  
> 依赖：[系统架构总览](./system-overview.md)、[通信系统](./communication-system.md)、[运行时启动与连接建立系统](./runtime-bootstrap-system.md)  
> 正式契约：[Game Package v1 Bootstrap / Descriptor](../15-contracts/game-package-v1.md)、[Desktop Node.js Launcher Profile v1](../15-contracts/nodejs-launcher-profile-v1.md)、[Content API v1](../15-contracts/content-api-v1.md)  
> 最近复核：2026-08-09

## 1. 设计目标

存储与内容系统为 Main、Subsystem 和 Renderer 提供安全、只读、按需的游戏包内容访问，同时隔离逻辑内容身份与本机物理路径。

核心：

> 运行时业务内容通过统一逻辑只读 Content API 访问 FSDB 和资源；Subsystem Launcher 是 Main 的独立特权执行能力。Content API 不提供任意物理路径或执行能力，但 Desktop Node.js Runtime 的 OS 权限属于 Launcher trust model，不能与 Content API 能力边界混为一谈。

## 2. 游戏包内容层次

```text
Game Package
├── Manifest
├── Game Entry
│   ├── initial target
│   └── Subsystem Descriptors
├── Descriptor launcher.entry
├── FSDB data
└── resource bodies
        ↓
installation / content safety
        ↓
Package Index / Content Index
        ↓
Readonly Content API
        ↓
Subsystem Repository / Renderer Resource Client
```

Launcher Entry 属于启动描述，不通过普通 Content API 执行。

## 3. 游戏包只读原则

- Main 可以读取 Manifest、Entry 和 Subsystem Descriptor；
- Main Launcher 可以解析并启动 Entry 明确声明、且当前平台支持的 Subsystem Entry；
- Subsystem 和 Renderer 的普通业务内容访问 SHOULD 通过只读 Content API；
- Runtime 状态、缓存和日志不写回原始游戏包；
- Launcher Entry 与普通 Content Resource 使用不同能力边界。

Desktop Launcher v1 使用 `nodejs`，并把被执行的 Subsystem JavaScript 视为 trusted executable code；当前 Profile 不提供 OS sandbox。

## 4. 公共加载与 Bootstrap

```text
read manifest/entry
→ validate Game Package v1
→ read initial target + complete Subsystem Descriptor set
→ validate key / launcher / entry / env
→ install Descriptor Registry
→ hand descriptors to Runtime Bootstrap / Launcher
```

Main 不根据旧 `systemId` 或业务名称猜测地图、人物或其他业务字段。

Subsystem Bootstrap：

```text
select launcher.type
→ safely resolve launcher.entry inside Installation Root
→ create Launch Attempt / bootstrapToken
→ register Main Control authentication state
→ construct child environment / Bootstrap Context
→ spawn Host-selected Node.js, shell=false
→ Runtime Supervisor takes ownership
```

## 5. Launcher 与 Content API 分离

```text
Launcher
    Main privileged capability
    executes only Game Entry declared Subsystem entry
    creates supervised Runtime

Content API
    Runtime / Renderer logical readonly data capability
    Manifest / Record / Group / Resource only
```

禁止：

- Renderer 通过 Content API 请求执行脚本；
- Subsystem 通过 Content API 请求启动另一个 Runtime；
- Descriptor env 覆盖 LoomRealm / Node 保留字段；
- Content API 把逻辑 Key 当任意本机路径；
- 把 Launcher physical entry 当普通 Content Resource 暴露。

### `launcher.entry`

Desktop v1：

- Installation Root 相对 logical path；
- 禁止 absolute / URL / traversal / backslash；
- 路径链禁止 symlink / junction / reparse redirect；
- 最终目标是 Installation 内 regular file；
- `.mjs`=ESM，`.cjs`=CommonJS；plain `.js` 不属于 v1；
- Node executable由 Host选择；Game Package不提供 flags/argv；
- Process creation不经过 Shell。

这些属于 Launcher/Game Package contract，不从 Content API 读取能力推导执行能力。

## 6. 逻辑 Content API

业务内容使用逻辑身份：

```text
installationId
kind
namespace
key
contentVersion
```

典型能力：

```text
manifest
record(namespace, key)
group(namespace, key)
resource(namespace, key)
```

Content API 不接受任意物理路径，不返回文件句柄、绝对路径或执行能力。

## 7. 平台实现

Desktop：

```text
Subsystem / Renderer
→ localhost Readonly Content Service
→ Package Index
→ registered readonly package content

Main Launcher
→ validated Descriptor
→ ResolvedLauncherTarget
→ Node.js Launcher
→ supervised Process
```

PWA：

```text
Subsystem Worker / Window Renderer
→ same-origin Fetch
→ Service Worker
→ Package Index
→ OPFS / Cache Storage
```

PWA Launcher Descriptor 到 Worker Bootstrap 的映射尚未冻结；不得把 Desktop `nodejs` Launcher解释成 PWA contract。

## 8. FSDB / Package Index

Package Index SHOULD 保存：

- FSDB Namespace / type；
- logical key；
- validated internal content location；
- MIME；
- file size；
- `contentVersion` 或 hash；
- 必要 Schema / reference metadata。

Launcher Entry 的 executable validation属于 Launcher/Game Package边界，不伪装成普通业务 Resource。

## 9. Catalog / Repository

Catalog 保存稳定 logical ID、type、content version和 Content API location。

Repository负责：

- 构造 logical Content request；
- async fetch + parse + local schema validation；
- same-ID concurrent dedup；
- Runtime-local immutable cache；
- immutable results；
- Content error → module error mapping。

Repository不负责 Launcher、Frame Stack、User Input或 Render lifecycle。

## 10. Resource Model

Render State只携逻辑资源引用，例如：

```text
resourceKey + contentVersion
```

Renderer Resource Client通过 Content API获取 MIME/version/body。资源字节不进入 Render State或普通 System Data message。

资源访问不因 Frame suspend/close自动失效；缓存生命周期也不从 Frame Stack推导。

## 11. Hot-path Boundary

Content API用于会话初始化后的业务读取、地图/场景切换、菜单内容、资源加载和缓存恢复；不进入每 Tick 热路径。

Runtime Core每 Tick只读取已准备的内存状态与不可变内容。

## 12. 两类路径安全边界

Content path：由 Content Contract/Service定义，只解析安装登记和 Package Index允许的位置。

Launcher entry path：由 [Game Package v1](../15-contracts/game-package-v1.md) 与 [Desktop Node.js Launcher Profile v1](../15-contracts/nodejs-launcher-profile-v1.md) 定义 Installation-relative executable path、安全 containment和 module type。

```text
allowed to read != allowed to execute
```

## 13. Authorization / Cache

Desktop Content capability至少绑定：

```text
sessionId
installationId
allowed content scope
high-entropy credential
expiry if used
```

Launcher Bootstrap Credential 与 Content capability必须独立。Control `bootstrapToken`不能复用 Content bearer credential，反之亦然。

## 14. Validate / Start

- `start` MUST 校验当前启动所需 Manifest/Entry/Descriptor/Launcher约束；
- `validate` SHOULD 尽可能遍历全部 Descriptor、Launcher Entry、required content和强引用；
- Descriptor集合级错误 MUST 在任何 Runtime spawn前拒绝；
- Entry existence/type/redirect/containment MUST 在对应 spawn前确认；
- PWA安装应完整校验后再登记可用；
- 原始包和安装副本都视为不可信输入。

## 15. 第一阶段约束

```text
Desktop launcher.type       nodejs
Desktop module types        .mjs / .cjs
Desktop executable trust    trusted code; no OS sandbox claim
PWA launcher profile        not frozen
```

第一阶段地图 Subsystem继续使用 FSDB 保存地图、Tile、人物和资源定义。FSDB 是当前内容格式，不是所有未来 Subsystem 的强制存储接口。

## 16. 架构不变量

1. Game Package运行期间只读；
2. Main只启动 Game Entry明确声明且当前平台支持的 Subsystem Launcher；
3. Desktop entry必须在 Installation Root内安全解析；
4. `.mjs/.cjs`显式决定 module type；
5. Launcher Entry与普通 Resource是不同能力；
6. Content API只接受逻辑内容身份，不承担 Launcher职责；
7. Content API/Renderer不获得任意物理路径或执行能力；
8. Desktop Node.js executable code属 trusted code，当前无 OS sandbox；
9. Process creation不经过 Shell；
10. PWA Launcher mapping尚未冻结；
11. Service Worker和 Content Service不拥有游戏 Runtime state；
12. Render State不携资源字节或物理路径。

## 17. 相关文档

- [运行时启动与连接建立系统](./runtime-bootstrap-system.md)
- [Game Package v1](../15-contracts/game-package-v1.md)
- [Desktop Node.js Launcher Profile v1](../15-contracts/nodejs-launcher-profile-v1.md)
- [Readonly Content API v1](../15-contracts/content-api-v1.md)
- [Game Package 模块](../20-modules/game-package/README.md)
- [FSDB Content Service 模块](../20-modules/fsdb-content-service/README.md)
