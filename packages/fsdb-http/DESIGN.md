# @loomrealm/fsdb-http 设计草案

> 状态：Draft  
> 最近复核：2026-08-17  
> 目标：把硬盘上的只读 FSDB 目录转换成稳定、安全、可独立使用的 HTTP 接口  
> 参考：[FSDB 目录结构详解](../../doc/fsdb/FSDB目录结构详解.md)

本文描述第一版实现方向，不是冻结协议。FSDB logical identity 以 FSDB 规范为 authority；HTTP 层只负责安全、可逆地暴露该 identity，不自行增加另一套 key 语义。

---

## 1. 包定位

`@loomrealm/fsdb-http` 是独立技术能力包：

```text
filesystem FSDB directory
        ↓
Well-formed validation
        ↓
safe immutable logical index
        ↓
Node.js native HTTP handler
        ↓
FSDB logical HTTP interface
```

它不依赖 LoomRealm Main、Subsystem、Renderer、Frame、Data Connection、Game Package 或 Content API。

第一版目标：

```text
Node.js stdlib
    ↓
@loomrealm/fsdb-http
```

尽量保持 **0 runtime dependencies**。Node.js 类型定义、TypeScript 等只属于 build/dev dependency。

核心原则：

```text
FSDB spec
    owns logical identity

FsdbDatabase
    owns one accepted filesystem snapshot

HTTP handler
    owns HTTP representation / routing semantics

serveFsdb
    owns Node server convenience composition
```

---

## 2. Scope

第一版负责：

```text
打开一个 FSDB 根目录
验证 Well-formed FSDB
构建 immutable logical index
按 FSDB logical identity 解析对象
GET / HEAD 原始内容读取
Unicode logical name ↔ HTTP path 可逆映射
Content-Type / Content-Length
ETag / If-None-Match / Cache-Control
traversal / symlink escape 防护
static-source snapshot 与 stale fail-closed
Node.js stdlib RequestListener
可选的独立 node:http convenience service
```

第一版不负责：

```text
写入 / 删除 / import
filesystem watch / hot reload
完整 Integrity-valid 检查
自动 reference join
query / filter / pagination
ORM / business schema mapping
key listing
Range
Express / Koa / Fastify / Hono framework dependency
LoomRealm installation registry
Game Package
Content API authorization
Bearer token
Main / Frame / Renderer authority
rate limiting policy
跨进程 bootstrap
CLI / daemon process management
```

---

## 3. 继承的 FSDB Identity

HTTP 层直接继承 FSDB 规范。

### 3.1 Table kind 与 TableIdentity

```text
TableKind = struct | extend | group | resource
```

物理目录：

```text
[FSDB]<DatabaseName>/
├── [struct]<TableName>/
├── [extend]<TableName>/
├── [group]<TableName>/
└── [resource]<TableName>/
```

本包索引与 HTTP 层使用：

```text
TableIdentity = (TableKind, TableName)
```

因此以下表可以共存：

```text
[struct]角色
[resource]角色
```

因为它们的 `TableKind` 不同。

同一 `(TableKind, TableName)` 不得出现两个 logical table。

### 3.2 Unicode NameSegment

FSDB 的 `DatabaseName`、`TableName`、普通 `Key` 与 ResourceKey segment 都基于同一个 `NameSegment`。

FSDB logical canonical form 是 NFC；scanner 从 filesystem 获得 physical name 后：

```text
physical Unicode name
→ NFC canonicalization
→ NameSegment validation
→ logical identity
```

若两个 physical name canonicalize 为同一个 NFC logical name，`openFsdb()` 必须因 logical identity collision 失败。

除此之外，本包不得自行 ASCII 化、lowercase、trim、collapse whitespace 或改变合法 NFC logical name。

必须继承的关键约束包括：

```text
valid Unicode / UTF-8
NFC logical canonical form
1..200 UTF-8 bytes after NFC
not starting with "." or "$"
no leading/trailing Unicode whitespace
no trailing "."
no path separators / NUL / control chars / non-portable filename chars
reserved device basename rejection
```

中文等人类可读名称是正常 identity：

```text
[struct]角色/皮卡丘.json
→ table = 角色
→ key   = 皮卡丘
```

### 3.3 保留命名空间

FSDB 已规定普通 logical name 不得以 `$` 开头，因此 HTTP 可以安全使用：

```text
$info
$extend
$desc
```

作为 metadata logical entry。

`.` 前缀属于 FSDB physical metadata / auxiliary namespace，HTTP 不直接暴露物理 dot-file 名称。

### 3.4 ResourceKey

```text
ResourceKey = NameSegment ("/" NameSegment)*
```

例如：

```text
[resource]图片/皮卡丘.png
→ 皮卡丘

[resource]图片/关都地区/真新镇.png
→ 关都地区/真新镇

[resource]图片/UI/道具.large.webp
→ UI/道具.large
```

最后扩展名不属于 Resource identity。

因此同一 Resource 表中：

```text
皮卡丘.png
皮卡丘.webp
```

产生相同 key `皮卡丘`，属于 duplicate logical key，`openFsdb()` 必须拒绝。

---

## 4. 核心安全与读取不变量

### 4.1 HTTP identity 不得直接变成 filesystem path

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
→ immutable logical index

request logical identity
→ index lookup
→ validated internal file identity
→ safe file-handle read
```

Index 中的 physical location 永不返回客户端。

第一版默认：

```text
不 follow symlink
resolved object 不得逃逸 FSDB root
不暴露任意未索引文件
不暴露 absolute path / raw filesystem path
```

FSDB object 分类遵循：

```text
unrecognized auxiliary object
    → ignore / not index / not serve

recognized FSDB candidate but malformed
    → openFsdb() fails
```

Resource 中 dot-prefixed 子目录/文件不进入普通 Resource namespace。

### 4.2 Single-handle read invariant

文件型响应必须避免：

```text
stat(path)
→ validate
→ reopen(path)
→ stream
```

因为这会在 validation 与 reopen 之间留下 path-level TOCTOU 窗口。

第一版要求一次文件读取使用同一个已打开 file handle：

```text
index lookup
→ safe open file handle
→ fstat(the same handle)
→ compare snapshot fingerprint / file type
→ decide headers / conditional response
→ stream from the same handle
→ close handle
```

核心不变量：

> **validation handle = streaming handle。**

如果 safe-open 或同一 handle 上的 `fstat` 发现文件已经不是当前 snapshot 接受的对象，则进入 `stale`，不得重新按 path 猜测或修复。

该规则降低 pathname replacement / symlink replacement 的 TOCTOU 风险，但不把本包伪装成 filesystem transaction system。正确性仍建立在第 14 节 static-source contract 上：宿主在 database open 期间不得并发修改 source。

---

## 5. 候选内部结构

```text
src/
├── fsdb/
│   ├── open.ts
│   ├── scan.ts
│   ├── validate.ts
│   ├── index.ts
│   ├── fingerprint.ts
│   ├── read-handle.ts
│   └── types.ts
│
├── http/
│   ├── handler.ts
│   ├── route.ts
│   ├── url-segment.ts
│   ├── conditional.ts
│   ├── response.ts
│   └── mime.ts
│
├── server/
│   └── serve.ts
│
└── index.ts
```

职责：

```text
fsdb/
    filesystem snapshot / validation / index / safe read lease

http/
    FSDB HTTP semantics + Node RequestListener

server/
    node:http createServer/listen/close convenience
```

第一阶段保持一个 package。只有出现第二个真实消费者时，再考虑抽出 `@loomrealm/fsdb`。

---

## 6. Node.js 落地形式与 Public API

第一版不以 Express、Koa 等 Web Framework plugin 为核心，也不把独立 daemon/process 当成协议实现本体。

主落地形式：

```text
FsdbDatabase
    ↓
Node.js stdlib http.RequestListener
    ↓
node:http Server
```

原则：

> **Node 原生 HTTP Handler 是核心能力；独立 HTTP Service 是 convenience composition；Framework middleware 只是未来可选 adapter。**

### 6.1 `openFsdb()`：storage snapshot

```ts
const db = await openFsdb({
  root: "/path/to/[FSDB]游戏数据",
});
```

概念接口：

```ts
interface FsdbDatabase {
  readonly name: string;
  readonly state: "open" | "stale" | "closed";
  close(): Promise<void>;
}
```

`openFsdb()` 负责：

```text
scan
Well-formed validation
logical index
source fingerprints
snapshotId
read admission / active read leases
snapshot lifetime
```

它本身不启动端口，也不拥有 HTTP server。

#### close 语义

`close()` 必须幂等。

调用 `close()` 后：

```text
立即停止接纳新的 read lease
public state 视为 closed
已成功接纳的 in-flight read lease 允许完成
close() Promise 等待这些 lease drain 后 resolve
```

不增加公开的 `closing` 状态。`closed` 表示“不再接纳新操作”；已 admitted 的内部 lease 可以在 close Promise resolve 前完成资源释放。

### 6.2 `createFsdbHttpHandler()`：核心 HTTP 落地形式

```ts
import { createServer } from "node:http";

const db = await openFsdb({ root });
const handler = createFsdbHttpHandler(db);
const server = createServer(handler);
```

第一版 public type：

```ts
import type { RequestListener } from "node:http";

function createFsdbHttpHandler(
  db: FsdbDatabase,
): RequestListener;
```

核心 handler：

```text
使用 IncomingMessage / ServerResponse
直接处理 node:http 暴露的原始 URL spelling
拥有本文定义的 route / encoding / status / cache 语义
不依赖 Express / Koa / Fastify / Hono
不启动端口
不注册 signal handler
不决定进程生命周期
```

`createFsdbHttpHandler(db)` **借用**调用方提供的 `FsdbDatabase`：

```text
handler creation does not own db
handler/server close does not implicitly close db
caller owns db.close()
```

第一版 handler 直接拥有 `/fsdb/v1` namespace。它不是 middleware，不提供 `next()`，也不支持 configurable mount path。

### 6.3 `serveFsdb()`：独立 HTTP Service convenience

```ts
const service = await serveFsdb({
  root: "/path/to/[FSDB]游戏数据",
  host: "127.0.0.1",
  port: 0,
});

console.log(service.origin?.href);

await service.close();
```

概念返回值：

```ts
interface FsdbHttpService {
  readonly db: FsdbDatabase;
  readonly server: import("node:http").Server;
  readonly address: {
    readonly host: string;
    readonly port: number;
  };
  readonly origin?: URL;
  close(): Promise<void>;
}
```

`serveFsdb()`：

```text
openFsdb(root)
    ↓
createFsdbHttpHandler(db)
    ↓
http.createServer(handler)
    ↓
listen(host, port)
```

ownership：

```text
serveFsdb()
    owns the FsdbDatabase it creates
    owns the http.Server it creates

service.close()
    block new database reads
    stop accepting new HTTP connections
    allow admitted in-flight responses to drain
    close owned server
    close owned database
```

`service.close()` 必须幂等，并在 owned server/database 都完成关闭后 resolve。

默认：

```text
host = 127.0.0.1
port = 0 allowed
```

`origin` 只在 bind host 可以表达为一个具体客户端 origin 时提供。对于 `0.0.0.0`、`::` 等 wildcard bind，`address` 仍然有效，但不把 wildcard address 假装成唯一 externally reachable origin。

#### `server` escape hatch

暴露 `service.server` 是为了 Node 用户可以做必要的 timeout、`unref()`、address inspection 等低层配置。

但 ownership 不因此转移：

```text
service.close() remains the lifecycle owner
caller SHOULD NOT use server.close() as a replacement for service.close()
```

即使调用方提前直接关闭了 `server`，后续 `service.close()` 仍必须安全、幂等地关闭 owned database。

### 6.4 Framework adapter boundary

第一版不直接提供：

```text
Express Router
Koa Middleware
Fastify Plugin
Hono Middleware
```

原因：

```text
避免 runtime framework dependency
避免把 HTTP semantics 绑定到某个 router lifecycle
避免 framework 提前 decode / normalize path
```

未来 adapter MUST 保留本文 route、raw path、percent-decoding、status、cache、single-handle read 与 source-lifetime semantics。

如果 framework 无法取得足够原始的 request-target/URL spelling 来执行第 7.4 节规则，则该 adapter 不应宣称完全等价。

是否单独发布：

```text
@loomrealm/fsdb-http-express
@loomrealm/fsdb-http-koa
```

必须等真实独立消费者出现后再决定。

### 6.5 CLI / daemon boundary

未来 CLI 只应是：

```text
config parsing
process lifecycle
logging
signal handling
        ↓
serveFsdb()
```

守护、自动重启、systemd/service integration 不进入核心 HTTP contract。

### 6.6 第一版不以 Fetch `Request → Response` 为主 API

第一版问题域明确是：

```text
Node.js filesystem
+
Node.js local HTTP serving
```

并且需要控制：

```text
raw URL spelling
file-handle streaming
socket abort
fstat/fingerprint
node:http lifecycle
```

因此第一版以 `node:http` 为最小且直接的 implementation binding。未来出现真实的非 Node consumer 后，再考虑抽出 `@loomrealm/fsdb` 和 Fetch-compatible adapter。

### 6.7 第一版主要 exports

```ts
export {
  openFsdb,
  createFsdbHttpHandler,
  serveFsdb,
};
```

职责：

```text
openFsdb
    storage snapshot semantics

createFsdbHttpHandler
    FSDB HTTP semantics

serveFsdb
    Node server convenience composition
```

最终 TypeScript signature 在首个实现前仍可微调，但上述职责与 ownership boundary 应保持稳定。

---

## 7. HTTP Surface

第一版只有两个 route pattern：

```text
GET|HEAD /fsdb/v1
GET|HEAD /fsdb/v1/{kind}/{table}/{entry...}
```

其中：

```text
kind = struct | extend | group | resource
```

`entry...`：

- `struct` / `extend` / `group` 普通 key 只占一个 logical segment；
- `resource` 普通 key 可占多个 logical segment；
- `$info` / `$extend` / `$desc` 是 metadata entry。

### 7.1 Database Descriptor

```text
GET|HEAD /fsdb/v1
```

概念响应：

```json
{
  "name": "游戏数据",
  "tables": [
    { "kind": "struct", "name": "角色" },
    { "kind": "group", "name": "地图事件" },
    { "kind": "resource", "name": "图片" }
  ]
}
```

只列数据库 identity 与 table，不列 keys，不暴露 physical path。

`tables` 必须稳定排序：

```text
kind lexical order
then TableName Unicode code point order
```

这样 descriptor bytes、测试与 ETag 不依赖 filesystem `readdir()` 顺序。

`/fsdb/v1` 中 `v1` 是 HTTP API version，不是 FSDB format version。

### 7.2 Data Entry

```text
GET|HEAD /fsdb/v1/struct/{table}/{key}
GET|HEAD /fsdb/v1/extend/{table}/{key}
GET|HEAD /fsdb/v1/group/{table}/{key}
GET|HEAD /fsdb/v1/resource/{table}/{resourceKey...}
```

示例 logical URL：

```text
[struct]角色/皮卡丘.json
→ /fsdb/v1/struct/角色/皮卡丘

[group]地图事件/常磐森林.jsonl
→ /fsdb/v1/group/地图事件/常磐森林

[resource]图片/关都地区/真新镇.png
→ /fsdb/v1/resource/图片/关都地区/真新镇
```

HTTP 不携 Resource extension。

### 7.3 Metadata Entry

```text
.info.meta   ↔ $info
.extend.meta ↔ $extend
.desc.meta   ↔ $desc
```

合法组合：

| kind | 普通 key | `$info` | `$extend` | `$desc` |
|---|---|---|---|---|
| `struct` | yes | yes | no | optional |
| `extend` | yes | yes | yes | optional |
| `group` | yes | yes | optional | yes |
| `resource` | yes | no | no | yes |

允许但不存在的 optional metadata 返回 `404`。

### 7.4 URL Segment 编码

FSDB logical identity 使用 Unicode；HTTP wire 对每个 logical segment 单独编码。

Canonical client encoding：

```text
logical segment
→ UTF-8 bytes
→ RFC 3986 percent-encoding
```

普通 segment 只保留 ASCII unreserved characters：

```text
A-Z a-z 0-9 - . _ ~
```

其他 UTF-8 bytes 使用 `%HH`，hex 使用 uppercase。metadata entry `$info/$extend/$desc` 可以直接使用其 ASCII spelling。

服务端必须：

```text
取 raw URL path spelling，不先做整体 decode
→ 按 raw literal "/" 切分 segment
→ 每个 segment percent-decode exactly once
→ UTF-8 decode
→ NFC canonicalization / logical validation
→ index lookup
```

规则：

- `+` 在 path 中就是 `+`，不得按 form encoding 转为空格；
- malformed percent encoding 返回 `400`；
- invalid UTF-8 返回 `400`；
- decoded ordinary segment canonicalize 为 NFC 后必须满足 FSDB `NameSegment`；
- decoded segment 中出现 `/`、`\\`、NUL 等禁止字符返回 `400`；因此 `%2F` 不能在单个 segment 内制造额外 Resource 层级；
- metadata `$info/$extend/$desc` 在 ordinary NameSegment 校验之前识别；
- 空 segment、重复 `/`、普通 route 的 trailing `/` 都返回 `400`；
- 第一版不定义 query parameter；non-empty query component 返回 `400`；
- fragment 不属于 HTTP request-target，因此不参与服务端 identity。

服务端 MAY 接受语义等价但非 canonical 的 percent-encoding spelling；lookup 永远基于 decoded + NFC logical identity，而不是 raw URL bytes。

---

## 8. Response / Cache 原则

文件型响应尽量发送磁盘原始 bytes，不 parse 后重新 serialize。

```text
struct key / extend key
    → application/json; charset=utf-8

group key / $extend
    → application/x-ndjson; charset=utf-8

$info
    → application/schema+json; charset=utf-8
       若兼容性需要可退回 application/json; charset=utf-8

$desc
    → text/markdown; charset=utf-8

resource known extension
    → MIME mapping

resource unknown extension
    → application/octet-stream
```

Database Descriptor：

```text
application/json; charset=utf-8
```

第一版成功表示统一使用：

```http
Cache-Control: no-cache
```

含义是：缓存 MAY 保存响应，但在再次使用前必须向当前 service revalidate。

这样 snapshot-local ETag 才能真正控制 reopen 后的缓存复用：

```text
cached body
→ mandatory revalidation
→ same snapshot + unchanged → 304
→ new snapshot            → 200 new representation
→ stale source            → 503
```

第一版不使用 `no-store`，因为允许客户端保存 representation 并进行条件请求是有价值的。

支持：

```text
Content-Length
ETag
If-None-Match
304 Not Modified
Cache-Control: no-cache
```

`HEAD` 与对应 `GET` 返回相同的可确定 representation headers，但没有 body。

---

## 9. HTTP Methods / Conditional Request

### 9.1 Methods

第一版只允许：

```text
GET
HEAD
```

对于 syntactically valid 的 FSDB route shape，其他 method 返回：

```text
405 Method Not Allowed
Allow: GET, HEAD
```

第一版不因为 `OPTIONS`、CORS 或 framework convention 自动增加额外 method。

### 9.2 `If-None-Match`

`If-None-Match` 直接遵循标准 HTTP GET/HEAD conditional request 语义，不定义 FSDB 私有方言。

实现必须支持标准语义，包括：

```text
weak entity-tag comparison
"*"
comma-separated entity-tag list
```

返回 `304` 前必须先完成当前 snapshot 的 source-state / same-handle fingerprint 检查。不能因为 header 命中就跳过 stale detection。

---

## 10. Route / Status / Error Boundary

处理优先级固定为：

```text
1. 是否属于 /fsdb/v1 namespace
2. URL / route syntax / encoding validation
3. method validation
4. GET/HEAD logical lookup / existence
5. source-state / same-handle validation
6. conditional request
7. response
```

因此：

```text
outside /fsdb/v1 namespace
    → 404

inside namespace but malformed path/encoding
    → 400

syntactically valid FSDB route + unsupported method
    → 405

GET/HEAD valid route but kind/table/key/metadata not found
    → 404

FsdbDatabase stale/closed or drift detected
    → 503
```

示例：

```text
POST /other
→ 404

POST /fsdb/v1/struct/角色/皮卡丘
→ 405

POST /fsdb/v1/struct//皮卡丘
→ 400

GET /fsdb/v1/struct/角色/不存在
→ 404
```

状态表：

| 情况 | Status |
|---|---:|
| `GET` / `HEAD` 命中 | `200` |
| `If-None-Match` 命中 | `304` |
| malformed URL / encoding / logical identity | `400` |
| namespace 外或 GET/HEAD logical object 不存在 | `404` |
| syntactically valid FSDB route 使用非 GET/HEAD | `405` |
| `FsdbDatabase` stale / closed / source drift | `503` |
| unexpected local implementation/service failure | `500` |

第一版不建立复杂 error protocol。实现 MAY 返回很小的 JSON body，例如：

```json
{ "error": "not_found" }
```

错误不得泄露：

```text
absolute path
user home
internal stack
raw filesystem error path
physical metadata filename
```

`HEAD` 错误响应同样不得包含 body。

---

## 11. Index / Validation

`openFsdb()` 必须要求 **Well-formed FSDB**，但不默认要求完整 Integrity-valid。

至少检查：

```text
DatabaseName / TableName / Key / ResourceKey NameSegment rules
TableIdentity = (kind, TableName) uniqueness
physical-name → NFC logical-name canonicalization
normalization collision
UTF-8 byte limits after NFC
recognized table directory type
required metadata exists
metadata syntax valid
struct/extend entry is JSON object
group JSONL record is JSON object
logical key identity unique
hierarchical ResourceKey mapping
resource collision across extensions
Resource Extension grammar
physical path containment
no indexed symlink escape
```

`.extend.meta` 自身的 JSONL shape 和 required field types 属于 Well-formed validation。

以下属于更深的 Integrity validation，不默认阻塞 HTTP raw-read：

```text
完整 JSON Schema record validation
所有 cross-record reference target 存在
其他业务完整性约束
```

`openFsdb()` 的语义是：

> 这个目录可以安全、无歧义地解释为 FSDB logical namespace。

而不是：

> 所有业务数据关系已经被完整证明正确。

---

## 12. Resource Index

例如：

```text
[resource]图片/UI/道具.large.webp
```

概念索引：

```ts
{
  kind: "resource",
  table: "图片",
  key: "UI/道具.large",
  extension: ".webp",
  mime: "image/webp",
  // validated internal file identity + snapshot fingerprint
}
```

索引器递归扫描合法非 dot-prefixed Resource 子目录，将 observed physical segment canonicalize 为 NFC，并转换成 `/` 分隔的 ResourceKey。

子目录只参与 key，不形成 table 或 metadata scope。

---

## 13. Discovery Boundary

第一版只有：

```text
GET|HEAD /fsdb/v1
```

做 table-level discovery。

第一版不提供：

```text
GET /fsdb/v1/{kind}/{table}
GET /fsdb/v1/{kind}/{table}/keys
```

不做 key listing，从而避免提前引入排序、分页、大响应上限和 enumeration semantics。

---

## 14. Source Lifetime

第一版把打开后的 FSDB 视为**静态 source**。

宿主 contract：

> `FsdbDatabase` 处于 open snapshot 期间，宿主不得修改其 FSDB source directory。修改内容需要关闭并重新 `openFsdb()`。

每次成功 `openFsdb()` 生成新的、仅进程内使用的 `snapshotId`。`snapshotId`：

```text
不是 FSDB identity
不是 wire authority
不写回磁盘
只隔离本次 open instance 的 cache validator namespace
```

逻辑状态：

```text
open → stale → closed
  └──────────→ closed
```

### 14.1 open

```text
scan
→ Well-formed validation
→ immutable logical index
→ capture source fingerprints
→ generate fresh snapshotId
→ admit read leases
```

### 14.2 stale

请求读取已索引 object 时，如果 same-handle validation 检测到：

```text
indexed file disappeared / cannot be safely opened
regular file type changed
indexed file became symlink / unsafe target
relevant file fingerprint changed
indexed metadata became unreadable
```

则整个 `FsdbDatabase` 原子进入 `stale`。

进入 stale 后：

```text
停止接纳新 read lease
不局部 reindex
不 hot reload
不继续混合 old/new snapshot
后续 HTTP read 返回 503
```

已经在 drift 被发现前成功 admitted 的其他 read lease 不被主动回滚；它们基于各自已打开的 handle 完成或因本地 I/O 错误失败。第一版不尝试跨 request transaction。

恢复方式只有：

```text
close
→ openFsdb(root)
```

新增但未被初始 index 接受的文件不会在当前实例中突然出现；新 namespace 只能通过 reopen 建立。

static-source contract 是 correctness assumption；drift detection + same-handle read 是 fail-closed 防线，不是 watch/hot-reload 机制，也不承诺抵抗拥有并发写权限的恶意本地 writer。

### 14.3 closed / drain

调用 `db.close()`：

```text
atomically stop admitting new read leases
→ public state becomes closed
→ wait already admitted leases to finish
→ release remaining snapshot resources
→ resolve close Promise
```

因此关闭不会无理由截断一个已经成功接纳、正在发送大 Resource 的正常请求。

---

## 15. ETag / Cache

ETag 建立在第 14 节 static-source snapshot 上。

文件型 entry 第一版使用 snapshot-local weak ETag，至少包含：

```text
snapshotId
+
entry fingerprint
```

entry fingerprint 可基于：

```text
size
mtime/mtimeNs
以及实现可稳定获得的 file identity fields
```

概念形式：

```text
W/"<snapshotId>-<entryFingerprint>"
```

文件型请求的决策顺序：

```text
safe open handle
→ fstat same handle
→ verify snapshot fingerprint
→ build current ETag
→ evaluate If-None-Match
→ 304 or stream same handle
```

不能：

```text
compare old ETag first
→ 304
→ skip source validation
```

所有可缓存成功 representation 使用：

```http
Cache-Control: no-cache
```

因此 close/reopen 后，即使 URL 相同，cache 也必须 revalidate；新的 `snapshotId` 会阻止旧 validator 误命中新 snapshot。

Database Descriptor 由 immutable index 生成，使用稳定 table 排序和 deterministic JSON serialization；其 ETag 同样纳入当前 `snapshotId`，并使用相同 `Cache-Control: no-cache`。

第一版不承诺跨 reopen cache continuity。

未来 FSDB 若拥有 authoritative content hash，再优先使用该 authority，并可重新评估跨 snapshot cache reuse / max-age / immutable policy。

---

## 16. 与 LoomRealm Content API 的关系

```text
@loomrealm/fsdb-http
    FSDB storage semantics
    disk → HTTP

LoomRealm Content API
    installation/game logical content semantics
```

本包不加入：

```text
installationId
Game Package
Desktop Content bearer
Renderer / Runtime identity
Content API route
```

上层可以组合本包，但两层不强制一一映射。

---

## 17. 第一阶段实现顺序

```text
1. FSDB NameSegment / TableIdentity / Key / ResourceKey types
2. Well-formed validator
3. scanner + NFC logical index
4. safe open + same-handle fstat + path containment
5. source fingerprints + read lease primitive
6. hierarchical ResourceKey indexing
7. raw URL split + percent-decode + logical resolver
8. Node RequestListener + route/method precedence
9. raw JSON / JSONL / Resource streaming
10. metadata logical entry
11. MIME + Content-Length
12. OPEN / STALE / CLOSED lifecycle + snapshotId + drain
13. ETag / standard If-None-Match / Cache-Control: no-cache
14. serveFsdb() ownership / wildcard address / close tests
15. malformed/not-found/stale/method/cache tests
16. real Unicode FSDB fixture + embedded/standalone consumer smoke
```

暂不实现：

```text
Range
watch/hot reload
auth
write API
query/filter
reference expansion
key listing
full Integrity-valid checker
Express/Koa/Fastify/Hono adapter
CLI/daemon process management
```

---

## 18. 第一版完成标准

给定静态 FSDB fixture，可以完成：

```text
open
→ Well-formed validation/index
→ createFsdbHttpHandler(db)
→ attach to node:http createServer
→ GET/HEAD struct/extend/group/resource
→ GET/HEAD hierarchical ResourceKey
→ GET/HEAD metadata
→ Unicode NameSegment URL round-trip
→ correct raw bytes / MIME / Content-Length / ETag / Cache-Control
```

同时：

```text
serveFsdb({ root, host, port })
→ starts standalone node:http service
→ exposes concrete address
→ service.close() blocks new reads, drains admitted requests,
  closes owned server and database
```

必须证明：

```text
中文等 Unicode key 可正常读取
canonically equivalent physical spelling 收敛到同一 NFC logical identity
normalization collision 被拒绝
TableIdentity = (kind, TableName) 无歧义
$ / . reserved namespace 不与业务 key 冲突
Resource 子目录稳定映射为 hierarchical logical key
扩展名不参与 Resource identity
%2F 不能突破 HTTP segment boundary
空 segment / trailing slash / query 不扩大 API surface
route / method / existence status precedence 固定
无法通过 URL 读取 index 外文件
无法 path traversal
无法 symlink escape
文件响应使用同一 handle 完成 fstat + validation + stream
source drift 后进入 stale 且返回 503
close 不接纳新请求但允许已 admitted stream drain
If-None-Match 支持标准 weak/list/* 语义
Cache-Control: no-cache 强制旧缓存 revalidate
reopen 后旧 ETag 不会误命中新 snapshot
createFsdbHttpHandler 不隐式拥有/关闭 caller-provided db
serveFsdb 明确拥有并关闭其创建的 db/server
wildcard bind 不伪造唯一 client origin
service.server escape hatch 不改变 service.close ownership
核心 package 无 Web Framework runtime dependency
无法写入 FSDB
错误不泄露 physical path
```

达到上述条件后，第一版设计即可进入实现。Range、完整 Integrity validation、framework adapter、CLI 或抽分 `@loomrealm/fsdb` 只在真实消费者需要时继续增加。