# LoomRealm 系统架构总览

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Stable  
> 主要定义：logical roles、authority/currentness、bootstrap、state/events/render/content placement 与 platform composition  
> 依赖：[产品总览](../00-overview/product-vision.md)、[文档治理](../00-overview/document-governance.md)  
> 细化：[框架与应用验证边界](./framework-validation-boundary.md)、[平台组合](./platform-composition-system.md)、[运行承载](./runtime-hosting-system.md)、[Shared State](./shared-state-system.md)、[Session Events](./session-events-system.md)、[渲染](./rendering-system.md)、[Subsystem](./subsystem-model.md)、[存储](./storage-system.md)  
> 最近复核：2026-10-30

本文描述 Current system-level responsibility / authority / topology。精确 wire、ABI、error、limit 与 conformance semantics 由 [正式契约](../15-contracts/README.md) 拥有；实现位置由 [模块文档](../20-modules/README.md) 拥有；qualification 规则由 [30-development](../30-development/qualification.md) 拥有。

## 1. Logical roles

| Role | Authoritative responsibility | 明确不拥有 |
| --- | --- | --- |
| Game Package | logical installation document validation | runtime authority / executable host |
| Platform Launcher | current-platform PREPARE、binding、preflight | business semantics |
| Main | Session / Runtime / Frame / Activation / InputTarget / DataAuthority / failure unwind | shared business state / DOM |
| Shared State | session shared mutable Records、versions、OCC、commit revision | Frame/InputTarget / persistence policy |
| Session Events | Session-scoped transient exact-channel routing / bounded serial delivery | business truth / history / RPC / control flow |
| Subsystem | domain execution、local business state、Input Interest、Render Domains | platform host / Renderer replica |
| Renderer | current readonly replica、Input producer gate、presentation projection inputs | authoritative game state |
| Content | readonly prepared installation definitions/resources | mutable session state |
| Platform composition | Process/Worker/Port/Window/Service Worker wiring | second application authority |

核心原则：**single authority partition**。物理共置不等于逻辑 owner 合并。

Session Events 是“有 infrastructure owner 但不是 business authority”的角色：`SessionEventHub` 只拥有 exact-channel routing、subscription lifetime、serial/bounded delivery 等 mechanics，不拥有事件所描述的业务事实。

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
→ Shared State READY + SessionEventHub READY
→ Runtime-scoped State/Event client capabilities
→ first business Runtime side effect
```

Main 不解析 installation document，也不接触 executable path/URL/module binding。Shared State bootstrap material 与 `LogicalGameBootstrap` 平级，不塞进 Main control model。SessionEventHub 同样由 Session composition 构造/承载，不进入 Main control state，也不创建第二份 Session authority；它没有 Game event history/bootstrap payload。

Web presentation bootstrap独立于 logical game/runtime bootstrap；Window/document lifecycle、CSP/origin、prepared Content binding 属于 concrete platform composition。

## 3. Main、Shared State 与 Session Events

```text
Main                           Shared State                     Session Events
Control Authority              Business State Authority        Transient Distribution
Session/Runtime/Frame          Records / versions              exact-channel routing
Activation/InputTarget         OCC / global commit revision    subscriptions
DataAuthority                  subscriptions                   serial bounded delivery
failure unwind                 mutation result                 no business truth
```

Shared State operation 不创建、消费或验证 Frame/Activation/InputTarget authority。Shared State fatal 可以报告 Session-fatal fact，但 **Main 唯一提交 Session terminal 与 Runtime/Frame unwind**。

Session Events 同样不创建、消费或验证 Frame/Activation/InputTarget authority。`SessionEventHub` invariant fatal MUST self-terminal before reporting Session-fatal fact；仍由 Main / Session lifecycle owner 提交 terminal/unwind。

State / Event placement rule：

```text
需要表达“当前 authoritative business fact 是什么”
→ Shared State（目标命名 Shared State）

需要表达“Session 中刚刚发生了什么”且允许 late subscriber 不看历史
→ Session Events

需要表达 RenderDomain 的 transient presentation intent
→ render.event
```

如果 restarted / late-joining Runtime 必须知道某信息，它不能只存在 Session Events；该信息必须由 Shared State、Main、Content 或其他明确 authority 持有。

Session Events v1 的核心 author model：

```text
publish(channel,type,payload)
subscribe([exactChannel...],listener) → Promise<live subscription>
subscription.closed → closed | overflow | binding-terminal | client-terminal | hub-terminal
subscription.close() → synchronous local revoke
```

固定语义：

```text
channel = only v1 Hub routing key
type = business discriminator, not routing filter
'/' = ordinary channel text, no hierarchy semantics
source.subsystemKey = framework-derived Runtime identity
one accepted event = at most one delivery per matching subscription
one subscription = one serial listener lane
zero matching subscribers = publish success
self-delivery = allowed
```

Slow consumer如果无法继续保持 bounded delivery，该 subscription 显式 `overflow` terminal；不会 silent drop while healthy，也不会 retroactively fail accepted publisher。

Save/Load 是 business workflow，不是 Shared State lifecycle authority：业务 Subsystem 自行读取/解释 persistence data，再使用普通 SharedStateClient read/commit。

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

这条 Data path 使用单 reader / serialized writer；每个 Carrier、Runtime send queue 与 RenderManager pending-work queue 都必须有有限的本地容量预算。资源预算耗尽属于 Data-local resource failure：入站候选状态不部分提交，当前 Data carrier 退休后通过 fresh Registry + Domain Snapshots 恢复；它不是 peer schema/protocol violation，也不自动升级为 Runtime / Frame failure。具体容量由 Host / Product composition 决定，不改变 `/3` wire identity。

DOM/Web Component 私有状态不得 reverse-sync Renderer Store，更不得成为 Main/Shared State/Subsystem authority。

`RenderDomain.emit()` 的 Render Event 继续属于 presentation-oriented transient intent；它不进入 Session Events plane，也不自动跨 Subsystem fan-out。需要跨 Subsystem 的业务通知时必须显式使用 Session Events。

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
    SharedStateAuthority
    SessionEventHub
    RuntimeHosting
    Content/Data/Renderer composition
        ↓
Runner → Subsystem Runtime
```

External Hostra 是 outer physical owner；LoomRealm Desktop 是 plain Node product composition。Hostra RPC 是 host-control boundary，不成为 game/runtime application protocol。

SessionEventHub MAY later split into dedicated process without changing author/protocol semantics。

### PWA

```text
Window
    Renderer / Input / Viewport / Presentation
        ↕
Session Worker
    Main + Shared State + SessionEventHub
        ↓
Dedicated Subsystem Workers

Service Worker
    Content / executable / runtime-info physical boundary
```

PWA 也 MAY 把 Event Hub 放到独立 Worker。PWA 的 worker/port/origin/generation fencing 属于 PWA profile；不能把 browser-specific mechanics 提升为 universal runtime ABI。

State 与 Events MAY separate carriers，也 MAY multiplex one Session-service physical carrier；共享 carrier 不创建 shared authority、transaction、revision、retry 或 public cross-plane ordering。

Session Events 在 Desktop/PWA 可以使用不同 physical carrier，但必须保持同一 logical observable semantics；Process、Worker、Port、socket identity 不进入 business event identity。

## 7. Failure 与 lifetime

- Data carrier loss != Runtime/Frame failure；
- Data local resource-budget exhaustion != peer protocol violation：不 partial commit，退休当前 Data carrier，并由 fresh baseline 恢复；不自动 unwind Runtime / Frame；
- Renderer reload != Shared State / Session Events reset；
- presentation/bootstrap error 默认 Window-local，不 rollback authoritative state；
- Shared State binding loss终止旧 physical subscription，但不自动 fail still-live Runtime logical client；
- Session Events binding loss使旧 subscriptions `binding-terminal`，但不自动 fail still-live Runtime logical client；fresh binding 不 replay missed history且需要 fresh subscribe；
- no usable Event binding 的新 publish/subscribe fail-fast `BINDING_UNAVAILABLE`，不等待 reconnect；
- Session event listener throw/rejected thenable 必须 subscriber-local isolate；subscription默认继续下一条；
- Session Event subscriber overflow → subscription `closed(reason="overflow")`，accepted publish保持 accepted；
- ambiguous State mutation / Event publish result 不自动 retry；
- Runtime terminal 使该 Runtime 的 state/events/data capabilities terminal/inert；Event subscriptions `client-terminal`；
- Session/Hub terminal 使 Event subscriptions `hub-terminal`；
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
Renderer → direct Shared State authority
Shared State → Main Frame/Activation/InputTarget authority
Session Events → Main Frame/Activation/InputTarget authority
Session Events → direct Shared/Shared State mutation authority
DOM → Store reverse authority
runtime business code → tools/*
```

## 9. Current capability map

```text
Launch / Hosting       Game Package + Platform profiles + RuntimeHosting
Control                Main + Runtime Control + Frame/Call
Shared business state  Shared State (target rename: Shared State)
Cross-domain events    Session Events v1
Data / Input / Render  Renderer Data + Input + Render Update + Viewport
Presentation           Web Presentation Config/API + business WC
Content                Content API + FSDB/PWA physical realizations
Game domain            game-libs/map and other game libraries
Products               Desktop/Hostra + PWA
```

这些是长期 capability，不是项目阶段。新的实现工作按 capability impact 与 qualification subject 管理。

## 10. Final invariants

1. 一个 application authority 只有一个 owner；
2. SessionEventHub 只拥有 transient routing/delivery mechanics，不成为 business authority；
3. platform composition 只做 physical assembly/wiring/disposal；
4. first business Runtime side effect 发生前 PREPARE + Shared State READY + SessionEventHub READY；
5. Main bootstrap 不包含 platform executable material、Shared State business payload 或 Session event routing state；
6. Shared State、Session Events 与 Renderer Data 拥有独立 lifetime/currentness；
7. Session Events exact-channel only；type 不参与v1 filtering；source由 Runtime binding派生；
8. Session Event subscribe只返回live handle，terminal通过`closed`可观察；one subscription one serial listener lane；
9. Session Event overflow显式terminal，不silent drop，不retroactively fail accepted publisher；
10. Session Event publish acceptance != subscriber handler success != Shared State consequence commit；
11. no-binding新 Event operation fail-fast；binding recovery no replay/no old subscription reattach；
12. late subscriber 不依赖 Session Events replay 来恢复 authoritative state；
13. Renderer/DOM 只投影 authoritative state，不反向取得 authority；
14. Content readonly、State mutable、Event transient、Render replica/presentation intent边界不能混合；
15. State/Event可以共进程、共carrier，但不共享authority/transaction/revision/order；
16. Desktop/PWA physical topology 可以不同，但 logical contract 与 observable outcome 必须一致；
17. current architecture 不从历史 qualification ledger 推导；
18. 行为或 qualification-input 改变后，PASS 只对重新确定的 subject 有效；
19. `Frozen != Implemented != Qualified`；
20. 框架默认只强制执行自身运行、协议兼容和资源安全所必需的 Runtime Guard；应用业务正确性归开发者，额外 Strict Validation 必须 opt-in；
21. 对可信应用数据优先 operation-first / error-first，失败 candidate 不得部分提交；
22. 不得静默修改正式 Contract；numeric resource budgets 属于 Host / Product / Runtime 本地策略，可经显式配置、诊断和资格验证调整而不改变 wire identity/version；只有 wire-observable schema 或 semantics 变化才必须版本化；
23. 不得仅为严格验证而默认深复制、深冻结或全量扫描与当前操作无关的应用数据；但现有 API 要求的 ownership isolation 必须保留，并将必要复制/冻结与验证和计量融合。
24. Data queue / retained work / candidate / serialization 必须有有限 local resource budgets；资源耗尽与协议错误分开，且不改变 wire ABI。