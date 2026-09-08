# PWA Composition 设计

> 层级：模块设计  
> 状态：M16 Runtime Vertical Planned / M17 Full E2E Planned  
> 稳定程度：Architecture Evolving / Renderer Control Dependency Frozen / M13 Web projection target shared  
> 主要定义：PWA Platform Composition realization：PWA Launcher-owned Game PREPARE、Worker Runner、Runtime Control MessagePort，以及 M17 Renderer Control/Data/Content/Web presentation full physical realization  
> 依赖：[平台组合系统](../../10-architecture/platform-composition-system.md)、[渲染系统](../../10-architecture/rendering-system.md)、[ADR 0026](../../decisions/0026-session-scoped-platform-instance.md)、[ADR 0027](../../decisions/0027-freeze-renderer-control-v1-preimplementation.md)、[ADR 0031](../../decisions/0031-business-owned-web-component-projection.md)、[Web Presentation Config v1](../../15-contracts/web-presentation-config-v1.md)、[Game Package v1](../../15-contracts/game-package-v1.md)、[PWA Game Launcher / Worker Subsystem Runner Profile v1](../../15-contracts/pwa-launcher-profile-v1.md)、[Runtime Control Profile v1](../../15-contracts/runtime-control-profile-v1.md)、[Renderer Control v1](../../15-contracts/main-renderer-control-v1.md)、[Renderer Data Profile v1](../../15-contracts/renderer-data-profile-v1.md)  
> 最近复核：2026-09-08

本文描述完整 PWA Platform Composition target，不是 `@loomrealm/platform-pwa` mega-package。M16只关闭 PWA Runtime/Worker vertical；M17才关闭 Renderer Control + Data Broker/bindings + Content + M13 Web presentation + full cross-platform equivalence。

---

## 1. Milestone Shape

### M16 Runtime Vertical

```text
apps/pwa / product entry
→ session-scoped PwaPlatform
→ PwaPlatform.prepareGame(...)
→ @loomrealm/game-launcher-pwa PREPARE
→ PwaLaunchPlan installed privately + LogicalGameBootstrap
→ runMain({bootstrap, platform})
→ RuntimeHosting
→ Host-owned Worker Runner
→ Runtime Control MessagePort
→ @loomrealm/subsystem/host
```

M16 does not claim Renderer Control/Data/Content/Web presentation full physical composition。

### M17 Full PWA Target

```text
M16 Runtime vertical
+
user-selected WebPresentationConfigV1
+
Window/Web Renderer bootstrap document
+
M7 Frozen RendererControlBinding physical realization
+
Renderer Control MessagePort
+
PWA DataConnectionBroker / MessageChannel
+
RendererDataBinding + SubsystemDataBinding provisioning
+
User Input + Render Update
+
M13 <link> / classic <script> / window.onload bootstrap
+
M13 document.body thin Web Projector
+
business-owned Custom Elements
+
Fetch / Service Worker / OPFS Content
→ full PWA E2E
→ cross-platform logical equivalence
```

PWA physical ownership never becomes Frame/Activation/InputTarget/DataAuthority/Renderer-currentness/Render projection authority。

---

## 2. PWA PREPARE / Presentation Input

Product bootstrap caller调用 `PwaPlatform.prepareGame(...)`；PwaPlatform内部调用 PWA Launcher component：

```text
obtain Game Entry
→ @loomrealm/game-package validate
→ validate launch.pwa.json
→ exact Game↔PWA key-set join
→ resolve selected-installation executable modules
→ same-origin/trusted-installation/security preflight
→ validate Worker/Runner capability
→ freeze PwaLaunchPlan
→ project LogicalGameBootstrap
```

Any PREPARE failure：

```text
Worker create = 0
business module import = 0
Runtime Control establish = 0
```

`apps/pwa` MUST NOT duplicate Game Package schema validation or PWA manifest/join semantics。

M17 presentation input遵循 M13 current model：用户在 product startup另行选择 `WebPresentationConfigV1`。它不进入 `launch.pwa.json`、PwaLaunchPlan或 LogicalGameBootstrap。

presentation module/path/URL/loader capability也不进入 RenderNode。

---

## 3. Main Installation Boundary

Main receives only：

```text
LogicalGameBootstrap
+
Main-facing narrow capability view
```

Main does not receive GameEntry/formatVersion/PwaLaunchPlan/module URL/Worker/Port/presentation implementation details。

Main-facing logical shape remains：

```text
DeadlineScheduler
OpaqueMaterialGenerator
RuntimeHosting
RendererControlBinding?   // optional; PWA physical realization arrives M17
```

M16 PWA Runtime-only provider MAY omit `rendererControl` entirely；no fake Binding。

---

## 4. Worker Runner — M16

Dedicated Worker physical entry：

```text
Host-owned Worker Runner
```

Business module：

```text
PwaLaunchPlan[key].module
= selected-installation Definition Module
```

Runner capability growth：

```text
M16 RuntimeControlBinding
M17/M8-derived SubsystemDataBinding provisioning
M17/M12-derived ContentClient realization as required
```

Business module不得创建 Worker、寻找 bootstrap Port、读取 launch manifest或分支 PWA business semantics。

Business Web presentation implementation不进入 Worker Runner；它运行在 Window/Web Renderer side。

---

## 5. PWA Host Policy

`launch.pwa.json` MAY select installation business artifact，但不得控制 Host-owned Worker Runner entry、arbitrary Worker constructor options、bootstrap/Runtime Control/Data MessagePort、credential material、CSP/same-origin policy、Service Worker authority或 arbitrary resource/timeouts。

M17 presentation implementation必须遵循 M13冻结的 WebPresentationConfig + browser bootstrap model；`launch.pwa.json`不选择 presentation JS/CSS。

Render data不得携 arbitrary module URL动态 import。

---

## 6. Runtime Bootstrap — M16

```text
PwaLaunchPlan frozen
→ Main creates Launch Attempt/bootstrap credential
→ RuntimeHosting looks up plan[key]
→ create Worker Runner
→ Runner imports exact planned module
→ Runtime Control MessagePort
→ subsystem.hello / identified / initialize / ready
```

```text
plan valid != Worker created != module loaded != connected != identified != ready
ready != Renderer exists
ready != Data current
ready != Web presentation ready
```

Unexpected Worker/Control loss remains Runtime failure；same-attempt Control reconnect不存在。

---

## 7. Runtime Control MessagePort — M16

```text
postMessage(string)
= one UTF-8 JSON text JSON-RPC application object
```

Structured Clone只用于 Platform bootstrap/Port transfer，不形成第二套 application value model。

---

## 8. Renderer Hosting / Control — M17

Window creation/show/reload belongs to concrete PWA composition；M7 does not define a Core `RendererHosting` service。

Frozen candidate path：

```text
Main arms RendererControlBinding.acquire(T, signal)
→ PWA composition waits for/binds at most one Window Renderer candidate
→ exact Main-issued T delivered through secure bootstrap
→ Renderer Control MessageChannel/MessagePort established
→ acquire resolves one MessageCarrier<string>
→ renderer-control peer handles renderer.hello/version
→ Main atomic acceptance grants current Renderer
```

Binding does not authenticate token、negotiate protocol version或 decide currentness。

Renderer Snapshot never carries Data MessagePort/transfer object/credential/PwaLaunchPlan/module URL/presentation implementation locator。

---

## 9. DataConnectionBroker — M17 Physical Realization

M8 freezes role/Data authority semantics；M17 must supply PWA physical realization：

```text
Main DataAuthority(S,G,P)
→ PWA DataConnectionBroker
→ create MessageChannel
→ bind exact Session/current Renderer/S/G/P
→ transfer Renderer endpoint
→ provision Subsystem endpoint to target Worker Runner
→ paired current Data Connection install
```

Broker不拥有 generation/profile/current Renderer authority。

Same S/G/P MAY sequentially reconnect with fresh MessageChannel；stale/duplicate endpoint cannot become current。

---

## 10. Worker Provisioning Path

Worker Runner needs a Platform-private path distinct from Runtime Control/Data application carrier。

MAY carry fresh Data endpoint for exact current S/G/P 与 revoke/supersede physical material。

It is not Subsystem Control、Frame、Renderer Control、Renderer Data application protocol或 business RPC。

Provisioning failure本身 != Runtime failure / Frame unwind / DataAuthority mutation。

---

## 11. Renderer Data / Input / Render — M17 Composition

Renderer Data Profile：

```text
loomrealm.renderer-data/1
= Data Connection v1 + User Input v1 + Render Update v1
```

Data application carrier：

```text
postMessage(string)
= one UTF-8 JSON text child-protocol object
```

One Data dispatcher demux input/render。

Fresh Data carrier requires fresh Input/Render baselines according to M10/M11 semantics；Frame/Data/Render lifecycles remain independent。

---

## 12. Web Presentation — M17 Physical Realization

PWA Window必须复用 M13关闭的 logical/browser-visible semantics：

```text
WebPresentationConfigV1 = Window-level scripts/styles
styles → ordered <link rel="stylesheet">
scripts → ordered classic <script>
window.onload → Web Projector start barrier
business JS → customElements.define(...)
top-level roots → document.body
same live key → same HTMLElement instance
attrs → Renderer-managed host attributes
data → optional receiveRenderData(complete readonly snapshot)
children → Renderer-managed ordered light DOM
projection order → structure → attrs → receiveRenderData
```

M13不建立 generic Domain layer/stacking framework；business WC/CSS拥有 layout/position/stacking。

Business WC对 projected state只有读取权，但 PWA/Hostra都不需要 MutationObserver policing；DOM violation永远不反向成为 Store authority，违规后的 presentation-local后果不保证。

M13不定义 RenderEvent → WC/DOM event ABI；PWA不得自行增加一个平台专属 mapping。

PWA不得因为 framework/tooling差异引入第二份 LoomRealm projection tree authority。业务 WC内部 UI framework可以不同。

---

## 13. Content — M17 Physical Realization

PWA full closure must include：

```text
same-origin Fetch
Service Worker
OPFS / Cache Storage as product implementation requires
```

These implement logical readonly Content API only。Definition Module executable loading remains trusted Launcher/Runner capability。

Presentation bootstrap resources继续使用 M12 logical `namespace + resourceKey` identity；PWA composition负责把 current prepared logical resource可信地绑定成 browser `<link href>` / `<script src>` 可加载位置，但不得把 credential/resolver暴露给 business WC。

Business WC不得获得 arbitrary filesystem/path/credential；runtime presentation resource access必须保持 M12 logical identity/version semantics。

M17 cannot claim full PWA E2E if Renderer Control exists but Data/Content/Web projection physical realization is still absent。

---

## 14. Composition Root

`apps/pwa` is final composition root and MAY combine current-platform packages/adapters as milestones land；Main/business Definition never depend on concrete PWA implementation。

Business Web presentation implementation由业务提供；PWA composition只负责 M13冻结的 config/resource/browser bootstrap与 Window hosting，不拥有具体 WC semantics或 business layout authority。

---

## 15. Cross-platform Equivalence — M17

Compare same logical/business-observable：

```text
Game topology / LogicalGameBootstrap
Runtime lifecycle
Frame/Activation/outcome/unwind
Renderer authority/replacement
Data S/G/Profile/currentness
Input delivered semantics
Render authoritative replica
Content logical response
WebPresentationConfig logical resource lists
<link>/classic <script>/window.onload startup semantics
document.body projection
identity/attrs/receiveRenderData/children semantics
business-owned presentation contract/observable result
```

Do not compare：

```text
module path/bytes
PID vs Worker id
WebSocket vs MessagePort
IPC vs Port transfer
HTTP vs Fetch/SW internals
trusted browser href/src physical binding
business WC private Shadow DOM/Canvas/WebGL/UI framework/layout implementation
```

---

## 16. Qualification Placement

M16 must qualify：

```text
PWA PREPARE
Worker Runner
RuntimeHosting
Runtime Control MessagePort
real Main↔Worker↔Subsystem trace
Worker termination/failure
```

M17 additionally must qualify：

```text
real PWA RendererControlBinding candidate-slot settlement/currentness
Window Renderer reload/replacement
Renderer Control MessagePort
PWA DataConnectionBroker + paired Port provisioning
Input/Render full trace
same M13 <link>/classic <script>/window.onload bootstrap semantics
same document.body thin Web projection
same receiveRenderData ABI/order
no RenderEvent → WC/DOM event mapping
PWA Content realization
Session shutdown
Hostra/PWA full logical equivalence
```

---

## 17. Final Invariants

1. M16 owns PWA Runtime/Worker vertical, not full Renderer/Data product；
2. PWA Launcher owns Game PREPARE/Runtime launch only；Web Presentation Config是独立 product startup input；
3. Main receives no Game/executable/Worker/presentation implementation material；
4. Host-owned Worker Runner is physical Runtime entry；
5. M7 `RendererControlBinding` remains Main-facing optional candidate carrier capability；
6. Window hosting is M17 concrete composition responsibility, not Core RendererHosting service；
7. PWA cannot invent separate Renderer currentness/retry protocol；
8. M17 includes Renderer Control + Data Broker/bindings + Content + M13 Web presentation, not Renderer Control alone；
9. same WebPresentationConfig / `<link>` / classic `<script>` / `window.onload` semantics apply in Hostra/PWA；
10. same document.body thin projection + `receiveRenderData` semantics apply in Hostra/PWA；
11. concrete WC由业务拥有，对 projected state只读；layout/stacking由业务 WC/CSS负责；
12. M13不定义 RenderEvent → WC event ABI；PWA不得平台专属增加；
13. DOM read-only contract不依赖 MutationObserver policing；
14. Data/presentation provisioning failure != Runtime/Frame authority mutation；
15. Control/Data MessagePort application unit remains JSON text string；
16. Hostra/PWA physical storage/href-src binding may differ, logical application/presentation semantics must match。
