# LoomRealm 系统架构总览

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：M10–M15 closed baseline；M15 physical realization remains ADR 0034 + recomposition SSOT；Realm State core semantics closed / not implemented / not qualified  
> 主要定义：logical roles、bootstrap boundary、authority/currentness、Realm State placement、Render/Web presentation placement、Platform composition  
> 依赖：[产品设计总览](../00-overview/product-vision.md)、[文档治理](../00-overview/document-governance.md)  
> 细化：[平台组合系统](./platform-composition-system.md)、[Realm State](./realm-state-system.md)、[渲染系统](./rendering-system.md)  
> 相关：[Realm State v1](../15-contracts/realm-state-v1.md)、[Web Presentation Config v1](../15-contracts/web-presentation-config-v1.md)、[Web Presentation API v1](../15-contracts/web-presentation-api-v1.md)、[ADR 0031](../decisions/0031-business-owned-web-component-projection.md)、[ADR 0032](../decisions/0032-game-library-example-boundary.md)、[ADR 0034](../decisions/0034-hostra-owned-desktop-composition.md)  
> 最近复核：2026-10-05

本文只描述 system-level responsibility / authority / topology。精确 browser/ABI/error/qualification semantics由 formal contracts与 milestone closure拥有。M15 exact Desktop physical realization由 `M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md` + ADR 0034拥有。

---

## 1. Logical Roles

```text
Game Package
    logical Game Entry document
    optional Realm State initial document definition

Platform Launcher / launch profile
    executable binding + PREPARE
    PlatformLaunchPlan
    PreparedLogicalGame
        ├─ LogicalGameBootstrap
        └─ PreparedRealmStateDefinition

Main
    Session / Runtime / Frame / Stack / Activation
    InputTarget / DataAuthority / failure unwind

Realm State
    Session shared mutable business-state authority
    immutable prepared Game baseline
    mutable current Records
    Record version OCC / global commit revision

Subsystem Runtime
    business-local state
    Input Interest
    authoritative Render Domains
    author-facing ContentClient / RealmStateClient

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
    compose game libraries + game-specific Subsystems/content/config/state
```

一个 application authority只有一个 owner；physical Platform/Host/DOM ownership不会产生第二份 application authority。

核心 owner distinction：

```text
Main
    Control Authority
    “谁正在运行 / 当前 Frame/Activation/InputTarget 是什么”

Realm State
    Session Business State Authority
    “跨 Subsystem 的共享业务事实现在是什么”

Subsystem
    Domain Execution / Local State Authority

Renderer
    Readonly presentation replica

Content
    Readonly installation definition authority
```

Realm State MUST NOT 被实现为 Main 内部 business field collection；Main 也 MUST NOT 解释 Realm State namespace/value。

Session composition 可以 physically construct/wire/dispose sibling authorities，但不得因此成为第三 application authority或复制 Main/Realm State state machine。

---

## 2. Bootstrap Boundaries

Runtime executable/bootstrap preparation：

```text
installation/source
→ matching Platform Launcher / launch-profile PREPARE
→ Game Entry validation including optional state document
→ Platform manifest join
→ executable/capability preflight
→ PlatformLaunchPlan
→ Launcher projects validated Game State
→ PreparedLogicalGame
    ├─ LogicalGameBootstrap
    └─ PreparedRealmStateDefinition
→ Session composition physically constructs RealmStateAuthority
→ installs prepared Game baseline / optional Load current overrides
→ Realm State READY
→ RuntimeHosting / business Runtime side effects
```

`LogicalGameBootstrap` 只包含 Main-required logical topology/initial Frame input。`PreparedRealmStateDefinition` 与它平级，MUST NOT 塞进 Main bootstrap。

Game Package document type不是 RealmStateAuthority bootstrap ABI：

```text
GameEntryV1.state
    document/schema layer

PreparedRealmStateDefinition
    Realm State bootstrap layer
```

必须保持：

```text
first business Runtime side effect
    ⇒ PREPARE complete
    ∧ Realm State READY
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
Game topology
!= Realm State business baseline
!= executable binding
!= Window/document bootstrap
!= Web presentation bootstrap
```

Config source、prepared Content selection、private browser binding、Window/document lifecycle属于 concrete platform composition，不进入 Main/Frame/RenderNode/Launcher logical ABI。

---

## 3. Main / Realm State / Renderer Authority

Main唯一拥有 Session、Runtime/Frame/Stack/Activation、InputTarget、DataAuthority generation/profile 与 failure unwind，并向 Renderer发布 committed control authority snapshot。

Realm State唯一拥有 Session shared mutable business Records。Subsystem 通过 Runtime-scoped `RealmStateClient` 读取/发现/订阅/提交；Renderer v1 不直接成为 Realm State client。

```text
Main                         Realm State
Control authority            Business-state authority
Session/Runtime/Frame        initial/current Records
Activation/InputTarget       Record versions / OCC
DataAuthority                global commit revision
failure unwind               committed subscriptions
          \                   /
                 Session
```

Realm State operations 不创建、消费或验证 Frame/Activation/InputTarget authority；Realm State OCC 与 Main control-flow semantics 正交。Frame suspend/close、Activation replacement 或 pending `frame.call()` 不构成 Realm State transaction admission condition。

RealmStateAuthority 检测 fatal 时只报告 Session-fatal condition；Main/Session lifecycle owner 唯一提交 Session terminal 与 Runtime/Frame failure unwind。

Web presentation currentness仍由 current Control snapshot + current Renderer Store决定；Platform/Host不得复制第二份 presentation topology authority，也不得把 Realm State变成第二份 Renderer Store。

---

## 4. Renderer Data / Input / Render

Current Data identity：

```text
Session + current Renderer + subsystemKey + generation
```

Data loss != Runtime/Frame failure；same generation/profile可 reconnect。

```text
reload
    → fresh Renderer logical identity

same-generation Data-only reconnect
    → same Renderer Control participant / same Renderer identity
    → fresh Data physical pair only
```

因此 Data carrier loss不得隐式升级为 Renderer replacement 或第二份 Renderer currentness。

Input继续受 current Data × Main InputTarget × active Activation × Subsystem Interest × physical Producer gate约束。

Render：

```text
Subsystem authoritative Render Domains
→ Render Update v1
→ per-subsystem Renderer Store
```

Wire node identity包含 `(Session, subsystemKey, generation, domainId, key)`。

Realm State 不属于 Renderer Data profile：

```text
Renderer Data
    connection-local Input / Render / Viewport replica traffic

Realm State
    Session-level shared business-state authority
```

两者 MAY 共享某些 physical transport primitives，但 MUST NOT 共享 authority/currentness/lifetime semantics。

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

Realm State current values只有经过 Subsystem business logic → RenderDomain → Renderer Store 才成为 presentation input；DOM/Web Presentation不得反向成为 Realm State authority。

---

## 6. Projection / Business Boundary

Same full live wire-node identity保持 same HTMLElement。Business WC 对 managed attrs/data/light DOM只读；DOM不 reverse-sync Store。

Projector只注入 Web Presentation API 定义的 narrow context/data/resource capability，不创建 component library、AssetManager、dynamic loader、global service locator或 RenderEvent WC ABI。

Business Definition 可通过 `@loomrealm/subsystem` 使用 Runtime-scoped RealmStateClient，但不得接触 RealmStateAuthority implementation、carrier 或 persistence internals。

Realm State 只适合需要成为 Session 跨 Subsystem authoritative mutable business truth 的事实；Subsystem-local task、Input/Render state、cache/derived projection、Platform/transport/Content facts继续留在各自 owner。

---

## 7. Failure / Lifetime Boundary

Presentation/bootstrap runtime failure保持 Window-local，不 rollback Store、不 mutate Main/Subsystem/Realm State、不自动 fail Runtime/Frame。

Realm State ordinary invalid/limit/conflict 是 caller-visible coordination result。Subscription listener throw/rejected thenable 属 Runtime-local containment，不得使 Authority/Session terminal。

Realm State physical binding loss只终止受影响的 Realm State binding/client/subscriptions；不得自动 fail Main Runtime、unwind Frame、terminate Session 或 reset RealmStateAuthority。

RealmStateAuthority fatal 是 Session-fatal condition，由 Main/Session lifecycle owner 提交 terminal/unwind。Runtime terminal → 该 Runtime 的 RealmStateClient/subscriptions terminal/inert。

Desktop physical terminal trigger必须由 concrete platform composition映射到 existing Main/RuntimeHosting owner chain；System layer不定义第二份 Runtime failure/kill authority。

---

## 8. Dependency / Non-goals

Repository taxonomy：

```text
packages/      framework/runtime/protocol/platform seams
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
Business Definition → RealmStateAuthority / Realm State physical carrier
Business WC → Store/Data carrier/Content credential/Realm State authority
Renderer → DOM reverse-sync Store
Renderer → direct Realm State authority
Realm State core → GameEntryV1 / game.json / Platform manifest runtime dependency
Realm State → Main Frame/Activation/InputTarget authority
Session composition → generic application authority/coordinator
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

Realm State 是后续 shared mutable business-state capability，不改变 M14 Content definition boundary，也不吸收 imported immutable Content facts。

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
    ├─ Main realization
    ├─ RealmStateAuthority realization target
    ├─ RuntimeHosting
    ├─ Content Service
    └─ Data / Renderer bindings
        ↓ RuntimeHosting
Runner
        ↓
Subsystem Runtime
```

`@loomrealm/game-launcher-hostra` 在文档中称为 **Hostra launch profile**，表示 PREPARE + Runner realization；它不等于 external Hostra shell。

RealmStateAuthority 与 Main MAY 同进程，但 logical owner/API 必须分离；同进程 placement不产生 Main-owned business state。LoomRealm Desktop/Session composition只做 physical assembly、binding 与 disposal，不解释 State value，也不建立第三份 Session authority。

M15只纠正 outer physical owner，不改变 Main/Renderer/Subsystem、M9–M14 logical semantics。Realm State 尚未因本文 placement 被解释为 M15 已实现/qualified。

Document reload保持同一 Hostra physical Window但产生 fresh Renderer logical participant；same-generation Data-only reconnect保持当前 Renderer identity，只替换 Data physical pair。Realm State Session authority不因 Renderer reload/Data reconnect重置。

Hostra window/RPC/OS-signal/failure终态汇入一个 LoomRealm Desktop cancellation/cleanup owner chain。精确 rendezvous/navigation-only bootstrap/shutdown sequence与 frozen Hostra baseline由 M15 physical SSOT拥有。

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

Realm State 作为独立 pre-implementation architecture/contract track，不 retroactively 改写 M10–M15 qualification claims；实现时必须分别 qualification。

M15–M17只 materialize各自 physical platform职责，不复制 business semantics。

当前 milestone/evidence 状态由 [`phase-1-delivery-plan.md`](../30-implementation/phase-1-delivery-plan.md) 汇总。Architecture docs不独立发布 milestone evidence。

---

## 12. Final Invariants

1. Launcher/launch profile拥有 Game Entry + Runtime executable preparation；presentation startup独立；
2. PREPARE 产出 PlatformLaunchPlan + 平级 `LogicalGameBootstrap` / `PreparedRealmStateDefinition`；Game Package document state不是 Authority bootstrap ABI；
3. Main 是唯一 Control Authority；RealmStateAuthority 是唯一 Session shared mutable business-state authority；
4. Session composition仅拥有 physical assembly/order/binding/disposal，不成为第三 application authority；
5. Realm State必须在第一项 business Runtime side effect前 READY；
6. `LogicalGameBootstrap` 不包含 Realm State payload；Main不解释 Realm State business data；
7. Realm State operations不依赖 Frame/Activation/InputTarget，不受 Frame mutation gate支配；
8. Subsystem通过 Runtime-scoped RealmStateClient消费 State；Renderer/Web Presentation v1不直接成为 State client；
9. Platform 是 physical composition boundary，不是 Main/Render/Realm State/business authority；
10. RealmStateAuthority fatal只报告 Session-fatal condition；Main/Session owner提交 terminal/unwind；
11. Realm State listener failure与 physical binding loss不得自动升级 Runtime/Frame/Session failure；
12. Hostra shell是 canonical Desktop Electron/BrowserWindow/direct-subprocess owner；
13. LoomRealm Desktop是 plain Node HOSTRA_SUBCMD，只拥有 LoomRealm physical services/realizations；
14. Control、Renderer Data、Realm State、Content保持 authority/lifetime separation；
15. reload replaces Renderer identity；Data-only reconnect preserves Renderer identity；二者都不重置 Realm State；
16. Realm State只承载 Session 跨 Subsystem authoritative mutable business facts，不吸收 local/cache/render/input/platform/content/persistence policy；
17. Hostra/PWA允许不同 physical realization，但保持 Realm State logical/business outcome；
18. 不为 Realm State引入 UniversalPlatform、StateManager、NamespaceRegistry、generic transaction coordinator 或第二份 Main authority。
