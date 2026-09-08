# M12 / 05 — Qualification and Closure

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M12 Content  
> 落地顺序：05  
> 最近复核：2026-09-08  
> 前置：[M12 / 01](M12_01_CONTENT_SERVICE.md) → [M12 / 02](M12_02_SUBSYSTEM_CONTENT_CLIENT.md) → [M12 / 03](M12_03_RENDERER_RESOURCE_CLIENT.md) → [M12 / 04](M12_04_VERTICAL_INTEGRATION.md)  
> 正式契约：[Content API v1](doc/15-contracts/content-api-v1.md)  
> 目标：定义唯一 M12 closure matrix；实施只补足 Content capability，不扩张为 storage、asset 或 deployment framework。

> **M12 closure = 现有只读 HTTP/filesystem mechanics 上形成一个 logical、authorized、version-safe Content capability，并被 Subsystem 与 Renderer 两个真实角色消费。**

---

## 1. Closure Scope

必须完成：

```text
Desktop Content API composition
trusted logical content lookup
Desktop bearer authorization
Content-specific cache/version/error semantics
Subsystem ContentClient
Renderer ResourceClient
real Hostra/Desktop Subsystem vertical
real Hostra/Desktop Renderer resource vertical
```

不属于 M12：

```text
loom.map implementation
DOM/Canvas/WebGL/Audio presentation
PWA Service Worker Content implementation
PWA equivalence
package install/update/delete
executable resolution changes
Save System
```

---

## 2. Existing Baseline Preservation

必须保持 `@loomrealm/fsdb-http` 既有行为与 qualification，并证明 M12 没有重新实现第二套等价 HTTP/filesystem machinery。

允许对现有包增加最小 production seam；若现有 surface 已足够则不增加。禁止为了代码复用预先拆分新的 generic package。

---

## 3. Content API Evidence

至少覆盖：

```text
manifest / record / group / resource success
GET / HEAD
ETag / If-None-Match / 304
MIME / Content-Length where determinable
X-Loom-Content-Version
unknown installation / namespace / key
malformed logical identity / traversal rejection
401 missing/invalid/expired bearer
403 insufficient scope
409 installation/version/index conflict
422 schema/integrity failure
413 / 429 bounded deployment behavior
405 for non-GET/HEAD
no token/path/internal-stack leak
```

`409` 与 `422` 必须作为不同 failure category qualification。

Range 只有实现选择支持时才按标准 HTTP semantics 测试；不是 M12 closure requirement。

---

## 4. Subsystem Evidence

必须证明：

```text
business Definition depends only on @loomrealm/subsystem
record/group/resource are readable
installationId/URL/token/path are hidden
contentVersion is observable where needed
ordinary Content failure is caller-local
AbortSignal cancels one request
Frame/Activation/Data/Render lifecycle does not own ContentClient
Runtime terminal settles owned work
```

不得发布 raw `fetch`、Response、Headers 或 filesystem handle 给 author。

---

## 5. Renderer Evidence

必须证明：

```text
logical resource reference → ResourceClient → Content API
resource bytes/MIME/contentVersion reach Renderer role
same key + different version never reuses stale bytes
Render replica contains no URL/path/token
Data reconnect does not invent Content cache lifecycle
Content failure does not mutate Main/Subsystem Render authority
```

M12 不新增 public Renderer asset/store subscription API。

---

## 6. Vertical Evidence

必须有两个 production-path vertical：

```text
A. Hostra/Desktop → SubsystemScope.content → business observable result
B. RenderDomain → Renderer replica → ResourceClient → resource bytes
```

Temporary installation/fixtures 可以是 test-owned；Content Service、authorization、clients 与 role integration 必须是生产代码。

---

## 7. Abstraction Budget

允许：

```text
one Desktop Content API composition
minimal trusted content lookup
minimal authorization/error/version helpers
one bound Subsystem ContentClient responsibility
one Renderer-private ResourceClient responsibility
small immutable cache/dedupe where directly useful
```

禁止：

```text
@loomrealm/content-core created only for symmetry
generic Repository hierarchy
AssetManager framework
loader/plugin registry
service locator
Content RPC / credential protocol
second HTTP implementation
Content/Main authority coupling
executable/content capability merge
```

任何新增 abstraction 必须在 M12 中至少有一个明确 production consumer；跨角色共享 abstraction 必须有两个真实 production consumers 才成立。

---

## 8. Dependency Evidence

必须保持核心边界：

```text
business Definition → @loomrealm/subsystem
@loomrealm/map       → @loomrealm/subsystem   (M13)
Main                 ✗ Content implementation dependency unless a concrete Main use case is proven
Renderer             ✗ filesystem / fsdb-http direct business-facing dependency
Subsystem author API ✗ platform / HTTP / credential types
```

Physical Content Service 与 credential ownership 留在 Platform composition。

---

## 9. Root Gate

M12 实施后建立唯一 root closure gate：

```text
npm run test:m12
    = npm run test:m11
    + existing fsdb-http regression
    + Content API qualification
    + Subsystem ContentClient tests
    + Renderer ResourceClient tests
    + dependency/boundary tests
    + M12 real verticals
```

CI 在当前支持的 Node 20 / 24 上执行同一 M12 closure gate。

---

## 10. Implementation Checklist

```text
[ ] Desktop logical Content API implemented
[ ] existing fsdb-http mechanics reused; no duplicate HTTP stack
[ ] trusted logical lookup does not expose physical path
[ ] bearer scope/expiry enforced
[ ] Content version/cache/error semantics conform
[ ] 409 vs 422 qualified

[ ] Subsystem ContentClient implemented
[ ] business sees no installation/HTTP/token/path
[ ] ordinary failure remains caller-local
[ ] lifecycle independence proven

[ ] Renderer ResourceClient implemented
[ ] version-safe resource cache/read path proven
[ ] no presentation framework pulled into M12

[ ] Subsystem production vertical passes
[ ] Renderer production vertical passes
[ ] boundary/dependency tests pass
[ ] M1–M11 regression green
[ ] Node 20 / 24 root gate green
```

---

## 11. Closure Statement

M12 complete 后，LoomRealm 应具备：

```text
current installation logical content
→ Desktop readonly Content API
→ Subsystem business reads
→ Renderer resource reads
```

而不引入新的 application authority、不暴露 physical storage、不把 FSDB 变成 author contract，也不提前实现 M13/M14/M15/M16 的职责。

实现完成后再同步 README、phase plan 与 qualification record；本文件在实施期间作为 frozen required matrix。