# M12 / 05 — Qualification and Closure

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M12 Content  
> 落地顺序：05  
> 最近复核：2026-09-08  
> 前置：[M12 / 01](M12_01_CONTENT_SERVICE.md) → [M12 / 02](M12_02_SUBSYSTEM_CONTENT_CLIENT.md) → [M12 / 03](M12_03_RENDERER_RESOURCE_CLIENT.md) → [M12 / 04](M12_04_VERTICAL_INTEGRATION.md)  
> 正式契约：[Content API v1](doc/15-contracts/content-api-v1.md)  
> 目标：定义唯一 M12 closure matrix；实现只完成 readonly Content capability，不扩张为 storage、asset、presentation 或 deployment framework。

> **M12 已冻结到可直接完整实施：package ownership、public API、identity、version、validation、error、lifetime、vertical 与 qualification均不得在编码阶段重新选择。**

---

## 1. Closure Scope

必须完成：

```text
@loomrealm/fsdb exact Node FSDB core extraction
prepare-time immutable Content view/index
Desktop Content API composition
FSDB logical Content projection
Desktop bearer authorization
exact Content version/cache/error semantics
exact Subsystem ContentClient author surface
Renderer-private version-checked ResourceClient
real Hostra Subsystem vertical
real Renderer ResourceClient vertical
```

不属于 M12：

```text
loom.map implementation
Subsystem group()/manifest() author API
RenderNode→resource-reference presentation schema
DOM/Canvas/WebGL/Audio presentation
PWA Service Worker implementation/equivalence
package install/update/delete
executable resolution changes
Save System
```

---

## 2. Freeze / Reopen Rule

本组 M12 文档与当前 Content API v1共同构成 frozen implementation baseline。

编码阶段只允许：

```text
private data structures
buffer sizing within bounded policy
internal function/file decomposition
cache implementation strategy
performance optimization preserving observables
```

不得重新选择：

```text
package ownership/public export shape
logical identity/routes
contentVersion representation
argument validation/error mapping
credential flow
lifetime/failure domain
vertical scope
qualification evidence
```

若实施证明 formal contract 与 frozen M12 slice存在 correctness contradiction：

```text
stop
→ classify exact contradiction
→ explicitly update/review formal contract
→ reopen affected M12 item
```

不得用 private header、query、alias、compatibility DTO 或 duplicate model绕过。

---

## 3. Exact FSDB Package Ownership

M12新增 exactly one FSDB core package：

```text
@loomrealm/fsdb
```

冻结 dependency set：

```text
@loomrealm/fsdb
    depends on Node stdlib only

@loomrealm/fsdb-http
    depends on @loomrealm/fsdb

@loomrealm/desktop
    depends on @loomrealm/fsdb
```

`@loomrealm/fsdb` exact public concepts：

```text
FsdbTableKind
OpenFsdbOptions
FsdbDatabaseState
FsdbDatabase
FsdbEntryIdentity
FsdbEntryDescriptor
FsdbReadLease
openFsdb
listFsdbEntries
openFsdbEntry
```

Exact signatures/semantics以 M12/01 为准。

必须保持：

```text
fsdb-http existing root public API unchanged
fsdb-http existing observable HTTP behavior/conformance unchanged
listFsdbEntries/openFsdbEntry not re-exported by fsdb-http root
```

禁止：

```text
HTTP-over-HTTP fsdb proxy
duplicate FSDB scanner/safe-open
cross-workspace relative import
import fsdb-http private implementation
generic Repository/storage-provider framework
```

---

## 4. Prepared Installation / Identity Evidence

必须证明：

```text
one successful prepare
→ one opaque installationId
→ deterministic normalized public GameEntryV1 manifest bytes
→ one immutable Content Index
```

禁止 global mutable InstallationRegistry 作为 M12 requirement。

FSDB-backed mapping固定：

```text
struct T   → record   namespace struct.<T>
extend T   → record   namespace extend.<T>
group T    → group    namespace group.<T>
resource T → resource namespace resource.<T>
```

Identity rules：

```text
record/group key = single logical segment
resource key     = one-or-more validated logical segments joined by /
```

同名 struct/extend必须可区分；不得使用 lookup priority。

`installationId`/namespace/key均是 logical identity，不是 path。Resource route逐 segment decode/validate后形成 logical ResourceKey；禁止 request path→filesystem direct mapping。

---

## 5. Exact Content Version Evidence

Content API v1 exact format：

```text
contentVersion = sha256:<64 lowercase hex>
```

必须证明：

```text
SHA-256 covers exact successful full-body 200 representation bytes
same full-body bytes → same version
changed full-body bytes → different version
contentVersion != fsdb snapshotId
contentVersion != raw filesystem metadata fingerprint
X-Loom-Content-Version = exact contentVersion
ETag = quoted exact contentVersion
If-None-Match match → 304
HEAD/304 use corresponding full-body 200 version fact
```

FSDB-backed record/group/resource使用 `FsdbEntryDescriptor.sha256` 对应 exact served bytes。

Manifest固定：

```text
public GameEntryV1 fields only
→ recursively sorted object keys by Unicode code-point order
→ arrays preserve order
→ scalar spelling follows JSON.stringify semantics
→ no insignificant whitespace
→ UTF-8 without BOM
→ SHA-256 exact served bytes
```

不得建立 public generic canonical-JSON framework。

Client cache identity至少包含 prepared installation + logical identity + contentVersion。

---

## 6. Content API Service Evidence

至少覆盖：

```text
manifest / record / group / resource success
single-segment record/group identity
multi-segment hierarchical resource identity
GET / HEAD
MIME / Content-Length where determinable
unknown installation / namespace / key
malformed identity / traversal rejection
401 missing/invalid/expired bearer
403 insufficient scope
409 installation/version/index conflict
422 schema/integrity failure
413 / 429 bounded deployment behavior
405 non-GET/HEAD
no token/path/internal-stack/index leak
```

固定：

```text
state/version/index conflict → 409
body schema/integrity failure → 422
```

Range只在实现支持时按标准 HTTP qualification；不是 closure requirement。

---

## 7. Exact Subsystem Author Surface

M12 root surface exactly：

```text
ContentReadOptions(signal only)
ContentRecord
ContentResource
ContentReadErrorCode
ContentReadError
ContentClient.record
ContentClient.resource
SubsystemScope.content
```

`ContentReadError`：

```text
constructor(code: ContentReadErrorCode)
name = "ContentReadError"
code = exact constructor code
message is not branchable API
```

Local validation：

```text
namespace / record key = valid single Content segment
resource key = one-or-more valid segments joined by /
options = non-null object when supplied
signal = AbortSignal when supplied
```

Observable result：

```text
invalid local argument
→ synchronous TypeError
→ zero HTTP request

already-aborted valid signal
→ Promise rejects CONTENT_CANCELLED
→ zero HTTP request
```

合法 remote request mapping：

```text
404                              → CONTENT_NOT_FOUND
409                              → CONTENT_CONFLICT
422                              → CONTENT_INVALID
abort                            → CONTENT_CANCELLED
400/401/403/413/429/5xx/network → CONTENT_UNAVAILABLE
```

必须证明：

```text
business Definition depends only on @loomrealm/subsystem
installationId/URL/token/path/HTTP/FSDB types hidden
no author contentVersion request selector
no author group/manifest/raw fetch surface
returned contentVersion exact sha256 format
returned JSON/bytes detached from internal cache ownership
caller mutation cannot affect future reads
ordinary read failure is caller-local
Frame/Activation/Data/Render lifecycle does not own ContentClient
Runtime terminal settles owned reads
```

Hostra Runner必须在 `definition.initialize` 前构造 required ContentClient；构造失败属于 Runtime bootstrap failure。Content grant不得进入 `SubsystemLaunchContext`、Frame params、Runtime bootstrapToken或 M9 Data provisioning IPC。

---

## 8. Renderer Evidence

必须证明：

```text
namespace + hierarchical-or-single key + expectedContentVersion
→ production Renderer ResourceClient
→ Content API
→ bytes + MIME + actualContentVersion
```

并证明：

```text
actual version format = sha256:<64 lowercase hex>
actual version mismatch → no success bytes
same key + different version never reuses stale bytes
returned Uint8Array cannot mutate cache/future reads
Content failure does not mutate Renderer Render Store/Main/Subsystem authority
Data reconnect does not invent Content cache lifecycle
```

M12 不 qualification RenderNode.data→resource mapping，也不新增 public AssetManager/Store subscription API。

---

## 9. Vertical Evidence

必须有两个 production-path vertical：

```text
A. prepare → @loomrealm/fsdb → Desktop Service → Hostra child → scope.content → business observable result
B. prepare → @loomrealm/fsdb → Desktop Service → production Renderer ResourceClient → resource bytes
```

Temporary installation/fixtures可以 test-owned；FSDB core、prepare/index、service、authorization、Hostra injection、clients必须走 production code。

禁止 test-only direct file reader、test-only ResourceClient、manual private-path injection或手工 authority mutation。

---

## 10. Abstraction Budget

允许：

```text
one Node-specific @loomrealm/fsdb core with two real consumers
one prepared-installation Content view
one Desktop Content Service composition
minimal authorization/version/problem helpers
one bound Subsystem ContentClient responsibility
one Renderer-private ResourceClient responsibility
small immutable cache/dedupe where directly useful
```

禁止：

```text
global mutable InstallationRegistry
@loomrealm/content-core created only for symmetry
generic Repository/storage provider hierarchy
AssetManager / loader / decoder plugin framework
service locator
Content RPC / credential protocol
second HTTP stack
Content/Main authority coupling
executable/content capability merge
```

跨角色 shared Content client helper只有两个 production consumers出现真实重复时才允许抽取。

---

## 11. Dependency Evidence

必须保持：

```text
@loomrealm/fsdb       → Node stdlib only
@loomrealm/fsdb-http  → @loomrealm/fsdb
@loomrealm/desktop    → @loomrealm/fsdb

business Definition   → @loomrealm/subsystem
@loomrealm/map        → @loomrealm/subsystem   (M13)
Main                  ✗ Content implementation dependency without concrete use case
Subsystem author API  ✗ platform / HTTP / credential / FSDB types
Renderer business state ✗ filesystem / bearer / privileged URL
```

Physical Content Service、grant、installation view留在 Platform composition。

---

## 12. Root Gate

M12实施后建立唯一 closure gate：

```text
npm run test:m12
    = npm run test:m11
    + @loomrealm/fsdb build/test/pack
    + fsdb-http regression/build/test/pack
    + Content API qualification
    + Subsystem ContentClient tests
    + Renderer ResourceClient tests
    + dependency/boundary tests
    + M12 production verticals
```

Node 20 / 24 CI执行同一 gate。

---

## 13. Implementation Checklist

```text
[ ] @loomrealm/fsdb exact public surface implemented
[ ] existing fsdb-http public contract/conformance preserved
[ ] no duplicate scanner/safe-read/HTTP proxy/cross-workspace private import
[ ] FsdbEntryDescriptor.sha256 exact 64 lowercase hex
[ ] list/open/lease semantics qualified

[ ] prepared installation Content view/index implemented
[ ] opaque installationId + deterministic public GameEntry manifest proven
[ ] FSDB namespace mapping exact and collision-free
[ ] hierarchical ResourceKey route round-trip proven
[ ] exact sha256 contentVersion/ETag semantics proven
[ ] bearer scope/expiry enforced
[ ] 409 vs 422 qualified

[ ] exact Subsystem ContentClient surface implemented
[ ] ContentReadError constructor/name/code exact
[ ] invalid local arguments synchronously TypeError + zero HTTP
[ ] already-aborted valid signal → CONTENT_CANCELLED + zero HTTP
[ ] no author group/manifest/contentVersion-selector/raw fetch
[ ] returned JSON/bytes cannot poison cache/future reads
[ ] Hostra injection before business initialize proven
[ ] Content grant does not reuse Data provisioning IPC
[ ] ordinary read failure remains caller-local

[ ] Renderer ResourceClient implemented
[ ] response-version format/comparison proven
[ ] hierarchical resource key works
[ ] returned bytes cannot poison cache/future reads
[ ] no RenderNode schema/presentation work pulled into M12

[ ] Subsystem production vertical passes
[ ] Renderer ResourceClient production vertical passes
[ ] boundary/dependency tests pass
[ ] M1–M11 regression green
[ ] Node 20 / 24 root gate green
```

---

## 14. Freeze Statement

**M12 preimplementation design is closed.**

Implementation MUST now follow M12/01–05 + Content API v1 as written.普通编码困难、文件布局偏好或复用便利性都不是 reopen理由。

允许 reopen 的唯一门槛：

```text
proof of a correctness contradiction
with an existing normative/frozen contract
that cannot be satisfied by private realization choices
```

满足该门槛时必须先修订 contract/frozen doc，再继续实现；不得在代码中先产生第二语义。

---

## 15. Closure Statement

M12 complete 后：

```text
current prepared installation
→ @loomrealm/fsdb immutable logical source
→ immutable logical Content view
→ Desktop readonly Content API
→ Subsystem business record/resource reads
→ Renderer version-safe resource bytes reads
```

并且没有新增 application authority、没有暴露 physical storage、没有把 FSDB HTTP surface变成 author contract，也没有提前实现 M13/M14/M15/M16。

实现完成后只同步 README、phase plan、qualification record与 concrete evidence；不再回头重选 M12设计。
