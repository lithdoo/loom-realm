# `loom.map` 地图 Subsystem 模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：第一阶段地图 Subsystem 的 business/runtime 模块；作为 `@loomrealm/subsystem` 的普通 platform-neutral consumer  
> 依赖：[Subsystem 模型](../../10-architecture/subsystem-model.md)、[平台组合系统](../../10-architecture/platform-composition-system.md)、[User Input v1](../../15-contracts/user-input-v1.md)、[Render Update v1](../../15-contracts/render-update-v1.md)  
> 最近复核：2026-08-19

`loom.map` 是 Phase 1 vertical slice，但它不实现自己的 LoomRealm Control/Data transport stack。

核心原则：

```text
loom.map business
    → @loomrealm/subsystem
    → platform-neutral role capabilities

Hostra Desktop / PWA
    → composition root provides physical infrastructure
```

同一份 map business definition 应可以在 Hostra Desktop 与 PWA 上运行，而不出现 WebSocket/MessagePort/Process/Worker 分支。

---

## 1. 模块结构

目标结构：

```text
loom.map
├── Subsystem Definition
├── Frame Handlers / Session Coordinator
├── Game Catalog / Repositories
├── Runtime Loop / World State
├── Input Consumers
├── Render Projectors
│   ├── desired Domain state
│   ├── stable logical keys
│   └── presentation events
└── Pokémon Essentials Compatibility Compiler
```

以下机制不应继续由 `loom.map` 自己实现：

```text
Subsystem Control bootstrap
JSON-RPC dispatcher / request IDs
Frame activation bookkeeping
Frame mutation gate
Control/Frame deadlines
Data Connection reconnect
Frame Interest Registry wire publication
Render Registry/Snapshot/Patch wire publication
WebSocket / MessagePort
platform bootstrap
```

这些属于 `@loomrealm/subsystem`、protocol capability packages 与 Platform Composition。

---

## 2. Author-facing Runtime / Frame

业务通过 `@loomrealm/subsystem` 获得已经绑定本地 Frame Context 的 capability。

概念代码：

```ts
export default defineSubsystem((scope) => ({
  async initialize() {
    // map Runtime-level business initialization
  },

  async frame(frame) {
    // frame.params = initialize business params
    // await frame.call(...)
    // normal handler completion becomes Frame outcome
  },

  async shutdown() {
    // bounded business cleanup
  },
}));
```

业务不持有 `activationId`，不管理 `frame.activate/resume`，不自行恢复 suspended Frame。

Frame handler 可以跨 `await frame.call(...)` 继续运行；SDK 在底层安装 fresh Activation 后才恢复 continuation。

---

## 3. User Input Consumer

`loom.map` 使用 SDK 提供的 Frame-bound InputListener，而不是直接读 Data message。

概念：

```ts
const input = createInputListener({
  frame,
  channels: [
    "keyboard.event",
    "pointer.state",
    "x.map.interact.event",
  ],
});
```

SDK 内部负责：

```text
local Frame exists/active
current Activation match
channel ∈ local Interest[frameId]
mutation gate
current Data Connection
full Frame Interest Registry publication
fresh carrier republish
stale/in-flight input drop
```

业务不接触 `frameId + activationId` wire gate。

### Frame / Activation behavior

```text
Frame suspension
    InputListener may remain alive
    Frame Interest configuration may remain
    ordinary delivery stops

same Frame fresh Activation resume
    same InputListener reused
    Interest configuration reused if same Data carrier survived
    old Activation Input State/Event never reused

fresh Data Connection
    wire Interest Registry starts empty
    SDK republishes current local Frame Interest Registry
```

因此业务代码不需要在 child return 后重新订阅输入。

---

## 4. Custom Map Input

地图专用 channel 可以使用 `x.*`：

```text
x.map.interact.event
x.map.pointer-tile.state
```

它们仍是 Frame-scoped Interest，仍受 Main InputTarget/Activation + current Data Connection + Producer availability gate。

平台特定 DOM/OS/device mapping 属于 Renderer/Platform implementation，不进入 map Runtime。

---

## 5. Render Domain Model

地图业务表达 declarative desired presentation，不直接拼 Render Update wire。

概念：

```ts
const world = createRenderDomain({ name: "world", zIndex: 0 });
const hud = createRenderDomain({ name: "hud", zIndex: 100 });

world.set(buildWorldState());
hud.set(buildHudState());
```

SDK 自己 mint protocol domain identity；业务 `name` 不等于可复用 protocol `domainId`。

候选 map domains：

```text
world   zIndex=0
hud     zIndex=100
loading zIndex=200
debug   zIndex=1000
```

这些名字/zIndex 是 map implementation choices，不是公共标准。

---

## 6. Render Publication Boundary

业务只表达：

```text
desired authoritative tree
transient presentation event
Domain create/close
```

SDK/Render manager 负责转换为：

```text
render.domains
render.snapshot
render.patch
render.event
```

因此 `loom.map` 不应维护 protocol publication revision、carrier-local baseline、ACK/reconnect mechanics。

业务 Projector 可以维护 stable logical node keys，方便 SDK/Render capability 计算 Patch；但 wire heuristic 不属于 map public API。

---

## 7. Render / Frame / Data Independence

```text
Frame close != Domain destroy
Frame suspend != Domain hidden
Activation change != Domain lifecycle
Runtime ready != Data Connection exists
Data retire != authoritative Domain destroy
```

如果某个 map RenderDomain 应与某 Frame 同生共死，应由 map business 显式 `close()`，而不是 SDK/协议根据 Frame lifecycle 自动推导。

Data reconnect 时业务 RenderDomain object/desired state 继续存在；SDK 在 fresh carrier 上恢复 Registry + Snapshots。

---

## 8. Content

地图通过 `@loomrealm/subsystem` 注入的 platform-neutral Content client 读取 logical content：

```text
maps
tilesets
characters
autotiles
metadata/resources
```

业务不得知道当前底层是：

```text
Desktop filesystem/localhost HTTP
PWA Fetch/Service Worker/OPFS
```

Pokémon Essentials / RMXP compatibility compiler 负责把来源格式解释为 map business 可消费的 logical data，不改变 Content API/Platform boundary。

---

## 9. Platform Independence

`loom.map` package 依赖方向：

```text
@loomrealm/map
    → @loomrealm/subsystem
```

不直接依赖：

```text
@loomrealm/transport-websocket
@loomrealm/transport-messageport
@loomrealm/launcher-node
Hostra
Worker/MessagePort APIs
```

Hostra Desktop 与 PWA 的 entry/composition 位于产品 composition root，而不是 map business package。

```text
same map business definition
        │
        ├── apps/desktop composition
        └── apps/pwa composition
```

---

## 10. Tests

除了适用的 `@loomrealm/subsystem` conformance/integration fixture，map business 至少覆盖：

```text
frame-handler-initialize
nested-call-return-business-continuation
input-listener-survives-suspend-resume
fresh-activation-does-not-reuse-input-state
new-frame-waits-for-own-interest
custom-channel-frame-scope
fresh-data-reconnect-hidden-from-business
zero-frame-render-domain
multi-domain-map-render
frame-close-does-not-destroy-unrelated-domain
render-domain-reconnect-hidden-from-business
content-logical-results-platform-independent
same-business-trace-hostra-pwa
```

协议 wire correctness 由对应 capability package conformance 测试，不在 map 里复制整套协议测试。

---

## 11. 不得恢复的旧模型

```text
loom.map 自己实现 Control/Frame JSON-RPC adapter
loom.map 自己建立 WebSocket/MessagePort
runtime.input / runtime.render 万能 service locator
Frame.input 同时表示 business params 与 User Input
Runtime-global Input Interest
Activation reuse
per-Frame mandatory Render ownership
Frame close = Render destroy
Data reconnect = Frame recovery
platform-specific map business branches
```

核心目标：

> **`loom.map` 只证明一件事：一个普通业务 Subsystem 可以通过统一的 `@loomrealm/subsystem` author API，在 Hostra Desktop 与 PWA 两个 Platform Composition 上运行同一套核心业务。**
