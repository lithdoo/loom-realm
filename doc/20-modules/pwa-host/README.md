# PWA Composition 设计

> 层级：模块设计  
> 状态：M16 Runtime Vertical Planned / M17 Full E2E Planned  
> 主要定义：PWA PREPARE/Worker Runtime，以及 M17 Renderer/Data/Content/M13 Web Presentation physical realization  
> 依赖：[平台组合系统](../../10-architecture/platform-composition-system.md)、[渲染系统](../../10-architecture/rendering-system.md)、[Web Presentation Config v1](../../15-contracts/web-presentation-config-v1.md)、[Web Presentation API v1](../../15-contracts/web-presentation-api-v1.md)、[ADR 0031](../../decisions/0031-business-owned-web-component-projection.md)、[PWA Launcher Profile v1](../../15-contracts/pwa-launcher-profile-v1.md)  
> 最近复核：2026-09-08

PWA不是新的 application architecture。M16只关闭 Worker Runtime vertical；M17才完成 Renderer/Data/Content/Web Presentation 与 Hostra logical equivalence。

---

## 1. Milestones

```text
M16
PWA PREPARE
→ Worker Runner
→ RuntimeHosting
→ Runtime Control MessagePort
→ real Main↔Worker↔Subsystem trace

M17
M16 + Window Renderer
→ Renderer Control MessagePort
→ PWA Data broker / MessageChannel
→ Input / Render
→ PWA Content
→ M13 Web Presentation Config/API/Projector
→ business-owned WC
→ full PWA E2E/equivalence
```

M16不提前 claim完整 Renderer/Data/Content/Web presentation closure。

---

## 2. PWA PREPARE

```text
PwaPlatform.prepareGame
→ game-launcher-pwa
→ Game Entry + launch.pwa.json validation/join
→ same-origin/trusted executable preflight
→ immutable PwaLaunchPlan
→ LogicalGameBootstrap
```

Main只接收 logical bootstrap + narrow platform capabilities，不接收 module URL/Worker/Port/presentation implementation material。

WebPresentationConfigV1是独立 product startup input，不进入 `launch.pwa.json`、PwaLaunchPlan、LogicalGameBootstrap或 RenderNode。

---

## 3. Worker Runtime — M16

Host-owned Dedicated Worker Runner：

```text
PwaLaunchPlan[key]
→ exact Definition Module
→ RuntimeControlBinding
→ @loomrealm/subsystem/host
```

M17再增加 Subsystem Data provisioning 与 ContentClient physical realization。

Business Web presentation不进入 Worker；它运行在 Window/Renderer Realm。

---

## 4. Renderer / Data — M17

PWA使用 Window + MessagePort/MessageChannel实现已经冻结的 Renderer Control/Data logical contracts。

```text
Main DataAuthority(S,G,P)
→ PWA Data broker
→ fresh MessageChannel
→ exact current Renderer + target Worker provisioning
→ paired current Data Connection
```

Broker不拥有 generation/profile/current Renderer authority。same S/G/P reconnect使用 fresh carrier，但不重定义 M10/M11 currentness/identity semantics。

---

## 5. Web Presentation — M17

PWA必须复用 M13 formal contracts，而不是创建平台专属 Web projection variant：

```text
WebPresentationConfigV1
→ ordered browser bootstrap
→ window.onload
→ Web Projector

Web Presentation API v1
→ context / data / PresentationResourceClient
```

Identity/order同样固定：

```text
same live wire-node identity
(Session, subsystemKey, generation, domainId, key)
→ same HTMLElement

managed root order
→ subsystemKey UTF-8 lexical
→ within subsystem: M11 zIndex/domainId order
→ roots order
```

PWA不得退化成 bare `same key → same element` 规则，也不得自己发明 cross-Subsystem zIndex/layer semantics。

---

## 6. PWA Content

M17可以使用：

```text
same-origin Fetch
Service Worker
OPFS / Cache Storage
```

这些只实现 logical readonly Content semantics；Node-only `@loomrealm/fsdb`不成为 PWA abstraction。

Presentation bootstrap physical binding可以与 Desktop不同，但不能把 physical URL/credential/resolver暴露给 business WC。

Runtime business resource必须通过 M13 `PresentationResourceClient`保持 namespace/key/expectedContentVersion semantics。

---

## 7. WC / Input / Failure Boundaries

Business WC对 LoomRealm-managed projection只读；DOM不 reverse-sync Store。M13不需要 MutationObserver policing。

Physical DOM input必须继续进入 M10 `RendererInputSource`；WC focus/event不能创造 Main InputTarget或 Data shortcut。

PWA不得新增 RenderEvent→WC/DOM mapping。

Presentation callback/resource/provisioning failure本身不修改 Main/Subsystem authority，也不自动 fail Runtime/Frame，除非已有 owning contract另有明确 terminal rule。

---

## 8. Cross-platform Equivalence

Hostra/PWA必须共享：

```text
Game/Runtime/Frame/Data/Input/Render logical semantics
Content logical identity/version/errors
Web Presentation Config v1 semantics
Web Presentation API v1 semantics
scoped wire-node → HTMLElement identity
managed body ordering
business-observable outcome
```

可以不同：

```text
Process vs Worker
WebSocket vs MessagePort
Desktop HTTP/FSDB vs PWA Fetch/SW/OPFS
private browser href/src binding
business WC private Shadow DOM/Canvas/WebGL implementation
```

---

## 9. Qualification

M16：PREPARE、Worker Runner、Runtime Control、termination/failure。

M17 additionally：

```text
Renderer Control Window lifecycle/replacement
PWA Data broker/provisioning
Input/Render full trace
M13 ordered bootstrap + failure handling
scoped identity / deterministic body order
context/data/resource API
PWA Content realization
reload/replacement/shutdown
Hostra/PWA logical equivalence
```

---

## 10. Final Invariants

1. PWA physical mechanics不创建新 application authority；
2. M16 Runtime-only与 M17 full E2E边界保持清晰；
3. Web presentation直接复用 M13 Config/API/identity/order semantics；
4. PWA不引入平台专属 component loader、layer manager、RenderEvent bridge或 second projection tree；
5. physical storage/transport可以不同，logical business outcome必须等价。
