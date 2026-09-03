# PWA Composition 设计

> 层级：模块设计  
> 状态：M15 Runtime Vertical Planned / M16 Full E2E Planned  
> 稳定程度：Architecture Evolving / Renderer Control Dependency Frozen  
> 主要定义：PWA Platform Composition realization：PWA Launcher-owned Game PREPARE、Worker Runner、Runtime Control MessagePort，以及 M16 Renderer Control/Data/Content full physical realization  
> 依赖：[平台组合系统](../../10-architecture/platform-composition-system.md)、[运行时启动系统](../../10-architecture/runtime-bootstrap-system.md)、[ADR 0026](../../decisions/0026-session-scoped-platform-instance.md)、[ADR 0027](../../decisions/0027-freeze-renderer-control-v1-preimplementation.md)、[Game Package v1](../../15-contracts/game-package-v1.md)、[PWA Game Launcher / Worker Subsystem Runner Profile v1](../../15-contracts/pwa-launcher-profile-v1.md)、[Runtime Control Profile v1](../../15-contracts/runtime-control-profile-v1.md)、[Renderer Control v1](../../15-contracts/main-renderer-control-v1.md)、[Renderer Data Profile v1](../../15-contracts/renderer-data-profile-v1.md)  
> 最近复核：2026-09-03

本文描述完整 PWA Platform Composition target，不是 `@loomrealm/platform-pwa` mega-package。M15只关闭 PWA Runtime/Worker vertical；M16才关闭 Renderer Control + Data Broker/bindings + Content + full cross-platform equivalence。

---

## 1. Milestone Shape

### M15 Runtime Vertical

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

M15 does not claim Renderer Control/Data/Content full physical composition。

### M16 Full PWA Target

```text
M15 Runtime vertical
+
Window/Web Renderer
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
Fetch / Service Worker / OPFS Content
→ full PWA E2E
→ cross-platform logical equivalence
```

PWA physical ownership never becomes Frame/Activation/InputTarget/DataAuthority/Renderer-currentness authority。

---

## 2. PWA PREPARE

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

---

## 3. Main Installation Boundary

Main receives only：

```text
LogicalGameBootstrap
+
Main-facing narrow capability view
```

Main does not receive GameEntry/formatVersion/PwaLaunchPlan/module URL/Worker/Port details。

Through M7 Main-facing logical shape remains：

```text
DeadlineScheduler
OpaqueMaterialGenerator
RuntimeHosting
RendererControlBinding?   // optional; PWA physical realization arrives M16
```

M15 PWA Runtime-only provider MAY omit `rendererControl` entirely；no fake Binding。

---

## 4. Worker Runner — M15

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
M15 RuntimeControlBinding
M16/M8-derived SubsystemDataBinding provisioning
M16/M12-derived ContentClient realization as required
```

Business module不得创建 Worker、寻找 bootstrap Port、读取 launch manifest或分支 PWA business semantics。

---

## 5. PWA Host Policy

`launch.pwa.json` MAY select installation business artifact，但不得控制：

```text
Host-owned Worker Runner entry
arbitrary Worker constructor options
bootstrap/Runtime Control/Data MessagePort
credential material
CSP/same-origin policy
Service Worker authority
resource/timeouts
```

---

## 6. Runtime Bootstrap — M15

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
```

Unexpected Worker/Control loss remains Runtime failure；same-attempt Control reconnect不存在。

---

## 7. Runtime Control MessagePort — M15

```text
postMessage(string)
= one UTF-8 JSON text JSON-RPC application object
```

Structured Clone只用于 Platform bootstrap/Port transfer，不形成第二套 application value model。

---

## 8. Renderer Hosting / Control — M16

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

Transient physical candidate establishment failure MAY be absorbed/disposed while `acquire` remains pending。If PWA surfaces non-abort `acquire` rejection to Main, Frozen M7 rule makes the Binding terminal for that Main Session；PWA must not add a private retry/currentness protocol。

Renderer Snapshot never carries Data MessagePort/transfer object/credential/PwaLaunchPlan/module URL。

---

## 9. DataConnectionBroker — M16 Physical Realization

M8 freezes role/Data authority semantics；M16 must supply PWA physical realization：

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

MAY carry：

```text
fresh Data endpoint for exact current S/G/P
revoke/supersede physical material
```

It is not Subsystem Control、Frame、Renderer Control、Renderer Data application protocol或 business RPC。

Provisioning failure本身 != Runtime failure / Frame unwind / DataAuthority mutation。

---

## 11. Renderer Data / Input / Render — M16 Composition

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

## 12. Content — M16 Physical Realization

PWA full closure must include：

```text
same-origin Fetch
Service Worker
OPFS / Cache Storage as product implementation requires
```

These implement logical readonly Content API only。Definition Module executable loading remains trusted Launcher/Runner capability。

M16 cannot claim full PWA E2E if Renderer Control exists but Data/Content physical realization is still absent。

---

## 13. Composition Root

`apps/pwa` is final composition root and MAY combine current-platform packages/adapters as milestones land；Main/business never depend on concrete PWA implementation。

---

## 14. Cross-platform Equivalence — M16

Compare same logical：

```text
Game topology / LogicalGameBootstrap
Runtime lifecycle
Frame/Activation/outcome/unwind
Renderer authority/replacement
Data S/G/Profile/currentness
Input delivered semantics
Render authoritative replica
Content logical response
business observable state
```

Do not compare：

```text
module path/bytes
PID vs Worker id
WebSocket vs MessagePort
IPC vs Port transfer
HTTP vs Fetch/SW internals
```

---

## 15. Qualification Placement

M15 must qualify：

```text
PWA PREPARE
Worker Runner
RuntimeHosting
Runtime Control MessagePort
real Main↔Worker↔Subsystem trace
Worker termination/failure
```

M16 additionally must qualify：

```text
real PWA RendererControlBinding candidate-slot settlement/currentness
Window Renderer reload/replacement
Renderer Control MessagePort
transient candidate establishment handling without second Binding protocol
PWA DataConnectionBroker + paired Port provisioning
Input/Render full trace
PWA Content realization
Session shutdown
Hostra/PWA full logical equivalence
```

---

## 16. Final Invariants

1. M15 owns PWA Runtime/Worker vertical, not full Renderer/Data product；
2. PWA Launcher owns Game PREPARE/Runtime launch only；
3. Main receives no Game/executable/Worker material；
4. Host-owned Worker Runner is physical Runtime entry；
5. M7 `RendererControlBinding` remains Main-facing optional candidate carrier capability；
6. Window hosting is M16 concrete composition responsibility, not Core RendererHosting service；
7. PWA cannot invent separate Renderer currentness/retry protocol；
8. M16 includes Renderer Control + Data Broker/bindings + Content, not Renderer Control alone；
9. Data provisioning failure != Runtime/Frame failure；
10. Control/Data MessagePort application unit remains JSON text string；
11. Hostra/PWA physical mechanisms may differ, logical application semantics must match。
