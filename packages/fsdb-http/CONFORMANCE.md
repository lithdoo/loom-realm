# @loomrealm/fsdb-http v1 Conformance

> 状态：**Frozen for Implementation — v1**  
> Contract：[DESIGN.md](./DESIGN.md)  
> FSDB authority：[FSDB 目录结构详解](../../doc/fsdb/FSDB目录结构详解.md)

本文定义 `@loomrealm/fsdb-http` v1 的 mandatory conformance cases。测试实现可以自由选择 test runner、fixture layout 和 helper，但必须证明本文列出的 observable behavior 与 safety invariants。

---

## 1. Conformance 原则

### 1.1 Mandatory vs implementation-specific

Mandatory：

```text
public API behavior
FSDB logical identity
HTTP route / status / headers
Unicode / percent encoding
Well-formed validation boundary
single-handle read safety
snapshot / stale / close lifecycle
cache / conditional request
ownership
MIME mapping
information disclosure boundary
```

Implementation-specific：

```text
internal classes / helpers
index data structure
fingerprint encoding
read lease implementation
stream implementation
logging / diagnostics
performance optimizations
```

### 1.2 测试结果

每个 mandatory case 必须能稳定得到：

```text
PASS
or
FAIL with concrete observable mismatch
```

不得依赖宿主机器 `/etc/mime.types`、OS MIME registry、随机 filesystem enumeration order 或 framework behavior。

---

## 2. Required Fixtures

至少准备以下 fixture groups：

```text
fixtures/
├── minimal-valid/
├── unicode-valid/
├── resource-hierarchy/
├── metadata-valid/
├── normalization-collision/
├── duplicate-resource-key/
├── malformed/
├── auxiliary-files/
└── security/
```

建议内容：

### `minimal-valid`

```text
[FSDB]game/
├── [struct]actor/
│   ├── 001.json
│   └── .info.meta
└── [resource]image/
    ├── hero.png
    └── .desc.meta
```

### `unicode-valid`

```text
[FSDB]游戏数据/
├── [struct]角色/
│   ├── 皮卡丘.json
│   └── .info.meta
└── [group]地图事件/
    ├── 常磐森林.jsonl
    ├── .info.meta
    └── .desc.meta
```

### `resource-hierarchy`

```text
[resource]图片/
├── 关都地区/
│   └── 真新镇.png
├── UI/
│   └── 道具.large.webp
└── .desc.meta
```

### `security`

应覆盖 symlink、path replacement、encoded slash 和 index 外文件。

---

## 3. FSDB Identity / Validation

### FDB-001 — Unicode key accepted

合法 NFC Unicode TableName / Key MUST 成功打开并可通过 logical identity 查询。

### FDB-002 — physical spelling canonicalizes to NFC logical identity

宿主 filesystem 返回 canonically equivalent 的 Unicode spelling 时，scanner MUST 构造 NFC logical identity。

### FDB-003 — normalization collision rejected

两个 physical names canonicalize 到相同 NFC logical identity 时，`openFsdb()` MUST 失败。

### FDB-004 — reserved logical prefix rejected

普通 key / ResourceKey segment 以 `$` 开头时 MUST 视为 malformed FSDB。

### FDB-005 — physical dot namespace excluded

非规范 metadata 的 dot-prefixed file/directory MUST NOT 进入普通 data namespace。

### FDB-006 — TableIdentity includes kind

```text
[struct]角色
[resource]角色
```

MUST 可以共存；同一 `(kind, TableName)` duplicate MUST 被拒绝。

### FDB-007 — hierarchical ResourceKey

```text
[resource]图片/关都地区/真新镇.png
```

MUST index 为：

```text
(kind=resource, table=图片, key=关都地区/真新镇)
```

### FDB-008 — Resource extension not identity

同一 Resource 表：

```text
皮卡丘.png
皮卡丘.webp
```

MUST 因 duplicate logical key 拒绝整个 open。

### FDB-009 — recognized malformed candidate fails open

例如 struct `.json` entry 不是 JSON object，或 Resource candidate 无合法 extension，MUST 使 `openFsdb()` 失败，而不是静默 ignore。

### FDB-010 — unrecognized auxiliary object ignored

不属于 FSDB recognized candidate 的辅助对象 MUST NOT 被 index 或 serve。

---

## 4. HTTP Route / URL

### HTTP-001 — descriptor

```text
GET /fsdb/v1
```

MUST 返回 `200`、deterministic descriptor JSON 与稳定 table ordering。

### HTTP-002 — struct / extend / group routes

合法单 segment key MUST 可以通过对应 route 获取。

### HTTP-003 — hierarchical resource route

多 segment ResourceKey MUST 保持 segment hierarchy，不携 physical extension。

### HTTP-004 — metadata routes

`$info/$extend/$desc` MUST 按 DESIGN 合法组合映射；optional metadata 缺失 → `404`。

### HTTP-005 — Unicode percent round-trip

例如 logical：

```text
/fsdb/v1/struct/角色/皮卡丘
```

canonical UTF-8 percent encoded request MUST round-trip 到相同 NFC logical identity。

### HTTP-006 — decode exactly once

percent encoding MUST 每 segment exactly once decode；double-encoded spelling 不得被重复 decode。

### HTTP-007 — plus is literal

path 中 `+` MUST 保持 `+`，不得转换为空格。

### HTTP-008 — encoded slash rejected

single segment 内 `%2F` decode 后 MUST 因非法 NameSegment 返回 `400`，不得制造 ResourceKey hierarchy。

### HTTP-009 — malformed encoding rejected

malformed `%` sequence / invalid UTF-8 MUST 返回 `400`。

### HTTP-010 — empty/trailing/repeated segment rejected

重复 `/`、空 segment、普通 route trailing `/` MUST 返回 `400`。

### HTTP-011 — query rejected

non-empty query component MUST 返回 `400`。

---

## 5. Method / Status Precedence

### STATUS-001 — namespace first

```text
POST /other
→ 404
```

### STATUS-002 — syntax before method

```text
POST /fsdb/v1/struct//皮卡丘
→ 400
```

### STATUS-003 — method before lookup

syntactically valid FSDB route 使用非 GET/HEAD：

```text
→ 405
Allow: GET, HEAD
```

### STATUS-004 — lookup

GET/HEAD 合法 route 但 object 不存在：

```text
→ 404
```

### STATUS-005 — stale/closed

已知 logical object 在 database stale/closed 时：

```text
→ 503
```

### STATUS-006 — HEAD body

HEAD 的成功或错误 response MUST NOT 包含 body。

---

## 6. Response / MIME

### MIME-001 — fixed FSDB types

必须验证：

```text
struct / extend
→ application/json; charset=utf-8

group / $extend
→ application/x-ndjson; charset=utf-8

$info
→ application/schema+json; charset=utf-8

$desc
→ text/markdown; charset=utf-8

descriptor
→ application/json; charset=utf-8
```

### MIME-002 — deterministic resource table

DESIGN.md v1 Resource MIME table 中每个 extension MUST 返回冻结的 Content-Type。

### MIME-003 — unknown resource fallback

合法但未列入 v1 MIME table 的 extension MUST 返回：

```text
application/octet-stream
```

### MIME-004 — environment independence

同一 fixture 在不同 OS MIME registry / `/etc/mime.types` 环境下 MUST 得到相同 Content-Type。

### RESP-001 — raw bytes

文件型成功 response MUST 保持原始文件 bytes，不通过 parse + reserialize 改写内容。

### RESP-002 — error body non-contract

测试不得要求固定 error JSON schema；只验证 status、required headers 与不泄漏敏感 filesystem information。

---

## 7. Cache / Conditional Request

### CACHE-001 — successful representation is revalidated

所有可缓存成功 representation MUST 返回：

```http
Cache-Control: no-cache
```

### CACHE-002 — ETag present

成功 representation MUST 返回当前 snapshot 的 ETag。

### CACHE-003 — weak comparison

`If-None-Match` MUST 使用标准 weak comparison。

### CACHE-004 — entity-tag list

comma-separated entity-tag list 中任一匹配 current validator 时 GET/HEAD MUST 返回 `304`。

### CACHE-005 — wildcard

`If-None-Match: *` MUST 按标准存在性语义处理。

### CACHE-006 — validation before 304

file response MUST：

```text
safe open
→ same-handle fstat
→ fingerprint validation
→ conditional evaluation
```

不得命中旧 ETag 后直接跳过 source validation。

### CACHE-007 — reopen invalidates previous snapshot validator

close + reopen 后，即使文件 size/mtime 恰好相同，previous snapshot ETag MUST NOT 命中新 snapshot。

### CACHE-008 — descriptor deterministic

相同 snapshot 的 descriptor bytes 与 ETag MUST 不受 filesystem enumeration order 影响。

---

## 8. Safety / Single-handle Read

### SAFE-001 — no URL-to-path join

测试必须证明 URL 无法读取 immutable index 外对象。

### SAFE-002 — traversal rejected

`..`、encoded traversal 或 path separator tricks MUST 无法逃逸 FSDB root。

### SAFE-003 — symlink escape rejected

indexed object 不得通过 symlink 指向 root 外对象。

### SAFE-004 — same handle validation and stream

测试/white-box instrumentation MUST 证明一次文件 response 使用同一 opened handle 完成：

```text
fstat
validation
conditional decision
stream
```

不得 path-stat 后 reopen stream。

### SAFE-005 — replacement before validation causes stale

在 index 完成后、request safe-open/fstat 前替换 indexed file，request MUST fail closed，并使 database stale。

### SAFE-006 — no physical path disclosure

400/404/405/500/503 等错误不得泄露 absolute path、home、raw fs error path、stack 或 physical metadata filename。

---

## 9. Source Lifetime / Close

### LIFE-001 — initial state

成功 `openFsdb()`：

```text
state = open
```

### LIFE-002 — drift is monotonic

检测到 source drift：

```text
open → stale
```

不得自动回到 open。

### LIFE-003 — stale blocks new reads

进入 stale 后新 HTTP reads MUST 返回 `503`。

### LIFE-004 — no hot reindex

新增文件不得在当前 instance 中突然变成可见 logical object；必须 close + reopen。

### LIFE-005 — close admission barrier

调用 `db.close()` 后 MUST 立即停止接纳新 read leases，并将 public state 视为 closed。

### LIFE-006 — admitted request drains

close 前已经 admitted 的正常大 Resource stream MUST 被允许完成；`close()` Promise 在 active leases drain 后 resolve。

### LIFE-007 — close idempotent

重复调用 `db.close()` MUST 安全且语义一致。

### LIFE-008 — post-header I/O failure

如果 headers 已发送后 stream 出现 I/O failure，不得伪造新的 HTTP status；response 应终止，并在能判定 snapshot invariant 被破坏时 mark stale。

---

## 10. Public API / Ownership

### API-001 — exports

v1 MUST export：

```text
openFsdb
createFsdbHttpHandler
serveFsdb
```

以及 DESIGN 冻结的 public types。

### API-002 — handler borrows database

关闭由 `createFsdbHttpHandler(db)` 创建的 HTTP server MUST NOT 自动关闭 caller-provided `db`。

### API-003 — serveFsdb owns resources

`serveFsdb()` MUST own 它创建的 server 与 database。

### API-004 — service close drains and owns shutdown

`service.close()` MUST：

```text
block new reads
stop new HTTP connections
allow admitted responses to drain
close server
close database
```

并幂等。

### API-005 — server escape hatch does not transfer ownership

caller 提前 `service.server.close()` 后，`service.close()` MUST 仍能安全关闭 owned database。

### API-006 — wildcard bind

`0.0.0.0` / `::` bind MUST 提供 concrete `address.port`，但 MUST NOT 把 wildcard address 暴露为唯一 client `origin`。

### API-007 — defaults

未指定时：

```text
host = 127.0.0.1
port = implementation-chosen ephemeral port request (0)
```

---

## 11. Framework / Dependency Boundary

### BOUNDARY-001 — no framework runtime dependency

production package dependency graph MUST NOT 因核心实现引入 Express、Koa、Fastify、Hono 等 Web Framework。

### BOUNDARY-002 — Node RequestListener works standalone

```ts
createServer(createFsdbHttpHandler(db))
```

MUST 是完整可工作的核心使用方式。

### BOUNDARY-003 — no LoomRealm higher-layer authority

核心包不得要求 `installationId`、Game Package、Main/Frame/Renderer authority 或 Content bearer 才能 open/serve FSDB。

---

## 12. Implementation Exit Gate

第一版进入 release candidate 前：

```text
all mandatory conformance cases PASS
+
real Unicode fixture smoke PASS
+
embedded node:http smoke PASS
+
serveFsdb standalone smoke PASS
+
package build/test PASS
```

任何失败若说明 DESIGN.md 的 Frozen observable contract 本身不可实现或互相矛盾，应按 DESIGN.md Frozen change rule 分类处理，不得通过测试特判隐藏合同问题。