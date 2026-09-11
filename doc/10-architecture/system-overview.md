# LoomRealm 系统架构总览

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：M10–M13 closed baseline；M14 consumer architecture/implementation frozen；M15 Hostra physical recomposition frozen for execution  
> 主要定义：logical roles、bootstrap boundary、authority/currentness、Render/Web presentation placement、Platform composition  
> 依赖：[产品设计总览](../00-overview/product-vision.md)、[文档治理](../00-overview/document-governance.md)  
> 细化：[平台组合系统](./platform-composition-system.md)、[渲染系统](./rendering-system.md)  
> 相关：[Web Presentation Config v1](../15-contracts/web-presentation-config-v1.md)、[Web Presentation API v1](../15-contracts/web-presentation-api-v1.md)、[ADR 0031](../decisions/0031-business-owned-web-component-projection.md)、[ADR 0032](../decisions/0032-game-library-example-boundary.md)、[ADR 0034](../decisions/0034-hostra-owned-desktop-composition.md)  
> 最近复核：2026-09-11

本文只描述 system-level responsibility / authority / topology。精确 browser/ABI/error/qualification semantics由 formal contracts与 milestone closure拥有。M15 exact Desktop physical realization由 `M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md` + ADR 0034拥有。

---

## 1. Logical Roles

```text
Game Package
    logical Game Entry

Platform Launcher / launch profile
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

Concrete games
    compose game libraries + game-specific Subsystems/content/config
```

一个 application authority只有一个 owner；physical Platform/Host/DOM ownership不会产生第二份 application authority。

---

## 2. Bootstrap Boundaries

Runtime executable bootstrap：

```text
installation/source
→ matching Platform Launcher / launch-profile PREPARE
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
→ Renderer Window/document bootstrap
→ presentation start
```

因此：

```text
Game topology != executable binding != Window/document bootstrap != Web presentation bootstrap
```

Config source、prepared Content selection、private browser binding、Window/document lifecycle属于 concrete platform composition，不进入 Main/Frame/RenderNode/Launcher logical ABI。

---

## 3. Main / Renderer Authority

Main唯一拥有 Session、Runtime/Frame/Stack/Activation、InputTarget、DataAuthority generation/profile 与 failure unwind，并向 Renderer发布 committed authority snapshot。

Web presentation currentness仍由 current Control snapshot + current Renderer Store决定；Platform/Host不得复制第二份 presentation topology authority。

---

## 4. Renderer Data / Input / Render

Current Data identity：

```text
Session + current Renderer + subsystemKey + generation
```

Data loss != Runtime/Frame failure；same generation/profile可 reconnect。

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
Window/document bootstrap
→ presentation start
→ current Control facts ───────────────┐
                                       ├→ package-private reevaluation
   current Renderer Store ─────────────┘
                                              ↓
                                        thin Projector
                                              ↓
                                    business Custom Elements
```

Same-generation transport loss不等于 authority removal；fresh Session/generation结束旧 identity universe。

---

## 6. Projection / Business Boundary

Same full live wire-node identity保持 same HTMLElement。Business WC 对 managed attrs/data/light DOM只读；DOM不 reverse-sync Store。

Projector只注入 Web Presentation API 定义的 narrow context/data/resource capability，不创建 component library、AssetManager、dynamic loader、global service locator或 RenderEvent WC ABI。

---

## 7. Failure / Lifetime Boundary

Presentation/bootstrap runtime failure保持 Window-local，不 rollback Store、不 mutate Main/Subsystem、不自动 fail Runtime/Frame。

Desktop physical terminal trigger必须由 concrete platform composition映射到 existing Main/RuntimeHosting owner chain；System layer不定义第二份 Runtime failure/kill authority。

---

## 8. Dependency / Non-goals

Repository taxonomy：

```text
packages/      framework/runtime
game-libs/     reusable game-domain libraries
examples/      concrete games
apps/          product/platform compositions
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
public PresentationState / second Store/topology
component registry / AssetManager / dynamic loader
layout/layer authority / global service locator
packages/framework → game-libs/examples reverse dependency
runtime game/game-lib → tools/* dependency
```

---

## 9. M14 Consumer Placement

```text
examples/essentials-v21.1
    consumes
        ↓
game-libs/map
    @loomrealm-game/map
```

M14只 materialize当前消费者需要的 RMXP/Essentials Map/Tileset facts到 prepared Content；Runtime只通过 M12 ContentClient读取普通 JsonValue，不依赖 importer/Marshal/tooling representation。

M14 qualification可使用 test-owned composition harness + real Chromium；完整 Hostra-owned Desktop composition属于 M15。

---

## 10. Hostra Desktop Placement

术语和 owner chain固定为：

```text
Hostra shell
    external Electron / BrowserWindow / direct-subprocess host
        ↓ HOSTRA_SUBCMD
LoomRealm Desktop process
    plain Node physical composition
        ↓ RuntimeHosting
Runner
        ↓
Subsystem Runtime
```

`@loomrealm/game-launcher-hostra` 在文档中称为 **Hostra launch profile**，表示 PREPARE + Runner realization；它不等于 external Hostra shell。

M15只纠正 outer physical owner，不改变 Main/Renderer/Subsystem、M9–M14 logical semantics。

Document reload保持同一 Hostra physical Window但产生 fresh Renderer logical participant；Hostra window/RPC/OS-signal/failure终态汇入一个 LoomRealm Desktop cancellation/cleanup owner chain。精确 rendezvous/navigation-only bootstrap/shutdown sequence由 M15 physical SSOT拥有。

ADR 0033只保留 historical direct-Electron compatibility relevance；canonical M15 composition由 ADR 0034决定。

---

## 11. Phase Route

```text
M10 Input
→ M11 Render
→ M12 Content
→ M13 Web Presentation
→ M14 Map Game Library + First Real Game
→ M15 Hostra-owned Desktop Full E2E
→ M16 PWA Runtime
→ M17 PWA Full E2E / Equivalence
```

M15–M17只 materialize各自 physical platform职责，不复制 M14 business semantics。

当前 milestone/evidence 状态由 [`phase-1-delivery-plan.md`](../30-implementation/phase-1-delivery-plan.md) 汇总；Architecture docs不独立发布 milestone Closed日期。
