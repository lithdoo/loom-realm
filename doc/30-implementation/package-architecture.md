# 独立分包与发布架构

> 层级：实施计划 / Package Boundary  
> 状态：Active Design / Tracking  
> 稳定程度：M12/M13 **Implemented / Qualified / Closed**；M14 workspace taxonomy revised  
> 主要定义：framework、game library、concrete game、platform app、tooling 的 ownership/dependency boundary  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[ADR 0032](../decisions/0032-game-library-example-boundary.md)  
> 最近复核：2026-09-09

```text
Protocol boundary
!= npm package boundary
!= process boundary
!= Platform boundary
!= game-library boundary
!= milestone boundary
```

只有真实 ownership/consumer需要时才 materialize package；不为了 symmetry 预建 framework。

---

## 1. Repository taxonomy

Phase 1 顶层职责：

```text
packages/
    LoomRealm framework/runtime packages

game-libs/
    reusable game-domain libraries

examples/
    concrete games / integration examples

apps/
    platform host applications

tools/
    development/import/compatibility tooling
```

这些目录表达 ownership，不等于 process boundary。

---

## 2. Namespace / publication rule

```text
packages/*
→ framework namespace @loomrealm/*

game-libs/*
→ separate game-library namespace @loomrealm-game/*

examples/*
→ private; never framework/public package by default

apps/*
→ private platform products/hosts

tools/*
→ repository development tooling
```

因此 M14 map：

```text
game-libs/map
@loomrealm-game/map
```

而不是 `packages/map` / `@loomrealm/map`。

---

## 3. Dependency DAG

```text
examples/* ───────→ game-libs/* ───────→ public @loomrealm author APIs
     └──────────────────────────────────→ public @loomrealm author APIs

apps/* ───────────→ framework/platform composition packages

tools/* ──────────→ local prepared artifacts / qualification only
```

禁止：

```text
packages/* → game-libs/* / examples/*
game-libs/* → renderer/main/platform/protocol internals
runtime game code → tools/*
apps/* owning reusable business semantics
```

Business Definition继续只依赖 `@loomrealm/subsystem` author surface。Business Web presentation是独立 browser execution side，不获得 Render/Main authority。

---

## 4. M13 placement remains unchanged

Concrete app/Renderer Window composition拥有 Config source、prepared Content selection、private browser binding、Window lifecycle。

`@loomrealm/renderer` 保持 package-private/trusted：

```text
Control/Data/Store facts
→ presentation reevaluation
→ per-subsystem eligibility
→ thin Web Projector
→ context/data/resource façade
```

M14 repository taxonomy 不 reopen M13 contract/package surface。

---

## 5. M14 map game library

`game-libs/map` 可以在同一 workspace拥有隔离的 runtime/browser outputs：

```text
runtime Definition
→ only @loomrealm/subsystem

browser presentation
→ map-owned Custom Elements/CSS/Canvas/WebGL
→ structural M13 ABI consumer
```

Map library owns normalized map business/content schema；不得理解 Essentials/RMXP/PBS/Marshal source format。

不因为 game library category出现就增加：

```text
GameLibrary base package
GameLibraryRegistry
component SDK
AssetManager
Repository hierarchy
```

---

## 6. M14 concrete example / tooling

Concrete game：

```text
examples/essentials-v21.1
```

它是 private workspace，负责 concrete Game Entry、game-specific keys、compatibility preparation和 `@loomrealm-game/map` composition。

Tool chain：

```text
external/local Essentials source
→ tools/fixtures/essentials-v21.1 importer
→ ignored .local prepared data
→ example-local compatibility preparation
→ map normalized Content
```

Tool不是 runtime dependency；第三方 corpus不提交仓库。

---

## 7. Workspace implementation rule

当前 root `package.json` 尚只有：

```text
packages/*
apps/*
```

M14/01 实施时增加：

```text
game-libs/*
examples/*
```

并复核所有 `--workspaces` scripts，避免 framework build/test 隐式扩张为 example qualification。只做需要的命令分层，不引入 workspace orchestration framework。

---

## 8. Qualification ownership

```text
M13
    Web presentation generic contract/browser closure

M14 game-lib
    reusable map business + browser consumer

M14 example
    concrete game composition + compatibility preparation

M14 CI
    distributable synthetic/author-owned fixture vertical

M14 local evidence
    exact Essentials v21.1 corpus compatibility

M15/M17
    complete physical Desktop/PWA E2E/equivalence
```

No giant E2E replaces role/contract evidence。

---

## 9. Explicitly rejected abstractions

```text
@loomrealm/map
packages/map
Generic GameLibrary framework
Generic Repository / StorageProvider
AssetManager / decoder/plugin registry
UniversalRendererServices
Presentation DSL / graphics scene graph
LoomRealm component library
Dynamic Component / ESM loader
second projection tree/topology authority
runtime dependency on importer/tooling
framework-owned Essentials compatibility layer
```

---

## 10. Milestone placement

```text
M12 Content                                  closed
M13 Web Presentation                        ✅ Closed 2026-09-09
M14 Map Game Library + First Real Game      pending
M15 Desktop full E2E                         pending
M16 PWA Runtime                              pending
M17 PWA full E2E/equivalence                 pending
```

M14 按根目录 M14/01–05 实施。M10–M13 frozen boundaries 不因 repository taxonomy 调整而重开。
