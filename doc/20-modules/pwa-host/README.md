# PWA Composition 设计

> 层级：模块设计  
> 状态：M16 Runtime Vertical Planned / M17 Full E2E Planned  
> 主要定义：PWA PREPARE/Worker Runtime，以及 M17 Renderer/Data/Content/M13 Web Presentation physical realization  
> 依赖：[平台组合系统](../../10-architecture/platform-composition-system.md)、[渲染系统](../../10-architecture/rendering-system.md)、[Web Presentation Config v1](../../15-contracts/web-presentation-config-v1.md)、[Web Presentation API v1](../../15-contracts/web-presentation-api-v1.md)、[PWA Launcher Profile v1](../../15-contracts/pwa-launcher-profile-v1.md)  
> 最近复核：2026-09-09

PWA 不是新的 application architecture。M16 只关闭 Worker Runtime vertical；M17 才完成 Renderer/Data/Content/Web Presentation 与 Hostra logical equivalence。M13 Web Presentation design 已 Frozen，PWA 只实现其 physical realization。

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

M16 不提前 claim 完整 Renderer/Data/Content/Web presentation closure。

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

Main 只接收 logical bootstrap + narrow platform capabilities，不接收 module URL/Worker/Port/presentation implementation material。

WebPresentationConfigV1 是独立 product startup input，不进入 `launch.pwa.json`、PwaLaunchPlan、LogicalGameBootstrap 或 RenderNode。PWA 如何取得 Config candidate 属于 product-private acquisition，不属于 Config v1 ABI。

---

## 3. Worker Runtime — M16

Host-owned Dedicated Worker Runner：

```text
PwaLaunchPlan[key]
→ exact Definition Module
→ RuntimeControlBinding
→ @loomrealm/subsystem/host
```

M17 再增加 Subsystem Data provisioning 与 ContentClient physical realization。

Business Web presentation 不进入 Worker；它运行在 Window/Renderer Realm。

---

## 4. Renderer / Data — M17

PWA 使用 Window + MessagePort/MessageChannel 实现冻结的 Renderer Control/Data logical contracts。

```text
Main DataAuthority(S,G,P)
→ PWA Data broker
→ fresh MessageChannel
→ exact current Renderer + target Worker provisioning
→ paired current Data Connection
```

Broker 不拥有 generation/profile/current Renderer authority。same S/G/P reconnect 使用 fresh carrier，但不重定义 frozen currentness/identity semantics。

---

## 5. Web Presentation — M17

PWA 必须复用 M13 formal contracts，而不是创建平台专属 Web projection variant：

```text
PWA-private Config acquisition
→ WebPresentationConfigV1
→ private browser bootstrap
→ window.onload
→ start presentation

current Control topology + current per-subsystem Store
→ frozen M13 reevaluation/currentness
→ Web Projector
→ business-owned WC
```

尤其：

```text
same-generation Data carrier loss
→ freeze only affected subsystem presentation
→ healthy subsystem remains independently projectable

partial rebaseline
→ hidden from DOM

complete rebaseline
→ reconcile according to frozen M13 identity rules
```

其余 identity/order/receiver/resource/failure 规则直接引用 [Web Presentation API v1](../../15-contracts/web-presentation-api-v1.md)，PWA 不维护第二份 lifecycle 规范。

---

## 6. PWA Content

M17 可以使用：

```text
same-origin Fetch
Service Worker
OPFS / Cache Storage
```

这些只实现 logical readonly Content semantics；Node-only `@loomrealm/fsdb` 不成为 PWA abstraction。

Presentation bootstrap physical binding 可以与 Desktop 不同，但不能把 physical URL/credential/resolver 暴露给 business WC。

Runtime business resource 必须通过 M13 `PresentationResourceClient` 保持 namespace/key/expectedContentVersion semantics。

---

## 7. WC / Input / Failure Boundaries

Business WC 对 LoomRealm-managed projection 只读；DOM 不 reverse-sync Store。

Physical DOM input 必须继续进入 M10 `RendererInputSource`；WC focus/event 不能创造 Main InputTarget 或 Data shortcut。

PWA 不新增 RenderEvent→WC/DOM mapping。

Presentation failure 不修改 Main/Subsystem authority，也不自动 fail Runtime/Frame；精确 structural/resource lifetime 规则直接复用 frozen M13 contract。

---

## 8. Cross-platform Equivalence

Hostra/PWA 必须共享：

```text
Game/Runtime/Frame/Data/Input/Render logical semantics
Content logical identity/version/errors
Web Presentation Config v1 semantics
Web Presentation API v1 semantics
M13 authority/currentness/identity semantics
business-observable outcome
```

可以不同：

```text
Process vs Worker
WebSocket vs MessagePort
Desktop HTTP/FSDB vs PWA Fetch/SW/OPFS
private Config acquisition mechanism
private browser resource binding
business WC private implementation
```

---

## 9. Qualification

M16：PREPARE、Worker Runner、Runtime Control、termination/failure。

M17 additionally：

```text
Renderer Control Window lifecycle/replacement
PWA Data broker/provisioning
Input/Render full trace
PWA Content realization
M13 Config/API/Projector physical realization
reload/replacement/shutdown
Hostra/PWA logical equivalence
```

M17 不重新复制 M13 lower-level Chromium conformance，只证明 PWA physical composition 与跨平台结果。

---

## 10. Final Invariants

1. PWA physical mechanics 不创建新 application authority；
2. M16 Runtime-only 与 M17 full E2E 边界保持清晰；
3. Web presentation 直接复用 M13 frozen Config/API/authority/currentness semantics；
4. Config acquisition 可以平台不同，但 Config v1 value contract 一致；
5. PWA 不引入平台专属 component loader、layer manager、RenderEvent bridge或 second projection tree；
6. physical storage/transport 可以不同，logical business outcome 必须等价。
