# 平台组合系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：M9/M12/M13 **Implemented / Qualified / Closed**
> 主要定义：跨平台 physical composition、Launcher PREPARE、Runtime/Renderer/Data/Content/Web presentation placement  
> 依赖：[系统架构总览](./system-overview.md)、[渲染系统](./rendering-system.md)  
> 最近复核：2026-09-09

Platform 是 physical composition boundary，不是 game-library 或 application authority owner。

---

## 1. Core boundary

```text
Framework logical roles
Main / Renderer / Subsystem / Content
             ▲
      narrow capabilities
             │
      Hostra / PWA apps
```

Reusable game libraries和concrete games位于 Platform 之上：

```text
concrete game
→ game libraries
→ public LoomRealm author contracts
```

Platform不拥有 map/menu/dialogue等业务语义。

---

## 2. Runtime PREPARE vs presentation startup

Runtime executable PREPARE继续由 matching Launcher拥有；Web presentation startup继续独立消费 prepared Content + Window-level Config。M14 game-library/example taxonomy不改变这两个 boundary。

---

## 3. Physical ownership

Platform/app composition拥有 Process/Worker/Window、Control/Data provisioning、Content physical binding、presentation bootstrap environment与 lifecycle。

Main/Subsystem/Renderer authority边界保持不变。Concrete game/game library只通过 public capabilities进入 runtime，不获得 physical path/token/carrier。

---

## 4. M13 runtime presentation integration

Renderer继续使用 committed Control topology + successful per-subsystem Store commits驱动 package-private reevaluation与 thin Projector。Platform不建立 PresentationState、topology registry或 component loader。

---

## 5. M14 placement

M14不把 concrete game塞进 `apps/desktop`：

```text
game-libs/map
    reusable map business

examples/essentials-v21.1
    concrete game

apps/desktop / apps/pwa
    platform hosts only
```

M15/M17分别让 platform host加载同一 concrete logical game scenario，验证不同 physical realization下的等价结果。

---

## 6. Essentials preparation

Essentials importer属于 `tools/*` development boundary：

```text
external source
→ tool/importer
→ .local prepared game material
→ concrete example
```

Platform runtime不 import tooling，也不把 importer filesystem路径暴露给 business。

---

## 7. Cross-platform equivalence

Hostra/PWA共享 Game topology、Runtime/Frame/Data/Input/Render/Content/Web Presentation semantics及同一 concrete game business outcome；Process/Worker、WebSocket/MessagePort、FSDB/Fetch等physical mechanics可不同。

---

## 8. No mega-abstraction

不建立 UniversalPlatform、GameLibraryHost、UniversalPresentationRegistry、AssetManager、StorageProvider SPI 或 platform-owned game registry。

---

## 9. Milestone placement

```text
M12 Content                                  closed
M13 Web Presentation                        ✅ Closed 2026-09-09
M14 Map Game Library + First Real Game      pending
M15 Desktop full E2E                         pending
M16 PWA Runtime                              pending
M17 PWA full E2E/equivalence                 pending
```

M14关闭 reusable/concrete business consumer；M15/M17只完成各平台 physical composition/equivalence。
