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

第一版按 flat resource identity 设计：

```text
[resource]<name>/
├── {key}.{ext}
└── .desc.meta       required
```

resource 数据文件必须是 `[resource]<name>` 的直接子文件；第一版不递归解释资源子目录。

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

最终 TypeScript API 在实现前不冻结；优先保持小而可组合。

---

## 7. HTTP Surface

HTTP API 直接表达 FSDB storage semantics，不表达 LoomRealm Content API semantics。

第一版只设计两个 route pattern：

```text
GET|HEAD /fsdb/v1
GET|HEAD /fsdb/v1/{kind}/{table}/{entry}
```

其中：

```text
kind = struct | extend | group | resource
```

`entry` 可以是普通 FSDB key，也可以是该 kind 支持的逻辑 metadata 名称。

这样 router 不需要为每种数据建立一套独立 URL 结构；不同 FSDB 类型的差异由 index entry type 与合法组合校验表达。

### 7.1 Database Descriptor

```text
GET|HEAD /fsdb/v1
```

根接口用于 discovery，但只列出数据库身份与表，不列出表内 keys。

概念响应：

```json
{
  "fsdbVersion": 1,
  "name": "game",
  "tables": [
    { "kind": "struct", "name": "actor" },
    { "kind": "group", "name": "map-event" },
    { "kind": "resource", "name": "image" }
  ]
}
```

根 descriptor 的目标只回答：

```text
这是哪个 FSDB？
有哪些逻辑表？
每个表是什么 kind？
```

第一版不通过该接口暴露 physical directory、metadata filename、文件数量、绝对路径或 table 内 key 列表。

### 7.2 Data Entry

普通 key：

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

[resource]image/hero.png
→ /fsdb/v1/resource/image/hero
```

resource route 中的 key 不携扩展名。扩展名属于 indexed storage/MIME metadata，不属于 HTTP logical identity。

因此同一个 resource table 中：

```text
hero.png
hero.webp
```

会产生相同 logical key `hero`，第一版视为 index collision，`openFsdb()` 必须拒绝，而不是让 URL 通过扩展名区分两份资源。

### 7.3 Metadata Entry

Metadata 使用 logical name，而不是暴露物理 dot-file 名称：

```text
.info.meta
    ↕
$info

.extend.meta
    ↕
$extend

.desc.meta
    ↕
$desc
```

合法组合：

| kind | 普通 key | `$info` | `$extend` | `$desc` |
|---|---|---|---|---|
| `struct` | yes | yes | no | optional |
| `extend` | yes | yes | yes | optional |
| `group` | yes | yes | optional | yes |
| `resource` | yes | no | no | yes |

示例：

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

如果某 metadata 在该 FSDB kind 中允许但当前表没有实际文件，例如 struct 的 optional `$desc`，请求返回 `404`。

`$info`、`$extend`、`$desc` 是 HTTP route reserved entry。Index/route validation 必须保证普通 key 不会与保留 entry 产生歧义。

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

直接返回原始资源 bytes；MIME 由 immutable index 中已验证的扩展名/metadata 决定。

### metadata

第一版倾向：

```text
$info    → application/schema+json; charset=utf-8
$extend  → application/x-ndjson; charset=utf-8
$desc    → text/markdown; charset=utf-8
```

如果 `application/schema+json` 的兼容性在实现中带来实际问题，可以退回 `application/json; charset=utf-8`；这个细节在首个实现前收敛。

### database descriptor

```text
Content-Type: application/json; charset=utf-8
```

Descriptor 是服务端根据 immutable index 生成的逻辑 JSON，不对应某个原始 FSDB 文件。

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

`HEAD` 执行与对应 `GET` 相同的 route/index/existence 检查，并返回可确定的相同 headers，但不返回 body。

---

## 10. HTTP Status / Error Boundary

第一版状态语义保持最小：

| 情况 | Status |
|---|---:|
| `GET` / `HEAD` 命中 | `200` |
| `If-None-Match` 命中 | `304` |
| URL / percent-encoding / logical identity 非法 | `400` |
| kind/table/key/metadata 不存在或组合不支持 | `404` |
| 非 `GET` / `HEAD` | `405` |
| 已索引文件在服务期间异常不可读等本地故障 | `500` |

第一版不建立复杂 error protocol。实现 MAY 返回一个很小的 JSON error body，例如：

```json
{ "error": "not_found" }
```

但客户端不应依赖详细内部错误文本。

错误响应不得包含：

```text
absolute path
user home
internal stack
raw filesystem error path
physical metadata filename
```

---

## 11. Index / Validation

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
resource key collision across extensions
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

### 11.1 Resource identity

第一版采用：

```text
resource file MUST be direct child of [resource]<table>
logical key = filename without final extension
extension = indexed storage/MIME metadata
```

例如：

```text
[resource]image/hero.png
```

索引概念上记录：

```ts
{
  kind: "resource",
  table: "image",
  key: "hero",
  extension: ".png",
  mime: "image/png",
  // validated internal location
}
```

未来若确实需要 hierarchical resource key，应先扩展 FSDB identity 规则，再调整 HTTP logical identity；实现不得自行把任意物理子目录静默变成 URL path。

---

## 12. Discovery Boundary

第一版包含：

```text
GET|HEAD /fsdb/v1
```

只做 table-level discovery。

第一版明确不提供：

```text
GET /fsdb/v1/{kind}/{table}
GET /fsdb/v1/{kind}/{table}/keys
```

即不提供 key listing。

原因是 key listing 会立即引入额外语义：

```text
排序
分页
大量 key 的响应上限
资源存在性暴露范围
snapshot/stability semantics
```

这些都不是“把已知 FSDB logical object 通过 HTTP 读取出来”的必要能力。

如果未来出现真实消费者确实需要 key enumeration，再单独设计，不为了“像数据库服务”而提前增加 API。

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

Database descriptor 的 ETag 可由 immutable index 的稳定摘要生成；具体算法是实现细节，只要同一打开实例的相同 descriptor 有稳定 validator。

如果后续 FSDB 提供稳定 content hash，再优先使用该 authority，而不是重复计算。

---

## 14. 明确不提供的 HTTP 能力

第一版没有：

```text
POST
PUT
PATCH
DELETE

/query
/search
/filter
/join
/resolve
/references
/batch
/watch
/events
```

也没有：

```text
任意 physical path 读取
目录浏览
key listing
自动 extend reference expansion
ORM-style transformed response
```

特别是 `[extend]` / `[group]` 的 `.extend.meta` 只作为可读取 metadata；HTTP 服务不会根据它自动 join/展开被引用的 struct。

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
4. resource flat-key + extension collision validation
5. logical resolver
6. /fsdb/v1 database descriptor
7. /fsdb/v1/{kind}/{table}/{entry} route parser
8. GET / HEAD handler
9. raw JSON / JSONL / resource / metadata response
10. MIME + Content-Length
11. ETag / If-None-Match / 304
12. malformed/not-found/method error tests
13. real FSDB fixture + consumer smoke
```

暂不实现：

```text
key listing
Range
watch/hot reload
auth
write API
query/filter
reference expansion
hierarchical resource key
```

---

## 17. 第一版完成标准

给定一个静态 FSDB fixture：

```text
open
→ validate/index
→ start handler
→ GET/HEAD /fsdb/v1 descriptor
→ GET/HEAD struct/extend/group/resource
→ GET/HEAD supported metadata
→ 返回正确原始 bytes 与 MIME
```

并能够证明：

```text
resource logical key 不依赖文件扩展名
同 resource key 多扩展名会在 open 时拒绝
无法通过 URL 读取 index 外文件
无法 path traversal
无法 symlink escape
无法写入 FSDB
错误不泄露 physical path
HEAD 不返回 body
unsupported method 返回 405 + Allow
```

达到上述条件后，再根据真实消费者需求决定是否增加 Range、key enumeration、层级 resource key 或拆分 `@loomrealm/fsdb`。

---

## 18. 当前 Draft HTTP 摘要

```text
GET|HEAD /fsdb/v1

GET|HEAD /fsdb/v1/{kind}/{table}/{entry}

kind:
    struct | extend | group | resource

entry:
    ordinary key
    $info
    $extend
    $desc
```

核心约束：

```text
HTTP logical identity ≠ physical path
metadata logical name ≠ dot-file name
resource key ≠ filename with extension
root discovery lists tables, not keys
GET/HEAD only
raw stored bytes when serving FSDB entries
no query/join/listing/write semantics
```
