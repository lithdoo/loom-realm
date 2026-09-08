# LoomRealm 系统架构总览

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：顶层 logical roles、Game/Launcher/Main bootstrap boundary、状态所有权、运行承载、Web presentation projection、Platform Composition 与主要 authority/lifecycle 关系  
> 依赖：[产品设计总览](../00-overview/product-vision.md)、[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)、[ADR 0031](../decisions/0031-business-owned-web-component-projection.md)、[Web Presentation Config v1](../15-contracts/web-presentation-config-v1.md)  
> 被以下文档细化：[平台组合系统](./platform-composition-system.md)、[运行承载系统](./runtime-hosting-system.md)、[运行时启动系统](./runtime-bootstrap-system.md)、[栈式运行系统](./stack-runtime-system.md)、[通信系统](./communication-system.md)、[渲染系统](./rendering-system.md)、[Subsystem 模型](./subsystem-model.md)  
> 最近复核：2026-09-08

本文只描述 system-level responsibility / authority / topology。精确 wire、transaction、error、limit、conformance 由 `15-contracts` 与对应 milestone closure定义。

---

## 1. Bootstrap Boundary vs Runtime Roles

Game Package 不是 Runtime role。

Runtime bootstrap boundary：

```text
Game installation / source
        ↓
matching Platform Launcher PREPARE
    ├── @loomrealm/game-package
    ├── current Platform Launch Manifest
    ├── exact join
    ├── executable/security/capability preflight
    └── immutable PlatformLaunchPlan
        ↓
Prepared current-platform game
    ├── LogicalGameBootstrap
    └── plan-bound RuntimeHosting
        ↓
apps/* composition
```

Web presentation bootstrap是独立 product startup input：

```text
user-selected WebPresentationConfigV1
→ current prepared Content resource resolution
→ Renderer Window bootstrap
```

Platform-neutral Runtime/application roles：

```text
LoomRealm Main
├── Session / Runtime authority
├── Frame / Stack / Activation
├── InputTarget
├── transaction/failure unwind
└── DataAuthority

Subsystem Runtime
├── business state
├── local Frame/Input Context
├── Interest[F]
└── Render Domain authoritative state

Renderer
├── read-only Main authority mirror
├── Data connections
├── Input producers/gating
├── Render replica
└── thin Web projection

Readonly Content Service
```

Web physical presentation再区分：

```text
Web Projector
    → Renderer-owned mechanical physical projection

Business Custom Elements
    → business-owned concrete presentation/layout
    → read-only consumer of LoomRealm projected state
```

因此：

```text
Game Package capability != Runtime role
GameEntryV1 != Main state model
Render replica != business Custom Element implementation
WebPresentationConfigV1 != Game topology / executable manifest
```

---

## 2. Main-facing Logical Bootstrap

Main 不解析 `game.json`，不 import `@loomrealm/game-package`。

Main 只接收 full PREPARE 后的 logical projection：

```ts
interface LogicalGameBootstrap {
  readonly subsystemKeys: readonly string[];
  readonly initial: {
    readonly subsystemKey: string;
    readonly input: JsonValue;
  };
}
```

它只表达 complete logical key set、initial logical target 与 initial business JsonValue。

它不表达 formatVersion、ValidatedGameEntry brand、module/path/URL、Platform manifest、Node/Worker/Runner、PlatformLaunchPlan、Web Presentation Config或 Content credential。

Main 通过独立 Main-facing Platform port 使用 plan-bound `RuntimeHosting`。

---

## 3. Platform / App Composition

Platform/app composition负责真实 physical Session realization：

```text
matching Game Launcher / executable PREPARE
Runtime Hosting / Supervision
Main ⇄ Subsystem Control binding
Renderer Hosting
Main ⇄ Renderer Control binding
Renderer ⇄ Subsystem DataConnectionBroker
late Data provisioning
Content Binding
Web Presentation Config acquisition/resolution
Renderer Window presentation bootstrap
physical startup/shutdown
```

Hostra：

```text
launch.hostra.json
Node Runner Process
WebSocket
BrowserWindow
Runner provisioning IPC
HTTP/fs
```

PWA：

```text
launch.pwa.json
Dedicated Worker Runner
MessagePort/MessageChannel
Window
Worker provisioning
Service Worker/Fetch/OPFS
```

Physical ownership不会提升成 Main/Subsystem/Renderer application authority，也不会让 Platform拥有具体业务 Custom Element语义。

M13 current presentation startup已经冻结：

```text
user-selected Window-level WebPresentationConfigV1
→ ordered styles/scripts from current prepared Content
→ <link rel="stylesheet"> / classic <script>
→ business customElements.define(...)
→ window.onload
→ Web Projector starts
```

该模型不扩张 Launcher Runtime PREPARE、Game Entry或 LogicalGameBootstrap。

---

## 4. Game Entry / Platform Executable / Presentation Config

Game Entry v1：

```ts
interface SubsystemDescriptorV1 {
  readonly key: string;
}
```

Current Platform独立声明：

```text
Hostra Launch Manifest
    key → Hostra Definition Module

PWA Launch Manifest
    key → PWA Definition Module
```

Phase 1：

```text
keys(Game Entry) = keys(Current Platform Launch Manifest)
```

```text
subsystemKey = application identity
module/path/URL = Platform executable material
```

Web Presentation Config独立回答另一个问题：

```text
WebPresentationConfigV1
→ whole Renderer Window scripts[] / styles[]
→ M12 namespace + hierarchical resource key
```

它没有 `subsystems`，不建立 `subsystemKey → presentation resource` binding。

Business Definition与 Web presentation implementation保持 execution/authority boundary；两者都不把 arbitrary module path/URL或 loader capability写进 RenderNode。

---

## 5. Parse → Plan → Commit

Matching Launcher 的 Runtime PREPARE 是完整 transaction：

```text
obtain/read Game Entry
→ validate via @loomrealm/game-package
→ validate current Platform Launch Manifest
→ exact key-set join
→ resolve every required executable binding
→ installation/security containment
→ hosting capability preflight
→ freeze immutable PlatformLaunchPlan
→ project immutable LogicalGameBootstrap
────────────────────────────────────────────
first business Runtime side effect may begin
```

任何 PREPARE failure：

```text
Process/Worker creation = 0
business Definition import = 0
Runtime Control establishment = 0
```

Presentation startup不加入这个 executable join。成功 PREPARE后的 current prepared Content view与用户指定的 Web Presentation Config共同形成 `PreparedWebPresentation`，然后由 Renderer Window bootstrap消费。

不得依赖 Render tree到达后从业务 data拼接 arbitrary module URL。

---

## 6. Runtime / Runner

每个 `subsystemKey` 同时最多一个 active Runtime Container。

Physical entry：

```text
Hostra → Host-owned Node Runner Process
PWA    → Host-owned Worker Runner
```

Runner：

```text
verify planned key/binding
→ import exact selected Definition Module
→ validate SubsystemDefinitionFactory
→ construct role-local capabilities
→ enter @loomrealm/subsystem/host
```

Business Web presentation implementation不进入 Subsystem Runner，也不能获得 business Runtime object reference。

---

## 7. Main Runtime Authority

Main 创建 Launch Attempt 后只发：

```text
RuntimeHosting.launch(subsystemKey, LaunchAttemptMaterial)
```

Main 不持有 module/path/URL、Node executable/argv/env、Worker target/options、Runner entry、Control endpoint/MessagePort或 presentation material。

Runtime lifecycle：

```text
launch
!= physical container created
!= connected
!= identified
!= ready
```

`stopped` 只来自 actual physical termination observation。

No automatic restart；新的 Runtime = fresh Launch Attempt + fresh physical/control lifetime。

---

## 8. Runtime Control

当前：

```text
Subsystem Control v1
+ Frame / Call v1
= Runtime Control Application Profile v1
```

```text
ready != Data current
ready != Renderer exists
ready != Web presentation ready
```

Control carrier loss在无 shutdown intent时进入 Runtime failure；same-attempt Control reconnect不存在。

---

## 9. Frame / Activation

Main 唯一拥有 frameId、Frame→subsystemKey、caller、lifecycle/outcome、Stack、activationId、InputTarget、transaction/recovery。

核心 transaction barrier：

```text
Response-before-dependent-RPC
ACK-before-publication
post-commit no rollback
```

Frame mutation outcome：

```text
Success        → known commit
Explicit Error → protocol-defined known no-commit/fatal
Timeout/loss   → ambiguous → Runtime failure
```

No retry/replay ambiguous mutation。

Failure unwind root/order由 Main 计算，Platform/Runner/SDK/Renderer/WC不得自行替代。

---

## 10. Renderer Control

Main 向 Renderer 发布 committed authority snapshot：

```text
Runtime projection
Frame Stack / Activation
InputTarget
DataAuthority {
    subsystemKey,
    generation,
    dataProfile
}
```

Snapshot 不携 Data endpoint/ticket/MessagePort、PlatformLaunchPlan/module、Interest Registry、Render state、Web Presentation Config或 Content credential。

Renderer只复制 authority，不 mint/recover authority。

---

## 11. Renderer Data

Current profile：

```text
loomrealm.renderer-data/1
= Data Connection v1
+ User Input v1
+ Render Update v1
```

Data Connection identity：

```text
Session + current Renderer + subsystemKey + generation
```

```text
Data loss != Runtime failure
Data loss != Frame unwind
same generation/profile MAY sequential reconnect
profile change MUST fresh generation
```

Platform DataConnectionBroker只实现 physical carrier；generation/profile仍属于 Main authority。

---

## 12. User Input

```text
Effective(F,A,C)
=
current matching Data
∧ Main InputTarget(S,F,A)
∧ current active Activation
∧ C ∈ Interest[F]
∧ Producer(C)
```

Authority：Main InputTarget。  
Configuration：Subsystem `Interest[F]`。  
Physical producer：Renderer。

fresh Activation可以复用 Interest config，但不能复用 old Input State/Event。

Business WC的 DOM focus/event不创建 Input authority；physical event如需进入游戏，必须通过 frozen `RendererInputSource` gate。

---

## 13. Render Replication vs Thin Web Projection

Subsystem拥有 `0..N` Render Domains authoritative state。

```text
Frame close != Render Domain destroy
Frame suspend != Render hide
Data carrier loss != authoritative Render destroy
```

fresh Data carrier通过 current Registry + fresh Snapshot重建 Renderer replica baseline。

M11关闭：

```text
business Render authority
→ Render Update
→ committed Renderer Store
```

M13关闭：

```text
Renderer Store successful atomic commit
→ package-private post-commit notification/effect
→ thin Web Projector
→ document.body / business-owned WC instances
```

Web projection：

```text
key      → stable HTMLElement identity
tag      → business-owned WC name
attrs    → Renderer-managed host attrs
data     → optional receiveRenderData(complete readonly snapshot)
children → Renderer-managed ordered light DOM
```

一次 committed change的 physical order：

```text
structure / children
→ attrs
→ receiveRenderData(...)
```

Top-level roots直接进入 `document.body`。M13不建立 per-Domain wrapper、generic CSS layer、automatic z-index、cross-Subsystem stacking manager或 layout engine；actual layout/position/stacking由 business WC/CSS负责。

M13不建立第二份 desired projection tree authority；必要 keyed physical reconciliation只用于保持 same live key → same HTMLElement。

M13也不定义 RenderEvent → WC/DOM event ABI。

---

## 14. WC Read-only Boundary

Business WC对 LoomRealm projected state只有读取权：

```text
Element identity/tag
managed host attrs
Render data
managed light-DOM children/order
```

WC可以写自己的 private fields、Shadow DOM、Canvas/WebGL、decoded resources、animation/cache和 layout state。

M13不使用 MutationObserver或其他 policing机制检测/修复业务对 managed DOM的违规 mutation：

```text
Renderer Store remains authoritative
DOM is never adopted back into Store
presentation-local behavior after violation is not guaranteed
```

这是 authority/API contract，不是 hostile-code sandbox。

---

## 15. Content / Execution / Presentation Boundary

必须区分：

```text
Platform executable resolver/Runner capability
Readonly Content capability
Web presentation bootstrap physical binding
Business Web presentation implementation
Render projection mutation capability
```

M12 ResourceClient负责 Renderer trusted logical resource + expected version → bytes。

Presentation bootstrap同样从 current prepared Content/FSDB logical identities出发，但由 trusted composition私下绑定为 browser `<link href>` / `<script src>`；business config/WC不获得 filesystem path、bearer、privileged URL或 resolver capability。

Business WC runtime resource usage仍不得绕过 M12 credential/version boundary。

---

## 16. Messaging Model

当前 message-oriented Control/Data profiles统一：

```text
one carrier application unit
= one UTF-8 JSON text string
```

因此：

```text
WebSocket text message
MessagePort postMessage(string)
MemoryCarrier string
```

Structured Clone只用于 Platform bootstrap/Port transfer。

Web projection是 Renderer-local physical realization，不增加 network/wire profile。

---

## 17. State / Dependency Ownership

```text
Game Package capability
    validates Game Entry document

Platform Launcher
    owns Runtime executable PREPARE / PlatformLaunchPlan

Platform/app composition
    owns physical Window/Content/presentation bootstrap binding

Main
    Session/Runtime/Frame/Activation/InputTarget/DataAuthority

Subsystem
    business state / Interest[F] / Render Domains

Renderer Store
    current authoritative Render replica

Web Projector
    mechanical Store → DOM projection

Business Web Component
    read-only projected Render state
    private presentation/layout implementation state
```

禁止：

```text
main → game-package / concrete game-launcher-*
business Definition → game-package / launcher / renderer / browser
business WC → Render Store writer / Data carrier / Content credential
Renderer → DOM reverse-sync into Store
RenderNode → arbitrary module URL / loader capability
game-package → launcher/Main
```

允许：

```text
launcher → game-package
apps/* → matching launcher + roles + adapters
business Web presentation implementation → browser APIs + explicitly granted presentation integration seam
```

Business build/package可以自由产出最终 JS/CSS；runtime source由 `WebPresentationConfigV1` 中的 current installation resource refs确定。

---

## 18. Phase 1 Route

```text
M10 User Input                    closed
M11 Render Replication            closed
M12 Content                       closed
M13 Web Presentation Projection   pending
M14 loom.map                      pending
M15 Desktop full E2E              pending
M16 PWA Runtime                   pending
M17 PWA full E2E/equivalence      pending
```

M13先关闭 Window-level presentation bootstrap + thin Store→body projection，再让 M14 map业务及其自有 WC成为首个真实 consumer。

---

## 19. Core Invariants

1. Game Package不是 Runtime role；
2. Game Entry document model与 Main bootstrap model分离；
3. matching Launcher是 Runtime-product Game Entry consumer；
4. Main不依赖 Game Package或 concrete Launcher；
5. Descriptor v1精确 `{key}`；
6. executable binding由 current Platform Launch Manifest拥有；
7. Phase 1 Game/Platform key set严格相等；
8. immutable PlatformLaunchPlan + LogicalGameBootstrap在任何 business Runtime side effect前闭合；
9. Web Presentation Config是独立 product startup input，不进入 Launcher manifest/Main/Render；
10. WebPresentationConfigV1只有 Window-level `scripts/styles`，没有 `subsystems`；
11. Desktop presentation resources从 current prepared installation唯一 FSDB/Content view解析，用户不单独指定 FSDB；
12. browser bootstrap使用 ordered `<link>` / classic `<script>`，`window.onload`是 Projector start barrier；
13. Main launch intent只携 logical key/Launch Attempt material；
14. Host-owned Runner是 physical Runtime entry；
15. Frame/Stack/Activation/recovery authority = Main；
16. ambiguous Frame mutation Runtime-fatal/no retry；
17. DataAuthority = subsystemKey + generation + dataProfile；
18. Broker只实现 physical carrier；Data provisioning/loss不等于 Runtime/Frame failure；
19. Render lifecycle独立于 Frame/Data carrier；
20. M11 Render replica与 M13 Web projection是不同 closure；
21. concrete Custom Elements由业务拥有；
22. top-level roots直接进入 `document.body`；LoomRealm不拥有 generic layout/stacking framework；
23. data通过 optional `receiveRenderData(complete readonly snapshot)`投递；projection order = structure → attrs → data；
24. Business WC对 projected state只读；M13不做 MutationObserver policing；DOM不是 Render authority source；
25. Store只在 successful atomic commit后通过 package-private seam通知 Projector；Projector不直接消费 raw Render wire；
26. M13不定义 RenderEvent → WC/DOM event ABI；
27. Business WC不得绕过 M12 Content credential/version boundary；
28. message-oriented profiles统一 UTF-8 JSON text；
29. Hostra/PWA共享 logical/browser-visible Web presentation semantics，但不比较 physical executable/storage/href-src binding trace。
