# LoomRealm 模块设计目录

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：M10–M13 **Implemented / Qualified / Closed**；M14 consumer ownership revised
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[Package Architecture](../30-implementation/package-architecture.md)、[ADR 0032](../decisions/0032-game-library-example-boundary.md)  
> 最近复核：2026-09-09

```text
module boundary != npm package boundary != protocol boundary != platform boundary
framework module != reusable game library != concrete game
```

---

## 1. Module / consumer map

| 类别 | 入口 | Current responsibility |
|---|---|---|
| Framework Main | [main-system](./main-system/README.md) | Session/Runtime/Frame/Activation/InputTarget/DataAuthority authority |
| Framework Web Renderer | [web-renderer](./web-renderer/README.md) | Main mirror、Data/Input、Render Store、Content resource client、M13 thin Projector |
| Framework Game Package | [game-package](./game-package/README.md) | logical Game topology/common validation |
| Game Library: Map | [map design](./loom-map/README.md) | M14 reusable map business + map-owned Web presentation；physical target `game-libs/map` |
| Platform: Hostra Desktop | [desktop-host](./desktop-host/README.md) | physical composition、M15 integration |
| Platform: PWA | [pwa-host](./pwa-host/README.md) | Worker Runtime、M17 full realization |

Concrete M14 game位于 planned `examples/essentials-v21.1`，不是 framework module。

---

## 2. Repository ownership

```text
packages/      framework/runtime
game-libs/     reusable business libraries
examples/      concrete games
apps/          platform hosts
tools/         dev/import/compatibility tooling
```

依赖主方向：

```text
examples → game-libs → public framework author APIs
```

Platform apps不拥有 reusable game business semantics；framework不反向依赖 game-lib/example。

---

## 3. Authority boundaries

```text
Main
    application authority

Subsystem/game library runtime
    business state / Input Interest / Render Domains / Content author usage

Renderer Store
    per-subsystem Render replica

Web Projector
    mechanical managed DOM projection

Game-library Web Component
    concrete presentation semantics/private UI state

Platform/App Composition
    physical Process/Worker/Window/Control/Data/Content binding
```

M13 precision继续由 frozen formal contracts拥有。

---

## 4. Closed slices

```text
M10 User Input         ✅ Closed
M11 Render Replication ✅ Closed
M12 Content            ✅ Closed
M13 Web Presentation   ✅ Closed 2026-09-09
```

---

## 5. M14 first real consumer

```text
game-libs/map (@loomrealm-game/map)
        ↓
examples/essentials-v21.1 (private)
        ↓
Frame + Input + Content + Render + M13
        ↓
playable map slice
```

Map library不解析 Essentials source；`tools/fixtures/essentials-v21.1` 只在 development/preparation阶段生成本地数据。Example-local compatibility preparation再投影为 map-owned normalized records/resources。

---

## 6. Physical placement after M14

```text
M15 Desktop
    BrowserWindow + Control/Data/Input/Render/Content
    M13 Presentation
    M14 concrete game + map library

M17 PWA
    Window/Worker + PWA physical realization
    same concrete logical game scenario
    same M13 observable semantics
```

---

## 7. Abstraction rule

禁止仅为未来可能用途建立：

```text
GameLibrary registry/base framework
runtime service locator
Repository / AssetManager
LoomRealm component library / Presentation DSL
generic layer/stacking manager
dynamic component loader
runtime importer dependency
framework-owned Essentials adapter
```

真实 game library可以自由拥有自己的 domain types、WC与私有 presentation实现。
