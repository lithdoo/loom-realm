# M12 / 04 — Content Vertical Integration

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M12 Content  
> 落地顺序：04  
> 最近复核：2026-09-08  
> 前置：[M12 / 01](M12_01_CONTENT_SERVICE.md) → [M12 / 02](M12_02_SUBSYSTEM_CONTENT_CLIENT.md) → [M12 / 03](M12_03_RENDERER_RESOURCE_CLIENT.md)  
> 正式契约：[Content API v1](doc/15-contracts/content-api-v1.md)  
> 目标：用真实 Hostra/Desktop production path 证明 Content Service、Subsystem author capability 与 Renderer resource capability 已连成闭环；不使用 test-only direct reader 绕过 Content API。

> **M12 closure 必须证明两类真实 consumer：Subsystem 读取业务内容，Renderer 读取 Render 引用的资源。**

---

## 1. Vertical A — Subsystem Content

```text
temporary validated game installation
→ Hostra prepare / launch plan
→ Desktop Content Service
→ Host-private Content grant
→ real Node Runner
→ SubsystemScope.content
→ business Definition
→ record/group/resource read
→ business-observable result
```

必须走真实 Content request/response path；test fixture 不得直接把文件内容注入 `ContentClient`。

至少证明：

```text
record success
group success
resource success
contentVersion preserved
not-found/version/invalid-content failures mapped
AbortSignal cancels one request only
Frame/Runtime remain healthy after ordinary handled Content failure
```

---

## 2. Vertical B — Renderer Resource

```text
real RenderDomain state
→ Render publication
→ Renderer internal replica
→ logical resource reference
→ Renderer ResourceClient
→ Desktop Content Service
→ bytes + MIME + contentVersion
```

必须证明：

```text
Render State carries no URL/path/token
correct resource bytes reach Renderer role
different contentVersion cannot reuse stale bytes
Content failure does not mutate Render/Main authority
```

M12 不要求把 bytes decode/render 到 DOM/Canvas/WebGL。

---

## 3. Authorization Evidence

Desktop vertical至少覆盖：

```text
missing bearer          → 401
invalid/expired bearer  → 401
valid wrong scope       → 403
valid current grant     → success
```

并证明 error/log/business/Render observable data不泄露：

```text
token
filesystem path
installation root
internal stack
unauthorized index data
```

Grant delivery 属于 Host-private composition；不得新增 credential protocol。

---

## 4. Cache / Version Evidence

至少覆盖：

```text
ETag / If-None-Match → 304
HEAD metadata matches GET where determinable
contentVersion returned consistently
same logical key + new version → fresh bytes
old cached bytes never satisfy new version
```

M12 不 qualification optional Range。

---

## 5. Lifecycle Evidence

显式证明：

```text
Frame suspend/return does not destroy Content capability
Data carrier reconnect does not destroy Content capability
RenderDomain close does not own resource cache lifetime
ordinary Content request failure does not terminalize Runtime
Session/Renderer terminal settles owned outstanding requests
```

不得为这些关系增加 cross-system lifecycle coordinator。

---

## 6. Production Path Rule

Vertical 可以使用 temporary installation 和 deterministic fixtures，但以下必须是生产实现：

```text
installation/content lookup
Desktop Content Service
HTTP request path
bearer authorization
Subsystem ContentClient
Renderer ResourceClient
Render publication/replica path used by Renderer vertical
```

禁止：

```text
test-only file reader as ContentClient
test-only ResourceClient returning fixture bytes
private filesystem path passed through business/Render payload
manual authority mutation
```

---

## 7. Done

M12/04 complete when：

```text
Subsystem real consumer vertical passes
Renderer real resource vertical passes
Content API authorization/cache/version/error semantics are observable end to end
ordinary Content failure remains isolated from Runtime/Frame/Data/Render authority
physical path/token never crosses application boundary
no presentation work is pulled forward from M14
```

M13 can then consume the frozen Subsystem Content surface without adding a second content path。