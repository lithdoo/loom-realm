# Hostra Desktop Composition 设计

> 层级：模块设计  
> 状态：M6 Runtime / M9 Data **Implemented + Qualified**；M12 Content **Preimplementation Frozen**；M14 Full E2E Planned  
> 稳定程度：Closed lower slices / M12 implementation shape Frozen / M14 physical presentation Evolving  
> 主要定义：Hostra Launcher PREPARE、Node Runner、Runtime Control WS、Desktop Data Broker、M12 Content composition，以及 M14 BrowserWindow/Renderer full product target  
> 依赖：[平台组合系统](../../10-architecture/platform-composition-system.md)、[运行承载系统](../../10-architecture/runtime-hosting-system.md)、[Content API v1](../../15-contracts/content-api-v1.md)、[ADR 0030](../../decisions/0030-freeze-m12-content-preimplementation-closure.md)  
> 最近复核：2026-09-08

Hostra owns physical topology only；Main retains Session/Runtime/Frame/Activation/InputTarget/DataAuthority/Renderer-currentness authority。

---

## 1. Milestone Shape

```text
M6  Hostra PREPARE + Node Runner + Runtime Control        ✅
M9  Desktop paired Data Broker + child provisioning      ✅
M10 Input role behavior                                  ✅
M11 Render role behavior                                 ✅
M12 Desktop Content service + two Content consumers      frozen / pending implementation
M14 BrowserWindow + physical Renderer + presentation E2E pending
```

M14不会重新设计 M9–M12 logical semantics，只完成真实 Desktop physical composition。

---

## 2. Hostra PREPARE

```text
HostraPlatform.prepareGame(...)
→ @loomrealm/game-launcher-hostra
→ @loomrealm/game-package validation
→ launch.hostra.json validation
→ exact key-set join
→ safe executable resolution/preflight
→ immutable HostraLaunchPlan
→ LogicalGameBootstrap
```

Any PREPARE failure：

```text
Process create = 0
business module import = 0
Runtime Control establish = 0
Content service business exposure = 0
```

Main只接收 LogicalGameBootstrap + narrow Main-facing capabilities，不接收 Hostra plan/module/path/Content credential。

---

## 3. Runner / Runtime

```text
RuntimeHosting
→ Host-owned Node Runner
→ exact planned Definition Module
→ RuntimeControlBinding
→ optional/current SubsystemDataBinding
→ M12 bound ContentClient
→ @loomrealm/subsystem/host
```

Runner负责构造 physical role-local capabilities，不拥有 Frame/Data/Render authority。

M12 required ContentClient必须在 `runSubsystem()` / business `initialize` 前构造成功；构造失败属于 Runtime bootstrap failure。运行后的普通 Content read rejection只是 caller-local failure。

---

## 4. M9 Data Provisioning — Closed

```text
Main DataConnectionAuthoritySink
→ apps/desktop Broker
→ Renderer WS + Runner WS candidate
→ exact HostedRuntime-bound HostraRuntimeDataProvisioner
→ commit-time latest-view revalidation
→ paired sole-current install
```

Data ticket/provisioning IPC不产生 application authority。Post-install Runner delivery failure只 retire新 Data current，不 resurrect旧 current，也不自动 fail Runtime/Frame。

M12 Content credential/material **不得复用 M9 Data provisioning IPC/ticket**。

---

## 5. M12 Desktop Content — Frozen

Physical chain：

```text
successful Hostra PREPARE
→ current immutable prepared installation view
→ @loomrealm/fsdb snapshot
→ private immutable Content Index + normalized public manifest
→ localhost Content Service
```

Package placement：

```text
@loomrealm/fsdb
    readonly Node FSDB core

@loomrealm/fsdb-http
    standalone FSDB HTTP projection

apps/desktop
    LoomRealm Content route/auth/version composition
```

M12不建立 `@loomrealm/content-service` package、global InstallationRegistry、generic Repository/StorageProvider。

Desktop Content grant：

```text
Host-owned
opaque
installation scoped
permission scoped
expiring
separate from Runtime bootstrapToken / Renderer token / Data ticket
```

Hostra owner通过独立最小 child-private injection把 Runtime所需 access material交给 Runner；具体 env/IPC/context spelling是 private mechanics，但不得进入 Runtime Control/Data application/business payload。

---

## 6. M12 Content Consumers

Subsystem：

```text
Runner constructs bound ContentClient
→ runSubsystem({content,...})
→ scope.content.record/resource
```

Renderer：

```text
Desktop composition binds current installation/grant
→ trusted @loomrealm/renderer/resource-client integration subpath
→ logical resource + expected sha256 version
→ bytes + MIME
```

Renderer ResourceClient不是 public Platform port/AssetManager，也不解释 RenderNode presentation schema。

---

## 7. Content Failure / Lifetime

```text
Frame suspend/close != ContentClient close
Activation change   != ContentClient replacement
Data reconnect       != ContentClient/ResourceClient invalidation
RenderDomain close   != resource cache lifetime
```

普通 Content failure不得 mutate Main/Render authority或 terminalize Runtime/Frame。

Prepared installation在该 Content Service lifetime内是 Host-trusted readonly source；不为具有 physical write authority 的恶意并发 writer建立 transaction/copy-on-read storage system。

---

## 8. M14 Full Desktop Target

```text
M12-capable Hostra composition
+
BrowserWindow/Web Renderer
+
physical RendererControlBinding WS
+
M9 Data Broker
+
real DOM/Gamepad RendererInputSource
+
M11 internal current Render replica → presentation
+
M12 Renderer ResourceClient → resource bytes
+
M13 loom.map
→ full Desktop E2E
```

M14不得：

```text
DOM→Data shortcut绕过 M10 source
presentation自建 Render authority
Render State携 Content URL/token/path
Renderer直接读 fs/fsdb-http business path
```

---

## 9. Final Invariants

1. Launcher owns Game/executable PREPARE, not Renderer/Content application authority；
2. Main sees no Hostra plan/module/path/token；
3. M9 Data and M12 Content physical credentials/lifetimes remain separate；
4. apps/desktop owns Broker + Content composition policy；
5. `@loomrealm/fsdb` owns FSDB domain, not Content semantics；
6. Content version/auth/routes belong Desktop Content projection；
7. ordinary Data/Content failure does not directly equal Runtime/Frame failure；
8. M14 is first full BrowserWindow/presentation product closure。
