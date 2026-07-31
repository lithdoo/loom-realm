# FSDB Content Service 模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：桌面 HTTP 与 PWA Service Worker 的统一只读内容服务实现  
> 依赖：[存储与内容系统](../../10-architecture/storage-system.md)、[Content API v1](../../15-contracts/content-api-v1.md)  
> 最近复核：2026-08-01

## 1. 目标

FSDB Content Service 将不同平台的物理存储统一映射为只读逻辑 Content API：

```text
DesktopHttpContentService
    真实只读游戏包目录

ServiceWorkerContentService
    OPFS / Cache Storage
```

两者共享路由、索引、MIME、版本、错误和安全语义。

## 2. 建议模块

```text
FSDB Content Service
├── Request Router
├── Installation Registry
├── Package Index Loader
├── Logical Content Resolver
├── Storage Adapter
├── MIME Resolver
├── Version / ETag Policy
├── Authorization Policy
├── Response Builder
├── Size / Rate Limiter
└── Diagnostics
```

## 3. Request Router

只接受 Content API v1 路由和 `GET` / `HEAD`：

```text
manifest
records/{namespace}/{key}
groups/{namespace}/{key}
resources/{namespace}/{key}
```

Router：

- 严格解析 URL；
- 解码和校验路径段；
- 拒绝额外路径、空段和控制字符；
- 不把 URL 字符串直接拼接为物理路径；
- 将请求转换为 `ContentIdentity`。

## 4. Installation Registry

保存经过验证的安装实例：

```ts
interface InstallationRecord {
  readonly installationId: string;
  readonly gameId: string;
  readonly status: "installing" | "complete" | "corrupt";
  readonly packageIndexLocation: string;
  readonly installedAt: number;
}
```

只有 `complete` 安装可以服务运行时请求。

桌面 Registry 映射到受控游戏包目录；PWA Registry 保存于 IndexedDB，并映射到 OPFS 安装目录。

## 5. Package Index Loader

加载和验证 `fsdb.index.json` 或等价索引：

- 格式和版本；
- Namespace、Key 和 Kind；
- 内部路径安全；
- MIME、大小和内容版本；
- 重复身份；
- 索引数量和总大小限制。

索引可以在进程或 Service Worker 生命周期内缓存，但必须能够从持久存储重新加载。

## 6. Logical Content Resolver

```text
ContentIdentity
→ Installation Record
→ Package Index Entry
→ Safe Internal Location
```

Resolver 不读取主体，不解释业务 JSON，也不返回物理位置给客户端。

未知 Namespace 或 Key 返回 `CONTENT_NOT_FOUND`。

## 7. Storage Adapter

统一只读接口：

```ts
interface ReadonlyContentStorage {
  stat(location: SafeContentLocation): Promise<{
    readonly size: number;
    readonly modifiedAt?: number;
  }>;

  read(location: SafeContentLocation): Promise<Uint8Array>;

  readRange?(
    location: SafeContentLocation,
    start: number,
    endInclusive: number,
  ): Promise<Uint8Array>;
}
```

实现：

```text
NodeDirectoryStorage
    桌面真实目录

OpfsStorage
    PWA OPFS

CacheStorageAdapter
    可选不可变资源缓存
```

Storage Adapter 不接收用户输入的字符串路径，只接收 Resolver 产生的安全位置对象。

## 8. MIME Resolver

优先使用 Package Index 已验证 MIME。扩展名只能作为安装和索引生成阶段的辅助，不应在每次请求中信任客户端提供的扩展名。

资源响应设置准确 `Content-Type`。Record 和 Group 使用协议固定 MIME。

## 9. Version 与 ETag

每个内容条目具有稳定 `contentVersion`。优先使用 SHA-256 或等价内容哈希。

Response Builder 生成：

```text
ETag
X-Loom-Content-Version
Cache-Control
```

`If-None-Match` 匹配返回 304。

不可变资源可以长期缓存。Manifest 和安装状态使用短缓存或 no-cache 验证。

## 10. Authorization Policy

### 桌面

验证：

- Bearer token；
- sessionId；
- installationId；
- 权限范围；
- 过期时间；
- Origin；
- loopback 来源。

### PWA

验证：

- 当前 Origin；
- installationId 已登记；
- 安装状态 complete；
- Service Worker scope 覆盖请求；
- 请求未越过应用逻辑路由。

Authorization Policy 不读取 Frame Runtime 状态。未来按 Frame 限制资源时，应使用 Main 签发的独立权限声明，而不是查询 DOM。

## 11. Response Builder

统一构造：

- 200、206、304；
- 400、401、403、404、405；
- 409、413、416、422、429、500；
- `application/problem+json` 错误；
- HEAD 无主体响应；
- Content Length、MIME、ETag 和缓存头。

错误不包含物理路径、token、用户目录或内部堆栈。

## 12. JSON 与 JSONL

Content Service 返回原始已安装字节，不在服务层执行子系统业务 Schema 校验。

安装器和 Validator 负责全包基础完整性；模块 Repository 负责业务局部 Schema。

Group JSONL 可以流式返回。Content Service 限制：

- 总字节数；
- 单行长度；
- 记录数量元数据；
- 解压后大小（如未来支持压缩）。

## 13. Range

Range 是可选 Profile：

- 仅对索引标记允许的资源启用；
- 解析单 Range；
- 验证边界；
- 返回 206 或 416；
- Service Worker 与桌面 HTTP 使用同一测试向量。

第一阶段不要求多 Range。

## 14. 缓存层次

```text
物理存储 / OPFS
    完整已安装内容

Content Service Cache
    Index、字节和 Response 缓存

Subsystem Repository Cache
    已解析、已校验不可变业务对象

Renderer Resource Cache
    Blob、ImageBitmap、AudioBuffer 和 GPU 资源
```

Content Service 缓存不保存 Runtime 状态。

## 15. 并发与背压

- 相同内容的并发读取可以去重；
- 设置每会话并发上限；
- 大资源使用流式 Response；
- 客户端取消 Fetch 时取消底层读取（平台支持时）；
- 不让资源洪峰阻塞 Frame 控制连接；
- 失败结果默认不永久负缓存；
- Service Worker 每个 Fetch Event 必须使用 `respondWith` 和必要的 `waitUntil`。

## 16. 桌面 HTTP 实现

```text
127.0.0.1:<random-port>
```

要求：

- 只监听 loopback；
- 随机会话端口；
- 精确 CORS Origin；
- Bearer token；
- 禁止目录列表；
- 禁止重定向到文件 URL；
- 会话结束后关闭监听；
- 文件打开后仍执行最终路径或句柄安全检查，防止链接替换攻击。

## 17. PWA Service Worker 实现

Service Worker：

```text
fetch event
→ Route Parser
→ Installation Registry
→ Package Index
→ OPFS / Cache Storage
→ Response
```

Service Worker 可能随时重启，因此：

- 不依赖全局 Map 作为真相源；
- OPFS Handle 和 Index Cache 可丢弃重建；
- 安装登记保存于 IndexedDB；
- 版本切换时旧 Service Worker 不应服务不兼容的新安装格式；
- 激活和接管流程必须避免半升级状态。

## 18. 安装与运行边界

可写操作只属于 Installer：

```text
import
write temporary files
generate index
validate
mark complete
delete installation
```

Content Service 运行时只读。即使底层 OPFS 可写，也不得通过 Content API 暴露写方法。

## 19. 故障

- Registry 不可读：返回 500 或安装不可用诊断；
- 安装 incomplete：409；
- 索引损坏：409/422，并标记安装 corrupt；
- 主体不存在：409 或 404，取决于是否索引存在；
- 哈希不匹配：422；
- Service Worker 重启：重新加载 Registry 和 Index；
- 桌面 Content Process 崩溃：Main 可重启服务并签发新 Grant；
- 已加载 Runtime State 不因内容服务重启自动回滚。

## 20. 核心不变量

- API 只读；
- URL 只包含逻辑身份；
- 物理路径不离开 Content Service；
- 桌面和 PWA 返回相同业务语义；
- Service Worker 不拥有游戏运行状态；
- Repository 负责业务 Schema；
- 资源字节不进入 Frame 数据通道；
- Content Fetch 不进入每 Tick 热路径。

## 21. 测试入口

- 四类路由成功和失败；
- Path Segment 编码和穿越拒绝；
- 安装 incomplete/corrupt；
- Index 重复和路径逃逸；
- GET/HEAD、ETag/304；
- MIME 和内容版本；
- token、Origin 和权限；
- Service Worker 冷启动；
- 并发去重和取消；
- 大小、速率和可选 Range；
- 桌面与 PWA Conformance Fixture。
