# M12 / 01 — Desktop Content Service

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M12 Content  
> 落地顺序：01  
> 最近复核：2026-09-08  
> 正式契约：[Content API v1](doc/15-contracts/content-api-v1.md)  
> 架构：[存储与内容系统](doc/10-architecture/storage-system.md)  
> 现有底座：[`@loomrealm/fsdb-http`](packages/fsdb-http/README.md)  
> 目标：在既有只读 FSDB/HTTP mechanics 上落地 Desktop Content API；不重写 HTTP 基础设施，不引入新的 generic storage/content framework。

> **M12/01 增加的是 LoomRealm Content 语义与 Desktop composition，不是第二套 HTTP server。**

---

## 1. Position

```text
validated installation
→ trusted content mapping
→ Desktop Content API
→ logical readonly content
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

## 2. Existing HTTP Baseline

`@loomrealm/fsdb-http` 已经实现并 qualification 的能力继续作为 M12 底座：

```text
Node HTTP lifecycle
GET / HEAD
ETag / conditional read
MIME / Content-Length
safe target decoding
validated filesystem access
stream lifecycle / cancellation
bounded readonly snapshot
```

M12 不复制这些 mechanics。

当前 `/fsdb/v1/...` 是 FSDB storage-facing API；M12 的 `/_lr/v1/games/...` 是 LoomRealm Content-facing API。二者语义不同，M12 不把 FSDB 路由直接暴露为 business/Renderer Content contract。

实现时优先在现有 `fsdb-http` 能力上增加最窄的 production seam 或 composition；只有出现第二个真实 production consumer 时才抽取共享层。不得预先建立 `@loomrealm/content-core`、generic Repository、universal HTTP adapter 等框架。

---

## 3. Content Identity

外部 Content API 使用正式契约：

```text
installationId
kind
namespace
key
contentVersion
```

请求必须：

```text
validate logical identity
→ trusted mapping lookup
→ validated source
→ response
```

禁止：

```text
URL → filesystem path direct mapping
arbitrary local path
absolute resource URL in business state
executable module through Content API
```

---

## 4. Desktop Authorization

Desktop 只监听 Host 认可的 loopback endpoint。

受保护请求使用正式 Content API bearer semantics：

```text
Authorization: Bearer <opaque token>
```

grant 只表达：

```text
installation
permission scope
expiry
```

Host 负责生成、注入、轮换；不新增 Content credential wire/profile。Token 不进入 URL、Frame params、Render State 或普通 business payload。

---

## 5. Response Semantics

M12/01 必须补齐 Content API 特有语义：

```text
X-Loom-Content-Version
Content-Version / ETag consistency
application/problem+json errors
401 / 403 authorization
409 state/version conflict
422 schema/integrity failure
413 / 429 bounded deployment failure
```

已有 HTTP 行为若与 Content API v1 一致则直接复用；不为表面统一重写。

Range 不是 M12 mandatory capability。

---

## 6. Ownership and Lifetime

Content Service lifetime 属于 Desktop Platform Composition。

```text
Content Service lifetime != Frame lifetime
Content resource lifetime != RenderDomain lifetime
Content request failure != Runtime failure
Data reconnect != Content Service restart
```

普通 Content read failure只返回给调用方；不得自动触发 Main Runtime/Frame failure。

---

## 7. Abstraction Budget

允许：

```text
one Desktop Content API composition
trusted installation/content lookup
small authorization helper
small Content-specific response/error mapping
minimal reuse seam into existing fsdb-http mechanics when needed
```

禁止：

```text
new generic content framework
second HTTP stack
service locator
plugin registry
generic repository/cache framework
Content RPC protocol
credential bootstrap protocol
filesystem path capability exposed to clients
executable resolver merged into Content resolver
```

---

## 8. Done

M12/01 complete when：

```text
Content API routes are logical, not filesystem-derived
existing fsdb-http HTTP/filesystem mechanics are reused rather than duplicated
Desktop bearer scope/expiry is enforced
GET/HEAD + cache/version semantics match Content API v1
409 and 422 remain distinct
errors leak no token/path/internal stack
Content Service has one clear Platform owner
no new abstraction exists without a current production consumer
```

编码阶段不得重新设计 Content API v1；若现有 `fsdb-http` 与 Content contract 存在真实 contradiction，只做满足 M12 所需的最小修正。