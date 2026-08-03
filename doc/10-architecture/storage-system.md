# 存储与内容系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：只读游戏包、Subsystem Descriptor 内容边界、逻辑 Content API、内容索引、Repository、资源和路径安全  
> 依赖：[系统架构总览](./system-overview.md)、[通信系统](./communication-system.md)、[运行时启动与连接建立系统](./runtime-bootstrap-system.md)  
> 正式契约：[Game Package v2 Bootstrap / Descriptor](../15-contracts/game-package-v2.md)、[Desktop Node.js Launcher Profile v1](../15-contracts/nodejs-launcher-profile-v1.md)、[Content API v1](../15-contracts/content-api-v1.md)  
> 最近复核：2026-08-03

## 1. 设计目标

存储与内容系统为 Main、Subsystem 和 Renderer 提供安全、只读、按需的游戏包内容访问，同时隔离逻辑内容身份与本机物理路径。

核心结论：

> 运行时业务内容通过统一逻辑只读 Content API 访问 FSDB 和资源；Subsystem Launcher 是 Main 的独立特权执行能力。Content API 不提供任意物理路径或执行能力，但 Desktop Node.js Runtime 的 OS 权限属于 Launcher trust model，不能与 Content API 能力边界混为一谈。

## 2. 游戏包内容层次

```text
游戏包物理存储
├── Game Manifest
├── Game Entry
│   ├── initial target
│   └── Subsystem Descriptors
├── Descriptor 声明的 Launcher Entry
├── FSDB 数据
└── 资源主体
        ↓
安装 / 内容安全层
        ↓
Package Index / Content Index
        ↓
Readonly Content API
        ↓
Subsystem Repository / Renderer Resource Client
```

Launcher Entry 属于启动描述，不通过普通 Content API 执行。

## 3. 游戏包只读原则

游戏包在运行期间保持只读：

- Main 可以读取 Manifest、Entry 和 Subsystem Descriptor；
- Main Launcher 可以解析并启动 Entry 明确声明、且当前平台支持的 Subsystem Entry；
- Subsystem 和 Renderer 的普通业务内容访问 SHOULD 通过只读 Content API；
- Runtime 状态、缓存和日志不写回原始游戏包；
- Launcher Entry 与普通 Content Resource 使用不同能力边界。

Desktop v1 受控 Launcher Type 为 `nodejs`。

注意：Desktop Node.js Profile 把被执行的 Subsystem JavaScript 视为 trusted executable code；当前 Profile 不提供 OS sandbox。因此“Content API 不暴露任意物理路径”不能被解释成“Node Process 在 OS 层没有文件系统、网络或子进程能力”。

## 4. 公共加载与 Bootstrap

Main 公共加载：

```text
读取 manifest 和 entry
→ 校验格式、版本和安装实例
→ 读取 initial target
→ 读取全部 Subsystem Descriptor
→ 校验 Descriptor 公共结构、key 唯一、launcher.type、entry 语法、env 保留字段
→ 建立 Descriptor Registry
→ 将 Descriptor 交给 Runtime Bootstrap / Launcher
```

Main 不根据旧 `systemId` 或业务名称猜测地图、人物或其他业务字段。

Subsystem Bootstrap：

```text
根据 launcher.type 选择 Launcher
→ 安全解析 launcher.entry 到 Installation Root 内 regular file
→ 创建 Launch Attempt / Bootstrap Token
→ 在 Main Control authentication state 注册 Token
→ 显式构造 child environment / Bootstrap Context
→ 使用 Host-selected Node.js，shell=false，spawn Process
→ Runtime Supervisor 接管
```

详细规则见 [Desktop Node.js Launcher Profile v1](../15-contracts/nodejs-launcher-profile-v1.md)。

## 5. Launcher 与 Content API 的职责分离

```text
Launcher
    Main 特权能力
    只处理 Game Entry 明确声明的 Subsystem executable Entry
    产生受监督 Runtime Process

Content API
    Runtime / Renderer 逻辑只读数据能力
    只处理 Manifest / Record / Group / Resource
```

禁止：

- Renderer 通过 Content API 请求执行脚本；
- Subsystem 通过 Content API 请求启动另一个 Runtime；
- Descriptor env 覆盖 LoomRealm / Node 保留启动字段；
- Content API 把逻辑 Key 当任意本机路径解释；
- 把 Launcher 的物理 Entry path 当普通 Content Resource 暴露。

### 5.1 `launcher.entry` 已冻结边界

Desktop v1：

- Entry 是 Installation Root 相对的 package logical path；
- 禁止 absolute / URL / traversal / backslash 等路径形式；
- 路径链禁止 symlink / junction / reparse redirect；
- 最终目标必须位于 Installation Root 内且为 regular file；
- 当前只接受 `.js` / `.mjs` / `.cjs`；
- Node executable 由 Host 选择，Game Package 不提供 Node flags / argv；
- Process creation 不经过 Shell。

这些规则属于 Launcher Contract，不复用普通 Content API 的路径解析算法作为隐式实现。

## 6. 逻辑 Content API

运行时业务内容使用逻辑内容身份：

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

### Desktop

```text
Subsystem / Renderer
→ HTTP Fetch
→ localhost Readonly Content Service
→ Package Index
→ 已登记只读游戏包内容

Main Launcher
→ validated Subsystem Descriptor
→ ResolvedLauncherTarget
→ Node.js Launcher
→ supervised Process
```

Desktop Content Service 只监听 loopback，并只允许 Content API 的逻辑路由。

### PWA

```text
Subsystem Worker / Window Renderer
→ same-origin Fetch
→ Service Worker
→ Package Index
→ OPFS / Cache Storage
```

PWA Launcher Descriptor 到 Worker Bootstrap 的映射尚未冻结。不得把 Desktop `nodejs` Launcher 直接解释为 PWA wire contract。

## 8. FSDB / Package Index

建议为发布和安装生成 `fsdb.index.json` 或等价 Package Index，保存：

- FSDB Namespace 与类型；
- 逻辑 Key；
- 经过校验的内部内容位置；
- MIME；
- 文件大小；
- `contentVersion` 或内容哈希；
- 必要 Schema / 引用元数据位置。

Launcher Entry 的可执行入口校验属于 Launcher / Game Package 安全边界，不应把可执行入口伪装成普通业务 Resource。

## 9. Catalog 与 Repository

Catalog 是轻量内容目录，保存稳定逻辑 ID、类型、内容版本和 Content API 定位信息。

Repository 是 Subsystem 内部按需内容访问边界，负责：

- 通过 Catalog 构造逻辑 Content 请求；
- 异步 Fetch、解析和局部 Schema 校验；
- 同 ID 并发请求去重；
- Container 内不可变缓存；
- 返回不可变结果；
- 将 Content API 错误转换为模块错误。

Repository 不负责 Process Launcher、Frame Stack、User Input 或 Render 生命周期。

## 10. 资源模型

Render State 只携带逻辑资源引用，例如：

```text
resourceKey + contentVersion
```

Renderer Resource Client 通过 Content API 获取 MIME、版本和资源主体。图片、音频和其他资源字节不进入 Render State 或普通 System Data 消息。

资源访问不因 Frame suspend / close 自动失效。资源缓存生命周期和业务 Render 生命周期也不能从 Frame Stack 推导。

## 11. Content API 与热路径

Content API 用于会话初始化后的业务内容读取、地图/场景切换、菜单内容加载、资源加载以及缓存恢复。

Content API 不进入每 Tick 热路径。Runtime Core 每 Tick 只读取已经准备好的内存状态和不可变内容。

## 12. 两类路径安全边界

### Content path

由 Content Contract / Content Service 定义：

- URL 参数不能直接拼接物理路径；
- Content Service 只解析安装登记和 Package Index 允许的位置；
- Renderer 只获得逻辑资源能力。

### Launcher Entry path

由 Game Package v2 / Desktop Node.js Launcher Profile 定义：

- Installation-relative executable logical path；
- 禁止路径逃逸和文件系统 redirect；
- 解析结果是 Main 私有 `ResolvedLauncherTarget`；
- 物理 Entry 不进入业务协议。

两类路径具有相似安全目标，但能力完全不同，不能共享“允许读取 = 允许执行”的隐式规则。

## 13. 授权和缓存

Desktop Content Grant 至少绑定：

```text
sessionId
installationId
允许的内容范围
高熵 token
expiresAt
```

Launcher Bootstrap Credential 与 Content Grant 是不同能力。Control `bootstrapToken` 不应复用 Content Bearer Token；Content Token 也不能代替 Subsystem identity。

## 14. 校验与安装

`start` 与 `validate` 是不同操作：

- `start` MUST 校验当前启动所需的 Manifest / Entry / Descriptor 与冻结的 Launcher Entry/env 约束；
- `validate` SHOULD 尽可能遍历全部声明 Descriptor、Launcher Entry、必需内容和强引用；
- Descriptor 集合级错误 MUST 在任何业务 Process spawn 前被拒绝；
- Entry existence / regular-file / redirect / containment 校验 MUST 在对应 Process spawn 前完成；
- PWA 安装应先进入临时位置，完整校验后再登记为可用；
- 原始游戏包和安装副本都视为不可信输入。

## 15. 第一阶段约束

```text
Desktop launcher.type
    nodejs

Desktop executable trust
    trusted code; no OS sandbox claim

PWA launcher profile
    尚未冻结
```

MVP 不预定义 Shell、Native Executable、Deno、Bun 等 Launcher Type，也不定义自动 Runtime restart。

第一阶段地图子系统继续使用 FSDB 保存地图、Tile、人物和资源定义。FSDB 是当前内容格式，不是所有未来 Subsystem 的强制存储接口。

## 16. 架构不变量

1. 游戏包运行期间只读；
2. Main 只能启动 Game Entry 明确声明且当前平台支持的 Subsystem Launcher；
3. Desktop Entry 必须在 Installation Root 内安全解析；
4. Launcher Entry 与普通业务 Resource 是不同能力；
5. Content API 只接受逻辑内容身份，不承担 Launcher 职责；
6. Content API / Renderer 不获得任意物理文件路径或执行能力；
7. Desktop Node.js Subsystem executable code 属于 trusted code，当前不提供 OS sandbox；
8. Desktop v1 Launcher Type 是 `nodejs`，Process creation 不经过 Shell；
9. PWA Launcher 映射尚未冻结；
10. Service Worker 和 Content Service 不拥有游戏运行状态；
11. Render State 不携带资源字节或物理路径。

## 17. 相关文档

- [运行时启动与连接建立系统](./runtime-bootstrap-system.md)；
- [Game Package v2 Bootstrap / Descriptor Contract](../15-contracts/game-package-v2.md)；
- [Desktop Node.js Launcher Profile v1](../15-contracts/nodejs-launcher-profile-v1.md)；
- [游戏包契约 v1](../15-contracts/game-package-v1.md)：Legacy；
- [只读 Content API v1](../15-contracts/content-api-v1.md)；
- [游戏包模块设计](../20-modules/game-package/README.md)；
- [FSDB Content Service 模块](../20-modules/fsdb-content-service/README.md)。
