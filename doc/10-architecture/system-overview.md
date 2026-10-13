# LoomRealm 系统架构总览

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Stable  
> 主要定义：logical roles、authority/currentness、bootstrap、state/events/render/content placement 与 platform composition  
> 依赖：[产品总览](../00-overview/product-vision.md)、[文档治理](../00-overview/document-governance.md)  
> 细化：[平台组合](./platform-composition-system.md)、[运行承载](./runtime-hosting-system.md)、[Realm State](./realm-state-system.md)、[Session Events](./session-events-system.md)、[渲染](./rendering-system.md)、[Subsystem](./subsystem-model.md)、[存储](./storage-system.md)  
> 最近复核：2026-10-13

本文描述 Current system-level responsibility / authority / topology。精确 wire、ABI、error、limit 与 conformance semantics 由 [正式契约](../15-contracts/README.md) 拥有。

## 1. Logical roles

| Role | Authoritative responsibility | 明确不拥有 |
| --- | --- | --- |
| Game Package | logical installation document validation | runtime authority / executable host |
| Platform Launcher | current-platform PREPARE、binding、preflight | business semantics |
| Main | Session / Runtime / Frame / Activation / InputTarget / DataAuthority / failure unwind | shared business state / DOM |
| Realm State | session shared mutable Records、versions、OCC、commit revision | Frame/InputTarget / persistence policy |
| Session Events | Session-scoped transient exact-channel routing / bounded delivery | business truth / history / RPC / control flow |
| Subsystem | domain execution、local business state、Input Interest、Render Domains | platform host / Renderer replica |
| Renderer | current readonly replica、Input producer gate、presentation projection inputs | authoritative game state |
| Content | readonly prepared installation definitions/resources | mutable session state |
| Platform composition | Process/Worker/Port/Window/Service Worker wiring | second application authority |

核心原则：**single authority partition**。物理共置不等于 logical owner 合并。

`SessionEventHub` 是 infrastructure owner 而不是 business authority：只拥有 routing、subscription lifetime、serial/bounded delivery mechanics，不拥有事件描述的业务事实。

## 2. Bootstrap boundaries

```text
installation/source
→ matching Platform Launcher
→ Game Entry + platform manifest validation
→ exact key-set join
→ executable/security/hosting preflight
→ immutable PlatformLaunchPlan
→ logical bootstrap + prepared State
→ Session composition
→ Realm State READY + SessionEventHub READY
→ Runtime-scoped State/Event clients
→ Main / first business Runtime side effect
```

Main 不解析 installation document，也不接触 executable path/URL/module binding。Realm State bootstrap material 与 `LogicalGameBootstrap` 平级，不塞进 Main control model。SessionEventHub 没有 Game Event history/bootstrap payload；它由 Session composition 构造并在业务 Runtime side effect前 READY。

## 3. Main、State 与 Session Events

```text
Main                           Realm State                     Session Events
Control Authority              Business State Authority        Transient Distribution
Session/Runtime/Frame          Records / versions              exact-channel routing
Activation/InputTarget         OCC / commit revision           subscriptions
DataAuthority                  state subscriptions             serial bounded delivery
failure unwind                 mutation result                 no business truth
```

State/Event operations都不创建、消费或验证 Frame/Activation/InputTarget authority。

State/Event infrastructure fatal都只报告 Session-fatal fact；**Main / Session lifecycle owner 唯一提交 Session terminal 与 Runtime/Frame unwind**。

Placement rule：

```text
当前 authoritative business fact
→ Realm State（目标命名 Shared State）

刚刚发生的 transient cross-Subsystem business notification
→ Session Events

RenderDomain transient presentation intent
→ render.event
```

如果 restarted / late-joining Runtime 必须知道某信息，它不能只存在 Session Events。

## 4. Session Events v1 in one view

```text
publish(channel, type, payload)

subscribe([exactChannel...], listener)
    → Promise<live subscription>

subscription.closed
    → closed | overflow | binding-terminal | client-terminal | hub-terminal

subscription.close()
    → synchronous local revoke
```

规则：

```text
channel = only v1 Hub routing key
type = business discriminator, not filter
'/' = ordinary channel text, no hierarchy semantics
source.subsystemKey = derived from authenticated Runtime binding
one accepted event = at most one delivery per matching subscription
one subscription = one serial listener lane
zero subscribers = publish success
self-delivery = allowed
```

Slow consumer不会拖死 publisher：若 subscription queue无法继续保持语义，该 subscription `overflow` terminal；accepted publish仍保持 accepted。

Publish post-dispatch definitive result丢失 = `OUTCOME_UNKNOWN`，framework不自动 retry。

无 usable Event binding的新 publish/subscribe fail-fast `BINDING_UNAVAILABLE`，不等待 reconnect。

## 5. Renderer Data / Input / Render

Renderer Data identity/currentness 建立在 current Session、Renderer、subsystem key、generation/profile 上。Data reconnect/reload不重置 Realm State 或 Session Events。

Input admission仍由 Data × InputTarget × Activation × Interest × producer gate 决定。

Render authoritative flow：

```text
Subsystem RenderDomain
→ Render Update
→ Renderer Store
→ Web Projector
→ business-owned presentation
```

`render.event` 不进入 Session Events plane，也不自动跨 Subsystem fan-out。

## 6. Content

Content 是 installation-scoped readonly definition authority。Content readonly、State mutable current、Event transient、Render presentation intent 保持不同边界。

## 7. Platform composition

### Desktop / Hostra

```text
Hostra shell
    Electron + BrowserWindow + host RPC
        ↓ HOSTRA_SUBCMD
LoomRealm Desktop process
    Main
    RealmStateAuthority
    SessionEventHub
    RuntimeHosting
    Content/Data/Renderer composition
        ↓
Runner → Subsystem Runtime
```

SessionEventHub MAY future split into dedicated process without changing protocol。

### PWA

```text
Window
    Renderer / Input / Viewport / Presentation
        ↕
Session Worker
    Main + Realm State + SessionEventHub
        ↓
Dedicated Subsystem Workers
```

PWA也可把 Event Hub拆到独立 Worker。

State 与 Events 可以 separate carriers，也可以 multiplex one Session-service carrier；共 carrier 不创建 shared authority、transaction、revision 或 public ordering。

## 8. Failure 与 lifetime

```text
Data carrier loss != Runtime/Frame failure
Renderer reload != State/Event reset
Frame/Activation change != State/Event client revoke
```

State binding loss：old State subscription terminal；logical client可在 fresh binding后继续；no mutation replay。

Event binding loss：old Event subscriptions `binding-terminal`；logical client可在 fresh binding后继续；fresh subscribe required；no replay。

Event listener throw/rejected Promise：subscriber-local containment，subscription继续下一条，除非另有 close/terminal。

Event overflow：subscription `closed` resolves `overflow`；no silent drop while remaining healthy；accepted publisher不被反向失败。

Runtime terminal：该 Runtime 的 State/Event clients terminal；Event subscriptions `client-terminal`。

Session/Hub terminal：Event subscriptions `hub-terminal`；Main拥有整体 unwind。

## 9. Dependency boundaries

```text
packages/   framework/runtime/protocol/platform seams
game-libs/  reusable game-domain libraries
examples/   concrete games and fixtures
apps/       product/platform compositions
tools/      import/development tooling
```

禁止：

```text
framework → concrete game/example
Business Definition → platform/protocol authority
Renderer → direct Realm State authority
Session Events → Main Frame/Activation/InputTarget authority
Session Events → direct State mutation authority
DOM → Store reverse authority
```

## 10. Current capability map

```text
Launch / Hosting       Game Package + Platform profiles + RuntimeHosting
Control                Main + Runtime Control + Frame/Call
Shared business state  Realm State (target rename: Shared State)
Cross-domain events    Session Events v1
Data / Input / Render  Renderer Data + Input + Render Update + Viewport
Presentation           Web Presentation Config/API + business WC
Content                Content API + FSDB/PWA physical realizations
Game domain            game-libs/*
Products               Desktop/Hostra + PWA
```

## 11. Final invariants

1. 一个 application authority 只有一个 owner；
2. SessionEventHub只拥有 transient routing/delivery mechanics，不成为 business authority；
3. first business Runtime side effect前 PREPARE + State READY + Event Hub READY；
4. Main bootstrap不包含 platform executable material、State payload或Event routing state；
5. State、Events、Renderer Data拥有独立 lifetime/currentness；
6. Session Events exact-channel only，type不参与v1 filtering；
7. source由Runtime binding派生，不能spoof；
8. subscribe只返回live handle，terminal通过`closed`可观察；
9. one subscription one serial listener lane；overflow显式terminal；
10. publish acceptance != listener success != State consequence commit；
11. no-binding fail-fast；binding recovery no replay/no old-subscription reattach；
12. Render Event与Session Event不自动桥接；
13. State/Event可共进程、共carrier但不共享authority/transaction/order；
14. Desktop/PWA physical topology可以不同，但 logical contract 与 observable outcome一致；
15. `Frozen != Implemented != Qualified`。