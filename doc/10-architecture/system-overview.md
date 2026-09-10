# LoomRealm 系统架构总览

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：M10–M14 **Implemented / Qualified / Closed**
> 主要定义：logical roles、bootstrap boundary、authority/currentness、Render/Web presentation placement、Platform composition  
> 依赖：[产品设计总览](../00-overview/product-vision.md)、[文档治理](../00-overview/document-governance.md)  
> 细化：[平台组合系统](./platform-composition-system.md)、[渲染系统](./rendering-system.md)  
> 相关：[Web Presentation Config v1](../15-contracts/web-presentation-config-v1.md)、[Web Presentation API v1](../15-contracts/web-presentation-api-v1.md)、[ADR 0031](../decisions/0031-business-owned-web-component-projection.md)、[ADR 0032](../decisions/0032-game-library-example-boundary.md)  
> 最近复核：2026-09-10

本文只描述 system-level responsibility / authority / topology。精确 browser/ABI/error/qualification semantics由 formal contracts与 milestone closure拥有。

---

## 1. Logical Roles

```text
Game Package
    logical Game Entry

Platform Launcher
    executable binding + PREPARE
    PlatformLaunchPlan + LogicalGameBootstrap

Main
    Session / Runtime / Frame / Stack / Activation
    InputTarget / DataAuthority / failure unwind

Subsystem Runtime
    business state
    Input Interest
    authoritative Render Domains
    author-facing ContentClient

Renderer
    read-only Main authority mirror
    per-subsystem Data consumers
    Input producer gate
    current Render replicas
    thin physical Web projection

Readonly Content Service
    logical readonly Content bytes

Business Web presentation
    concrete Custom Elements
    Shadow DOM / Canvas / WebGL / layout/private state

Reusable game libraries
    consumers of public Subsystem author APIs
    reusable business state/Render/Content semantics
    optional business-owned Web presentation

Concrete games
    compose game libraries + game-specific Subsystems/content/config
```

一个 authority只有一个 owner；physical Platform/DOM ownership不会产生第二份 application authority。Game library/concrete game 是 business consumer layer，不成为新的 framework authority role。

---

## 2. Bootstrap Boundaries

Runtime executable bootstrap：

```text
installation/source
→ matching Platform Launcher PREPARE
→ Game Entry + Platform manifest join
→ executable/capability preflight
→ PlatformLaunchPlan
→ LogicalGameBootstrap
→ RuntimeHosting
```

Web presentation bootstrap独立：

```text
product/platform-private Config source
→ current prepared Content
→ Renderer Window bootstrap
→ presentation start
```

因此：

```text
Game topology != executable binding != Web presentation bootstrap
```

Config source、prepared Content selection、private browser binding、Window/document lifecycle属于 concrete `apps/*` composition，不进入 Main、Frame、RenderNode或 Launcher logical ABI。精确 Config shape/MIME/loading barrier由 Web Presentation Config v1拥有。

---

## 3. Main / Renderer Authority

Main唯一拥有 Session、Runtime/Frame/Stack/Activation、InputTarget、DataAuthority generation/profile 与 failure unwind，并向 Renderer发布 committed authority snapshot。

对 Web presentation，current Control snapshot唯一决定 current Session 与 subsystem/generation topology。Renderer不得复制出第二份 presentation topology authority。

---

## 4. Renderer Data / Input / Render

Current Data identity：

```text
Session + current Renderer + subsystemKey + generation
```

Data loss != Runtime/Frame failure；same generation/profile可 reconnect，profile change需要 fresh generation。

Input继续受 current Data × Main InputTarget × active Activation × Subsystem Interest × physical Producer gate约束。

Render：

```text
Subsystem authoritative Render Domains
→ Render Update v1
→ per-subsystem Renderer Store
```

Wire node identity包含 `(Session, subsystemKey, generation, domainId, key)`。

---

## 5. M13 Web Presentation Placement

```text
Window bootstrap
→ presentation start
→ current Control Session/DataAuthority facts ─┐
                                               ├→ package-private reevaluation
   current per-subsystem Renderer Store ───────┘
                                                     ↓
                                           per-subsystem eligibility
                                                     ↓
                                               thin Projector
                                                     ↓
                                     document.body / business WC
```

Production reevaluation只有 committed/fresh current Control snapshot 与 successful current Store domains/snapshot/patch commit。Failed Store mutation与 RenderEvent不触发 Web projection。

Same-generation transport loss不等于 authority removal；fresh Session/generation结束旧 identity universe。精确 eligibility/reconnect/DOM-observable semantics由 Web Presentation API v1拥有。

---

## 6. Projection / Business Boundary

Same full live wire-node identity保持 same HTMLElement；move/reparent/reorder移动 existing instance。Top-level managed roots按 deterministic physical sequence组成，但该顺序不建立 cross-Subsystem visual stacking authority；layout/stacking仍属于 business WC/CSS。

Business WC 对 managed attrs/data/light DOM只读；DOM不 reverse-sync Store。Business可拥有 Shadow DOM、Canvas/WebGL、decoded resource cache、animation/timers与 private layout state。

Projector只注入 formal Web Presentation API 定义的 narrow context/data/resource capability，不创建 component library、AssetManager、dynamic loader、global service locator或 RenderEvent WC ABI。

---

## 7. Failure / Lifetime Boundary

Bootstrap failure阻止 presentation start。Runtime presentation failure保持 Window-local，不 rollback Store、不 mutate Main/Subsystem、不自动 fail Runtime/Frame。

Unknown-tag precise preflight/freeze semantics、receiver callback ordering/data equality、resource teardown/error semantics全部由 Web Presentation API v1拥有；本总览不复制。

---

## 8. Dependency / Non-goals

M14 repository taxonomy：

```text
packages/      framework/runtime
game-libs/     reusable game-domain libraries
examples/      concrete games
apps/          platform hosts
tools/         development/import/compatibility tooling
```

主依赖方向：

```text
examples → game-libs → public author APIs
```

禁止：

```text
Business Definition → renderer/browser/platform/protocol authority
Business WC → Store/Data carrier/Content credential
Renderer → DOM reverse-sync Store
RenderNode → arbitrary module URL/loader
public PresentationState / second Store/topology
component registry / AssetManager / dynamic loader
layout/layer authority / global service locator
RenderEvent WC ABI
packages/framework → game-libs/examples reverse dependency
runtime game/game-lib → tools/* dependency
```

M13 implementation只允许选择不改变 frozen observable semantics 的 private mechanics。Game-library business vocabulary也不得反向升级为 LoomRealm framework contract。

---

## 9. M14 Consumer Placement

```text
examples/essentials-v21.1
    consumes
        ↓
game-libs/map
    @loomrealm-game/map
```

M14 不定义 universal/normalized map schema。它区分 source semantics、consumer representation 与 Runtime access：

```text
RMXP/Essentials source
    semantic authority for facts actually consumed

existing importer/lossless representation
    source fidelity / decoder representation

selective M14 consumer JSON
    Map/{id}: tileset_id,width,height,data
    Tileset/{id}: id,tileset_name,passages,priorities

prepared Content
    persisted/runtime representation

ContentClient
    map Runtime access boundary
```

数据准备链：

```text
Essentials source
→ tools/fixtures/essentials-v21.1 importer/lossless decode
→ selective Map/Tileset consumer projection
→ prepared FSDB records + raw resources
→ M12 ContentClient
→ @loomrealm-game/map
```

M14 不因 importer 能识别 `RPG::Event`、MapInfo、Color/Tone、AudioFile 等对象就把它们递归 materialize 到 first-slice consumer view。未消费 source facts继续留在 existing importer/lossless evidence；later real behavior需要时再增加最小 source-specific projection。

Map runtime只读取 `ContentClient.record()` 返回的普通 JsonValue，不依赖 Ruby Marshal binary、`.rxdata` decoding、`RmxpObject/RubyString/$id/$ref/$typed`、decoder object或 tooling filesystem layout。

可见资源以 logical identity/version进入 Render state，WC再通过 `PresentationResourceClient`取 bytes。Map browser JS/CSS也通过 prepared Content + `WebPresentationConfigV1`启动。

M14 qualification可使用 test-owned composition harness复用 existing roles + real Chromium；该 harness不是新的 production Platform/Host，完整 Desktop composition属于 M15。

---

## 10. Phase Route

```text
M10 Input
→ M11 Render
→ M12 Content
→ M13 Web Presentation
→ M14 Map Game Library + First Real Game
→ M15 Desktop Full E2E
→ M16 PWA Runtime
→ M17 PWA Full E2E / Equivalence
```

M14 不 reopen M10–M13 frozen contracts，也不把 RMXP-compatible map semantics升级为 LoomRealm universal map contract。M15–M17只 materialize各自 physical platform职责，不复制 M14 business semantics。
