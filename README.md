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

## 已关闭里程碑

```text
M10 User Input          ✅ Closed
M11 Render Replication  ✅ Closed
M12 Content             ✅ Closed 2026-09-08
```

当前 executable closure gate：

```text
npm run test:m12
```

---

## Authority Boundary

```text
Main
    Session / Runtime / Frame / Activation
    InputTarget / DataAuthority

Subsystem
    business state
    Input Interest
    authoritative Render Domains
    author-facing ContentClient

Renderer
    read-only Main mirror
    per-subsystem Data consumers
    current Render replicas
    trusted/private ResourceClient
    physical Web projection mutation

Business Web Component
    read-only projection consumer
    Web Presentation API consumer
    Shadow DOM / Canvas / WebGL / private presentation owner

Platform / apps/*
    executable hosting
    Control/Data physical provisioning
    Content physical binding
    Renderer Window composition
```

一个 authority只允许一个 owner；DOM/Platform physical ownership不产生第二份 application authority。

---

## M13 Web Presentation — Design Frozen

M13 已 **Preimplementation Closed**，实现尚未开始关闭。

Formal source：

```text
Web Presentation Config v1   Active / Normative / Frozen
Web Presentation API v1      Active / Normative / Frozen
ADR 0031                     Accepted / Frozen
```

实施文档：

- [M13 / 01 — Bootstrap](./M13_01_WEB_PRESENTATION_BOOTSTRAP.md)
- [M13 / 02 — Renderer Presentation Seam](./M13_02_RENDERER_PRESENTATION_SEAM.md)
- [M13 / 03 — Web Projector](./M13_03_WEB_PROJECTOR.md)
- [M13 / 04 — Chromium Vertical](./M13_04_VERTICAL_INTEGRATION.md)
- [M13 / 05 — Qualification Closure](./M13_05_QUALIFICATION_CLOSURE.md)

### Frozen flow

```text
concrete Window composition
→ Config validation + prepared M12 Content
→ exact MIME + ordered JS/CSS
→ window.onload
→ start presentation

current Control Session/DataAuthority ─┐
                                      ├→ package-private reevaluation
current per-subsystem Render Store ───┘
                                               ↓
                                     per-subsystem eligibility
                                               ↓
                                       thin Web Projector
                                               ↓
                                business-owned Custom Elements
```

### Frozen identity/currentness

```text
identity = (Session, subsystemKey, generation, domainId, key)
same identity → same HTMLElement
fresh Session/generation → fresh HTMLElement universe

same-generation carrier loss
→ freeze only affected subsystem
→ partial rebaseline hidden
→ complete baseline reconcile once

DataAuthority removal/generation change
→ presentation updates from Control authority topology
→ does not wait for a later Render commit
```

### Frozen bootstrap/API/failure

```text
scripts MIME essence = text/javascript
styles  MIME essence = text/css

new element:
construct → context → insertion/structure → attrs → data

unknown required tag:
preflight before DOM mutation
→ zero partial mutation
→ freeze failed Window permanently

Window teardown:
→ cancel presentation resource reads
→ later well-formed resource() = CONTENT_CANCELLED
```

M13明确不建立 second Store/topology、public PresentationState、AssetManager、dynamic loader、component registry、layout/layer framework、global service locator、DOM rollback framework或 RenderEvent WC ABI。

---

## Current Milestones

```text
M1–M9                                  ✅
M10 User Input                         ✅ Closed
M11 Render Replication                 ✅ Closed
M12 Content                            ✅ Closed 2026-09-08
M13 Web Presentation                   Design Frozen / implementation pending
M14 loom.map                           pending
M15 Desktop full E2E                   pending
M16 PWA Runtime                        pending
M17 PWA full E2E/equivalence           pending
```

Critical path：

```text
Input → Render → Content → Web Presentation → loom.map → Desktop E2E → PWA Runtime → PWA E2E
```

下一步直接实施 M13/01–05。M13完成后建立真实 Chromium qualification 的：

```text
npm run test:m13
```

---

## 本地文档

Node.js 20+：

```bash
npm install
npm run docs:dev
npm run docs:build
npm run docs:check-links
```
