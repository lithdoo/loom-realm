# LoomRealm 系统架构总览

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：M10–M13 **Implemented / Qualified / Closed**；M14 consumer taxonomy revised
> 主要定义：logical roles、authority、platform composition、framework/game-library/concrete-game placement  
> 依赖：[产品设计总览](../00-overview/product-vision.md)、[文档治理](../00-overview/document-governance.md)、[ADR 0032](../decisions/0032-game-library-example-boundary.md)  
> 最近复核：2026-09-09

本文描述 system-level responsibility / authority / topology。精确 browser/API semantics由 formal contracts拥有；具体 game-library business semantics不升级为 LoomRealm architecture。

---

## 1. Logical roles

```text
LoomRealm framework
    Game Package / Platform Launcher / Main / Subsystem Runtime / Renderer / Content

Reusable game libraries
    consume public author APIs
    own reusable business semantics + optional business Web presentation

Concrete games
    compose game libraries + game-specific business/config/content

Platform apps
    own physical hosting/composition

Tooling
    development/import/compatibility preparation only
```

一个 authority只有一个 owner；目录/package category不创建新 application authority。

---

## 2. Bootstrap boundaries

Runtime executable bootstrap：

```text
installation/source
→ matching Platform Launcher PREPARE
→ PlatformLaunchPlan + LogicalGameBootstrap
→ RuntimeHosting
```

Web presentation bootstrap独立：

```text
product/platform-private Config source
→ prepared Content
→ Renderer Window bootstrap
→ presentation start
```

Game-library/example placement不改变这两个 bootstrap contract。

---

## 3. Main / Renderer authority

Main唯一拥有 Session、Runtime/Frame/Stack/Activation、InputTarget、DataAuthority generation/profile 与 failure unwind。

Renderer只镜像 committed authority并维护 per-subsystem Render replica；Web presentation currentness从现有 Control/Data/Store facts推导。

---

## 4. Subsystem / game-library business boundary

Reusable game library运行时是普通 Subsystem author consumer：

```text
public @loomrealm/subsystem author API
→ game-library business behavior
```

Framework不知道 map/menu/dialogue/battle 等业务 vocabulary。

Concrete game可以组合多个 game libraries，也可以拥有 example/game-specific Subsystem；这些都不得反向要求 Main/Renderer成为业务 authority。

---

## 5. Renderer Data / Input / Render

Current Data identity仍为 Session + current Renderer + subsystemKey + generation。

Input受 current Data × Main InputTarget × Activation × Subsystem Interest × physical Producer gate约束。

Render：

```text
Subsystem/game-library authoritative Render Domains
→ Render Update v1
→ per-subsystem Renderer Store
```

---

## 6. M13 Web Presentation placement

```text
Window bootstrap
→ current Control + per-subsystem Store
→ package-private reevaluation
→ per-subsystem eligibility
→ thin Projector
→ business-owned WC
```

M14 map-owned WC只是这个 boundary的第一个真实 game-library consumer；M13不因此增加 map/component semantics。

---

## 7. Repository / package placement

ADR 0032冻结M14方向：

```text
packages/      LoomRealm framework/runtime
game-libs/     reusable game-domain libraries
examples/      concrete games
apps/          platform hosts
tools/         preparation/import tooling
```

依赖：

```text
examples → game-libs → public author APIs
```

不得出现 framework → game-library/example 反向依赖。

---

## 8. M14 Essentials development path

```text
external/local Essentials v21.1 source
→ tools/fixtures/essentials-v21.1 importer
→ local prepared canonical data
→ example-local compatibility preparation
→ map normalized Content
→ @loomrealm-game/map
→ M13 presentation
```

Tooling不进入 runtime graph，第三方 corpus不进入 repository distribution。

---

## 9. Non-goals

```text
framework-owned map/menu/dialogue vocabulary
GameLibrary registry/framework
runtime importer/tool dependency
universal asset/repository abstraction
Presentation DSL/component framework
examples embedded as platform app semantics
```

---

## 10. Phase route

```text
M10 User Input                                closed
M11 Render Replication                        closed
M12 Content                                   closed
M13 Web Presentation                          ✅ Closed 2026-09-09
M14 Map Game Library + First Real Game        pending
M15 Desktop full E2E                           pending
M16 PWA Runtime                                pending
M17 PWA full E2E/equivalence                   pending
```

当前 executable closure是 `npm run test:m13`。M14只在实现 `npm run test:m14` 并形成真实 game consumer evidence后关闭。
