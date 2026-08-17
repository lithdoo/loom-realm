# @loomrealm/fsdb-http v1 实现合同

> 状态：**Frozen for Implementation — v1**  
> 最后冻结复核：2026-08-17  
> 目标：把硬盘上的只读 FSDB 目录转换成稳定、安全、可独立使用的 Node.js HTTP 接口  
> FSDB authority：[FSDB 目录结构详解](../../doc/fsdb/FSDB目录结构详解.md)  
> Conformance：[CONFORMANCE.md](./CONFORMANCE.md)

本文冻结 `@loomrealm/fsdb-http` v1 的**可观察行为、public API、ownership、HTTP 语义与安全不变量**。实现可以自由调整内部模块、类、helper、索引结构和性能策略，只要不改变本文冻结的 contract。

---

## 0. Frozen Contract

### 0.1 冻结内容

v1 冻结：

```text
FSDB authority 的继承方式
root resolution / physical-object safety boundary
HTTP request-target / routes / methods / status precedence
Unicode URL encoding / decoding
metadata logical namespace
response MIME / cache / ETag / conditional semantics
Well-formed validation boundary
single-handle read invariant
OPEN / STALE / CLOSED source lifetime
read admission / client abort / close drain semantics
Node.js public API
handler / service ownership
framework / Content API boundary
```

### 0.2 不冻结内容

以下属于 implementation detail：

```text
src/ 内部目录结构
class / helper 划分
immutable index 的具体数据结构
fingerprint 的内部编码与 hash 选择
read lease 的具体实现方式
stream.pipeline 等 Node API 选择
内部 error class / message / code
logging / diagnostics
性能优化
```

### 0.3 Frozen 后变更规则

```text
implementation
→ conformance
→ real boundary issue
→ classify
```

- **clarification**：不改变合法实现集合，可直接修正文档或增加测试；
- **semantic change**：改变 public API、HTTP observable behavior、identity、lifecycle 或 security invariant，必须显式 unfreeze v1 或进入后续版本，不得静默修改。

---

## 1. 包定位与 Scope

```text
filesystem FSDB directory
        ↓
openFsdb()
        ↓
Well-formed validation
        ↓
immutable logical snapshot
        ↓
createFsdbHttpHandler()
        ↓
Node.js http.RequestListener
```

`serveFsdb()` 是上述能力的 standalone convenience composition。

依赖目标：

```text
Node.js stdlib
    ↓
@loomrealm/fsdb-http
```

v1 保持 **0 runtime dependencies**。

本包负责：

```text
打开一个 FSDB root
验证 Well-formed FSDB
构建 immutable logical index
按 FSDB logical identity lookup
GET / HEAD raw content serving
Unicode logical name ↔ HTTP path 映射
Content-Type / Content-Length
ETag / conditional request / cache policy
path traversal / symlink escape 防护
static-source snapshot / stale fail-closed
Node RequestListener
standalone node:http service convenience
```

本包不负责：

```text
write / delete / import
watch / hot reload / partial reindex
完整 Integrity-valid 检查
reference join
query / filter / pagination / key listing
Range / partial content
auth / rate limiting
Express / Koa / Fastify / Hono integration
LoomRealm installation / Game Package / Content API authority
CLI / daemon process management
```

Authority：

```text
FSDB spec
    owns physical format + logical identity

FsdbDatabase
    owns one accepted filesystem snapshot

HTTP handler
    owns FSDB HTTP representation semantics

serveFsdb
    owns standalone Node service composition
```

---

## 2. FSDB Identity 与 Validation Authority

HTTP 层直接继承 FSDB 规范，不增加第二套 storage identity。

```text
TableKind = struct | extend | group | resource
TableIdentity = (TableKind, TableName)

DatabaseName = NameSegment
TableName    = NameSegment
Key          = NameSegment
ResourceKey = NameSegment ("/" NameSegment)*
```

因此：

```text
[struct]角色
[resource]角色
```

可以共存；同一 `(TableKind, TableName)` duplicate 必须使 `openFsdb()` 失败。

scanner 从 physical name 构造 logical name：

```text
physical Unicode spelling
→ NFC canonicalization
→ FSDB NameSegment validation
→ logical identity
```

若多个 physical names canonicalize 为同一 logical identity，`openFsdb()` MUST 失败。

Resource 最后 extension 不属于 identity；同一 Resource 表：

```text
皮卡丘.png
皮卡丘.webp
```

必须因 duplicate ResourceKey `皮卡丘` 拒绝整个 open。

结构化 FSDB 文本的 UTF-8 规则、JSON/JSONL 规则、metadata 规则以及 Resource opaque-byte 规则均以 FSDB 规范为 authority。

---

## 3. Root、Physical Object 与 Snapshot Boundary

### 3.1 Root resolution

`OpenFsdbOptions.root`：

```text
absolute path
    → use as supplied location

relative path
    → resolve once against process.cwd() at openFsdb() call time
```

随后 MUST 解析到实际 root directory（等价于 `realpath` 语义），并验证最终目录名满足：

```text
[FSDB]<DatabaseName>
```

调用方通过 symlink/junction 指向 FSDB root 是允许的；解析后的实际目录成为本次 snapshot 的 physical root。之后不得通过请求路径重新解释调用方原始 root spelling。

### 3.2 Descendant object classification

scanner 不得 follow FSDB root 内部的 symlink/junction/文件系统间接引用。

```text
recognized table / metadata / data / resource candidate
    is symlink / junction / unexpected object type
        → malformed FSDB
        → openFsdb() fails

unrecognized / auxiliary indirection
        → ignore
        → never traverse
```

HTTP URL 永远不得直接 `path.join(root, requestSegments)` 后读取。必须：

```text
request logical identity
→ immutable index lookup
→ validated internal file identity
→ safe file-handle read
```

index 中的 physical location 不得返回客户端。

### 3.3 Well-formed boundary

`openFsdb()` MUST 要求 **Well-formed FSDB**，至少验证：

```text
root/database/table naming
TableIdentity uniqueness
NameSegment / Key / ResourceKey
NFC normalization collision
recognized physical object type
recognized symlink/junction rejection
required metadata
UTF-8 / JSON / JSONL syntax
struct/extend top-level JSON object
group/.extend.meta non-empty JSONL record object
logical key uniqueness
hierarchical ResourceKey
resource extension grammar / extension collision
physical path containment
```

不默认要求：

```text
full JSON Schema business validation
all reference target existence
other business integrity
```

也就是：

> `openFsdb()` 成功表示该目录能被安全、无歧义地解释成 FSDB logical namespace；不表示所有业务关系都已证明正确。

### 3.4 Static snapshot

一次成功 `openFsdb()`：

```text
scan
→ Well-formed validation
→ immutable logical index
→ capture source fingerprints
→ fresh process-local snapshotId
→ OPEN
```

新增但未进入初始 index 的对象在当前 instance 中不可见。v1 不做目录 watch、主动 rescan 或 partial reindex。

---

## 4. Frozen Node.js Public API

v1 engine：Node.js `>=20`。

`FsdbDatabase` 是 **opaque handle**：只有本 package 的 `openFsdb()` / 内部 standalone composition 可以产生有效 instance。TypeScript declaration SHOULD 使用 module-private `unique symbol` brand 或等价 nominal technique；运行时也不得把任意 structural look-alike object 当成有效 database。

冻结 public shape：

```ts
import type { RequestListener, Server } from "node:http";

declare const fsdbDatabaseBrand: unique symbol; // module-private

export interface OpenFsdbOptions {
  readonly root: string;
}

export type FsdbDatabaseState = "open" | "stale" | "closed";

export interface FsdbDatabase {
  readonly [fsdbDatabaseBrand]: never;
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

Primary exports：

```text
openFsdb
createFsdbHttpHandler
serveFsdb
以及上述 public types
```

### 4.1 JavaScript failure shape

无效 root、malformed FSDB、伪造 database handle、listen failure 等 API failure 必须 fail closed，但 **具体 Error subclass、`message`、`code`、stack text 不属于 v1 contract**。消费者不得依赖它们做跨版本协议判断。

### 4.2 `openFsdb()` ownership

`FsdbDatabase.close()` MUST 幂等：

```text
stop admitting new read leases
→ public state = closed
→ admitted leases may finish
→ wait leases drain
→ release resources
→ resolve
```

不增加公开 `closing` state。

### 4.3 `createFsdbHttpHandler()` ownership

handler **借用** caller-provided `FsdbDatabase`：

```text
handler does not own db
server close does not close db
caller owns db.close()
```

handler 只接受本 package 产生的 opaque database handle。

### 4.4 `serveFsdb()` ownership

默认：

```text
host = 127.0.0.1
port = 0
```

`serveFsdb()` owns 它内部创建的 database 与 `http.Server`。database 不作为 public service field 暴露，避免绕过 standalone lifecycle owner。

如果 listen/startup 失败，`serveFsdb()` MUST 清理已经创建的 owned database/server 后再 reject。

`service.close()` MUST 幂等，并建立 shutdown barrier：

```text
no new database reads
no new HTTP connections
admitted responses may drain
owned server closes
owned database closes
Promise resolves
```

`address.host` / `address.port` 表示实际 bind address。`origin` 仅在该 bind address 能表达具体 client origin 时提供；`0.0.0.0`、`::` 等 wildcard bind 不得伪造唯一 externally reachable origin。

`service.server` 是 Node escape hatch，可用于 timeout、`unref()`、address inspection 等，但不转移 lifecycle ownership。即使 caller 提前调用 `server.close()`，后续 `service.close()` 仍必须安全、幂等地完成 owned resource cleanup。

---

## 5. HTTP Request-Target 与 URL Identity

### 5.1 Request-target form

v1 只接受 HTTP **origin-form** request-target：

```text
/fsdb/v1...
```

以下均不是 v1 合法 request-target：

```text
absolute-form    http://host/fsdb/v1/...
authority-form   host:port
asterisk-form    *
```

非 origin-form → `400`。

Node binding MUST 基于 `IncomingMessage.url` 中实际 request URL spelling 解析，不得先通过 WHATWG URL/router 做全路径 decode/normalization。

literal `#` 不属于合法 origin-form path/query spelling，v1 收到时 → `400`。

### 5.2 HTTP Surface

```text
GET|HEAD /fsdb/v1
GET|HEAD /fsdb/v1/{kind}/{table}/{entry...}
```

其中：

```text
kind = struct | extend | group | resource
```

普通 entry：

```text
struct / extend / group
    → exactly one Key segment

resource
    → one or more ResourceKey segments
```

metadata：

```text
.info.meta   ↔ $info
.extend.meta ↔ $extend
.desc.meta   ↔ $desc
```

合法矩阵：

| kind | ordinary | `$info` | `$extend` | `$desc` |
|---|---|---|---|---|
| `struct` | yes | yes | no | optional |
| `extend` | yes | yes | yes | optional |
| `group` | yes | yes | optional | yes |
| `resource` | yes | no | no | yes |

允许但不存在的 optional metadata → `404`。

### 5.3 Database Descriptor

```text
GET|HEAD /fsdb/v1
```

逻辑结构：

```json
{"name":"游戏数据","tables":[{"kind":"struct","name":"角色"}]}
```

冻结 serialization：

```text
UTF-8 without BOM
no insignificant whitespace
object key order: name, tables
table object key order: kind, name
tables sort: kind lexical, then NFC TableName Unicode code-point order
```

因此同一 logical snapshot 的 descriptor bytes 不依赖 filesystem enumeration order。

### 5.4 Segment encoding

Canonical client encoding：

```text
logical segment
→ UTF-8 bytes
→ RFC 3986 percent encoding
```

仅 ASCII unreserved 保持原样：

```text
A-Z a-z 0-9 - . _ ~
```

其他 bytes → uppercase `%HH`。metadata `$info/$extend/$desc` 可以使用其保留 ASCII spelling。

Server：

```text
raw origin-form request-target
→ separate path/query without decoding
→ split raw path by literal "/"
→ percent-decode each segment exactly once
→ UTF-8 decode
→ NFC canonicalization / logical validation
→ index lookup
```

冻结规则：

```text
+ stays literal +
malformed percent → 400
invalid UTF-8 → 400
decoded / or \ or NUL or other forbidden NameSegment char → 400
%2F cannot create Resource hierarchy
empty segment / repeated slash / route trailing slash → 400
non-empty query → 400
```

server MAY 接受语义等价但 non-canonical 的 percent spelling；logical lookup 永远基于 decoded + NFC identity。

### 5.5 Request content

GET/HEAD request content 不参与 FSDB identity 或业务语义。v1 不因为存在 request body 改变 route result；实现可以为连接生命周期需要安全 discard/drain request content，但不得把其解释为 input payload。

---

## 6. Response、MIME 与 Cache

### 6.1 FSDB fixed types

由于 FSDB authority 已规定结构化文本使用 UTF-8：

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

文件型成功响应 MUST 返回 source 原始 bytes，不 parse + reserialize。

### 6.2 Resource MIME authority

Resource content 是 opaque bytes，因此 v1 Resource MIME mapping **不附加隐式 charset**：

| Extension | Content-Type |
|---|---|
| `avif` | `image/avif` |
| `bmp` | `image/bmp` |
| `css` | `text/css` |
| `gif` | `image/gif` |
| `html` | `text/html` |
| `ico` | `image/x-icon` |
| `jpeg` / `jpg` | `image/jpeg` |
| `js` / `mjs` | `text/javascript` |
| `json` | `application/json` |
| `md` | `text/markdown` |
| `mp3` | `audio/mpeg` |
| `mp4` | `video/mp4` |
| `ogg` | `audio/ogg` |
| `otf` | `font/otf` |
| `png` | `image/png` |
| `svg` | `image/svg+xml` |
| `ttf` | `font/ttf` |
| `txt` | `text/plain` |
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

mapping 由 package 自己持有，MUST NOT 依赖 `/etc/mime.types`、OS registry 或宿主环境。

### 6.3 Success / 304 headers

`200` / successful `HEAD` representation：

```text
Content-Type
Content-Length
ETag
Cache-Control: no-cache
```

`304 Not Modified`：

```text
ETag
Cache-Control: no-cache
no body
```

`HEAD` 与对应 GET 返回相同可确定 representation metadata，但没有 body。

### 6.4 Error cache policy

以下错误 MUST 使用：

```http
Cache-Control: no-store
```

至少包括：

```text
400
404
405
412
500
503
```

这样 negative/error response 不会跨 close/reopen 或修复后的 source 被缓存复用。

v1 不定义 error body schema。实现 MAY 返回空 body 或极小 JSON；客户端 MUST NOT 依赖 error JSON 字段、文本或 JS error message。

错误不得泄露：

```text
absolute filesystem path
user home
internal stack
raw filesystem error path
physical metadata filename
```

HEAD 错误 response 不得包含 body。

---

## 7. Methods、ETag Preconditions 与 Range Boundary

### 7.1 Methods

v1 只支持：

```text
GET
HEAD
```

syntactically valid FSDB route 使用其他 method：

```http
405 Method Not Allowed
Allow: GET, HEAD
Cache-Control: no-store
```

不自动增加 `OPTIONS` 或 CORS semantics。

### 7.2 ETag model

文件型 representation 使用 **snapshot-local weak ETag**：

```text
snapshotId + entryFingerprint
```

概念：

```text
W/"<snapshotId>-<entryFingerprint>"
```

`entryFingerprint` 内部编码不冻结，但必须足以支持 v1 的 same-snapshot drift detection。

Descriptor ETag 同样属于 current snapshot，并基于 deterministic descriptor representation。

### 7.3 `If-Match`

v1 按 RFC 9110 的标准 `If-Match` 语义处理：

```text
*            → target 存在则 condition true
entity tags  → strong comparison
condition false → 412 Precondition Failed
```

由于 v1 current ETag 是 weak validator，普通 weak/current tag 不会通过 strong `If-Match` comparison；这是标准语义，不做私有放宽。

### 7.4 `If-None-Match`

按标准语义：

```text
weak comparison
*
comma-separated entity-tag list
false for GET/HEAD → 304
```

### 7.5 Date preconditions

v1 不发送 `Last-Modified`，也不把 filesystem mtime 暴露成 HTTP modification-date authority。因此：

```text
If-Modified-Since
If-Unmodified-Since
```

按 HTTP 标准的“resource modification date unavailable”路径忽略，不建立第二套基于 mtime 的 validator semantics。

### 7.6 Range

v1 不支持 Range：

```text
Range    → ignore
If-Range → ignore
```

GET 在其他条件允许时返回完整 `200` representation；不得返回 `206` / `416`，也不得因为 Range 本身返回 `400`。

### 7.7 Precondition evaluation order

对一个本来会产生成功 representation 的 GET/HEAD：

```text
If-Match
→ If-None-Match
→ full response decision
```

date preconditions按 7.5 忽略，Range 按 7.6 忽略。

不存在、malformed、unsupported method、stale 等能在 precondition 前确定的失败保持其原状态；precondition 不把 `404/400/405/503` 改写为 `304/412`。

---

## 8. Route / Status Precedence

固定处理顺序：

```text
0. request-target form
1. /fsdb/v1 namespace
2. path / encoding / route syntax
3. method
4. GET/HEAD logical lookup / existence
5. source-state / same-handle validation
6. ETag preconditions
7. response
```

因此：

```text
GET http://host/fsdb/v1
→ 400

POST /other
→ 404

POST /fsdb/v1/struct//皮卡丘
→ 400

POST /fsdb/v1/struct/角色/皮卡丘
→ 405

GET /fsdb/v1/struct/角色/不存在
→ 404
```

状态：

| 情况 | Status |
|---|---:|
| GET/HEAD representation | `200` |
| If-None-Match false | `304` |
| malformed target/path/encoding/identity | `400` |
| namespace 外或 logical object 不存在 | `404` |
| valid route + unsupported method | `405` |
| If-Match false | `412` |
| database stale/closed/source drift | `503` |
| unexpected local service failure before headers | `500` |

---

## 9. Single-handle Read 与 I/O Failure

### 9.1 Read invariant

禁止：

```text
stat(path)
→ validate
→ reopen(path)
→ stream
```

文件型 GET/HEAD/conditional response必须：

```text
index lookup
→ acquire read lease
→ safe open file handle
→ fstat same handle
→ compare snapshot fingerprint / file type
→ build headers / evaluate preconditions
→ stream from same handle (GET) or close after validation (HEAD/304/412)
→ release handle + lease
```

核心：

> **validation handle = response file handle**

safe-open / fstat 发现 indexed object 不再符合 snapshot → atomically mark `stale`，不得 pathname retry、reindex 或 repair。

### 9.2 Post-header source I/O failure

如果 headers 已发送后 source read 失败，HTTP status 不能被重写。实现 MUST 终止该 response，并在能够判定 snapshot invariant 被破坏时 mark database stale。

### 9.3 Client abort

客户端断开、response socket abort、backpressure-side cancellation 等**仅由客户端/连接侧造成的失败**：

```text
terminate that response
close its file handle
release its read lease
MUST NOT solely because of client abort mark database stale
```

如果同一过程中另有证据证明 source fingerprint/type 已失效，则仍按 source drift 规则进入 stale。

---

## 10. Source Lifetime

宿主 contract：

> `FsdbDatabase` open snapshot 期间不得修改 source directory；修改内容需要 close + reopen。

状态：

```text
open → stale → closed
  └──────────→ closed
```

### 10.1 OPEN

允许 read lease。snapshot index 不因新增 filesystem object 自动变化。

### 10.2 STALE

需求驱动的 same-handle validation 检测到以下 drift：

```text
indexed object missing / unsafe open
expected regular file type changed
indexed object became indirection
relevant fingerprint changed
indexed metadata unreadable
```

则整个 database MUST 单调进入 stale：

```text
stop new read leases
no reindex
no hot reload
no old/new snapshot mixing
subsequent known reads → 503
```

已经在 drift 发现前 admitted 的其他 leases 不主动回滚；它们基于各自 handle 完成或失败。v1 不提供 cross-request transaction。

stale detection 是 fail-closed defense，不是 filesystem transaction；v1 不承诺抵抗拥有并发写权限的恶意本地 writer。

恢复只有：

```text
close
→ openFsdb(root)
```

### 10.3 CLOSED / drain

调用 `db.close()` 后立即停止新 read admission，public state 变为 `closed`；已 admitted leases 可完成，close Promise 在它们释放后 resolve。

---

## 11. Cache Snapshot Semantics

每次 successful `openFsdb()` 生成 fresh process-local `snapshotId`：

```text
not FSDB identity
not persisted
not wire authority
only cache-validator namespace
```

文件型请求：

```text
safe open same handle
→ fstat / fingerprint validation
→ build current ETag
→ evaluate If-Match / If-None-Match
→ 412 / 304 / stream same handle
```

禁止在 source validation 前因为旧 ETag 命中直接返回 304。

所有成功 representation 使用 `Cache-Control: no-cache`，所以 cache 再使用时必须 revalidate。close + reopen 后 fresh `snapshotId` 使旧 ETag 不会误命中新 snapshot。

所有 v1 error/negative response 使用 `Cache-Control: no-store`，避免 `404/503` 等跨 source 修复或 reopen 被复用。

v1 不承诺跨 reopen cache continuity。

---

## 12. Framework / Content Boundary

v1 primary binding 是 Node `http.RequestListener`：

```ts
createServer(createFsdbHttpHandler(db))
```

必须完整可用。

v1 不提供 Express/Koa/Fastify/Hono adapter。未来 adapter 若存在，必须保留：

```text
raw request-target spelling
segment decoding
route/status/precondition/cache semantics
single-handle read
source lifetime
ownership
```

无法获得足够原始 request-target 的 framework adapter 不应宣称完全等价。

v1 不以 WHATWG `Request → Response` 为主 API；出现真实非 Node consumer 后再考虑抽出独立 FSDB reader/binding。

本包不加入 LoomRealm `installationId`、Game Package、Content bearer、Main/Frame/Renderer authority 或 Content API route。

---

## 13. 实施顺序

```text
1. FSDB identity types + opaque FsdbDatabase handle
2. root resolution + Well-formed scanner
3. NFC logical index + descendant indirection policy
4. source fingerprint + read lease + safe same-handle open/fstat
5. Resource hierarchy
6. origin-form raw request-target parser + logical resolver
7. RequestListener + route/method/status precedence
8. raw JSON/JSONL/metadata/Resource response
9. deterministic descriptor + MIME table
10. OPEN/STALE/CLOSED + client abort + close drain
11. snapshot ETag + If-Match/If-None-Match + cache headers
12. serveFsdb ownership/startup cleanup/wildcard address
13. mandatory conformance + Unicode/security/standalone smoke
```

明确不在 v1 实现：

```text
Range
watch/hot reload
write API
auth
query/filter/listing
full Integrity-valid checker
framework adapters
CLI/daemon
```

---

## 14. Implementation Exit Gate

v1 implementation 必须通过 [CONFORMANCE.md](./CONFORMANCE.md) 全部 mandatory cases。

通过后才能从 **Frozen for Implementation** 推进到 implemented / release candidate。

实现中若发现本文 contract 本身不可实现、互相矛盾或导致真实 interoperability/security 问题，必须按 0.3 的 frozen change rule 处理；不得通过 hidden special-case 绕过合同。