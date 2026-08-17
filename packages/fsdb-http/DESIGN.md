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
well-formed validation
        ↓
safe immutable logical index
        ↓
readonly HTTP handler
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

尽量保持 0 runtime dependencies。

---

## 2. Scope

第一版负责：

```text
打开一个 FSDB 根目录
验证 Well-formed FSDB
构建 immutable logical index
按 FSDB logical identity 解析对象
通过 GET / HEAD 返回原始内容 bytes
Unicode logical name ↔ HTTP path 的安全可逆映射
Content-Type / Content-Length / ETag
traversal / symlink escape 防护
静态 source lifetime 与 stale fail-closed
可嵌入 Node HTTP handler
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
LoomRealm installation registry
Game Package
Content API authorization
Bearer token
Main / Frame / Renderer authority
rate limiting policy
跨进程 bootstrap
```

---

## 3. 继承的 FSDB Identity

HTTP 层直接继承 FSDB 规范。

### 3.1 Table kind

```text
struct
extend
group
resource
```

物理目录：

```text
[FSDB]<DatabaseName>/
├── [struct]<TableName>/
├── [extend]<TableName>/
├── [group]<TableName>/
└── [resource]<TableName>/
```

### 3.2 Unicode NameSegment

FSDB 的 `DatabaseName`、`TableName`、普通 `Key` 与 ResourceKey segment 都基于同一个 `NameSegment`。

本包不得自行 ASCII 化、lowercase、trim 或 normalize 已合法名称。

必须继承的关键约束包括：

```text
valid Unicode / UTF-8
NFC
1..200 UTF-8 bytes
not starting with "." or "$"
no leading/trailing Unicode whitespace
no trailing "."
no path separators / NUL / control chars / non-portable filename chars
```

因此中文等人类可读名称是正常 identity：

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

因此同一表中：

```text
皮卡丘.png
皮卡丘.webp
```

属于 duplicate logical key，`openFsdb()` 必须拒绝。

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
→ immutable logical index

request logical identity
→ index lookup
→ validated internal file identity
→ safe open / stat / stream
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
│   └── types.ts
│
├── http/
│   ├── handler.ts
│   ├── route.ts
│   ├── url-segment.ts
│   ├── response.ts
│   └── mime.ts
│
└── index.ts
```

第一阶段保持一个 package。只有出现第二个真实消费者时，再考虑抽出 `@loomrealm/fsdb`。

---

## 6. 候选 Public API

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

HTTP adapter：

```ts
const handler = createFsdbHttpHandler(db);
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

`tables` 必须以稳定顺序生成：

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

FSDB logical identity 使用 Unicode；HTTP wire 必须定义唯一的 segment 边界规则。

客户端构造 URL 时：

```text
1. 先按 FSDB logical structure 得到独立 segment
2. 每个 NameSegment 单独以 UTF-8 编码
3. 再对该 segment 做 percent-encoding
4. ResourceKey 的 "/" 只由 segment boundary 产生
```

例如 logical URL：

```text
/fsdb/v1/struct/角色/皮卡丘
```

wire 上可以表示为 UTF-8 percent-encoded URI；具体是否保留浏览器可直接展示的 Unicode 由 HTTP client 决定，identity 以 decoded segment 为准。

服务端必须：

```text
按 raw literal "/" 切分 path
→ 每个 segment percent-decode exactly once
→ UTF-8 decode
→ validation
→ index lookup
```

规则：

- `+` 在 path 中就是 `+`，不得按 form encoding 转为空格；
- malformed percent encoding 返回 `400`；
- invalid UTF-8 返回 `400`；
- decoded ordinary segment 必须满足 FSDB `NameSegment`；
- decoded segment 中出现 `/`、`\`、NUL 等 FSDB 禁止字符返回 `400`；因此 `%2F` 不能在单个 segment 内制造额外 Resource 层级；
- reader 不自动 NFC normalize；decoded 非 NFC ordinary name 返回 `400`；
- metadata `$info/$extend/$desc` 在 ordinary NameSegment 校验之前按保留 logical entry 识别。

这样：

```text
filesystem identity
↔ FSDB logical identity
↔ decoded HTTP identity
```

保持一一对应。

---

## 8. Response 原则

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

支持：

```text
Content-Length
ETag
If-None-Match
304 Not Modified
```

---

## 9. HTTP Methods

第一版只允许：

```text
GET
HEAD
```

其他方法：

```text
405 Method Not Allowed
Allow: GET, HEAD
```

`HEAD` 与对应 `GET` 做相同 route/index/source-state/existence 检查，返回相同的可确定 headers，不返回 body。

---

## 10. HTTP Status / Error Boundary

| 情况 | Status |
|---|---:|
| `GET` / `HEAD` 命中 | `200` |
| `If-None-Match` 命中 | `304` |
| malformed URL / encoding / logical identity | `400` |
| kind/table/key/metadata 不存在或组合不支持 | `404` |
| 非 `GET` / `HEAD` | `405` |
| `FsdbDatabase` 已 stale | `503` |
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

---

## 11. Index / Validation

`openFsdb()` 必须要求 **Well-formed FSDB**，但不默认要求完整 Integrity-valid。

至少检查：

```text
DatabaseName / TableName / Key / ResourceKey NameSegment rules
NFC and UTF-8 byte limits
recognized table directory type
required metadata exists
metadata syntax valid
struct/extend entry is JSON object
group JSONL record is JSON object
logical table identity unique
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

这样 `openFsdb()` 的语义是：

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
  // validated internal file identity
}
```

索引器递归扫描合法非 dot-prefixed Resource 子目录，并将 physical hierarchy 转换成 `/` 分隔的 ResourceKey。

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

> `FsdbDatabase` 处于 `open` 时，宿主不应修改其 FSDB source directory。修改内容需要关闭并重新 `openFsdb()`。

逻辑状态：

```text
open → stale → closed
  └──────────→ closed
```

### open

```text
scan
→ Well-formed validation
→ immutable logical index
→ capture file fingerprints required for safe read/cache validation
```

### stale

请求读取已索引 object 时，如果检测到以下 source drift：

```text
indexed file disappeared
regular file type changed
indexed file became symlink / unsafe target
relevant file fingerprint changed
indexed metadata became unreadable
```

则整个 `FsdbDatabase` 原子进入 `stale`。

进入 `stale` 后：

```text
不局部 reindex
不 hot reload
不继续混合 old/new snapshot
所有 HTTP read 返回 503
```

恢复方式只有：

```text
close
→ openFsdb(root)
```

新增但未被初始 index 接受的文件不会在当前实例中突然出现；新 namespace 只能通过 reopen 建立。

这一模型保证：

```text
immutable logical index
+
static-source contract
+
fail-closed drift handling
```

形成一致 snapshot 语义，而不需要 watch/replay/resync。

---

## 15. ETag / Cache

ETag 必须建立在第 14 节 source lifetime 上。

文件型 entry 第一版可使用 snapshot-local weak ETag，例如基于：

```text
size
mtime/mtimeNs
以及实现可稳定获得的 file identity fields
```

它不是跨 reopen 的永久 content hash，只在当前 static-source snapshot 语义下作为 HTTP validator。

请求前若 fingerprint 表明 source drift：

```text
mark stale
→ 503
```

而不是继续使用旧 ETag 返回内容。

Database Descriptor 因内容很小且由 index 生成，应使用稳定 table 排序和 deterministic JSON serialization；其 ETag 可直接由生成后的 descriptor bytes 计算。

未来 FSDB 若拥有 authoritative content hash，再优先使用该 authority。

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
1. FSDB NameSegment / TableName / Key / ResourceKey types
2. Well-formed validator
3. scanner + immutable logical index
4. symlink/path containment + source fingerprints
5. hierarchical ResourceKey indexing
6. raw URL split + percent-decode + logical resolver
7. GET / HEAD handler
8. raw JSON / JSONL / resource response
9. metadata logical entry
10. MIME + Content-Length
11. OPEN / STALE / CLOSED lifecycle
12. ETag / If-None-Match
13. malformed/not-found/stale/method tests
14. real Unicode FSDB fixture + consumer smoke
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
```

---

## 18. 第一版完成标准

给定静态 FSDB fixture，可以完成：

```text
open
→ Well-formed validation/index
→ start handler
→ GET/HEAD struct/extend/group/resource
→ GET/HEAD hierarchical ResourceKey
→ GET/HEAD metadata
→ Unicode NameSegment URL round-trip
→ correct raw bytes / MIME / Content-Length / ETag
```

必须证明：

```text
中文等 NFC Unicode key 可正常读取
非 NFC / 非法 filename key 被拒绝
$ / . reserved namespace 不与业务 key 冲突
Resource 子目录稳定映射为 hierarchical logical key
扩展名不参与 Resource identity
%2F 不能突破 HTTP segment boundary
无法通过 URL 读取 index 外文件
无法 path traversal
无法 symlink escape
source drift 后进入 stale 且返回 503
无法写入 FSDB
错误不泄露 physical path
```

达到上述条件后，第一版设计即足够进入实现；Range、完整 Integrity validation 或抽分 `@loomrealm/fsdb` 只在真实消费者需要时继续增加。
