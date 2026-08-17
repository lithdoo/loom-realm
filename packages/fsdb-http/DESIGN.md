# @loomrealm/fsdb-http 设计草案

> 状态：Draft  
> 最近复核：2026-08-17  
> 目标：把硬盘上的只读 FSDB 目录转换成稳定、安全、可独立使用的 HTTP 接口  
> 参考：[FSDB 目录结构详解](../../doc/fsdb/FSDB目录结构详解.md)

本文描述第一版实现方向，不是冻结协议。FSDB logical identity 以 FSDB 规范为 authority；HTTP 层不得自行增加与 FSDB 冲突的 key 规则。

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

第一版目标：

```text
Node.js stdlib
    ↓
@loomrealm/fsdb-http
```

即尽量保持 0 runtime dependencies；只有出现真实需求时再引入外部依赖。

---

## 2. Scope

第一版负责：

```text
打开一个 FSDB 根目录
识别 FSDB 表目录
验证必要 metadata 与数据文件
构建 immutable safe index
按 FSDB logical identity 解析对象
通过 GET / HEAD 返回原始内容 bytes
返回 Content-Type / Content-Length / ETag
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

## 3. 继承的 FSDB Identity

HTTP 层直接继承 FSDB 规范，不另定义一套数据 identity。

### 3.1 Table kind

```text
struct
extend
group
resource
```

物理目录：

```text
[FSDB]<database>/
├── [struct]<name>/
├── [extend]<name>/
├── [group]<name>/
└── [resource]<name>/
```

### 3.2 Key 保留规则

FSDB 已规定：

```text
普通 key 不得以 $ 开头
Resource Key 的任一 path segment 不得以 $ 开头
```

因此 HTTP 可以安全使用：

```text
$info
$extend
$desc
```

作为逻辑 metadata entry，而不会侵占合法 FSDB 业务 key。

该限制属于 FSDB identity，不属于 `@loomrealm/fsdb-http` 私有规则。

### 3.3 Resource Key

Resource 文件可以位于任意层级子目录中。

Logical Resource Key：

```text
relative path from [resource]<table>
- final file extension
+ '/' as canonical logical separator
```

示例：

```text
[resource]image/hero.png
→ hero

[resource]image/character/hero.png
→ character/hero

[resource]image/ui/icon/item.large.png
→ ui/icon/item.large
```

扩展名不属于 identity。

因此：

```text
hero.png
hero.webp
```

在同一 Resource 表中产生相同 key `hero`，属于 duplicate logical key，`openFsdb()` 必须拒绝。

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

FSDB 规范声明“其他目录/文件忽略”时，应遵循：

```text
unknown / unrecognized
    → ignore / not index / not serve

recognized FSDB object but malformed
    → openFsdb() fails
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

第一阶段先保持一个 package。只有出现第二个真实消费者，例如 Installer 或非 HTTP FSDB reader，再考虑把 `fsdb/` 抽成独立 `@loomrealm/fsdb`。

---

## 6. 候选 Public API

核心读取：

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

HTTP API 表达 FSDB storage semantics，不表达 LoomRealm Content API semantics。

第一版只有两个 route pattern：

```text
GET|HEAD /fsdb/v1
GET|HEAD /fsdb/v1/{kind}/{table}/{entry...}
```

其中：

```text
kind = struct | extend | group | resource
```

`entry...` 表示从 table 后开始的 logical entry path：

- 对 `struct` / `extend` / `group`，普通 key 只占一个 segment；
- 对 `resource`，普通 key 可以占多个 segment；
- `$info` / `$extend` / `$desc` 是 FSDB 保留命名空间中的 metadata entry。

### 7.1 Database Descriptor

```text
GET|HEAD /fsdb/v1
```

只列数据库身份和 table，不列 table 内 keys。

概念响应：

```json
{
  "name": "game",
  "tables": [
    { "kind": "struct", "name": "actor" },
    { "kind": "group", "name": "map-event" },
    { "kind": "resource", "name": "image" }
  ]
}
```

`/fsdb/v1` 中的 `v1` 是 HTTP API version，不表示 FSDB 文件格式存在一个独立的 `fsdbVersion = 1`。

Descriptor 不暴露：

```text
physical directory
metadata filename
absolute path
table 内 key 列表
```

### 7.2 Data Entry

```text
GET|HEAD /fsdb/v1/struct/{table}/{key}
GET|HEAD /fsdb/v1/extend/{table}/{key}
GET|HEAD /fsdb/v1/group/{table}/{key}
GET|HEAD /fsdb/v1/resource/{table}/{resourceKey...}
```

示例：

```text
[struct]actor/001.json
→ /fsdb/v1/struct/actor/001

[group]map-event/001.jsonl
→ /fsdb/v1/group/map-event/001

[resource]image/hero.png
→ /fsdb/v1/resource/image/hero

[resource]image/character/hero.png
→ /fsdb/v1/resource/image/character/hero
```

HTTP 不携 resource 扩展名；MIME/extension 是 indexed storage metadata。

### 7.3 Metadata Entry

物理 metadata 映射为 logical entry：

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

例如：

```text
/fsdb/v1/struct/actor/$info
/fsdb/v1/extend/actor-skill/$extend
/fsdb/v1/group/map-event/$desc
/fsdb/v1/resource/image/$desc
```

由于 FSDB 普通 key / Resource Key segment 已禁止 `$` 前缀，因此 metadata route 与业务 key 不产生命名冲突。

允许但不存在的 optional metadata 返回 `404`。

---

## 8. Response 原则

服务层尽量返回磁盘原始 bytes，而不是 parse 后重新 serialize。

```text
struct key
extend key
    → application/json; charset=utf-8

group key
$extend
    → application/x-ndjson; charset=utf-8

$info
    → application/schema+json; charset=utf-8
       或在实现兼容性需要时退回 application/json

$desc
    → text/markdown; charset=utf-8

resource
    → indexed extension/MIME 对应的原始 bytes
```

Database Descriptor：

```text
Content-Type: application/json; charset=utf-8
```

支持：

```text
Content-Length when determinable
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

`HEAD` 执行与对应 `GET` 相同的 route/index/existence 检查并返回可确定的相同 headers，但不返回 body。

包始终只读，即使宿主进程对目录具有写权限。

---

## 10. HTTP Status / Error Boundary

| 情况 | Status |
|---|---:|
| `GET` / `HEAD` 命中 | `200` |
| `If-None-Match` 命中 | `304` |
| URL / percent-encoding / logical identity 非法 | `400` |
| kind/table/key/metadata 不存在或组合不支持 | `404` |
| 非 `GET` / `HEAD` | `405` |
| 已索引文件在服务期间异常不可读等本地故障 | `500` |

第一版不建立复杂 error protocol。

实现 MAY 返回很小的 JSON error body，例如：

```json
{ "error": "not_found" }
```

错误不得包含：

```text
absolute path
user home
internal stack
raw filesystem error path
physical metadata filename
```

---

## 11. Index / Validation

`openFsdb()` 扫描一次并生成 immutable logical index。

至少检查：

```text
FSDB root identity
recognized table directory type
required metadata exists
metadata file syntax valid
struct/extend entry is JSON object
group each JSONL line is JSON object
logical table identity unique
logical key identity unique
all key rules from FSDB spec
hierarchical Resource Key normalization
resource key collision across extensions
resolved file stays inside root
no symlink escape
```

HTTP adapter 必须执行 structural/safety validation。

以下更深的 semantic integrity 不默认成为 HTTP serve 的必要条件：

```text
完整 JSON Schema business validation
所有 cross-record reference target 存在性
业务领域完整性
```

`.extend.meta` 本身仍需满足 FSDB 定义的格式与字段类型规则。

---

## 12. Resource Index

例如：

```text
[resource]image/ui/icon/item.large.png
```

索引概念上记录：

```ts
{
  kind: "resource",
  table: "image",
  key: "ui/icon/item.large",
  extension: ".png",
  mime: "image/png",
  // validated internal location
}
```

索引器递归扫描 Resource 表子目录，并把目录层级转换成规范中的 `/` logical key separator。

子目录只参与 key，不形成新 table，不创建独立 FSDB metadata scope。

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

即不做 key listing。

这样避免提前引入：

```text
排序
分页
大量 key 响应上限
资源存在性枚举
额外 snapshot semantics
```

未来只有真实消费者需要时再增加 enumeration。

---

## 14. ETag / Cache

第一版可使用：

```text
file size + modified time
```

生成 weak ETag，避免启动时给所有大资源计算完整 hash。

目标：

```text
ETag
If-None-Match
304 Not Modified
Content-Length
```

若未来 FSDB 自身提供稳定 content hash，再优先使用该 authority。

---

## 15. Source Lifetime

当前第一版不做 filesystem watch / hot reload。

实现时需要确保：

```text
immutable logical index
!=
假设底层磁盘永远不会变化
```

首个实现应在实际文件读取模型确定后，选择一个简单且 fail-closed 的 source lifetime 策略，例如：

```text
open → stable source expectation
source drift detected → fail/reopen
```

本节仍为实现阶段待闭合项，不影响 FSDB logical identity。

---

## 16. 与 LoomRealm Content API 的关系

两者属于不同层：

```text
@loomrealm/fsdb-http
    FSDB storage semantics
    disk → HTTP

LoomRealm Content API
    game installation logical content semantics
```

`@loomrealm/fsdb-http` 不加入：

```text
installationId
Game Package
Desktop Content bearer
Renderer / Runtime identity
Content API route
```

未来可由更高层 adapter/service 使用本包，但两层不强制一一映射。

---

## 17. 第一阶段实现顺序

```text
1. FSDB table/key/resource identity types
2. scanner + immutable index
3. validator + symlink/path containment
4. hierarchical Resource Key indexing
5. logical resolver
6. GET / HEAD handler
7. raw JSON / JSONL / resource response
8. metadata logical entry
9. MIME + Content-Length
10. ETag / If-None-Match
11. malformed/not-found/method error tests
12. real FSDB fixture + consumer smoke
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
```

---

## 18. 第一版完成标准

给定一个静态 FSDB fixture：

```text
open
→ validate/index
→ start handler
→ GET/HEAD struct/extend/group/resource
→ GET/HEAD hierarchical resource key
→ GET/HEAD metadata
→ 返回正确原始 bytes 与 MIME
```

并证明：

```text
$ 前缀普通 key 被 FSDB validation 拒绝
Resource 子目录稳定映射为 hierarchical logical key
扩展名不参与 Resource identity
无法通过 URL 读取 index 外文件
无法 path traversal
无法 symlink escape
无法写入 FSDB
错误不泄露 physical path
```

达到上述条件后，再根据真实消费者需求细化 source lifetime、Range 或拆分 `@loomrealm/fsdb`。
