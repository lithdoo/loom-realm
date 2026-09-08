# M12 / 01 — Desktop Content Service

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M12 Content  
> 落地顺序：01  
> 最近复核：2026-09-08  
> 正式契约：[Content API v1](doc/15-contracts/content-api-v1.md)  
> 架构：[存储与内容系统](doc/10-architecture/storage-system.md)  
> 现有底座：[`@loomrealm/fsdb-http`](packages/fsdb-http/README.md)  
> 目标：在既有 FSDB validation/read 与 Node HTTP mechanics 上落地 Desktop Content API；不复制 storage/HTTP mechanics，不建立 generic Content framework。

> **M12/01 增加的是 current prepared installation 的 logical Content projection 与 Desktop authorization/composition，不是第二套 FSDB 或 HTTP 系统。**

---

## 1. Frozen Position

```text
Hostra prepare succeeds
→ one immutable prepared installation view
→ trusted Content Index + normalized public manifest
→ Desktop Content Service
→ logical readonly Content API
```

Content API 只提供：

```text
manifest
record
group
resource
```

它不拥有 Runtime、Frame、Render、Input 或 executable authority。

---

## 2. FSDB / HTTP Reuse Boundary

`@loomrealm/fsdb-http` 的 frozen public contract仍是 FSDB HTTP adapter；M12 不把 `/fsdb/v1/...` 暴露成 Content contract，也不得导入其 private `DatabaseImpl`/scanner internals。

M12 同时成为既有 FSDB snapshot/read mechanics 的第二个真实 production consumer，因此允许把**已经存在的 FSDB-specific scan/index/safe-open/read mechanics**机械提取为一个 workspace-internal shared implementation seam，供：

```text
@loomrealm/fsdb-http
Desktop Content Service
```

共同使用。

该提取必须保持 `@loomrealm/fsdb-http` public API、HTTP observable behavior 与 conformance不变，并且不得扩张成：

```text
generic Repository
storage provider framework
universal filesystem abstraction
Content authority package
HTTP-over-HTTP proxy
second scanner / second safe-open implementation
```

shared seam 的内部文件/函数划分属于实现细节；M12 不新增独立 product-level storage abstraction。

---

## 3. Prepared Installation View

M12 Desktop 只服务**当前 concrete Platform 已成功 prepare 的 installation**；不建立全局 mutable InstallationRegistry。

Prepare 在 first business Runtime side effect 前形成并私有持有：

```text
installationId
normalized public manifest
immutable Content Index
validated internal source identities
contentVersion metadata
```

冻结规则：

```text
installationId = Host-owned opaque identity for this prepared installation view
installationId != filesystem path
manifest = normalized public GameEntryV1 projection
manifest ✗ launch.hostra.json / module path / installation root
```

Content Index 是请求 lookup authority；URL segment永远不能直接解释成 filesystem path。

---

## 4. Phase-1 FSDB Logical Projection

FSDB-backed Content Index 使用确定的、可逆的 logical namespace projection：

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

`key` 继续使用对应 FSDB logical `Key` / `ResourceKey`。这保留 `struct` 与 `extend` 同名表的可区分性，同时不泄露 physical directory/path。

不得通过“先找 struct，找不到再找 extend”等隐式优先级消解 identity。

---

## 5. Version / Cache Identity

M12 Content `contentVersion` 是 content identity，不复用 `fsdb-http` 的 process-local `snapshotId` 或 filesystem metadata fingerprint 作为跨读取版本事实。

当前 Desktop implementation使用 deterministic content hash形成 Content Index version；同一 indexed bytes 必须得到稳定版本，不同 bytes 不得错误共享版本。

成功响应固定保持：

```text
X-Loom-Content-Version = contentVersion
ETag                    = quoted contentVersion
```

`If-None-Match` 匹配返回 `304`。`HEAD` 执行与 GET 相同的 auth/identity/version检查但无 body。

---

## 6. Desktop Authorization

Desktop 只监听 Host 认可的 loopback endpoint。受保护请求使用：

```text
Authorization: Bearer <opaque token>
```

grant 只表达：

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

尤其不得复用 M9 Data provisioning protocol 分发 Content credential，也不新增 Content credential wire/profile。

---

## 7. Response / Failure Semantics

Content API 特有语义必须完整实现：

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

错误不得泄露 token、filesystem path、installation root、internal stack 或 unauthorized index data。

Range 不是 M12 mandatory capability。

---

## 8. Lifetime / Failure Domain

```text
Content Service lifetime = prepared Desktop Platform composition lifetime
Content resource lifetime != Frame / Activation / RenderDomain / Data carrier lifetime
Data reconnect != Content Service restart
```

Content capability在 Runtime business initialization 前无法正确构造时，属于该 Runtime bootstrap failure。

Runtime 已建立后的 ordinary Content read failure只返回给调用方：

```text
ordinary read failure
!= Runtime failure
!= Frame unwind
```

---

## 9. Abstraction Budget

允许：

```text
one prepared-installation Content view
one Desktop Content Service composition
minimal shared FSDB implementation seam with two real consumers
small authorization / version / problem mapping helpers
```

禁止：

```text
global mutable InstallationRegistry
generic Repository/cache hierarchy
service locator / plugin registry
second HTTP stack
Content RPC / credential protocol
executable resolver merged into Content resolver
```

---

## 10. Done

M12/01 complete when：

```text
prepared installation → immutable Content view is deterministic
manifest source is unambiguous
FSDB TableIdentity → Content namespace mapping is unambiguous
no URL→filesystem direct mapping exists
fsdb-http public contract/conformance remains unchanged
no duplicate scanner/safe-read/HTTP stack exists
contentVersion is stable content identity, not process-local fingerprint
bearer scope/expiry and failure mapping conform
Content/Data/Runtime credential boundaries remain separate
```

编码阶段只允许改变 private layout/performance strategy；上述 identity、ownership、failure 与 reuse boundary不得重新选择。