# 只读 Content API v1

> 层级：正式契约  
> 状态：Active / Normative  
> 稳定程度：Evolving  
> 主要定义：跨桌面与 PWA 的逻辑只读内容访问、缓存、授权和错误语义  
> 依赖：[存储与内容系统](../10-architecture/storage-system.md)  
> 最近复核：2026-08-01

## 1. 适用范围

本契约定义运行中的程序主系统、模块子系统和 Web Renderer 如何通过 Fetch/HTTP 语义读取游戏包清单、FSDB 记录、分组数据和资源主体。

平台实现：

```text
桌面
    localhost HTTP Content Service

PWA
    same-origin Fetch + Service Worker + OPFS / Cache Storage
```

两种实现必须保持相同的逻辑路由、状态码、MIME、版本和缓存语义。

## 2. 设计原则

- 只读；
- 以逻辑身份访问，不暴露物理路径；
- 所有内容视为不可信输入；
- 支持按需读取和标准缓存；
- 资源主体不进入 Frame 数据通道；
- Content Service 不拥有游戏运行状态；
- FSDB 是第一阶段实现，Content API 是公共稳定边界。

## 3. 核心身份

```ts
interface ContentIdentity {
  readonly installationId: string;
  readonly kind: "manifest" | "record" | "group" | "resource";
  readonly namespace?: string;
  readonly key?: string;
  readonly contentVersion?: string;
}
```

`installationId` 标识经过验证并登记的游戏包安装实例，不等同于游戏业务 ID 或本机目录。

`namespace` 和 `key` 是逻辑内容身份，不得解释为任意路径。

## 4. 基础路径

v1 API 基础路径：

```text
/_lr/v1/games/{installationId}
```

所有路径段必须使用 UTF-8 百分号编码。解码后必须满足实现声明的最大长度和字符规则，并不得包含：

- `/` 或 `\`；
- `.`、`..`；
- NUL；
- 控制字符；
- 盘符、URL 或 UNC 语义。

## 5. 路由

### 5.1 游戏清单

```http
GET /_lr/v1/games/{installationId}/manifest
HEAD /_lr/v1/games/{installationId}/manifest
```

返回规范化的游戏清单 JSON，不返回安装目录和物理入口路径。

### 5.2 结构记录

```http
GET /_lr/v1/games/{installationId}/records/{namespace}/{key}
HEAD /_lr/v1/games/{installationId}/records/{namespace}/{key}
```

用于 FSDB `[struct]`、`[extend]` 或其他单记录内容。

默认响应：

```text
Content-Type: application/json; charset=utf-8
```

### 5.3 分组记录

```http
GET /_lr/v1/games/{installationId}/groups/{namespace}/{key}
HEAD /_lr/v1/games/{installationId}/groups/{namespace}/{key}
```

第一阶段默认返回 JSON Lines：

```text
Content-Type: application/x-ndjson; charset=utf-8
```

客户端可以流式解析。每一行必须是独立 JSON 值，并受记录数、单行大小和总大小限制。

### 5.4 资源主体

```http
GET /_lr/v1/games/{installationId}/resources/{namespace}/{key}
HEAD /_lr/v1/games/{installationId}/resources/{namespace}/{key}
```

返回 Package Index 声明的真实 MIME 和二进制主体。资源不得 Base64 包装进 JSON。

## 6. Package Index

Content Service 通过经过验证的 `fsdb.index.json` 或等价 Package Index 将逻辑请求映射到内部内容位置。

索引条目至少包含：

```ts
interface ContentIndexEntry {
  readonly kind: "record" | "group" | "resource";
  readonly namespace: string;
  readonly key: string;
  readonly internalPath: string;
  readonly contentVersion: string;
  readonly size: number;
  readonly mime: string;
}
```

`internalPath` 只在受信任的 Content Service 内使用，不得返回给客户端。

请求解析必须先查询索引；禁止将 URL 参数直接拼接为文件系统路径。

## 7. 成功响应头

成功响应至少包含：

```text
Content-Type
Content-Length（可确定时）
ETag
X-Loom-Content-Version
Cache-Control
```

建议：

```text
ETag: "<contentVersion>"
X-Loom-Content-Version: <contentVersion>
```

当 `contentVersion` 表示不可变内容哈希时：

```text
Cache-Control: public, max-age=31536000, immutable
```

Manifest 或可变安装登记信息应使用更保守的缓存策略。

## 8. 条件请求

实现应支持：

```text
If-None-Match
```

ETag 匹配时返回：

```text
304 Not Modified
```

304 不包含主体。

客户端缓存身份至少包含：

```text
installationId + kind + namespace + key + contentVersion
```

不同版本不得共享错误字节。

## 9. HEAD

`HEAD` 必须执行与 `GET` 相同的授权、路由和存在性校验，但不返回主体。

响应头应与相应 `GET` 一致，包括 MIME、版本、大小和缓存信息。

## 10. Range Profile

v1 Core 不要求所有内容支持 Range。

实现声明支持时，必须正确处理：

```text
Range: bytes=<start>-<end>
```

并返回：

```text
206 Partial Content
Content-Range
Accept-Ranges: bytes
```

第一阶段建议对 JSON、JSONL 和普通图片整体读取；大型音频、视频或归档资源再启用 Range Profile。

桌面 HTTP 和 PWA Service Worker 的 Range 行为必须使用相同 Fixture 验证。

## 11. 桌面授权 Profile

桌面 Content Service 只监听：

```text
127.0.0.1 / ::1
```

程序主系统签发 Content Grant：

```ts
interface ContentGrant {
  readonly baseUrl: string;
  readonly sessionId: string;
  readonly installationId: string;
  readonly token: string;
  readonly expiresAt: number;
  readonly permissions: readonly ("manifest" | "records" | "groups" | "resources")[];
}
```

请求使用：

```text
Authorization: Bearer <token>
```

规则：

- token 使用高熵随机值；
- token 绑定会话、安装实例和权限范围；
- 服务拒绝过期或错误范围；
- 不在错误、日志或 URL 中回显 token；
- Renderer 跨 Origin 访问时使用精确 CORS Origin，不允许无边界 `*`。

## 12. PWA 授权 Profile

PWA Content API 与应用同源，由 Service Worker 拦截 `/_lr/v1/` 请求。

Service Worker 必须验证：

- `installationId` 已在当前 Origin 的安装注册表中登记；
- 请求方法和路由合法；
- Package Index 条目存在；
- OPFS 或 Cache Storage 中的内容版本匹配；
- 当前请求不尝试访问未安装或未完成安装的内容。

Service Worker 全局内存不是授权或内容真相源。它必须能从 IndexedDB、OPFS 和 Package Index 恢复。

## 13. 方法限制

运行时 Content API 只允许：

```text
GET
HEAD
```

其他方法返回：

```text
405 Method Not Allowed
Allow: GET, HEAD
```

安装、导入、写入、删除和全包验证属于独立的 Package Storage / Installer 能力，不属于本契约。

## 14. 状态码

```text
200 OK
    成功完整响应

206 Partial Content
    Range Profile 成功

304 Not Modified
    ETag 匹配

400 Bad Request
    URL 编码、参数或 Header 非法

401 Unauthorized
    桌面 token 缺失或无效

403 Forbidden
    token 权限不足或 Origin 不允许

404 Not Found
    安装实例、Namespace、Key 或主体不存在

405 Method Not Allowed
    非 GET/HEAD

409 Conflict
    安装未完成、内容版本冲突或索引与主体不一致

413 Content Too Large
    超过当前 Profile 的大小限制

416 Range Not Satisfiable
    Range 非法

422 Unprocessable Content
    已读取内容无法通过格式或完整性校验

429 Too Many Requests
    超过速率或并发限制

500 Internal Server Error
    非预期服务错误
```

错误响应使用：

```text
Content-Type: application/problem+json
```

## 15. 错误主体

```ts
interface ContentProblem {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly code: string;
  readonly detail?: string;
  readonly installationId?: string;
  readonly namespace?: string;
  readonly key?: string;
}
```

稳定错误码建议：

```text
INSTALLATION_NOT_FOUND
INSTALLATION_INCOMPLETE
CONTENT_NOT_FOUND
CONTENT_VERSION_MISMATCH
CONTENT_TOO_LARGE
CONTENT_SCHEMA_INVALID
CONTENT_INTEGRITY_FAILED
CONTENT_PERMISSION_DENIED
RANGE_INVALID
```

错误不得包含：

- 物理路径；
- token；
- 用户目录；
- 内部堆栈；
- 未授权的索引内容。

## 16. 大小与并发限制

实现 Profile 必须声明：

- URL 和路径段最大长度；
- JSON/JSONL 最大主体；
- Resource 最大主体；
- 单行 JSONL 最大长度；
- 并发请求上限；
- 每会话速率限制；
- 超时和取消行为。

Repository 应对相同逻辑内容的并发请求去重。失败结果默认不永久缓存。

## 17. 完整性

当 Package Index 提供内容哈希时，安装阶段必须校验主体。运行阶段可以按策略重新验证，但不得将已知哈希不匹配的主体返回为 200。

索引与主体不一致时返回 409 或 422，并记录安装损坏诊断。

## 18. Client State 中的资源引用

Client State 只携带：

```ts
interface ResourceReference {
  readonly resourceKey: string;
  readonly contentVersion: string;
}
```

Renderer 通过 Catalog 或 Resource Client 将 `resourceKey` 解析为 Content API 请求。

Client State 不携带：

- Content API token；
- 绝对 URL；
- 本机路径；
- 资源字节。

## 19. Service Worker 生命周期

Service Worker 可以被浏览器随时终止。处理每个 Fetch Event 时不得假设以下内存仍存在：

- Package Index Cache；
- 安装注册表；
- 授权对象；
- 打开的 OPFS Handle。

实现可以缓存这些对象以提高性能，但必须能够重新加载。

Service Worker 不承担 Runtime Tick、Frame Stack、Client State Projector 或输入处理。

## 20. 最小互操作测试

- Manifest、Record、Group 和 Resource 成功读取；
- GET 与 HEAD 头部一致；
- ETag 和 304；
- Content Version 缓存隔离；
- 未知 installationId、Namespace 和 Key；
- 非法编码、路径穿越和超长参数；
- 桌面 token 缺失、过期和权限不足；
- PWA 未完成安装拒绝；
- JSONL 流式读取；
- MIME 正确；
- 内容过大和并发限制；
- 索引与主体哈希不匹配；
- 可选 Range Profile；
- 桌面 HTTP 与 PWA Service Worker 返回相同业务结果和错误码。

## 21. 相关文档

- [游戏包契约 v1](./game-package-v1.md)；
- [资源协议草案](./resource-protocol.md)；
- [存储与内容系统](../10-architecture/storage-system.md)；
- [FSDB Content Service 模块](../20-modules/fsdb-content-service/README.md)。
