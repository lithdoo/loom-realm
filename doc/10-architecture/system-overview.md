# LoomRealm 系统架构总览

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Stable  
> 主要定义：logical roles、authority/currentness、bootstrap、state/render/content placement 与 platform composition  
> 依赖：[产品总览](../00-overview/product-vision.md)、[文档治理](../00-overview/document-governance.md)  
> 细化：[平台组合](./platform-composition-system.md)、[运行承载](./runtime-hosting-system.md)、[Realm State](./realm-state-system.md)、[渲染](./rendering-system.md)、[Subsystem](./subsystem-model.md)、[存储](./storage-system.md)  
> 最近复核：2026-10-09

本文描述 Current system-level responsibility / authority / topology。精确 wire、ABI、error、limit 与 conformance semantics 由 [正式契约](../15-contracts/README.md) 拥有；实现位置由 [模块文档](../20-modules/README.md) 拥有；qualification 规则由 [30-development](../30-development/qualification.md) 拥有。

## 1. Logical roles

| Role | Authoritative responsibility | 明确不拥有 |
| --- | --- | --- |
| Game Package | logical installation document validation | runtime authority / executable host |
| Platform Launcher | current-platform PREPARE、binding、preflight | business semantics |
| Main | Session / Runtime / Frame / Activation / InputTarget / DataAuthority / failure unwind | shared business state / DOM |
| Realm State | session shared mutable Records、versions、OCC、commit revision | Frame/InputTarget / persistence policy |
| Subsystem | domain execution、local business state、Input Interest、Render Domains | platform host / Renderer replica |
| Renderer | current readonly replica、Input producer gate、presentation projection inputs | authoritative game state |
| Content | readonly prepared installation definitions/resources | mutable session state |
| Platform composition | Process/Worker/Port/Window/Service Worker wiring | second application authority |

核心原则：**single authority partition**。物理共置不等于逻辑 owner 合并。

## 2. Bootstrap boundaries

```text
installation/source
→ matching Platform Launcher
→ Game Entry + platform manifest validation
→ exact key-set join
→ executable / security / hosting preflight
→ immutable PlatformLaunchPlan
→ logical bootstrap + prepared capabilities
→ Session composition
→ Main / Realm State READY
→ first business Runtime side effect
```

Main 不解析 installation document，也不接触 executable path/URL/module binding。Realm State bootstrap material 与 `LogicalGameBootstrap` 平级，不塞进 Main control model。

Web presentation bootstrap独立于 logical game/runtime bootstrap；Window/document lifecycle、CSP/origin、prepared Content binding 属于 concrete platform composition。

## 3. Main 与 Realm State

```text
Main                           Realm State
Control Authority              Business State Authority
Session/Runtime/Frame          Records / versions
Activation/InputTarget         OCC / global commit revision
DataAuthority                  subscriptions
failure unwind                 mutation result
```

Realm State operation 不创建、消费或验证 Frame/Activation/InputTarget authority。Realm State fatal 可以报告 Session-fatal fact，但 **Main 唯一提交 Session terminal 与 Runtime/Frame unwind**。

Save/Load 是 business workflow，不是 Realm State lifecycle authority：业务 Subsystem 自行读取/解释 persistence data，再使用普通 RealmStateClient read/commit。

## 4. Renderer Data / Input / Render

Renderer Data identity/currentness 建立在 current Session、Renderer、subsystem key、generation 与 profile 上。Same-generation Data reconnect 只替换 Data physical pair；Renderer reload 产生 fresh logical participant。

Input admission 必须同时满足 current Data、Main InputTarget、active Activation、Subsystem Interest 与 physical producer gate。

Render authoritative flow：

```text
Subsystem RenderDomain
→ Render Update contract
→ Renderer per-subsystem Store/current replica
→ thin Web Projector
→ business-owned Web Components
```

DOM/Web Component 私有状态不得 reverse-sync Renderer Store，更不得成为 Main/Realm State/Subsystem authority。

## 5. Content

Content 是 installation-scoped readonly definition authority。业务通过 `ContentClient` 消费 logical record/resource；Runtime 不依赖 importer、filesystem path、FSDB transport、Marshal 或 acquisition mechanics。

Desktop 可使用 FSDB-backed physical service；PWA 可使用 same-origin Service Worker/OPFS realization。两者只要满足 [Content API v1](../15-contracts/content-api-v1.md)，就不需要共享物理实现。

## 6. Platform composition

### Desktop / Hostra

```text
Hostra shell
    Electron + BrowserWindow + host RPC
        ↓ HOSTRA_SUBCMD
LoomRealm Desktop process
    Main
    RealmStateAuthority
    RuntimeHosting
    Content/Data/Renderer composition
        ↓
Runner → Subsystem Runtime
```

External Hostra 是 outer physical owner；LoomRealm Desktop 是 plain Node product composition。Hostra RPC 是 host-control boundary，不成为 game/runtime application protocol。

### PWA

```text
Window
    Renderer / Input / Viewport / Presentation
        ↕
Session Worker
    Main + Realm State
        ↓
Dedicated Subsystem Workers

Service Worker
    Content / executable / runtime-info physical boundary
```

PWA 的 worker/port/origin/generation fencing 属于 PWA profile；不能把 browser-specific mechanics 提升为 universal runtime ABI。

## 7. Failure 与 lifetime

- Data carrier loss != Runtime/Frame failure；
- Renderer reload != Realm State reset；
- presentation/bootstrap error 默认 Window-local，不 rollback authoritative state；
- Realm State binding loss终止旧 physical subscription，但不自动 fail still-live Runtime logical client；
- ambiguous mutation result 不自动 retry；业务需要 exactly-once intent 时使用普通业务 marker/reconciliation；
- Runtime terminal 使该 Runtime 的 state/data capabilities terminal/inert；
- physical host terminal signals 必须汇入既有 Main/RuntimeHosting owner chain，不创建第二套 failure authority。

## 8. Dependency boundaries

```text
packages/   framework/runtime/protocol/platform seams
game-libs/  reusable game-domain libraries
examples/   concrete games and fixtures
apps/       product/platform compositions
tools/      import/development tooling
```

禁止的典型反向依赖：

```text
framework → concrete game/example
Business Definition → browser/platform/protocol authority
Renderer → direct Realm State authority
Realm State → Main Frame/Activation/InputTarget authority
DOM → Store reverse authority
runtime business code → tools/*
```

## 9. Current capability map

```text
Launch / Hosting       Game Package + Platform profiles + RuntimeHosting
Control                Main + Runtime Control + Frame/Call
Shared business state  Realm State
Data / Input / Render  Renderer Data + Input + Render Update + Viewport
Presentation           Web Presentation Config/API + business WC
Content                Content API + FSDB/PWA physical realizations
Game domain            game-libs/map and other game libraries
Products               Desktop/Hostra + PWA
```

这些是长期 capability，不是项目阶段。新的实现工作按 capability impact 与 qualification subject 管理。

## 10. Final invariants

1. 一个 application authority 只有一个 owner；
2. platform composition 只做 physical assembly/wiring/disposal；
3. first business Runtime side effect 发生前 PREPARE 与必要 authorities 必须 READY；
4. Main bootstrap 不包含 platform executable material 或 Realm State business payload；
5. Realm State 与 Renderer Data 拥有独立 lifetime/currentness；
6. Renderer/DOM 只投影 authoritative state，不反向取得 authority；
7. Content readonly、State mutable、Render replica 三类数据边界不能混合；
8. Desktop/PWA physical topology 可以不同，但 logical contract 与 observable outcome 必须一致；
9. current architecture 不从历史 qualification ledger 推导；
10. 行为或 qualification-input 改变后，PASS 只对重新确定的 subject 有效。
