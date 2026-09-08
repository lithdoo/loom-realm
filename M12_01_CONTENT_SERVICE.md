# M12 / 01 — Desktop Content Service

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M12 Content  
> 落地顺序：01  
> 最近复核：2026-09-08  
> 正式契约：[Content API v1](doc/15-contracts/content-api-v1.md)  
> 架构：[存储与内容系统](doc/10-architecture/storage-system.md)  
> 现有底座：[`@loomrealm/fsdb-http`](packages/fsdb-http/README.md)  
> `fsdb-http` 冻结修订：[M12 FSDB Core Extraction Amendment](packages/fsdb-http/M12_CORE_EXTRACTION.md)  
> 目标：把既有 FSDB scan/index/safe-read mechanics机械提取为唯一 Node FSDB core，并在其上实现 Desktop Content API；不复制 storage/HTTP mechanics，不建立 generic Content framework。

> **M12/01 增加的是 current prepared installation 的 logical Content projection 与 Desktop authorization/composition；`@loomrealm/fsdb` 只承接完整 readonly FSDB domain，不承接 Content/HTTP authority。**

---

## 1. Frozen Position

```text
Hostra prepare succeeds
→ one immutable prepared installation view
→ @loomrealm/fsdb readonly snapshot
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

它不是 storage framework；它只是从现有 `@loomrealm/fsdb-http` 中机械提取已经存在的完整 readonly FSDB domain mechanics：

```text
FSDB validation
immutable logical snapshot/index
database descriptor representation
ordinary entries + metadata logical lookup
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

export type FsdbMetadataName =
  | "$info"
  | "$extend"
  | "$desc";

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

export type FsdbObjectIdentity =
  | {
      readonly type: "entry";
      readonly kind: FsdbTableKind;
      readonly table: string;
      readonly key: string;
    }
  | {
      readonly type: "metadata";
      readonly kind: FsdbTableKind;
      readonly table: string;
      readonly metadata: FsdbMetadataName;
    };

export interface FsdbEntryDescriptor {
  readonly identity: Extract<FsdbObjectIdentity, { readonly type: "entry" }>;
  readonly contentType: string;
  readonly length: bigint;
}

export interface FsdbObjectDescriptor {
  readonly identity: FsdbObjectIdentity;
  readonly contentType: string;
  readonly length: bigint;
  readonly sourceTag: string;
}

export interface FsdbReadLease {
  readonly descriptor: FsdbObjectDescriptor;
  readonly stream: Readable;
  close(): Promise<void>;
}

export function openFsdb(
  options: OpenFsdbOptions,
): Promise<FsdbDatabase>;

export function describeFsdb(
  db: FsdbDatabase,
): Uint8Array;

export function getFsdbSnapshotId(
  db: FsdbDatabase,
): string;

export function listFsdbEntries(
  db: FsdbDatabase,
): readonly FsdbEntryDescriptor[];

export function openFsdbObject(
  db: FsdbDatabase,
  identity: FsdbObjectIdentity,
  signal: AbortSignal,
): Promise<FsdbReadLease | null>;
```

这里 deliberately 不发布 Repository/query/provider abstraction。

### 2.2 Frozen core semantics

```text
describeFsdb(db)
    → exact existing deterministic FSDB database-descriptor bytes
    → caller-owned bytes; caller mutation cannot affect db/future describe

getFsdbSnapshotId(db)
    → fresh opaque process-local id per successful openFsdb()
    → stable for that database lifetime
    → not Content identity/version

listFsdbEntries(db)
    → all ordinary entry descriptors in current immutable snapshot
    → no metadata objects
    → descriptors detached/frozen from caller mutation
    → array order is intentionally non-semantic; callers MUST NOT branch on it

openFsdbObject(db, identity, signal)
    → accepts ordinary entry or metadata logical identity
    → invalid identity / forged db → TypeError
    → valid-but-absent/inapplicable object → null
    → abort before successful resolve → reject AbortError; no live lease
    → stale/closed/source mismatch/read failure → reject
    → success returns one lease over exact indexed object bytes
```

`sourceTag` 是 opaque snapshot-local source validator，只用于底层 currentness/adapter validator mechanics；它：

```text
!= content hash
!= Content contentVersion
!= public filesystem fingerprint structure
```

具体 `sourceTag` encoding/hash不冻结。

`signal` 只拥有 `openFsdbObject()` 的 admission/open 阶段：

```text
Promise resolves with FsdbReadLease
→ signal no longer owns that lease
→ caller owns lease.close()
```

`FsdbReadLease.close()`：

```text
idempotent
stops/settles owned stream work
releases the database read lease
```

`FsdbDatabase.close()`继续满足现有 drain semantics：停止新 admission，等待已 admitted lease release 后 resolve。

### 2.3 `@loomrealm/fsdb-http` compatibility

`@loomrealm/fsdb-http` 继续拥有：

```text
/fsdb/v1 routing
method/status precedence
metadata route grammar
MIME response policy
weak ETag / conditional request semantics
Cache-Control
Node RequestListener / Server composition
```

它改用 `@loomrealm/fsdb`：

```text
describeFsdb
getFsdbSnapshotId
openFsdbObject
```

从而继续服务：

```text
/fsdb/v1 database descriptor
ordinary entry
$info / $extend / $desc metadata
```

它的既有 root public surface保持不变：

```text
openFsdb
createFsdbHttpHandler
serveFsdb
existing public types
```

其中 `openFsdb` / `FsdbDatabase` / related existing types可以从 `@loomrealm/fsdb` re-export；以下 core functions/types **不得**从 `@loomrealm/fsdb-http` root re-export：

```text
describeFsdb
getFsdbSnapshotId
listFsdbEntries
openFsdbObject
FsdbObjectIdentity
FsdbObjectDescriptor
FsdbReadLease
```

M12 显式修订 `fsdb-http` 原 frozen DESIGN 中“0 runtime dependencies / package internal ownership”这一条；修订范围只允许 `Node stdlib → @loomrealm/fsdb → @loomrealm/fsdb-http` 的机械 core extraction。Node public API、HTTP observable behavior、安全不变量与既有 conformance不得改变；精确修订见 `packages/fsdb-http/M12_CORE_EXTRACTION.md`。

禁止：

```text
HTTP-over-HTTP proxy
cross-workspace relative import
import fsdb-http private internals
duplicate scanner
duplicate metadata index
duplicate safe-open implementation
```

---

## 3. Prepared Installation View

M12 Desktop只服务**当前 concrete Platform已成功 prepare 的 installation**；不建立 global mutable InstallationRegistry。

Prepare 在 first business Runtime side effect前形成并私有持有：

```text
installationId
normalized public manifest bytes
@loomrealm/fsdb database
immutable Content Index
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

### 3.1 Trusted readonly source assumption

M12 prepared installation在其 Content Service lifetime内属于 Host-trusted readonly source：

```text
ordinary game/runtime/renderer capability
→ no physical write authority to prepared installation
```

`@loomrealm/fsdb` 仍按 static-source contract在 admission/open 时检测已知 source drift并 fail closed。

M12 不把 Content capability扩张成抵抗“另一个拥有 installation physical write authority 的恶意并发本地 writer”的 filesystem transaction/snapshot system。若这种 writer绕过 Host ownership直接修改已经 opened 的 file handle backing storage，其行为不属于 M12 Content correctness threat model。

因此不得为此新增：

```text
copy-on-read store
transactional filesystem abstraction
immutable blob database
filesystem writer coordination protocol
```

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
ui/icons/potion
```

Content API route把它编码为多个 resource path segments；逐 segment decode/validate 后再以 `/` 组成 logical ResourceKey。不得把 request path直接当 filesystem path。

同名 `struct` / `extend` 通过 namespace prefix保持可区分；不得通过 lookup priority消解 identity。

FSDB metadata (`$info/$extend/$desc`) 不进入 Phase-1 Content ordinary record/group/resource projection；它们保留在 FSDB core供 `fsdb-http` 使用。

---

## 5. Exact Content Version

M12采用 Content API v1 frozen representation：

```text
contentVersion = "sha256:" + sha256Hex(exact full-body representation bytes)
```

其中 `sha256Hex` 精确是 64 lowercase hex chars。

### 5.1 FSDB-backed bodies

`@loomrealm/fsdb` **不拥有 Content hash/version policy**。

Prepare-time Content Index构建对每个 ordinary FSDB entry：

```text
listFsdbEntries()
→ openFsdbObject(entry identity)
→ stream exact indexed bytes through SHA-256
→ close lease
→ prefix "sha256:"
→ ContentIndexEntry.contentVersion
```

必须 hash exact successful full-body bytes；不得 hash path、mtime、inode、`snapshotId`、`sourceTag` 或 JSON semantic value。

这样 `fsdb-http` standalone consumer不会仅因 M12 core extraction被迫为所有资源计算 Content hash；Content-specific hashing只由 Desktop Content preparation承担。

### 5.2 Manifest

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
one Node-specific @loomrealm/fsdb core with two real production consumers
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
transactional filesystem abstraction
```

`@loomrealm/fsdb` 只承接既有 FSDB domain；Content hash、authorization、installation与Content logical projection均不得下沉进去。

---

## 10. Done

M12/01 complete when：

```text
@loomrealm/fsdb exact complete readonly FSDB surface implemented
fsdb-http descriptor/ordinary/metadata paths全部通过 core且 regression green
fsdb-http frozen dependency clause有显式 amendment；public API/HTTP contract不变
no duplicate scanner/metadata-index/safe-open/HTTP stack
prepared installation → immutable Content view deterministic
trusted readonly source assumption documented/qualified
manifest source/bytes/version unambiguous
FSDB TableIdentity → Content namespace mapping unambiguous
hierarchical ResourceKey round-trips without path leakage
Content hash由 Desktop prepare对 exact ordinary bytes计算，不污染 FSDB core
bearer scope/expiry and failure mapping conform
Content/Data/Runtime credential boundaries remain separate
```

编码阶段只允许改变 private data structure、buffering与性能策略；package ownership、public surface、identity、version、authorization、lifetime与 failure boundary不得重新选择。