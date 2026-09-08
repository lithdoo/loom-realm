# M12 / 01 — Desktop Content Service

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M12 Content  
> 落地顺序：01  
> 最近复核：2026-09-08  
> 正式契约：[Content API v1](doc/15-contracts/content-api-v1.md)  
> 架构：[存储与内容系统](doc/10-architecture/storage-system.md)  
> 现有底座：[`@loomrealm/fsdb-http`](packages/fsdb-http/README.md)  
> 目标：把既有 FSDB scan/index/safe-read mechanics机械提取为唯一 Node FSDB core，并在其上实现 Desktop Content API；不复制 storage/HTTP mechanics，不建立 generic Content framework。

> **M12/01 增加的是 current prepared installation 的 logical Content projection 与 Desktop authorization/composition；FSDB core只做必要抽取，Content 不变成 FSDB HTTP 的别名。**

---

## 1. Frozen Position

```text
Hostra prepare succeeds
→ one immutable prepared installation view
→ trusted Content Index + normalized public manifest
→ Desktop Content Service
→ logical readonly Content API
```

Content API只提供：

```text
manifest
record
group
resource
```

它不拥有 Runtime、Frame、Render、Input 或 executable authority。

---

## 2. Exact FSDB Ownership

M12 新增 **一个** Node-only workspace package：

```text
@loomrealm/fsdb
```

它不是新的 storage framework；它只是从现有 `@loomrealm/fsdb-http` 中机械提取已经存在的：

```text
FSDB validation
immutable logical snapshot/index
safe-open / source-currentness check
read lease / stream lifecycle
content MIME/length metadata
```

冻结依赖：

```text
@loomrealm/fsdb
    → Node stdlib only

@loomrealm/fsdb-http
    → @loomrealm/fsdb

@loomrealm/desktop
    → @loomrealm/fsdb
```

`@loomrealm/fsdb` MUST NOT依赖：

```text
HTTP
Content API
Game Package
Platform Ports
Main
Subsystem
Renderer
Launcher
```

### 2.1 Exact `@loomrealm/fsdb` public surface

M12冻结以下最小 surface：

```ts
import type { Readable } from "node:stream";

declare const fsdbDatabaseBrand: unique symbol; // module-private

export type FsdbTableKind =
  | "struct"
  | "extend"
  | "group"
  | "resource";

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

export interface FsdbEntryIdentity {
  readonly kind: FsdbTableKind;
  readonly table: string;
  readonly key: string;
}

export interface FsdbEntryDescriptor {
  readonly identity: FsdbEntryIdentity;
  readonly contentType: string;
  readonly length: bigint;
  readonly sha256: string; // exactly 64 lowercase hex chars
}

export interface FsdbReadLease {
  readonly descriptor: FsdbEntryDescriptor;
  readonly stream: Readable;
  close(): Promise<void>;
}

export function openFsdb(
  options: OpenFsdbOptions,
): Promise<FsdbDatabase>;

export function listFsdbEntries(
  db: FsdbDatabase,
): readonly FsdbEntryDescriptor[];

export function openFsdbEntry(
  db: FsdbDatabase,
  identity: FsdbEntryIdentity,
  signal: AbortSignal,
): Promise<FsdbReadLease | null>;
```

冻结 semantics：

```text
listFsdbEntries()
    → current immutable snapshot only
    → deterministic order: kind, table, key lexical
    → descriptors detached/frozen from caller mutation

openFsdbEntry()
    → invalid identity / forged db → TypeError
    → absent identity            → null
    → aborted signal             → reject AbortError
    → stale/closed/source mismatch/read failure → reject
    → success returns one lease over exact indexed bytes

FsdbReadLease.close()
    → idempotent
    → stops/settles owned stream work
```

具体 non-TypeError Error subclass/message/code不是跨 package contract。

`sha256` 在 `openFsdb()` 建立 immutable snapshot时基于 exact indexed file bytes计算；它可以与 integrity scan共用 I/O，但不是 filesystem fingerprint。

### 2.2 `@loomrealm/fsdb-http` compatibility

`@loomrealm/fsdb-http` 的既有 root public surface保持不变：

```text
openFsdb
createFsdbHttpHandler
serveFsdb
existing public types
```

其中 `openFsdb` / `FsdbDatabase` / related existing types可以从 `@loomrealm/fsdb` re-export；`listFsdbEntries` 与 `openFsdbEntry` **不得**从 `@loomrealm/fsdb-http` root re-export。

因此已有 consumers/qualification不需要迁移 API；HTTP handler内部改用 `@loomrealm/fsdb` core。

禁止：

```text
HTTP-over-HTTP proxy
cross-workspace relative import
import fsdb-http private internals
duplicate scanner
duplicate safe-open implementation
```

---

## 3. Prepared Installation View

M12 Desktop只服务**当前 concrete Platform已成功 prepare 的 installation**；不建立 global mutable InstallationRegistry。

Prepare 在 first business Runtime side effect前形成并私有持有：

```text
installationId
normalized public manifest bytes
immutable Content Index
validated FSDB entry identities
contentVersion metadata
```

冻结规则：

```text
installationId = Host-owned opaque identity for this prepared installation view
installationId != filesystem path
manifest = normalized public GameEntryV1 projection
manifest ✗ launch.hostra.json / module path / installation root
```

Content Index是 request lookup authority；URL segment永远不能直接解释成 filesystem path。

---

## 4. Phase-1 FSDB Logical Projection

FSDB-backed Content Index使用确定、可逆的 logical projection：

```text
FSDB TableIdentity = (kind, TableName)
Content namespace  = "<kind>." + TableName
```

因此：

```text
[struct]角色   → record   namespace = struct.角色
[extend]角色   → record   namespace = extend.角色
[group]队伍    → group    namespace = group.队伍
[resource]图像 → resource namespace = resource.图像
```

`record/group key` 使用对应 FSDB single-segment `Key`。

`resource key` 使用对应 FSDB hierarchical `ResourceKey`：

```text
ui/icons/potion.png
```

Content API route把它编码为多个 resource path segments；逐 segment decode/validate 后再以 `/` 组成 logical ResourceKey。不得把 request path直接当 filesystem path。

同名 `struct` / `extend` 通过 namespace prefix保持可区分；不得通过 lookup priority消解 identity。

---

## 5. Exact Content Version

M12直接采用 Content API v1 frozen representation：

```text
contentVersion = "sha256:" + sha256Hex(exact full-body representation bytes)
```

其中 `sha256Hex` 精确是 64 lowercase hex chars。

### FSDB-backed bodies

对于 record/group/resource：

```text
FsdbEntryDescriptor.sha256
→ prefix "sha256:"
→ ContentIndexEntry.contentVersion
```

必须 hash exact successful full-body bytes；不得 hash path、mtime、inode、snapshotId 或 JSON semantic value。

### Manifest

Manifest 使用 Content API v1定义的 deterministic normalized public GameEntry JSON serialization，再 hash exact served UTF-8 bytes。

响应固定：

```text
X-Loom-Content-Version = contentVersion
ETag                    = quoted contentVersion
```

`If-None-Match`匹配返回 `304`。HEAD/304使用对应 full-body 200的同一版本事实。

---

## 6. Desktop Authorization

Desktop只监听 Host认可的 loopback endpoint。受保护请求使用：

```text
Authorization: Bearer <opaque token>
```

grant只表达：

```text
installationId
permission scope
expiry
```

Desktop Platform Composition owns service + grant policy。Hostra child/Renderer只获得各自当前需要的 bound access material。

Content grant：

```text
!= Runtime bootstrapToken
!= Runner executable material
!= Data ticket / Data provisioning IPC
```

尤其不得复用 M9 Data provisioning protocol分发 Content credential，也不新增 Content credential wire/profile。

---

## 7. Response / Failure Semantics

Content API特有语义必须完整实现：

```text
application/problem+json
401 missing/invalid/expired auth
403 insufficient scope
404 unknown installation/content
409 installation/version/index conflict
413 deployment hard limit
422 selected body schema/integrity failure
429 bounded deployment pressure
405 non-GET/HEAD
```

固定：

```text
state/version/index conflict → 409
body schema/integrity failure → 422
```

错误不得泄露 token、filesystem path、installation root、internal stack或 unauthorized index data。

Range不是 M12 mandatory capability。

---

## 8. Lifetime / Failure Domain

```text
Content Service lifetime = prepared Desktop Platform composition lifetime
Content resource lifetime != Frame / Activation / RenderDomain / Data carrier lifetime
Data reconnect != Content Service restart
```

Content capability在 Runtime business initialization前无法正确构造时，属于该 Runtime bootstrap failure。

Runtime已建立后的 ordinary Content read failure只返回给调用方：

```text
ordinary read failure
!= Runtime failure
!= Frame unwind
```

---

## 9. Abstraction Budget

允许：

```text
one Node-specific @loomrealm/fsdb core extracted from existing mechanics
one prepared-installation Content view
one Desktop Content Service composition
small authorization / version / problem mapping helpers
```

禁止：

```text
global mutable InstallationRegistry
generic Repository/cache hierarchy
storage provider interface
service locator / plugin registry
second HTTP stack
Content RPC / credential protocol
executable resolver merged into Content resolver
```

`@loomrealm/fsdb` 的存在只由两个真实 production consumers证明：`fsdb-http` 与 Desktop Content Service。不得继续抽象成 generic storage SPI。

---

## 10. Done

M12/01 complete when：

```text
@loomrealm/fsdb exact surface implemented
fsdb-http public API/conformance preserved through core extraction
no duplicate scanner/safe-open/HTTP stack
prepared installation → immutable Content view deterministic
manifest source/bytes/version unambiguous
FSDB TableIdentity → Content namespace mapping unambiguous
hierarchical ResourceKey round-trips without path leakage
contentVersion exact sha256 representation qualified
bearer scope/expiry and failure mapping conform
Content/Data/Runtime credential boundaries remain separate
```

编码阶段只允许改变 private data structure、buffering与性能策略；package ownership、public surface、identity、version、authorization、lifetime与 failure boundary不得重新选择。
