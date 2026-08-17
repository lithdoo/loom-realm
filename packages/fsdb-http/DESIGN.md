# @loomrealm/fsdb-http 设计草案

> 状态：Draft  
> 最近复核：2026-08-17  
> 目标：把硬盘上的只读 FSDB 目录转换成稳定、安全、可独立使用的 HTTP 接口  
> 参考：[FSDB 目录结构详解](../../doc/fsdb/FSDB目录结构详解.md)

本文描述第一版实现方向，不是冻结协议。实现过程中若发现更简单或更可靠的边界，可以直接回到本文收敛。

---

## 1. 包定位

`@loomrealm/fsdb-http` 是独立的技术能力包：

```text
filesystem FSDB directory
        ↓
scan / validate / index
        ↓
readonly HTTP handler
        ↓
FSDB logical HTTP interface
```

它不依赖 LoomRealm Main、Subsystem、Renderer、Frame、Data Connection、Game Package 或 Content API。

第一版目标是尽可能做到：

```text
Node.js stdlib
    ↓
@loomrealm/fsdb-http
```

即 0 runtime dependencies；只有出现真实需求时再引入外部依赖。

---

## 2. Scope

第一版负责：

```text
打开一个 FSDB 根目录
识别 FSDB 表目录
验证必要 metadata 与数据文件
构建 immutable safe index
按 logical identity 解析对象
通过 GET / HEAD 返回原始内容 bytes
返回合理 Content-Type / Content-Length / ETag
拒绝 traversal / symlink escape / 非法 logical identity
提供可嵌入的 Node HTTP handler
```

第一版不负责：

```text
写入 / 删除 / import
filesystem watch / hot reload
自动 reference join
query / filter / pagination
ORM / business schema object mapping
LoomRealm installation registry
Game Package
Content API authorization
Bearer token
Main / Frame / Renderer authority
rate limiting policy
跨进程 bootstrap
```

---

## 3. FSDB 物理模型

当前 FSDB 根目录：

```text
[FSDB]<database>/
├── [struct]<name>/
├── [extend]<name>/
├── [group]<name>/
└── [resource]<name>/
```

### struct

```text
[struct]<name>/
├── {key}.json
├── .info.meta       required
└── .desc.meta       optional
```

### extend

```text
[extend]<name>/
├── {key}.json
├── .info.meta       required
├── .extend.meta     required
└── .desc.meta       optional
```

### group

```text
[group]<name>/
├── {key}.jsonl
├── .info.meta       required
├── .desc.meta       required
└── .extend.meta     optional
```

### resource

```text
[resource]<name>/
├── {key}.{ext}
└── .desc.meta       required
```

HTTP 层只暴露上述 FSDB logical object，不提供目录浏览器或任意物理路径读取。

---

## 4. 核心安全边界

HTTP path 不得直接转换成 filesystem path。

禁止：

```text
request URL
→ path.join(root, request segments)
→ read file
```

目标模型：

```text
openFsdb(root)
→ scan / validate
→ immutable index

request logical identity
→ index lookup
→ validated internal file location
→ read / stream
```

Index 中的 physical location 永不返回客户端。

第一版默认：

```text
不 follow symlink
不允许任何 resolved path 逃逸 FSDB root
不暴露 dot-file 物理名称
不暴露任意未索引文件
```

---

## 5. 候选内部结构

```text
src/
├── fsdb/
│   ├── open.ts
│   ├── scan.ts
│   ├── validate.ts
│   ├── index.ts
│   └── types.ts
│
├── http/
│   ├── handler.ts
│   ├── route.ts
│   ├── response.ts
│   └── mime.ts
│
└── index.ts
```

第一阶段先放在一个 package 内。只有未来出现第二个真实消费者，例如 Installer 或非 HTTP FSDB reader，再考虑把 `fsdb/` 抽成独立 `@loomrealm/fsdb`。

---

## 6. 候选 Public API

核心读取能力：

```ts
const db = await openFsdb({
  root: "/path/to/[FSDB]game",
});
```

概念接口：

```ts
interface FsdbDatabase {
  readonly name: string;
}
```

HTTP adapter：

```ts
const handler = createFsdbHttpHandler(db);
```

可直接接 Node HTTP server：

```ts
createServer(handler);
```

可选 convenience API：

```ts
await serveFsdb({
  root,
  host: "127.0.0.1",
  port: 0,
});
```

最终 API 在实现前不冻结；优先保持小而可组合。

---

## 7. 候选 HTTP Route

HTTP API 直接表达 FSDB storage semantics，不表达 LoomRealm Content API semantics。

Base：

```text
/fsdb/v1
```

候选数据路由：

```text
GET|HEAD /fsdb/v1/struct/{table}/{key}
GET|HEAD /fsdb/v1/extend/{table}/{key}
GET|HEAD /fsdb/v1/group/{table}/{key}
GET|HEAD /fsdb/v1/resource/{table}/{key}
```

示例：

```text
[struct]actor/001.json
→ /fsdb/v1/struct/actor/001

[group]map-event/001.jsonl
→ /fsdb/v1/group/map-event/001
```

Metadata 使用 logical route，而不是暴露 `.info.meta` 等物理名称：

```text
/fsdb/v1/struct/actor/$info
/fsdb/v1/struct/actor/$desc

/fsdb/v1/extend/actor-skill/$info
/fsdb/v1/extend/actor-skill/$extend
/fsdb/v1/extend/actor-skill/$desc

/fsdb/v1/group/map-event/$info
/fsdb/v1/group/map-event/$extend
/fsdb/v1/group/map-event/$desc

/fsdb/v1/resource/image/$desc
```

Route 名称、`$` 保留字和是否需要 `/fsdb/v1` 前缀都属于实现阶段可调整项。

---

## 8. Response 原则

服务层尽量返回磁盘原始 bytes，而不是 parse 后重新 serialize。

### struct / extend

```text
Content-Type: application/json; charset=utf-8
```

实际响应优先发送原始 `.json` bytes。

### group

```text
Content-Type: application/x-ndjson; charset=utf-8
```

实际响应优先发送原始 `.jsonl` bytes。

### resource

直接返回原始资源 bytes；MIME 由已验证扩展名 / resolver 决定。

### metadata

```text
.info.meta   → application/schema+json 或 application/json
.extend.meta → application/x-ndjson
.desc.meta   → text/markdown; charset=utf-8
```

具体 MIME 在实现时根据兼容性确认。

---

## 9. HTTP Methods

第一版只允许：

```text
GET
HEAD
```

其他方法返回：

```text
405 Method Not Allowed
Allow: GET, HEAD
```

包始终只读，即使宿主进程对目录具有写权限。

---

## 10. Index / Validation

启动时扫描一次并生成 immutable index。

至少检查：

```text
FSDB root identity
recognized table directory type
required metadata exists
metadata file format valid
JSON valid
JSONL line format valid
logical table identity unique
logical key identity unique
resolved file stays inside root
no symlink escape
reserved logical names do not collide
```

对于 `[extend]` / `[group]` 的 reference integrity，第一版需要区分：

```text
格式 validation
vs
完整数据库 reference integrity validation
```

是否在 `openFsdb()` 时强制验证所有引用目标，暂不冻结；实现时根据启动成本和使用场景决定。

---

## 11. Resource key 的待定问题

当前 FSDB 基础描述以：

```text
[resource]<name>/{key}.{ext}
```

表达 resource identity，但最佳实践中又允许大型资源进一步使用子目录。

这会影响 HTTP logical identity，因此第一版实现前必须明确以下二选一：

### A. flat resource v1

```text
resource file MUST be direct child of [resource]<name>
key = filename without extension
```

### B. hierarchical resource key

```text
sub/path/hero.png
→ logical key has explicit hierarchical semantics
```

实现不得自行把未知目录层级静默转换成 HTTP path；这个问题应先回到 FSDB identity 规则中明确。

当前倾向先采用 A，保持第一版 identity 简单。

---

## 12. Discovery

候选但非 MVP 必需：

```text
GET /fsdb/v1
GET /fsdb/v1/{type}/{table}
```

可用于列出 table / key。

第一版如果实际消费者都已知道 `{type, table, key}`，可以完全不实现 discovery。

原则：不为了“像数据库服务”而增加不必要 API。

---

## 13. ETag / Cache

第一版可基于：

```text
file size + modified time
```

生成 weak ETag，避免启动时对所有大资源做完整 hash。

目标支持：

```text
ETag
If-None-Match
304 Not Modified
Content-Length
```

如果后续 FSDB 提供稳定 content hash，再优先使用该 authority，而不是重复计算。

---

## 14. Error Boundary

候选最小状态：

```text
400 malformed logical identity / bad encoding
404 table / key / metadata not found
405 unsupported method
500 unexpected local service failure
```

错误响应不得包含：

```text
absolute path
user home
internal stack
raw filesystem error path
```

是否使用 `application/problem+json` 暂不冻结。

---

## 15. 与 LoomRealm Content API 的关系

两者是不同层：

```text
@loomrealm/fsdb-http
    FSDB storage semantics
    disk → HTTP

LoomRealm Content API
    game installation logical content semantics
    installationId / record / group / resource
```

`@loomrealm/fsdb-http` 不应为了适配 LoomRealm 而加入：

```text
installationId
Game Package
Desktop Content bearer
Renderer / Runtime identity
Content API route
```

未来可以由更高层 adapter/service 使用 `@loomrealm/fsdb-http`，也可以直接复用其底层 reader/index 能力；两层不强制一一映射。

---

## 16. 第一阶段实现顺序

```text
1. FSDB path / identity types
2. scanner + immutable index
3. validator + symlink/path containment
4. logical resolver
5. GET / HEAD handler
6. raw JSON / JSONL / resource response
7. MIME + Content-Length
8. ETag / If-None-Match
9. malformed/not-found/method error tests
10. real FSDB fixture + consumer smoke
```

暂不实现：

```text
discovery
Range
watch/hot reload
auth
write API
query/filter
reference expansion
```

---

## 17. 第一版完成标准

给定一个静态 FSDB fixture：

```text
open
→ validate/index
→ start handler
→ GET/HEAD struct/extend/group/resource
→ 返回正确原始 bytes 与 MIME
```

并能够证明：

```text
无法通过 URL 读取 index 外文件
无法 path traversal
无法 symlink escape
无法写入 FSDB
错误不泄露 physical path
```

达到上述条件后，再根据真实消费者需求决定是否增加 discovery、Range、层级 resource key 或拆分 `@loomrealm/fsdb`。
