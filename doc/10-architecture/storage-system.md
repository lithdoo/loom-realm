# 存储与内容系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：只读游戏包、逻辑 Content API、内容索引、Repository、资源和路径安全  
> 依赖：[系统架构总览](./system-overview.md)、[通信系统](./communication-system.md)  
> 最近复核：2026-08-01

## 1. 设计目标

存储与内容系统为程序主系统、模块子系统和渲染端提供安全、只读、按需的静态内容访问，同时隔离逻辑内容身份与本机物理路径。

核心结论：

> 运行时通过统一的逻辑只读 Content API 访问 FSDB 和资源；桌面由 localhost HTTP 服务实现，PWA 由 Service Worker 和 OPFS 实现。

## 2. 内容层次

```text
游戏包物理存储
├── 游戏清单
├── 入口文件
├── FSDB 数据
└── 资源主体
        ↓
安装与路径安全层
        ↓
fsdb.index.json / Package Index
        ↓
Readonly Content API
        ↓
模块 Repository / Renderer Resource Client
        ↓
不可变业务内容 / 解码后的资源
```

## 3. 游戏包

第一阶段游戏包是普通只读目录或其受控安装副本：

- 根目录存在统一游戏清单；
- 清单引用唯一入口文件；
- 入口指定初始子系统和 JSON 参数；
- 所有物理路径必须限制在包内；
- 不执行包内脚本或本机二进制；
- 运行状态、缓存和日志不写回原始游戏包。

PWA 可以将经过验证的游戏包复制到 OPFS；该安装副本在运行阶段仍通过只读能力暴露。

## 4. 公共加载与业务加载

程序主系统只负责公共加载：

```text
读取 manifest 和 entry
→ 校验格式、版本和安装实例
→ 检查初始 System 可解析
→ 建立只读 Content Grant
→ 初始化目标 Frame
```

目标子系统负责业务加载：

```text
验证调用参数
→ 使用 Catalog / Repository 访问逻辑 Content API
→ 按需读取和校验
→ 构造不可变业务内容
→ 生成首次 Client State
→ 报告 Frame ready
```

程序主系统不根据 `systemId` 猜测地图、人物或其他业务字段。

## 5. 逻辑 Content API

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

Content API 不接受客户端提供的任意物理路径，不返回文件句柄、绝对路径或包内真实目录结构。

## 6. 平台实现

### 桌面

```text
Runtime Container / Renderer
→ HTTP Fetch
→ localhost Readonly Content Service Process
→ Package Index
→ 真实只读游戏包目录
```

Content Service 只监听 loopback，使用会话授权，并只允许逻辑路由的 `GET` 和 `HEAD`。

### PWA

```text
Subsystem Worker / Window Renderer
→ same-origin Fetch
→ Service Worker
→ Package Index
→ OPFS / Cache Storage
```

Service Worker 是无状态请求处理器。它不拥有 Frame Stack、权威业务状态或 Runtime Tick，必须能够从 OPFS、IndexedDB 安装注册表和 Package Index 重建请求处理能力。

## 7. FSDB 索引

建议为发布和安装生成：

```text
fsdb.index.json
```

索引保存：

- FSDB Namespace 与类型；
- 逻辑 Key；
- 经过校验的内部位置；
- MIME；
- 文件大小；
- `contentVersion` 或内容哈希；
- 必要的 Schema 和引用元数据位置。

索引是可重新生成的物理访问索引，不是业务记录真相源。

层次关系：

```text
FSDB 文件
    业务内容真相源

fsdb.index.json
    可生成的物理索引

Game Catalog
    当前会话轻量逻辑目录

Repository Cache
    已解析、已校验的不可变对象
```

HTTP 和 Service Worker 不依赖目录枚举即可通过索引解析逻辑请求。

## 8. Catalog

Catalog 是轻量内容目录，保存稳定逻辑 ID、类型、内容版本和 Content API 定位信息。

Catalog 不应保存：

- 全部地图 Tile；
- 全部业务记录主体；
- 图片或音频字节；
- 会话状态；
- Client State。

Catalog 可以在程序主系统或受控内容服务中建立，并作为只读能力交给内置子系统。

## 9. Repository

Repository 是模块内部的按需内容访问边界，负责：

- 通过 Catalog 构造逻辑 Content 请求；
- 异步 Fetch、解析和局部 Schema 校验；
- 同 ID 并发请求去重；
- Container 内不可变缓存；
- 返回不可变结果；
- 将 Content API 错误转换为模块错误。

Repository 不负责业务 Tick、调用栈、Client State 投影或画面呈现。

同一个 Runtime Container 内多个 Frame 可以共享 Repository 和不可变内容缓存，但不能共享 Frame 可变业务状态。

## 10. 资源模型

Client State 只携带：

```text
resourceKey + contentVersion
```

Renderer Resource Client 通过 Content API 获取 MIME、版本和资源主体。图片、音频和其他资源字节不进入业务 Runtime Snapshot 或 Scope Tree。

内容版本不可变时，可以使用长期缓存。不同版本必须使用不同缓存身份，旧字节不能覆盖新版本。

## 11. Content API 与热路径

Content API 用于：

- 会话初始化；
- 地图或场景切换；
- 菜单和业务内容按需加载；
- 图片、音频和其他资源加载；
- 缓存恢复和版本校验。

Content API 不应进入每 Tick 热路径。Runtime Core 每帧只读取已经准备好的内存状态和不可变内容。

错误示例：

```text
每个 Tick fetch Tile 或碰撞数据
```

正确示例：

```text
地图切换时 fetch、解析和校验
→ 构造不可变 Map Snapshot
→ Runtime Core 在内存中运行
```

## 12. 路径安全

所有物理路径解析只发生在安装器或 Content Service 内，并必须：

- 使用包根目录相对路径；
- 规范化后仍位于包内；
- 拒绝绝对路径、URL、盘符和 UNC；
- 拒绝 `..` 越界；
- 拒绝符号链接、junction 或等价逃逸；
- 限制文件大小、记录数和递归深度；
- 只允许 Package Index 中已声明的内容位置。

Runtime Container 和 Renderer 不获得物理路径。

## 13. 授权和缓存

桌面 Content Grant 至少绑定：

```text
sessionId
installationId
允许的内容范围
高熵 token
expiresAt
```

PWA Content API 使用同源安全边界，并由安装注册表验证 `installationId`。

响应应支持：

- 正确 `Content-Type`；
- `contentVersion` / ETag；
- `Cache-Control`；
- `GET` 和 `HEAD`；
- 明确 404、409、413 和内容校验错误。

大型媒体的 Range 支持属于可选 Profile，必须通过跨平台一致性测试。

## 14. 校验与安装

启动和完整验证是两个不同操作：

- `start` 只加载建立会话所需内容；
- `validate` 遍历全部强引用并尽可能报告所有问题；
- PWA 安装先复制到临时 OPFS 目录，完整校验后再登记为可用；
- 未完成安装不能作为运行时 `installationId` 使用；
- 原始游戏包和运行时安装副本都视为不可信输入。

## 15. 第一阶段 FSDB

第一阶段地图子系统使用 FSDB 保存地图、Tile、人物和资源定义。FSDB 是当前内容格式和参考实现，不自动成为所有未来子系统必须使用的公共存储接口。

公共稳定边界是逻辑只读 Content API。其他子系统可以使用自己的内容格式，只要通过相同的安全、版本和授权语义暴露。

## 16. 架构不变量

1. 运行时不获得任意文件系统能力；
2. Content API 只接受逻辑内容身份；
3. 桌面 HTTP 和 PWA Service Worker 语义一致；
4. Service Worker 和 Content Service 不拥有游戏运行状态；
5. Repository 返回已校验不可变对象；
6. Content Fetch 不进入每 Tick 热路径；
7. Client State 不携带资源字节或物理路径。

## 17. 相关下层文档

- [游戏包契约入口](../15-contracts/game-package-v1.md)；
- [只读 Content API v1](../15-contracts/content-api-v1.md)；
- [资源协议草案](../15-contracts/resource-protocol.md)；
- [游戏包模块设计](../20-modules/game-package/README.md)；
- [FSDB Content Service 模块](../20-modules/fsdb-content-service/README.md)；
- [现有详细设计：游戏启动与内容加载](../game-package/phase-1-game-loading.md)；
- [现有参考：FSDB 目录结构](../fsdb/FSDB目录结构详解.md)；
- [ADR 0003：逻辑只读 Content API](../decisions/0003-readonly-content-api.md)。
