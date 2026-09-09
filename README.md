# LoomRealm

LoomRealm 是一个以 **platform-neutral logical Subsystem topology**、Main authority、capability-oriented role boundaries 与 cross-platform composition 为核心的模块化游戏运行平台。

Phase 1 使用 RPG Maker XP / Pokémon Essentials v21.1 地图兼容作为 `loom.map` vertical validation。

---

## 当前入口

- [产品设计总览](./doc/00-overview/product-vision.md)
- [系统架构总览](./doc/10-architecture/system-overview.md)
- [渲染系统](./doc/10-architecture/rendering-system.md)
- [正式契约目录](./doc/15-contracts/README.md)
- [Web Presentation Config v1](./doc/15-contracts/web-presentation-config-v1.md)
- [Web Presentation API v1](./doc/15-contracts/web-presentation-api-v1.md)
- [ADR 0031：M13 Web Presentation Frozen Design](./doc/decisions/0031-business-owned-web-component-projection.md)
- [Phase 1 交付计划](./doc/30-implementation/phase-1-delivery-plan.md)
- [Package Architecture](./doc/30-implementation/package-architecture.md)

---

## 当前状态

```text
M10 User Input          ✅ Closed
M11 Render Replication  ✅ Closed
M12 Content             ✅ Closed 2026-09-08
M13 Web Presentation    ✅ Closed 2026-09-09
M14 loom.map            pending
M15 Desktop full E2E    pending
M16 PWA Runtime         pending
M17 PWA full E2E        pending
```

当前 executable closure gate：

```text
npm run test:m13
```

---

## Authority Boundary

```text
Main
    Session / Runtime / Frame / Activation
    InputTarget / DataAuthority

Subsystem
    business state / Input Interest
    authoritative Render Domains
    author-facing ContentClient

Renderer
    read-only Main mirror
    per-subsystem Data consumers / current Render replicas
    trusted/private ResourceClient
    physical Web projection mutation

Business Web Component
    read-only projection consumer
    Shadow DOM / Canvas / WebGL / private presentation owner

Platform / apps/*
    executable hosting
    Control/Data/Content physical binding
    Renderer Window composition
```

一个 authority只允许一个 owner；DOM/Platform physical ownership不产生第二份 application authority。

---

## M13 Web Presentation — Implemented / Qualified / Closed

M13 已按冻结设计完成生产实现与真实 Chromium qualification。实现主线：

```text
Window bootstrap
→ current Control Session/DataAuthority + per-subsystem Render Store
→ package-private reevaluation / per-subsystem eligibility
→ thin Web Projector
→ business-owned Custom Elements
```

Formal source：

```text
Web Presentation Config v1   Active / Normative / Frozen
Web Presentation API v1      Active / Normative / Frozen
ADR 0031                     Accepted / Frozen decision provenance
```

实施顺序：

- [M13 / 01 — Bootstrap](./M13_01_WEB_PRESENTATION_BOOTSTRAP.md)
- [M13 / 02 — Renderer Presentation Seam](./M13_02_RENDERER_PRESENTATION_SEAM.md)
- [M13 / 03 — Web Projector](./M13_03_WEB_PROJECTOR.md)
- [M13 / 04 — Chromium Vertical](./M13_04_VERTICAL_INTEGRATION.md)
- [M13 / 05 — Qualification Closure](./M13_05_QUALIFICATION_CLOSURE.md)

M13不建立 second Store/topology、public PresentationState、component registry/loader、AssetManager、layout/layer framework、global service locator、DOM rollback framework或 mandatory presentation SDK/package。

唯一 executable closure gate：

```text
npm run test:m13
```

Qualification evidence：[M13 Web Presentation qualification](./doc/30-implementation/m13-qualification.md)。下一步进入 M14 `loom.map` 真实 business consumer。

---

## 本地文档

Node.js 20+：

```bash
npm install
npm run docs:dev
npm run docs:build
npm run docs:check-links
```
