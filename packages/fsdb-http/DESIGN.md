# @loomrealm/fsdb-http v1 实现合同

> 状态：**Frozen for Implementation — v1**  
> 冻结日期：2026-08-17  
> 目标：把硬盘上的只读 FSDB 目录转换成稳定、安全、可独立使用的 HTTP 接口  
> FSDB authority：[FSDB 目录结构详解](../../doc/fsdb/FSDB目录结构详解.md)  
> Conformance：[CONFORMANCE.md](./CONFORMANCE.md)

本文冻结 `@loomrealm/fsdb-http` 第一版的**可观察行为、public API、ownership 与安全不变量**。实现可以自由调整内部模块、类、helper、数据结构和性能策略，只要不改变本文冻结的 observable contract。

---

## 0. Frozen Contract

### 0.1 冻结内容

v1 冻结以下内容：

```text
FSDB logical identity 的继承方式
HTTP routes / methods / status precedence
Unicode URL encoding / decoding
metadata logical namespace
response MIME / cache / conditional semantics
Well-formed validation boundary
single-handle read invariant
OPEN / STALE / CLOSED source lifetime
read admission / close drain semantics
Node.js public API
handler / service ownership
framework / Content API boundary
```

### 0.2 不冻结内容

以下属于 implementation detail：

```text
src/ 内部目录结构
class / function / helper 划分
immutable index 的具体数据结构
fingerprint 的内部编码与 hash 选择
read lease 的具体实现方式
stream.pipeline 等 Node API 选择
内部 error class
logging / diagnostics 结构
性能优化与缓存内部实现
```

### 0.3 Frozen 后的变更规则

文案澄清、例子、测试 fixture 和内部实现优化可以继续增加，只要不改变合法实现集合。

如果实现或 conformance 暴露真实边界问题：

```text
implementation
→ conformance test
→ boundary issue
→ classify
```

- **clarification**：不改变 observable contract，可直接修正文档；
- **semantic change**：改变 public API / HTTP observable behavior / identity / lifecycle / security invariant，必须显式解除 v1 冻结或进入后续版本，不得静默修改。

---

## 1. 包定位与 Scope

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

目标依赖关系：

```text
Node.js stdlib
    ↓
@loomrealm/fsdb-http
```

v1 目标为 **0 runtime dependencies**。

本包负责：

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
可选独立 node:http convenience service
```

本包不负责：

```text
写入 / 删除 / import
filesystem watch / hot reload
完整 Integrity-valid 检查
automatic reference join
query / filter / pagination
ORM / business schema mapping
key listing
Range
auth / rate limiting
Express / Koa / Fastify / Hono dependency
LoomRealm installation registry
Game Package / Content API
Main / Frame / Renderer authority
CLI / daemon process management
```

核心 authority：

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

## 2. 继承的 FSDB Identity

HTTP 层直接继承 FSDB 规范，不自行定义另一套 key 语义。

### 2.1 TableIdentity

```text
TableKind = struct | extend | group | resource
TableIdentity = (TableKind, TableName)
```

因此：

```text
[struct]角色
[resource]角色
```

可以共存；同一 `(TableKind, TableName)` 不得重复。

### 2.2 Unicode NameSegment

`DatabaseName`、`TableName`、普通 `Key` 与 ResourceKey segment 均继承 FSDB `NameSegment`。

scanner：

```text
physical Unicode name
→ NFC canonicalization
→ NameSegment validation
→ logical identity
```

如果两个 physical names canonicalize 为同一个 NFC logical identity，`openFsdb()` MUST 失败。

本包不得自行 ASCII 化、lowercase、trim、collapse whitespace 或改变合法 NFC logical name。

中文等可读 Unicode 是正常 identity：

```text
[struct]角色/皮卡丘.json
→ table = 角色
→ key   = 皮卡丘
```

### 2.3 保留命名空间

FSDB 已保留 `$` logical prefix 与 `.` physical prefix，因此 HTTP 使用：

```text
$info
$extend
$desc
```

不会侵占合法业务 key。

### 2.4 ResourceKey

```text
ResourceKey = NameSegment ("/" NameSegment)*
```

例如：

```text
[resource]图片/关都地区/真新镇.png
→ key = 关都地区/真新镇
```

Resource 最后扩展名不属于 identity。同一 Resource 表中：

```text
皮卡丘.png
皮卡丘.webp
```

产生相同 key，属于 duplicate logical key，`openFsdb()` MUST 拒绝。

---

## 3. 核心安全与读取不变量

### 3.1 URL identity 不得直接变成 filesystem path

禁止：

```text
request URL
→ path.join(root, request segments)
→ read file
```

必须：

```text
openFsdb(root)
→ scan / validate
→ immutable logical index

request logical identity
→ index lookup
→ validated internal file identity
→ safe file-handle read
```

Index 中 physical location 不得返回客户端。

v1：

```text
不 follow symlink
resolved object 不得逃逸 FSDB root
不暴露 index 外对象
不暴露 absolute/raw filesystem path
```

对象分类：

```text
unrecognized auxiliary object
    → ignore / not index / not serve

recognized FSDB candidate but malformed
    → openFsdb() fails
```

### 3.2 Single-handle read invariant

文件型响应禁止：

```text
stat(path)
→ validate
→ reopen(path)
→ stream
```

必须使用同一个已打开 file handle：

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

> **validation handle = streaming handle**

safe-open 或 same-handle `fstat` 发现对象已不符合当前 snapshot 时，database MUST 进入 `stale`；不得按 pathname 自动 reindex、retry 或修复。

static-source contract 仍是 correctness assumption；same-handle read 与 drift detection 是 fail-closed 防线，不承诺提供 filesystem transaction 或抵抗拥有并发写权限的恶意本地 writer。

---

## 4. Frozen Node.js Public API

v1 package engine：Node.js `>=20`。

```ts
import type { RequestListener, Server } from "node:http";

export interface OpenFsdbOptions {
  readonly root: string;
}

export type FsdbDatabaseState = "open" | "stale" | "closed";

export interface FsdbDatabase {
  readonly name: string;
  readonly state: FsdbDatabaseState;
  close(): Promise<void>;
}

export function openFsdb(
  options: OpenFsdbOptions,
): Promise<FsdbDatabase>;

export function createFsdbHttpHandler(
  db: FsdbDatabase,
): RequestListener;

export interface ServeFsdbOptions extends OpenFsdbOptions {
  readonly host?: string;
  readonly port?: number;
}

export interface FsdbHttpService {
  readonly db: FsdbDatabase;
  readonly server: Server;
  readonly address: {
    readonly host: string;
    readonly port: number;
  };
  readonly origin?: URL;
  close(): Promise<void>;
}

export function serveFsdb(
  options: ServeFsdbOptions,
): Promise<FsdbHttpService>;
```

v1 primary exports：

```ts
export {
  openFsdb,
  createFsdbHttpHandler,
  serveFsdb,
};
```

### 4.1 `openFsdb()` ownership

`openFsdb()` 建立 storage snapshot，不启动端口，也不拥有 HTTP server。

`FsdbDatabase.close()` MUST 幂等：

```text
stop admitting new read leases
→ public state becomes closed
→ admitted leases may finish
→ wait leases drain
→ release remaining resources
→ resolve Promise
```

不增加公开 `closing` state。

### 4.2 `createFsdbHttpHandler()` ownership

`createFsdbHttpHandler(db)` **借用** caller-provided database：

```text
handler does not own db
server close does not implicitly close db
caller owns db.close()
```

handler 直接拥有 `/fsdb/v1` namespace；v1 不是 middleware，不提供 `next()`，不支持 configurable mount path。

### 4.3 `serveFsdb()` ownership

默认：

```text
host = 127.0.0.1
port = 0 allowed
```

`serveFsdb()` owns 它创建的 database 与 `http.Server`。

`service.close()` MUST 幂等：

```text
block new database reads
→ stop accepting new HTTP connections
→ allow admitted responses to drain
→ close owned server
→ close owned database
→ resolve
```

`origin` 仅在 bind host 能表示具体 client origin 时提供。`0.0.0.0`、`::` 等 wildcard bind 只保证 `address`，不得伪造唯一 externally reachable origin。

`service.server` 是 Node escape hatch，可用于 timeout、`unref()`、address inspection 等，但不转移 lifecycle ownership。caller SHOULD NOT 用 `server.close()` 替代 `service.close()`；即使提前关闭 server，后续 `service.close()` 仍必须安全关闭 owned database。

---

## 5. HTTP Surface

v1 只有两个 route patterns：

```text
GET|HEAD /fsdb/v1
GET|HEAD /fsdb/v1/{kind}/{table}/{entry...}
```

`kind`：

```text
struct | extend | group | resource
```

普通 entry：

```text
struct / extend / group
    → one logical key segment

resource
    → one or more ResourceKey segments
```

### 5.1 Database Descriptor

```text
GET|HEAD /fsdb/v1
```

响应结构：

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

只列 database identity 与 tables，不列 keys，不暴露 physical path。

`tables` MUST 稳定排序：

```text
kind lexical order
then TableName Unicode code point order
```

`/fsdb/v1` 的 `v1` 是 HTTP API version，不是 FSDB format version。

### 5.2 Data Entry

```text
/fsdb/v1/struct/{table}/{key}
/fsdb/v1/extend/{table}/{key}
/fsdb/v1/group/{table}/{key}
/fsdb/v1/resource/{table}/{resourceKey...}
```

HTTP Resource URL 不携 physical extension。

### 5.3 Metadata Entry

```text
.info.meta   ↔ $info
.extend.meta ↔ $extend
.desc.meta   ↔ $desc
```

| kind | 普通 key | `$info` | `$extend` | `$desc` |
|---|---|---|---|---|
| `struct` | yes | yes | no | optional |
| `extend` | yes | yes | yes | optional |
| `group` | yes | yes | optional | yes |
| `resource` | yes | no | no | yes |

optional metadata 不存在返回 `404`。

---

## 6. URL Segment Encoding

Canonical client encoding：

```text
logical segment
→ UTF-8 bytes
→ RFC 3986 percent-encoding
```

普通 segment 仅保留 ASCII unreserved：

```text
A-Z a-z 0-9 - . _ ~
```

其他 bytes 使用 uppercase `%HH`。metadata `$info/$extend/$desc` 可直接使用 ASCII spelling。

服务端：

```text
raw URL path spelling
→ split by raw literal "/"
→ percent-decode each segment exactly once
→ UTF-8 decode
→ NFC canonicalization / logical validation
→ index lookup
```

冻结规则：

- `+` 在 path 中就是 `+`，不得转为空格；
- malformed percent encoding → `400`；
- invalid UTF-8 → `400`；
- decoded ordinary segment canonicalize 为 NFC 后必须满足 FSDB `NameSegment`；
- decoded `/`、`\\`、NUL 等禁止字符 → `400`，所以 `%2F` 不能制造 Resource 层级；
- metadata `$...` 在 ordinary NameSegment 校验前识别；
- 空 segment、重复 `/`、普通 route trailing `/` → `400`；
- v1 不定义 query parameter，non-empty query → `400`；
- fragment 不属于 HTTP request-target。

服务端 MAY 接受语义等价但 non-canonical 的 percent spelling；lookup 永远基于 decoded + NFC logical identity。

---

## 7. Response、MIME 与 Cache

文件型响应尽量返回磁盘原始 bytes，不 parse 后重新 serialize。

固定类型：

```text
struct / extend
    application/json; charset=utf-8

group / $extend
    application/x-ndjson; charset=utf-8

$info
    application/schema+json; charset=utf-8

$desc
    text/markdown; charset=utf-8

database descriptor
    application/json; charset=utf-8
```

### 7.1 Resource MIME authority

Resource MIME MUST 来自 package-owned deterministic mapping；不得依赖 OS registry、`/etc/mime.types` 或运行机器环境。

v1 mapping：

| Extension | Content-Type |
|---|---|
| `avif` | `image/avif` |
| `bmp` | `image/bmp` |
| `css` | `text/css; charset=utf-8` |
| `gif` | `image/gif` |
| `html` | `text/html; charset=utf-8` |
| `ico` | `image/x-icon` |
| `jpeg` / `jpg` | `image/jpeg` |
| `js` / `mjs` | `text/javascript; charset=utf-8` |
| `json` | `application/json; charset=utf-8` |
| `md` | `text/markdown; charset=utf-8` |
| `mp3` | `audio/mpeg` |
| `mp4` | `video/mp4` |
| `ogg` | `audio/ogg` |
| `otf` | `font/otf` |
| `png` | `image/png` |
| `svg` | `image/svg+xml` |
| `ttf` | `font/ttf` |
| `txt` | `text/plain; charset=utf-8` |
| `wasm` | `application/wasm` |
| `wav` | `audio/wav` |
| `webm` | `video/webm` |
| `webp` | `image/webp` |
| `woff` | `font/woff` |
| `woff2` | `font/woff2` |

其他合法 extension：

```text
application/octet-stream
```

改变此 mapping 属于 observable behavior change，需按 Frozen change rule 处理。

### 7.2 Representation headers

成功 representation 支持：

```text
Content-Type
Content-Length
ETag
Cache-Control: no-cache
```

所有可缓存成功 representation MUST 使用：

```http
Cache-Control: no-cache
```

这允许缓存保存 body，但再次使用前必须 revalidate。

`HEAD` 与对应 `GET` 返回相同的可确定 representation headers，但不返回 body。

### 7.3 Error body 非契约

v1 **不定义 error body schema**。

实现 MAY 返回空 body 或极小 JSON，例如：

```json
{ "error": "not_found" }
```

客户端 MUST NOT 依赖 error body、error JSON 字段或错误文本作为 v1 contract。

规范性的错误信息是 status、`Allow` 等本文明确冻结的 HTTP semantics。

错误不得泄露：

```text
absolute path
user home
internal stack
raw filesystem error path
physical metadata filename
```

`HEAD` 错误响应不得包含 body。

---

## 8. Methods、Conditional Request 与 Status Precedence

### 8.1 Methods

v1 只允许：

```text
GET
HEAD
```

syntactically valid FSDB route 使用其他 method：

```http
405 Method Not Allowed
Allow: GET, HEAD
```

不自动增加 `OPTIONS`、CORS 或 framework method。

### 8.2 `If-None-Match`

直接采用标准 HTTP GET/HEAD conditional semantics，包括：

```text
weak entity-tag comparison
*
comma-separated entity-tag list
```

不得定义 FSDB 私有 conditional dialect。

### 8.3 固定处理顺序

```text
1. /fsdb/v1 namespace
2. URL / route syntax / encoding
3. method
4. GET/HEAD logical lookup / existence
5. source-state / same-handle validation
6. conditional request
7. response
```

因此：

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

状态：

| 情况 | Status |
|---|---:|
| `GET` / `HEAD` 命中 | `200` |
| `If-None-Match` 命中 | `304` |
| malformed URL / encoding / logical identity | `400` |
| namespace 外或 GET/HEAD object 不存在 | `404` |
| syntactically valid route + unsupported method | `405` |
| database stale / closed / source drift | `503` |
| unexpected implementation/service failure | `500` |

---

## 9. Index / Validation Boundary

`openFsdb()` MUST 要求 **Well-formed FSDB**，但不默认要求完整 Integrity-valid。

至少验证：

```text
DatabaseName / TableName / Key / ResourceKey rules
TableIdentity uniqueness
physical-name → NFC logical-name canonicalization
normalization collision
UTF-8 byte limits after NFC
recognized table directory type
required metadata exists
metadata syntax
struct/extend entry is JSON object
group JSONL record is JSON object
logical key uniqueness
hierarchical ResourceKey mapping
resource collision across extensions
Resource Extension grammar
physical path containment
no indexed symlink escape
```

`.extend.meta` JSONL shape 与 required field types 属于 Well-formed validation。

不默认阻塞 raw-read 的 Integrity validation：

```text
完整 JSON Schema record validation
所有 cross-record reference target 存在
其他业务完整性约束
```

`openFsdb()` 成功表示：

> 当前目录可以安全、无歧义地解释为 FSDB logical namespace。

不表示所有业务关系已经完整验证。

---

## 10. Discovery Boundary

v1 只有：

```text
GET|HEAD /fsdb/v1
```

做 table-level discovery。

v1 不提供：

```text
GET /fsdb/v1/{kind}/{table}
GET /fsdb/v1/{kind}/{table}/keys
```

因此不提前引入 key enumeration、pagination、listing size 或 enumeration snapshot semantics。

---

## 11. Source Lifetime

v1 把打开后的 FSDB 视为**静态 source**。

宿主 contract：

> `FsdbDatabase` open snapshot 期间不得修改其 source directory；修改内容需要 close + reopen。

每次成功 `openFsdb()` 生成 fresh process-local `snapshotId`：

```text
not FSDB identity
not wire authority
not persisted
only isolates cache validator namespace
```

状态：

```text
open → stale → closed
  └──────────→ closed
```

### 11.1 open

```text
scan
→ Well-formed validation
→ immutable logical index
→ capture source fingerprints
→ generate snapshotId
→ admit read leases
```

### 11.2 stale

same-handle validation 检测到以下 drift 时，整个 database MUST 原子进入 stale：

```text
indexed file disappeared / cannot be safely opened
regular file type changed
indexed file became symlink / unsafe target
relevant fingerprint changed
indexed metadata became unreadable
```

stale 后：

```text
stop new read leases
no reindex
no hot reload
no old/new snapshot mixing
subsequent HTTP reads → 503
```

在 drift 被发现前已经 admitted 的其他 leases 不主动回滚；它们基于各自已打开 handle 完成，或因 I/O 错误失败。v1 不提供 cross-request transaction。

如果已发送 headers 后发生 read I/O failure，不能重写 HTTP status；实现应终止该 response，并在能够判定 snapshot invariant 被破坏时 mark stale。

恢复只有：

```text
close
→ openFsdb(root)
```

### 11.3 closed / drain

`db.close()`：

```text
stop admitting reads
→ public state = closed
→ wait admitted leases
→ release resources
→ resolve
```

正常关闭不得无理由截断已经 admitted 的大 Resource stream。

---

## 12. ETag / Cache Snapshot Semantics

文件型 entry 使用 snapshot-local weak ETag：

```text
snapshotId + entry fingerprint
```

概念：

```text
W/"<snapshotId>-<entryFingerprint>"
```

`entryFingerprint` 的具体内部编码不冻结，但必须足以执行本文 same-snapshot drift check。

文件型请求顺序：

```text
safe open handle
→ fstat same handle
→ verify snapshot fingerprint
→ build current ETag
→ evaluate If-None-Match
→ 304 or stream same handle
```

禁止：

```text
compare old ETag first
→ 304
→ skip source validation
```

Database Descriptor 由 immutable index 以稳定排序和 deterministic JSON serialization 生成；descriptor ETag 同样纳入 current `snapshotId`。

v1 不承诺跨 reopen cache continuity。因为所有成功 representation 使用 `Cache-Control: no-cache`，reopen 后 cache 必须 revalidate，fresh `snapshotId` 会使旧 validator miss。

---

## 13. Node / Framework / Content Boundary

### 13.1 Framework adapter

v1 不提供 Express/Koa/Fastify/Hono adapter。

未来 adapter MUST 保留：

```text
raw URL spelling
segment decode rules
route/status semantics
cache semantics
single-handle read
source lifetime
ownership
```

如果 framework 无法提供足够原始 request-target/URL spelling，则 adapter 不应宣称完全等价。

### 13.2 Fetch binding

v1 不以 WHATWG `Request → Response` 为主 API。当前问题域是 Node filesystem + Node local HTTP serving。

出现真实非 Node consumer 后，再考虑抽出 `@loomrealm/fsdb` 与 Fetch-compatible adapter。

### 13.3 LoomRealm Content API

```text
@loomrealm/fsdb-http
    FSDB storage semantics
    disk → HTTP

LoomRealm Content API
    installation/game logical content semantics
```

本包不加入 `installationId`、Game Package、Content bearer、Renderer/Runtime identity 或 Content API routes。

---

## 14. 实施顺序

Frozen v1 建议按以下 vertical slices 实现：

```text
1. NameSegment / TableIdentity / Key / ResourceKey types
2. Well-formed validator
3. scanner + NFC logical index
4. safe open + same-handle fstat + path containment
5. source fingerprints + read lease
6. hierarchical ResourceKey indexing
7. raw URL split + percent-decode + logical resolver
8. Node RequestListener + route/method precedence
9. JSON / JSONL / Resource streaming
10. metadata logical entry
11. deterministic MIME + Content-Length
12. OPEN / STALE / CLOSED + snapshotId + drain
13. ETag / If-None-Match / Cache-Control
14. serveFsdb ownership / wildcard address / close
15. conformance fixtures + embedded/standalone smoke
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
framework adapters
CLI/daemon management
```

---

## 15. Implementation Exit Gate

v1 implementation 完成必须通过 [CONFORMANCE.md](./CONFORMANCE.md) 的 mandatory cases，并证明至少以下 invariants：

```text
Unicode/NFC logical identity 稳定
TableIdentity 无歧义
$ / . namespaces 不冲突
hierarchical ResourceKey 稳定
extension 不参与 Resource identity
URL percent decoding 无 traversal ambiguity
route / method / status precedence 固定
index 外文件不可读取
symlink/path escape 被拒绝
same handle 完成 fstat + conditional + stream
source drift 单调进入 stale
close 阻止新读并 drain admitted reads
If-None-Match 标准语义
Cache-Control: no-cache + snapshot ETag 闭环
handler 不拥有 caller db
serveFsdb 拥有并安全关闭 server/db
MIME mapping deterministic
核心 package 无 Web Framework runtime dependency
错误不泄露 physical path
```

通过该 gate 后，v1 可以从 **Frozen for Implementation** 推进到 implemented/release candidate；后续新增能力必须由真实消费者驱动。