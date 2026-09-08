# M12 / 04 — Content Vertical Integration

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M12 Content  
> 落地顺序：04  
> 最近复核：2026-09-08  
> 前置：[M12 / 01](M12_01_CONTENT_SERVICE.md) → [M12 / 02](M12_02_SUBSYSTEM_CONTENT_CLIENT.md) → [M12 / 03](M12_03_RENDERER_RESOURCE_CLIENT.md)  
> 正式契约：[Content API v1](doc/15-contracts/content-api-v1.md)  
> 目标：用真实 Hostra/Desktop production path证明 Content core、Desktop Service、Subsystem author capability 与 Renderer resource capability闭环；不把 M14 presentation拉入 M12。

> **M12 closure证明两个真实 consumer；Renderer vertical只证明 Content resource bytes capability，RenderNode→resource mapping留给 M14。**

---

## 1. Vertical A — Subsystem Content

```text
temporary game installation
→ real Hostra prepare
→ @loomrealm/fsdb readonly snapshot
→ prepare-time immutable Content Index/version hashing
→ Desktop Content Service
→ Host-private scoped grant
→ real Node Runner
→ construct bound ContentClient
→ runSubsystem({content,...})
→ SubsystemScope.content
→ business Definition
→ record/resource read
→ business-observable result
```

必须走真实 HTTP request/response path；fixture不得直接注入文件 bytes/value到 ContentClient。

至少证明：

```text
record success
resource single-segment success
resource hierarchical key success
contentVersion exact sha256:<64 lowercase hex>
returned value/bytes detached from cache ownership
CONTENT_NOT_FOUND / CONFLICT / INVALID / UNAVAILABLE / CANCELLED mapping
AbortSignal only cancels one read
ordinary handled Content failure leaves Runtime/Frame healthy
```

Formal Content API 的 manifest/group success在 service qualification覆盖；M12 author surface不为对称性暴露它们。

---

## 2. Vertical B — Renderer Resource

```text
temporary prepared installation
→ Desktop Content Service
→ Renderer-scoped grant
→ production Renderer ResourceClient
→ resource(namespace,key,expectedVersion)
→ real HTTP request
→ bytes + MIME + actual contentVersion
```

必须证明：

```text
matching version → correct bytes
mismatched expected version → no success bytes
hierarchical ResourceKey round-trips
same key + new version → old cache cannot satisfy
returned bytes cannot mutate cache/future reads
Content failure does not mutate Renderer Render Store/Main/Subsystem authority
```

M12 vertical **不要求**：

```text
RenderDomain
Render publication
Render replica interpretation
DOM/Canvas/WebGL
```

这些由 M14 把真实 presentation reference接到已 qualification 的 ResourceClient。

---

## 3. FSDB Core Extraction Evidence

必须证明：

```text
@loomrealm/fsdb owns complete readonly FSDB domain core
@loomrealm/fsdb-http depends on @loomrealm/fsdb
Desktop Content Service depends on @loomrealm/fsdb
```

Core extraction至少直接 qualification：

```text
describeFsdb() returns existing deterministic descriptor bytes
listFsdbEntries() covers ordinary entries only; order is non-semantic
openFsdbObject() covers ordinary entries + $info/$extend/$desc metadata
getFsdbSnapshotId() is fresh/process-local and not Content version
sourceTag is opaque and not Content hash
invalid/forged identity fails closed
absent object returns null
abort before resolve leaves no live lease
resolved lease is caller-owned; original signal no longer owns it
lease.close() idempotent
FsdbDatabase.close() drains admitted leases
```

并证明：

```text
fsdb-http existing root public API unchanged
fsdb-http existing descriptor/metadata/ordinary routes and conformance green
M12_CORE_EXTRACTION amendment is the only dependency-contract revision
no HTTP-over-HTTP proxy
no duplicate scanner/metadata-index/safe-open implementation
no cross-workspace relative import
no import of fsdb-http private internals
```

---

## 4. Prepare / Installation Evidence

必须通过真实 prepare证明：

```text
one prepare success
→ one opaque installationId
→ normalized public GameEntry manifest bytes
→ one @loomrealm/fsdb database
→ immutable Content Index
```

FSDB projection至少覆盖：

```text
struct.<TableName> / record
extend.<TableName> / record
group.<TableName> / group
resource.<TableName> / resource
```

并证明：

```text
same-name struct/extend do not collide
record/group key stay single segment
resource key may contain multiple logical segments
resource route segment decoding never becomes direct filesystem resolution
FSDB metadata stays outside ordinary Content projection
```

Prepare/content index failure发生在 first business Runtime side effect前。

---

## 5. Authorization / Injection Evidence

Desktop至少覆盖：

```text
missing bearer          → 401
invalid/expired bearer  → 401
valid wrong scope       → 403
valid current grant     → success
```

Hostra injection必须证明：

```text
Desktop owns service/grant policy
Hostra owner injects exact child-private access material
Runner constructs ContentClient before runSubsystem
Content material absent from SubsystemLaunchContext / Frame params
Content grant != Runtime bootstrapToken
Content grant != Data ticket
Content grant is not sent through M9 Data provisioning IPC
```

如果 required Content capability在 `definition.initialize` 前无法构造，Runtime bootstrap失败；之后 ordinary read failure不 terminalize Runtime。

---

## 6. HTTP / Version Evidence

至少覆盖：

```text
manifest / record / group / resource service success
GET / HEAD
ETag / If-None-Match → 304
X-Loom-Content-Version = sha256:<64 lowercase hex>
ETag = quoted exact same contentVersion
HEAD metadata matches corresponding full-body GET
same full-body bytes → same contentVersion
changed full-body bytes → different contentVersion
```

Manifest额外证明：

```text
public GameEntryV1-only projection
recursive sorted-key deterministic JSON serialization
UTF-8 without BOM / no insignificant whitespace
same normalized manifest → stable bytes/version
```

FSDB-backed record/group/resource的 Content version必须由 prepare-time code通过 `openFsdbObject()` 读取 exact ordinary bytes并计算 SHA-256；`snapshotId`/`sourceTag`/filesystem fingerprint不进入 Content version authority。

M12 不 qualification optional Range，除非实现选择支持。

---

## 7. Static Source / Drift Evidence

必须证明 M12 依赖现有 static-source边界，而不是发明 filesystem transaction：

```text
prepared installation is Host-trusted readonly for Content Service lifetime
ordinary Runtime/Renderer capabilities receive no physical write authority
known replacement/drift detected by FSDB safe-open → fail closed
```

不要求模拟或抵抗拥有 installation physical write authority 的恶意 concurrent writer 在 validated same-handle stream期间直接篡改 backing storage。

不得为该非目标新增 copy-on-read store、transactional filesystem abstraction 或 writer coordination protocol。

---

## 8. Author API Observable Evidence

必须证明 exact M12 author behavior：

```text
ContentReadError(code) sets name/code exactly
caller must not depend on message
invalid namespace/record-key/options → synchronous TypeError
invalid hierarchical resource key → synchronous TypeError
unknown own enumerable option property → synchronous TypeError
invalid local argument → zero HTTP request
already-aborted valid signal → CONTENT_CANCELLED + zero HTTP request
legal remote 400 → CONTENT_UNAVAILABLE
```

并证明 returned JSON/Uint8Array mutation不能改变 cache或 future reads。

---

## 9. Failure / Confidentiality Evidence

至少覆盖：

```text
404 not found
409 installation/version/index conflict
422 schema/integrity failure
413 / 429 bounded deployment failure
405 non-GET/HEAD
```

error/log/business/Renderer observable data不得泄露：

```text
token
filesystem path
installation root
internal stack
unauthorized index data
```

---

## 10. Lifecycle Evidence

显式证明：

```text
Frame suspend/return != ContentClient lifetime
Activation change     != ContentClient replacement
Data reconnect         != ContentClient/ResourceClient invalidation
RenderDomain close     != resource cache lifetime
ordinary read failure != Runtime/Frame/Data/Render authority failure
Runtime/Renderer terminal settles owned outstanding reads
```

不得为这些关系增加 cross-system lifecycle coordinator。

---

## 11. Production Path Rule

Temporary installation和deterministic fixture可以由 tests拥有，但以下必须是 production implementation：

```text
@loomrealm/fsdb core
prepare → Content view/index/version hashing
FSDB logical projection
Desktop Content Service
HTTP path
bearer authorization
Hostra Content injection
Subsystem ContentClient
Renderer ResourceClient
```

禁止：

```text
test-only file reader
HTTP-over-HTTP fsdb proxy
manual private-path injection
test-only ResourceClient returning fixture bytes
manual Main/Render authority mutation
```

---

## 12. Done

M12/04 complete when：

```text
FSDB core extraction preserves fsdb-http descriptor/metadata/ordinary regression
Subsystem real Hostra consumer vertical passes
Renderer production ResourceClient vertical passes
prepare/index/namespace/resource identity is unambiguous
exact contentVersion representation is proven end-to-end
static trusted-readonly source boundary is explicit
local author misuse behavior is proven
Hostra credential injection boundary is proven
Content API auth/cache/version/error semantics pass end-to-end
caller mutation cannot poison Content caches
ordinary Content failure remains isolated
M14 presentation work remains deferred
```

M13 可以直接消费 frozen `scope.content`；M14 可以直接消费已 qualification 的 Renderer bytes capability。