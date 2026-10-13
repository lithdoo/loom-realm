# 平台组合系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：M9/M11/M12/M13/M14/M15 current qualification Closed；Realm State v1 implemented / qualified；Session Events v1 logical semantics frozen / not implemented / not qualified；PWA M16/M17 implemented with independent gate
> 主要定义：跨平台 physical composition、Launcher PREPARE、Runtime/Renderer/Data/Content/Realm State/Session Events/Web presentation placement  
> 依赖：[系统架构总览](./system-overview.md)、[Realm State](./realm-state-system.md)、[Session Events](./session-events-system.md)、[渲染系统](./rendering-system.md)  
> 正式化：[Realm State v1](../15-contracts/realm-state-v1.md)、[Session Events v1](../15-contracts/session-events-v1.md)、[Web Presentation Config v1](../15-contracts/web-presentation-config-v1.md)、[Web Presentation API v1](../15-contracts/web-presentation-api-v1.md)  
> 最近复核：2026-10-13

本文回答：**同一套 LoomRealm logical application semantics 如何在 Hostra / PWA 上被准备、组合并运行。** Platform 是 physical composition boundary，不是 universal application authority/service locator。

---

## 1. Core Boundary

```text
Platform-neutral logical roles
┌─────────────────────────────────────────────────────┐
│ Main   Realm/Shared State   Session Events   Renderer│
│ Subsystem                      Content consumers     │
└─────────────────────────────────────────────────────┘
                         ▲
                 narrow capabilities
                         │
               Hostra          PWA
```

Logical ownership：

```text
Main
    Control Authority

RealmStateAuthority
    Session shared mutable business-state authority

SessionEventHub
    Session-scoped transient routing/delivery mechanics
    no business truth ownership

Subsystem
    business-local execution / Render authority

Renderer
    control/data replica + presentation projection

Content
    readonly installation definitions/resources

Platform / Session composition
    physical construction / binding / disposal / wiring only
```

Platform不解释 Realm State values，也不解释 Session Event channel/type business semantics。

---

## 2. Runtime PREPARE vs Session Services vs Presentation Startup

Launcher PREPARE：

```text
Game source
→ Game Entry validation including optional state document
→ Platform Launch Manifest
→ exact Subsystem key join
→ executable/security/hosting preflight
→ immutable PlatformLaunchPlan
→ LogicalGameBootstrap
→ PreparedRealmStateDefinition
```

Session Events没有 Game Entry event history/channel registry projection。

PREPARE成功后、第一项 business Runtime side effect前，Session composition MUST：

```text
construct RealmStateAuthority from prepared State
→ Realm State READY

construct SessionEventHub
→ bounded routing/subscription infrastructure READY

install Runtime-scoped RealmStateClient binding factory
install Runtime-scoped SessionEventClient binding factory
```

因此：

```text
first business Runtime side effect
    ⇒ PREPARE complete
    ∧ Realm State READY
    ∧ SessionEventHub READY
```

Presentation startup仍独立于 executable join、State bootstrap 和 Event Hub construction。

---

## 3. Physical Ownership

Physical owner取决于 concrete platform；logical role不等于 OS/browser container。

```text
Hostra Desktop
    Hostra shell owns Electron / BrowserWindow / direct HOSTRA_SUBCMD process
    LoomRealm Desktop child may own
        Main realization
        RealmStateAuthority realization
        SessionEventHub realization
        RuntimeHosting
        Data/Control/Content bindings
        State/Event Runtime bindings

PWA
    browser Window/Worker environment owns physical containers
    composition may place
        Main
        RealmStateAuthority
        SessionEventHub
    together or separately
```

RealmStateAuthority / SessionEventHub MAY 与 Main 共进程/Worker，也 MAY 相互共置；co-location MUST NOT merge logical identity、authority、failure semantics or create State+Event transaction。

Platform/Session composition MUST NOT：

```text
interpret State value or Event business semantics
own State OCC/revision policy
own Event routing semantics beyond implementing frozen contract
inspect Frame/Activation to authorize State/Event operation
turn ordinary State/Event binding loss into Runtime/Session transition
create hidden State+Event atomic transaction/order
become generic SessionCoordinator / service locator
```

---

## 4. Data / Content / State / Events Boundaries

Renderer Data provisioning只实现 current Renderer + Subsystem physical carrier；它不是 Content、State 或 Session Events provisioning authority。

Realm State：

```text
PreparedRealmStateDefinition
→ RealmStateAuthority
→ Runtime-scoped RealmStateClient
→ replaceable physical State binding
→ business
```

Session Events：

```text
SessionEventHub
→ Runtime-scoped SessionEventClient
→ replaceable physical Event binding
→ business
```

Both MUST NOT reuse：

```text
Renderer Data application profile
frame.call()
Main business fields
Frame/Activation mutation gate
```

State and Events MAY use separate carriers or one multiplexed carrier：

```text
Runtime
    │
    ▼
shared Session-service carrier
    ├── Realm/Shared State logical binding
    └── Session Events logical binding
```

But：

```text
shared carrier != shared protocol != shared authority != shared order
```

Multiplexed implementation MUST keep protocol discriminator/correlation、flow-control、evidence/failure、subscription identities independent。Event/Diagnostics traffic MUST NOT indefinitely starve State。

### 4.1 Runtime-scoped client vs physical binding

Both clients follow：

```text
live Runtime-scoped logical client
    ├─ binding A
    │   ↓ lost
    └─ binding B
```

Binding loss by itself MUST NOT fail Main Runtime、unwind Frame、terminate Session or reset Session service。

State：old subscription terminal → fresh binding → fresh subscribe + baseline；no mutation replay。

Events：old subscriptions `binding-terminal` → fresh binding → future publish + fresh subscribe；no event replay/old reattach。

No usable Event binding causes new publish/subscribe to fail fast `BINDING_UNAVAILABLE`；Platform MUST NOT silently queue for reconnect。

---

## 5. SessionEventHub Placement Profiles

All are valid platform realizations：

```text
A. dedicated SessionEventHub Process/Worker

B. RealmStateAuthority + SessionEventHub in one Process/Worker

C. Main + RealmStateAuthority + SessionEventHub in one Session host

D. in-process direct Hub binding
```

Observable Session Events semantics MUST remain identical：

```text
exact-channel routing
source authenticity
publish evidence
async subscription establishment
serial listener lane
closed terminal reasons
bounded overflow
binding fencing/recovery
Runtime/Hub terminal behavior
```

In-process realization MUST NOT shortcut payload detachment、source authentication or synchronously execute remote-style listeners inside publisher call stack。

---

## 6. M13 Presentation Startup

```text
product-private Config source
→ validate/resolve against prepared Content
→ private browser binding
→ ordered business JS/CSS
→ presentation start
```

M13不建立 second registry/universal presentation port。Presentation startup不拥有 State/Event service bootstrap。

---

## 7. Runtime Presentation Integration

Renderer继续只依据 committed Main authority + Renderer Store。

Shared business truth只能：

```text
State
→ Subsystem business logic
→ RenderDomain
→ Renderer Store
```

Session Event 也不直接投影 Renderer；业务若需要 presentation effect，显式 emit Render Event/modify RenderDomain。

---

## 8. M14 Game Consumer Placement

Reusable game libraries / examples位于 Platform之上。Platform不拥有 map/dialogue/battle channel/type business vocabulary。

Immutable Content definition不变成 State；transient Session Events也不成为 Content/State替代物。

Save/Load仍是 business workflow，不由 Platform/Event Hub推导。

---

## 9. Hostra Desktop Realization

Canonical topology保持 Hostra shell → LoomRealm Desktop plain Node process。

Target Session-services topology MAY be：

```text
LoomRealm Desktop process
├─ Main
├─ RealmStateAuthority
├─ SessionEventHub
├─ RuntimeHosting
│   └─ Runner(s)
├─ Data Broker
├─ Content
└─ Runtime Session-service bindings
```

SessionEventHub MAY later split into dedicated child without changing author/protocol semantics。

Runner physical communication MAY use：

```text
State dedicated + Events dedicated
```

or multiplex one bounded Session-service WebSocket/IPC/private carrier。

Hostra RPC remains host-control only；it MUST NOT become generic State/Event application bus。

### Reload / reconnect

BrowserWindow reload replaces Renderer identity but MUST NOT reset RealmStateAuthority or SessionEventHub。

Data reconnect does not replace State/Event logical clients。

Event binding reconnect：

```text
binding A lost
→ subscriptions binding-terminal
→ same Runtime-scoped client may stay live
→ binding B
→ future publish/subscribe
→ fresh subscribe required
→ no replay
```

### Termination

State Authority fatal / Event Hub fatal follow：

```text
service self-terminal
→ report Session-fatal fact
→ Main commits Session terminal/unwind
→ Desktop physical cleanup funnel converges
```

Platform does not invent second logical terminal authority。

---

## 10. PWA Realization

PWA MAY use Dedicated Worker、MessagePort/MessageChannel、Window、Service Worker等 physical primitives。

Valid examples：

```text
Session Worker
    Main
    RealmStateAuthority
    SessionEventHub

or

Session Worker
    Main
    RealmStateAuthority

Dedicated Event Worker
    SessionEventHub
```

State/Event MAY share MessagePort/multiplexed private carrier or use separate ports。

PWA must preserve same logical source/routing/evidence/subscription/overflow/recovery semantics as Desktop。

---

## 11. Cross-platform Equivalence

必须共享：

```text
LogicalGameBootstrap / State projection semantics
State OCC/evidence/lifetime
Session Event channel/type/source grammar
exact-channel routing
publish evidence incl OUTCOME_UNKNOWN
subscription async establishment + closed surface
serial listener delivery
bounded overflow limits
Event binding fail-fast/fencing/recovery
State/Event ↔ Main/Frame authority separation
Runtime/Renderer/Data/Input/Render contracts
Content/Web Presentation semantics
business-observable result
```

可以不同：

```text
module bytes/path
Process tree vs Worker
WebSocket vs MessagePort vs in-process
State/Event dedicated vs multiplexed carrier
private framing envelope
private queue/index implementation
```

不同 copy/validation pass 数量可接受，只要 logical limits、detachment、source authenticity、evidence相同。

---

## 12. No Platform Mega-abstraction

除真实 consumer 要求外，不建立：

```text
UniversalPlatform
SessionCoordinator authority
RealmStateManager
EventBusManager / ChannelRegistry
GenericTransactionCoordinator
generic broker/service locator
universal transport framework
```

跨平台共享 logical contract；physical seams按真实实现最小 materialize。

---

## 13. Milestone Placement

Existing M12–M17 milestone claims不因 Session Events v1 contract frozen而自动扩张。Session Events是独立 implementation/qualification track。

`Frozen != Implemented != Qualified`。

---

## 14. Final Invariants

1. Platform composition只拥有 physical assembly/wiring/disposal，不拥有 Main/State/Event business authority；
2. first business Runtime side effect requires State READY + Event Hub READY；
3. SessionEventHub不需要 Game event bootstrap/history document；
4. Runtime获得 `RealmStateClient` + `SessionEventClient` logical capabilities；
5. Event source identity来自 authenticated Runtime binding；
6. State/Event may co-locate and may multiplex carrier，但logical protocol独立；
7. Event no-binding fail-fast；binding recovery no replay/no reattach；
8. Renderer/Data reload/reconnect不reset State/Event Session services；
9. Hub fatal只报告 Session-fatal fact，Main提交 terminal/unwind；
10. Desktop/PWA physical不同但 Session Events observable semantics必须等价；
11. Platform不建立 generic EventBus/ChannelRegistry/SessionCoordinator mega-abstraction。