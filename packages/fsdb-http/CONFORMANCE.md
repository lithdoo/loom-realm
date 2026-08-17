# @loomrealm/fsdb-http v1 Conformance

> 状态：**Frozen for Implementation — v1**  
> Contract：[DESIGN.md](./DESIGN.md)  
> FSDB authority：[FSDB 目录结构详解](../../doc/fsdb/FSDB目录结构详解.md)

本文定义 `@loomrealm/fsdb-http` v1 mandatory conformance cases。测试 runner、fixture layout、内部 helper 可以自由选择，但实现必须证明本文列出的 observable behavior 与 safety invariants。

---

## 1. Conformance 原则

Mandatory：

```text
public API / ownership
FSDB authority inheritance
root / physical object classification
logical identity / Unicode
HTTP request-target / route / status / headers
MIME / raw bytes
ETag / preconditions / cache
single-handle read safety
snapshot / stale / client abort / close lifecycle
information disclosure boundary
```

Implementation-specific：

```text
classes / helpers
index data structure
fingerprint encoding
read lease implementation
stream implementation
logging / diagnostics
performance optimization
```

每个 mandatory case 必须稳定得到 PASS 或 concrete observable FAIL。不得依赖 OS MIME registry、`/etc/mime.types`、随机 filesystem enumeration order 或 Web Framework behavior。

---

## 2. Required Fixtures

至少覆盖：

```text
fixtures/
├── minimal-valid/
├── unicode-valid/
├── resource-hierarchy/
├── metadata-valid/
├── text-encoding/
├── normalization-collision/
├── duplicate-resource-key/
├── table-kind-same-name/
├── malformed/
├── auxiliary-files/
└── security/
```

`security/` 应能构造：

```text
recognized symlink file
recognized symlink directory
auxiliary symlink
path replacement
index-outside target
client-abort large resource
```

平台不支持创建某类 symlink/junction 时，可用等价 white-box/integration fixture 证明相同 scanner invariant；不得因此跳过整个安全类别。

---

## 3. FSDB Authority / Validation

### FDB-001 — Unicode identity

合法 NFC Unicode `DatabaseName` / `TableName` / `Key` MUST 成功 open，例如：

```text
[FSDB]游戏数据/[struct]角色/皮卡丘.json
```

### FDB-002 — physical spelling canonicalizes to NFC

宿主 filesystem 返回 canonically equivalent spelling 时，scanner MUST 构造 NFC logical identity。

### FDB-003 — normalization collision rejected

两个 physical names canonicalize 为同一个 logical identity → `openFsdb()` MUST fail。

### FDB-004 — reserved prefixes

普通 `NameSegment` 以 `$` 或 `.` 开头时不得进入普通 data namespace；recognized malformed candidate MUST fail open。

### FDB-005 — TableIdentity includes kind

```text
[struct]角色
[resource]角色
```

MUST 可以共存；同一 `(TableKind, TableName)` duplicate MUST fail open。

### FDB-006 — hierarchical ResourceKey

```text
[resource]图片/关都地区/真新镇.png
```

MUST index 为：

```text
(kind=resource, table=图片, key=关都地区/真新镇)
```

### FDB-007 — Resource extension is not identity

```text
皮卡丘.png
皮卡丘.webp
```

同表出现时 MUST 因 duplicate logical key fail open。

### FDB-008 — UTF-8 structured text

`.json`、`.jsonl`、`.info.meta`、`.extend.meta`、`.desc.meta` 必须按 FSDB authority 验证 UTF-8 without BOM。invalid UTF-8 / forbidden BOM fixture MUST fail open。

### FDB-009 — JSONL record semantics

LF / CRLF 均可；空行/whitespace-only line 不产生 record；每个 non-empty record MUST 是 JSON object。

### FDB-010 — Resource remains opaque bytes

Resource 即使 extension 为 `txt/json/html`，scanner 不得因为内容不是 UTF-8 而判 malformed；Resource content 必须保持 opaque bytes。

### FDB-011 — recognized malformed candidate fails

例如 struct `.json` 非 object、required metadata 缺失、Resource candidate extension 非法，MUST fail open 而不是 ignore。

### FDB-012 — auxiliary object ignored

不属于 recognized candidate 的辅助对象 MUST NOT 被 index/serve。

---

## 4. Root / Physical Safety

### ROOT-001 — relative root resolution is one-shot

relative `root` MUST 相对 `openFsdb()` 调用时 `process.cwd()` resolve；随后改变 cwd 不得改变已打开 instance 的 source root。

### ROOT-002 — root indirection may resolve once

调用方 path 通过 symlink/junction 指向实际 FSDB root 时，允许 resolve 到实际 root 并 open；logical DatabaseName 取实际 FSDB root directory identity。

### ROOT-003 — root name validation

解析后的实际 root directory 名称不满足 `[FSDB]<DatabaseName>` → open fail。

### SAFE-001 — recognized descendant symlink rejected

recognized table、metadata、data、Resource candidate 是 symlink/junction/indirection → open fail；不得 follow。

### SAFE-002 — auxiliary indirection ignored and never traversed

unrecognized/dot-prefixed auxiliary symlink MUST NOT 被 traverse/index/serve。

### SAFE-003 — no URL-to-path join

请求 URL 无法读取 immutable index 外文件。

### SAFE-004 — traversal rejected

`..`、encoded traversal、separator tricks MUST 无法逃逸 root。

### SAFE-005 — replacement before request validation causes stale

index 完成后替换 indexed file，在 request same-handle validation 时 MUST fail closed 并 mark stale。

### SAFE-006 — same response handle

white-box/instrumentation MUST 证明文件型 response 在同一 opened handle 上完成：

```text
fstat
snapshot validation
precondition decision
stream (GET)
```

不得 path-stat 后 reopen stream。

---

## 5. Frozen Public API / Ownership

### API-001 — exports

MUST export：

```text
openFsdb
createFsdbHttpHandler
serveFsdb
以及 DESIGN 冻结 public types
```

### API-002 — FsdbDatabase is opaque

TypeScript consumer 不应能仅通过 structural look-alike 合法构造 `FsdbDatabase`；runtime 也不得把任意伪造 object 当成有效 package database handle。

### API-003 — API error details non-contract

测试只要求 invalid/malformed calls fail closed；不得把 Error subclass/message/code 固定成 conformance contract。

### API-004 — handler borrows database

关闭 `createServer(createFsdbHttpHandler(db))` 的 server MUST NOT 自动 close caller-owned `db`。

### API-005 — service owns internal database/server

`serveFsdb()` public service shape MUST NOT 暴露可绕过 lifecycle owner 的 `db` field；service owns 内部 database + server。

### API-006 — startup failure cleanup

使 listen/startup 失败后，`serveFsdb()` MUST reject 且不得泄漏已创建 database/server resources。

### API-007 — service close

`service.close()` MUST 幂等，并：

```text
block new reads/connections
allow admitted responses to drain
close owned resources
resolve
```

### API-008 — server escape hatch

caller 提前 `service.server.close()` 后，`service.close()` 仍 MUST 安全完成其余 owned cleanup。

### API-009 — defaults / wildcard

未指定时：

```text
host = 127.0.0.1
port = 0
```

wildcard bind 必须给出 concrete bound port/address，但不得暴露 wildcard 为唯一 client `origin`。

---

## 6. Request-Target / URL

### HTTP-001 — origin-form only

合法：

```text
GET /fsdb/v1 HTTP/1.1
```

以下 MUST `400`：

```text
absolute-form
asterisk-form
authority-form
literal # in request-target
```

### HTTP-002 — descriptor

`GET /fsdb/v1` → `200`。

### HTTP-003 — deterministic descriptor bytes

同一 logical snapshot descriptor MUST：

```text
UTF-8 no BOM
no insignificant whitespace
keys name,tables
per-table keys kind,name
table sort kind then NFC TableName code-point order
```

filesystem enumeration order 不得影响 bytes。

### HTTP-004 — data routes

struct/extend/group 单 segment key 与 Resource multi-segment key MUST 正确 lookup；Resource URL 不携 physical extension。

### HTTP-005 — metadata matrix

`$info/$extend/$desc` 必须按 DESIGN matrix；optional missing → `404`。

### HTTP-006 — Unicode percent round-trip

UTF-8 percent-encoded Unicode segment MUST round-trip 到相同 NFC identity。

### HTTP-007 — decode exactly once

percent encoding 每 segment exactly once decode；double-encoded spelling 不得二次 decode。

### HTTP-008 — plus literal

`+` MUST 保持 `+`，不得当 form-space。

### HTTP-009 — encoded separator rejected

`%2F`、encoded `\` 等 decode 成 forbidden NameSegment char → `400`，不得制造 hierarchy。

### HTTP-010 — malformed encoding

malformed `%` / invalid UTF-8 → `400`。

### HTTP-011 — empty / repeated / trailing segment

重复 `/`、empty segment、普通 route trailing slash → `400`。

### HTTP-012 — query rejected

non-empty query → `400`。

### HTTP-013 — request body does not change semantics

GET/HEAD 携带 request content 时，body MUST NOT 参与 identity/lookup 或改变对应无 body 请求的 route result。

---

## 7. Method / Status Precedence

### STATUS-001 — request-target form first

non-origin-form → `400`。

### STATUS-002 — namespace before method

```text
POST /other
→ 404
```

### STATUS-003 — syntax before method

```text
POST /fsdb/v1/struct//皮卡丘
→ 400
```

### STATUS-004 — method before lookup

syntactically valid FSDB route + non GET/HEAD：

```text
→ 405
Allow: GET, HEAD
```

### STATUS-005 — lookup before precondition

不存在 object MUST 保持 `404`，即使 request 同时携带 If-Match/If-None-Match。

### STATUS-006 — stale before precondition

已知 object 在 database stale/closed 时 → `503`，不得被 conditional header 改成 `304/412`。

### STATUS-007 — HEAD no body

所有 HEAD success/error/conditional response MUST 无 body。

---

## 8. Response / MIME

### MIME-001 — fixed FSDB types

验证：

```text
struct/extend → application/json; charset=utf-8
group/$extend → application/x-ndjson; charset=utf-8
$info         → application/schema+json; charset=utf-8
$desc         → text/markdown; charset=utf-8
descriptor    → application/json; charset=utf-8
```

### MIME-002 — deterministic Resource table

DESIGN v1 Resource MIME mapping 每个 extension MUST 返回冻结 Content-Type。

### MIME-003 — no implicit Resource charset

例如 Resource `.txt/.html/.css/.js/.json/.md` Content-Type MUST 与 DESIGN 一致且不得额外附加 `charset=utf-8`。

### MIME-004 — unknown fallback

unknown legal extension → `application/octet-stream`。

### MIME-005 — environment independence

不同 OS MIME registry / `/etc/mime.types` 不得改变结果。

### RESP-001 — raw source bytes

文件型 GET body MUST 与 source bytes byte-for-byte 相同。

### RESP-002 — representation headers

200 / successful HEAD MUST 有：

```text
Content-Type
Content-Length
ETag
Cache-Control: no-cache
```

### RESP-003 — error body non-contract / no disclosure

不得要求固定 error JSON；400/404/405/412/500/503 body 若存在，不得泄露 absolute path、home、stack、raw fs error path、physical metadata filename。

---

## 9. Preconditions / Range / Cache

### COND-001 — If-Match wildcard

existing target + `If-Match: *` MUST condition true；不存在 target 仍按 lookup precedence `404`。

### COND-002 — If-Match strong comparison

If-Match list 使用 strong comparison。v1 current ETag 是 weak，因此仅把 current weak tag 放入 `If-Match` list MUST NOT 匹配，结果 `412`。

### COND-003 — If-None-Match weak comparison

current weak ETag 以 weak comparison 匹配 → GET/HEAD `304`。

### COND-004 — If-None-Match list / wildcard

comma-separated list 任一匹配，或 existing target + `*`，GET/HEAD → `304`。

### COND-005 — date conditionals ignored

因为 v1 不提供 HTTP modification-date authority：

```text
If-Modified-Since
If-Unmodified-Since
```

不得单独改变 response result。

### COND-006 — Range ignored

`Range` 请求在其他条件允许时 MUST 返回完整 `200`，不得产生 `206/416/400`。

### COND-007 — If-Range ignored

无论是否同时有 Range，`If-Range` 不改变 v1 full-response semantics。

### CACHE-001 — success revalidation

200 / successful HEAD：

```http
Cache-Control: no-cache
```

### CACHE-002 — 304 validator headers

304 MUST：

```text
ETag = current ETag
Cache-Control: no-cache
no body
```

### CACHE-003 — errors no-store

400/404/405/412/500/503 MUST：

```http
Cache-Control: no-store
```

### CACHE-004 — source validation before precondition

file request MUST：

```text
safe open
→ same-handle fstat/fingerprint
→ current ETag
→ conditional evaluation
```

不得先命中 old ETag 后跳过 source validation。

### CACHE-005 — reopen invalidates validator

close + reopen 后，即使 size/mtime 相同，old snapshot ETag MUST NOT 命中新 snapshot。

---

## 10. Source Lifetime / I/O

### LIFE-001 — initial state

successful `openFsdb()` → `state === "open"`。

### LIFE-002 — drift monotonic

source drift：

```text
open → stale
```

不得自动恢复 open。

### LIFE-003 — stale blocks new reads

进入 stale 后新的 known HTTP read → `503`。

### LIFE-004 — no hot visibility

open 后新增文件不得在当前 index 自动可见；close + reopen 后才可进入 namespace。

### LIFE-005 — close admission barrier

调用 `db.close()` 后立即停止新 read admission，public state = closed。

### LIFE-006 — admitted request drains

close 前已 admitted 的正常大 Resource stream允许完成；close Promise 在 active lease release 后 resolve。

### LIFE-007 — close idempotent

重复 `db.close()` / `service.close()` MUST 安全幂等。

### LIFE-008 — post-header source failure

headers 已发送后 source I/O failure 不得伪造新 HTTP status；response 终止，并在能证明 snapshot invariant broken 时 mark stale。

### LIFE-009 — client abort releases lease without stale

client 中途断开大 Resource：

```text
response terminates
file handle closes
read lease releases
```

且仅凭 client abort MUST NOT mark database stale。随后对未发生 source drift 的其他 object/read 仍可正常工作。

---

## 11. Framework / Dependency Boundary

### BOUNDARY-001 — no framework runtime dependency

production dependency graph 不得因核心实现引入 Express/Koa/Fastify/Hono 等。

### BOUNDARY-002 — Node RequestListener standalone

```ts
createServer(createFsdbHttpHandler(db))
```

MUST 完整可用。

### BOUNDARY-003 — no higher-layer LoomRealm authority

open/serve FSDB 不得要求 installationId、Game Package、Main/Frame/Renderer authority 或 Content bearer。

---

## 12. Implementation Exit Gate

进入 release candidate 前必须：

```text
all mandatory conformance PASS
+
real Unicode fixture smoke PASS
+
embedded node:http smoke PASS
+
serveFsdb standalone smoke PASS
+
package build/test PASS
```

若失败说明 Frozen contract 本身不可实现、互相矛盾或造成真实 interoperability/security 问题，必须按 DESIGN frozen change rule 处理，不得通过 test special-case 隐藏合同问题。