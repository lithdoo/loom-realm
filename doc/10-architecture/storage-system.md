# 存储与内容系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：只读游戏包、Subsystem Descriptor 内容边界、逻辑 Content API、内容索引、Repository、资源和路径安全  
> 依赖：[系统架构总览](./system-overview.md)、[通信系统](./communication-system.md)、[运行时启动与连接建立系统](./runtime-bootstrap-system.md)  
> 最近复核：2026-08-02

## 1. 设计目标

存储与内容系统为 Main、Subsystem 和 Renderer 提供安全、只读、按需的游戏包内容访问，同时隔离逻辑内容身份与本机物理路径。

核心结论：

> 运行时业务通过统一逻辑只读 Content API 访问 FSDB 和资源；Subsystem Launcher 是 Main 的受控启动能力，不属于 Content API，也不赋予普通 Runtime 任意文件执行能力。

## 2. 游戏包内容层次

```text
游戏包物理存储
├── Game Manifest
├── Game Entry
│   ├── initial call
│   └── Subsystem Descriptors
├── 明确声明的 Subsystem Launcher Entry
├── FSDB 数据
└── 资源主体
        ↓
安装与路径安全层
        ↓
Package Index / Content Index
        ↓
Readonly Content API
        ↓
Subsystem Repository / Renderer Resource Client
```

Game Entry 中的 Launcher Entry 属于启动描述，不通过普通 Content API 执行。

## 3. 游戏包只读原则

游戏包在运行期间仍然只读：

- Main 可以读取 Manifest、Entry 和 Subsystem Descriptor；
- Launcher 可以读取并启动 Entry 明确声明、且当前平台支持的 Subsystem Entry；
- Subsystem 和 Renderer 的普通内容访问通过只读 Content API；
- Runtime 状态、缓存和日志不写回原始游戏包；
- 任何 Launcher 都不能把游戏包升级为任意读写文件系统能力。

“允许受控启动明确声明的 JavaScript Entry”与“运行时内容只读”不冲突：前者是 Main 的启动权限，后者是游戏业务 Runtime 的内容访问边界。

## 4. 公共加载与 Bootstrap

Main 负责公共加载：

```text
读取 manifest 和 entry
→ 校验格式、版本和安装实例
→ 读取 initial call
→ 读取全部 Subsystem Descriptor
→ 校验 Launcher Profile / Entry 路径 / env
→ 建立只读 Content Grant
→ 将 Descriptor 交给 Runtime Bootstrap / Launcher
```

Main 不根据 `systemId` 猜测地图、人物或业务字段。

Subsystem Bootstrap 负责：

```text
根据 launcher.type 选择 Launcher
→ 在受控安全边界内解析 launcher.entry
→ 注入 Main 保留环境 + descriptor env
→ 启动 Process / Worker
```

详细流程由 [运行时启动与连接建立系统](./runtime-bootstrap-system.md) 定义。

## 5. Launcher 与 Content API 的职责分离

```text
Launcher
    Main 特权能力
    只处理 Game Entry 明确声明的 Subsystem 启动入口

Content API
    Runtime / Renderer 只读数据能力
    只处理 Manifest / Record / Group / Resource
```

禁止：

- Renderer 通过 Content API 请求执行脚本；
- Subsystem 通过 Content API 任意启动另一个可执行文件；
- 游戏数据字段动态拼接任意本机执行路径；
- Launcher Entry 逃逸出安装根目录；
- Descriptor env 覆盖 LoomRealm 保留环境变量。

## 6. 逻辑 Content API

运行时只使用逻辑内容身份：

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

Content API 不接受任意物理路径，不返回文件句柄、绝对路径或任意执行能力。

## 7. 平台实现

### Desktop

```text
Subsystem / Renderer
→ HTTP Fetch
→ localhost Readonly Content Service Process
→ Package Index
→ 真实只读游戏包目录

Main Launcher
→ 已校验 Subsystem Descriptor
→ 已校验 launcher.entry
→ spawn Process
```

Content Service 只监听 loopback，使用会话授权，并只允许逻辑路由的 `GET` / `HEAD`。

### PWA

```text
Subsystem Worker / Window Renderer
→ same-origin Fetch
→ Service Worker
→ Package Index
→ OPFS / Cache Storage
```

PWA Launcher 只能使用浏览器支持的 Profile，例如受控 JavaScript Worker Entry。Shell / Native Executable 明确 unsupported。

## 8. FSDB / Package Index

建议为发布和安装生成：

```text
fsdb.index.json
```

或等价 Package Index，保存：

- FSDB Namespace 与类型；
- 逻辑 Key；
- 经过校验的内部位置；
- MIME；
- 文件大小；
- `contentVersion` 或内容哈希；
- 必要 Schema / 引用元数据位置。

Launcher Entry 的校验可以使用独立安装元数据，不应把可执行入口伪装成普通业务 Resource。

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

Render State 只携带：

```text
resourceKey + contentVersion
```

Renderer Resource Client 通过 Content API 获取 MIME、版本和资源主体。图片、音频和其他资源字节不进入 Subsystem 业务消息或 Render State Tree。

不同内容版本必须使用不同缓存身份，旧字节不能覆盖新版本。

## 11. Content API 与热路径

Content API 用于：

- 会话初始化后的业务内容读取；
- 地图或场景切换；
- 菜单和其他业务内容按需加载；
- 图片、音频和其他资源加载；
- 缓存恢复和版本校验。

Content API 不进入每 Tick 热路径。Runtime Core 每帧只读取已经准备好的内存状态和不可变内容。

## 12. 路径安全

所有物理路径解析只发生在安装器、受控 Launcher 或 Content Service 内，并必须：

- 使用安装根目录相对路径；
- 规范化后仍位于安装根目录内部；
- 拒绝绝对路径、任意 URL、盘符和 UNC；
- 拒绝 `..` 越界；
- 拒绝符号链接、junction 或等价逃逸；
- 限制文件大小、记录数和递归深度；
- Content API 只允许 Index 中已声明的内容位置；
- Launcher 只允许 Descriptor 中明确声明的启动入口。

Subsystem 和 Renderer 不获得通用物理路径访问能力。

## 13. 授权和缓存

桌面 Content Grant 至少绑定：

```text
sessionId
installationId
允许的内容范围
高熵 token
expiresAt
```

Launcher 授权与 Content Grant 是两种不同能力。Launcher 的系统身份、入口和启动环境由 Main / Runtime Bootstrap 验证，不应复用 Content Bearer Token 作为进程身份。

## 14. 校验与安装

启动和完整验证是两个不同操作：

- `start` 必须校验 Manifest、Entry、Subsystem Descriptor 和当前平台需要启动的 Launcher Entry；
- `validate` 应遍历所有声明 Subsystem 的 Launcher Descriptor、必需内容和强引用；
- PWA 安装先复制到临时 OPFS 目录，完整校验后再登记为可用；
- 未完成安装不能作为运行时 `installationId` 使用；
- 原始游戏包和运行时安装副本都视为不可信输入。

## 15. 第一阶段约束

第一阶段：

```text
Desktop launcher.type
    javascript

PWA launcher.type
    javascript worker compatible profile
```

Shell、Native Executable 等只作为未来扩展方向，不属于当前第一阶段互操作保证。

第一阶段地图子系统继续使用 FSDB 保存地图、Tile、人物和资源定义。FSDB 是当前内容格式，不是所有未来 Subsystem 的强制存储接口。

## 16. 架构不变量

1. 游戏包运行期间只读；
2. Main 可以启动 Game Entry 明确声明且当前平台支持的 Subsystem Launcher；
3. 允许受控 Launcher 不等于允许任意脚本 / 文件执行；
4. Content API 只接受逻辑内容身份，不承担 Launcher 职责；
5. Launcher Entry 与普通业务 Resource 必须在能力模型上区分；
6. Renderer 和普通 Subsystem Runtime 不获得任意文件系统能力；
7. PWA 可以拒绝桌面专用 Launcher Profile；
8. Service Worker 和 Content Service 不拥有游戏运行状态；
9. Content Fetch 不进入每 Tick 热路径；
10. Render State 不携带资源字节或物理路径。

## 17. 相关下层文档

- [运行时启动与连接建立系统](./runtime-bootstrap-system.md)；
- [游戏包契约入口](../15-contracts/game-package-v1.md)：当前 v1 仍使用旧的无可执行 Subsystem 模型，待版本迁移；
- [只读 Content API v1](../15-contracts/content-api-v1.md)；
- [游戏包模块设计](../20-modules/game-package/README.md)；
- [FSDB Content Service 模块](../20-modules/fsdb-content-service/README.md)。
