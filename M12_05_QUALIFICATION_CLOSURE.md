# M12 / 05 — Qualification and Closure

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M12 Content  
> 落地顺序：05  
> 最近复核：2026-09-08  
> 前置：[M12 / 01](M12_01_CONTENT_SERVICE.md) → [M12 / 02](M12_02_SUBSYSTEM_CONTENT_CLIENT.md) → [M12 / 03](M12_03_RENDERER_RESOURCE_CLIENT.md) → [M12 / 04](M12_04_VERTICAL_INTEGRATION.md)  
> 正式契约：[Content API v1](doc/15-contracts/content-api-v1.md)  
> 目标：定义唯一 M12 closure matrix；实现只完成 readonly Content capability，不扩张为 storage、asset、presentation 或 deployment framework。

> **M12 closure = current prepared installation形成一个 logical、authorized、version-safe readonly Content view，并被 Subsystem 与 Renderer 两个真实 production consumers使用。**

---

## 1. Closure Scope

必须完成：

```text
prepare-time immutable Content view/index
Desktop Content API composition
FSDB logical projection
Desktop bearer authorization
Content version/cache/error semantics
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

M12 implementation slice冻结在当前 Content API v1语义上。`Content API v1` 文档本身仍标记 Evolving，不表示编码阶段可以静默选择另一套语义。

若实施证明当前 formal contract 与 frozen M12 slice存在 correctness contradiction：

```text
stop
→ classify exact contradiction
→ explicitly update/review formal contract
→ reopen affected M12 item
```

不得用 private header、query、alias 或 duplicate model绕过。

---

## 3. FSDB Baseline / Reuse Evidence

必须保持 `@loomrealm/fsdb-http` 现有 public API、observable HTTP behavior 与 conformance。

证明：

```text
no HTTP-over-HTTP fsdb proxy
no duplicate FSDB scanner/safe-open implementation
no import of fsdb-http private implementation across package boundary
```

允许把既有 FSDB-specific snapshot/read mechanics机械提取为 workspace-internal shared implementation seam，因为 M12 Content Service已经是第二个 production consumer。该 seam不得成为 generic Repository/storage provider framework或新的 product authority。

---

## 4. Prepared Installation / Identity Evidence

必须证明：

```text
one successful prepare
→ one opaque installationId
→ normalized public GameEntryV1 manifest
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

同名 struct/extend必须可区分；不得使用 lookup priority。

`installationId`/namespace/key均是 logical identity，不是 path。

---

## 5. Content Version Evidence

必须证明：

```text
contentVersion is deterministic content identity
contentVersion != fsdb process-local snapshotId
contentVersion != raw filesystem metadata fingerprint
X-Loom-Content-Version == indexed contentVersion
ETag represents the same contentVersion
If-None-Match match → 304
changed bytes cannot keep the old version
```

Client cache identity至少包含 prepared installation + logical identity + contentVersion。

---

## 6. Content API Service Evidence

至少覆盖：

```text
manifest / record / group / resource success
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

## 7. Subsystem Evidence

Exact M12 author surface只包含：

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

必须证明：

```text
business Definition depends only on @loomrealm/subsystem
installationId/URL/token/path/HTTP types hidden
no author contentVersion request selector
no author group/manifest/raw fetch surface
returned JSON/bytes detached from internal cache ownership
caller mutation cannot affect future reads
stable closed ContentReadError code mapping
ordinary read failure is caller-local
Frame/Activation/Data/Render lifecycle does not own ContentClient
Runtime terminal settles owned reads
```

Hostra Runner必须在 `definition.initialize` 前构造 required ContentClient；构造失败属于 Runtime bootstrap failure。Content grant不得进入 `SubsystemLaunchContext`、Frame params、Runtime bootstrapToken或 M9 Data provisioning IPC。

---

## 8. Renderer Evidence

必须证明：

```text
namespace + key + expectedContentVersion
→ production Renderer ResourceClient
→ Content API
→ bytes + MIME + actualContentVersion
```

并证明：

```text
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
A. prepare → Desktop Service → Hostra child → scope.content → business observable result
B. prepare → Desktop Service → production Renderer ResourceClient → resource bytes
```

Temporary installation/fixtures可以 test-owned；prepare/index、service、authorization、Hostra injection、clients必须走 production code。

禁止 test-only direct file reader、test-only ResourceClient、manual private-path injection或手工 authority mutation。

---

## 10. Abstraction Budget

允许：

```text
one prepared-installation Content view
one Desktop Content Service composition
minimal FSDB shared implementation seam with two consumers
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

跨角色 shared client helper只有两个 production consumers出现真实重复时才允许抽取。

---

## 11. Dependency Evidence

必须保持：

```text
business Definition → @loomrealm/subsystem
@loomrealm/map       → @loomrealm/subsystem   (M13)
Main                 ✗ Content implementation dependency without concrete use case
Subsystem author API ✗ platform / HTTP / credential / FSDB implementation types
Renderer business state ✗ filesystem / bearer / privileged URL
```

Physical Content Service、grant、installation view留在 Platform composition。

---

## 12. Root Gate

M12 实施后建立唯一 closure gate：

```text
npm run test:m12
    = npm run test:m11
    + fsdb-http regression
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
[ ] prepared installation Content view/index implemented
[ ] opaque installationId + normalized public GameEntry manifest proven
[ ] FSDB namespace mapping exact and collision-free
[ ] existing fsdb-http public contract/conformance preserved
[ ] no duplicate scanner/safe-read/HTTP stack
[ ] stable contentVersion/ETag semantics proven
[ ] bearer scope/expiry enforced
[ ] 409 vs 422 qualified

[ ] exact Subsystem ContentClient surface implemented
[ ] no author group/manifest/contentVersion-selector/raw fetch
[ ] returned JSON/bytes cannot poison cache/future reads
[ ] ContentReadError mapping proven
[ ] Hostra injection before business initialize proven
[ ] Content grant does not reuse Data provisioning IPC
[ ] ordinary read failure remains caller-local

[ ] Renderer ResourceClient implemented
[ ] response-version comparison proven
[ ] returned bytes cannot poison cache/future reads
[ ] no RenderNode schema/presentation work pulled into M12

[ ] Subsystem production vertical passes
[ ] Renderer ResourceClient production vertical passes
[ ] boundary/dependency tests pass
[ ] M1–M11 regression green
[ ] Node 20 / 24 root gate green
```

---

## 14. Closure Statement

M12 complete 后：

```text
current prepared installation
→ immutable logical Content view
→ Desktop readonly Content API
→ Subsystem business record/resource reads
→ Renderer version-safe resource bytes reads
```

并且没有新增 application authority、没有暴露 physical storage、没有把 FSDB HTTP surface变成 author contract，也没有提前实现 M13/M14/M15/M16。

实现完成后再同步 README、phase plan 与 qualification record。