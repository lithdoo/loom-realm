# `@loomrealm/subsystem` 设计草案

> 状态：Draft  
> 阶段：Package boundary / platform ports / author API / implementation planning  
> 最近复核：2026-08-19  
> 目标：为 LoomRealm 业务 Subsystem 提供稳定、平台无关、协议机械细节不可见的 author-facing SDK。  
> 上层架构：[平台组合系统](../../doc/10-architecture/platform-composition-system.md)  
> 核心原则：**System Platform 提供 Subsystem role 所需的物理基础设施投影；SDK 建立长期协议 Plane 与 capability managers；业务只持有 Frame/Input/Render/Content capability。**

---

## 1. Package Position

`@loomrealm/subsystem` 是 platform-neutral **Subsystem role SDK**，不是 Desktop/PWA platform layer。

```text
Business Subsystem
    loom.map / battle / menu
            │
            ▼
@loomrealm/subsystem
            │
     Subsystem Platform Ports
            │
            ▼
System Platform Composition
    ├── Hostra Desktop
    └── PWA
```

它理解 LoomRealm Runtime Control / Data / Content semantics，但 public author API 不暴露协议/平台机械细节。

业务 Subsystem SHOULD NOT 直接依赖：

```text
@loomrealm/runtime-control
@loomrealm/wire
@loomrealm/transport-websocket
@loomrealm/transport-messageport
@loomrealm/launcher-node
Hostra
WebSocket
MessagePort
Worker / child_process
```

---

## 2. 为什么需要 Subsystem Platform Ports

Runtime Control、User Input、Render Update 最终都依赖真实物理连接。

仅有：

```text
MessageCarrier
```

不够，因为 `MessageCarrier` 只表达：

> 一条已经建立完成的双向消息管道如何收发。

它不表达：

```text
什么时候有连接
连接属于 Runtime Control 还是 Renderer Data
Data carrier replacement
same-generation reconnect
bootstrap material 如何交付
谁负责 physical establishment
```

如果这层缺失，SDK 很容易退化为：

```text
万能 runtime service locator
module-global current Subsystem context
Control/Data 共用一条 carrier
Input/Render 自己找连接
WebSocket/MessagePort 泄漏到业务
```

因此本包消费系统 Platform Composition 投影到 Subsystem role 的 **role-local ports**。

这些 ports 不是整个跨平台架构，也不拥有物理 topology；完整 physical coordination 仍由 system Platform Composition 负责。

---

## 3. Layering

```text
Business Author API
────────────────────────
Frame
InputListener
RenderDomain
ContentClient
lifecycle hooks

Capability Managers
────────────────────────
FrameRegistry
InputManager
RenderManager

Protocol Planes
────────────────────────
RuntimeControlPlane
RendererDataPlane

Subsystem Platform Ports
────────────────────────
RuntimeControlBinding
RendererDataBinding
ContentBinding

Foundation
────────────────────────
MessageCarrier
```

必须保持：

```text
Protocol Plane != physical connection
Capability lifetime != carrier lifetime
Frame lifetime != Data Connection lifetime
Input Interest lifetime != Activation lifetime
Render Domain lifetime != Frame lifetime
```

---

## 4. `MessageCarrier` Boundary

底层通用 carrier 由 `@loomrealm/foundation` 提供：

```ts
export interface MessageCarrier {
  send(message: string): void | Promise<void>;
  messages(): AsyncIterable<string>;
  readonly closed: Promise<CarrierClosed>;
  close(): void | Promise<void>;
}
```

它不回答 connection identity/lifecycle/establishment。

WebSocket / MessagePort adapters 只把某一条已经正确建立的物理连接转换为 `MessageCarrier`。

---

## 5. Subsystem Platform Ports

### 5.1 Runtime Control

Runtime Control 对一次 Launch Attempt 是 one-shot connection lifetime；same-attempt Control reconnect 非法。

候选：

```ts
export interface RuntimeControlBinding {
  acquire(signal?: AbortSignal): Promise<MessageCarrier>;
}
```

语义：

> 返回当前 Subsystem instance / Launch Attempt 唯一、已经正确绑定 bootstrap context 的 Runtime Control carrier。

Core 不关心底层是：

```text
Hostra Desktop WebSocket connect
PWA transferred MessagePort
in-memory test carrier
```

`acquire` 不等于“SDK 自己打开 WebSocket”。physical establishment policy 属于 Platform Composition。

### 5.2 Renderer Data

Data Connection 可以在相同 generation 下顺序重建，因此需要 connection stream：

```ts
export interface RendererDataConnection {
  readonly generation: number;
  readonly carrier: MessageCarrier;
}

export interface RendererDataBinding {
  connections(
    signal?: AbortSignal
  ): AsyncIterable<RendererDataConnection>;
}
```

`generation` 必须进入 binding value；same-generation reconnect 与 generation replacement 不应被压成不可区分的 carrier stream。

这个 binding 是 System Data Connection Broker 在 **Subsystem side** 的投影。

Subsystem SDK 不创建 Renderer endpoint，也不拥有 generation。

### 5.3 Content

Content 可以由 platform-neutral `ContentClient` 直接注入；具体 HTTP/Fetch/Service Worker transport 已在更低层绑定。

---

## 6. Startup Boundary

不再采用：

```ts
startSubsystem({ definition, carrier, bootstrap });
```

因为单一 `carrier` 会把 Runtime Control 与 Renderer Data 混在一起。

候选：

```ts
export interface SubsystemPlatformPorts {
  readonly runtimeControl: RuntimeControlBinding;
  readonly rendererData: RendererDataBinding;
  readonly content: ContentClient;
}

export interface StartSubsystemOptions {
  readonly definition: SubsystemDefinitionFactory;
  readonly platform: SubsystemPlatformPorts;
  readonly bootstrap: SubsystemBootstrap;
}

export function startSubsystem(
  options: StartSubsystemOptions
): Promise<void>;
```

`bootstrap` 与 physical connection 分离：

```text
Platform Binding
    supplies correct physical connection capability

Bootstrap material
    supplies protocol/application bootstrap facts
```

SDK 不探测 Desktop/PWA，也不读取 Hostra/PWA-specific globals。

---

## 7. Long-lived Protocol Planes

### 7.1 RuntimeControlPlane

```text
RuntimeControlBinding
        ↓
RuntimeControlPlane
        ↓
FrameRegistry / lifecycle
```

负责：

```text
subsystem.hello
subsystem.status
subsystem.shutdown
Frame / Call dispatcher
shared request ID namespace
Activation/context validation
mutation gate
Frame request deadlines
Runtime fatal classification
```

Control carrier loss按 Runtime Control Profile 进入 Runtime failure；SDK 不重连 same Launch Attempt。

### 7.2 RendererDataPlane

```text
RendererDataBinding
        ↓
RendererDataPlane
       /              \
      ▼                ▼
InputManager       RenderManager
```

`RendererDataPlane` 的 lifetime 长于单条 Data carrier：

```text
DataPlane lifetime ───────────────────────────────>

carrier A          ─────X
                         carrier B ─────X
                                      carrier C ───>
```

它负责 current/retired installation、generation observation、carrier demux/mux 与 fresh-connection notification。

Input/Render capability 不直接持有某条 carrier。

---

## 8. Author Instance Scope

业务需要 per-Subsystem-instance dependency scope，但不需要万能 `SubsystemRuntime` service locator。

不推荐：

```ts
runtime.input.createListener(...)
runtime.render.domain(...)
runtime.content.get(...)
runtime.frames...
```

也不推荐 module-global：

```ts
createInputListener(...)
```

推荐通过 definition factory 注入 instance-bound closures：

```ts
export interface SubsystemScope {
  readonly createInputListener: (
    options: CreateInputListenerOptions
  ) => InputListener;

  readonly createRenderDomain: (
    options?: CreateRenderDomainOptions
  ) => RenderDomain;

  readonly content: ContentClient;
  readonly signal: AbortSignal;
}
```

`SubsystemScope` 的含义只是：

> 这些 factory/client 属于同一个 Subsystem instance。

不表示 Runtime “拥有” Input/Render/Content。

---

## 9. `defineSubsystem`

候选：

```ts
export interface SubsystemDefinition {
  initialize?(): void | Promise<void>;
  frame(frame: Frame): JsonValue | Promise<JsonValue>;
  shutdown?(): void | Promise<void>;
  failed?(error: RuntimeFailure): void | Promise<void>;
}

export type SubsystemDefinitionFactory = (
  scope: SubsystemScope
) => SubsystemDefinition;

export function defineSubsystem(
  factory: SubsystemDefinitionFactory
): SubsystemDefinitionFactory;
```

业务：

```ts
export default defineSubsystem(({
  createInputListener,
  createRenderDomain,
  content,
  signal,
}) => ({
  async initialize() {
    // Runtime-level business initialization
  },

  async frame(frame) {
    const input = createInputListener({
      frame,
      channels: ["keyboard.event"]
    });

    const world = createRenderDomain({ name: "world" });

    // business logic

    return { completed: true };
  },

  async shutdown() {
    // bounded cleanup
  },
}));
```

同一个 definition 可被 Hostra Desktop / PWA composition 运行。

---

## 10. `Frame` Capability

`Frame` 只表达 Main-owned control-flow context 的 author facade。

```ts
export interface Frame<TParams extends JsonValue = JsonValue> {
  readonly id: string;
  readonly params: TParams;

  call<TResult extends JsonValue = JsonValue>(
    subsystem: string,
    params: JsonValue
  ): Promise<TResult>;
}
```

### 为什么叫 `params`，不叫 `input`

`frame.initialize` 的业务参数不是 User Input。

因此 author API 不再使用：

```ts
frame.input
```

来承载业务初始化参数，避免和 keyboard/pointer/gamepad User Input 永久冲突。

### 为什么不公开 `activationId`

Activation 是协议 authority epoch，由 SDK 内部 Frame Context 管理。

业务不得缓存/传递/恢复旧 Activation。

### Frame completion

普通 handler 正常 resolve 的 value 由 SDK 转换为 `frame.return`。

这样 author 不需要：

```ts
await frame.return(value); // Promise<never> ergonomics
```

SDK 在 handler terminalization / outbound return 时统一建立 mutation gate，防止第二个 call/return 或 late ordinary input delivery。

---

## 11. `frame.call()`

业务：

```ts
const result = await frame.call("loom.battle", params);
```

SDK/协议内部：

```text
frame.call Request
→ Main acceptance
→ caller suspension / old Activation revoked
→ child Frame initialize/activate
→ child returns
→ child closes
→ caller resume with fresh Activation
→ SDK installs fresh local Activation
→ frame.call Promise resolves
```

业务不监听 `frame.resume`。

`frame.resume` 是 continuation primitive，不是默认 author event。

---

## 12. Mutation Gate

SDK 统一拥有 commit-sensitive gate：

```text
pending frame.call / handler terminal return
→ hold mutation gate
→ stop ordinary input dispatch for that Frame
→ reject second mutation locally
→ wait protocol result / Runtime failure
```

可暴露稳定 local usage errors：

```text
FrameBusyError
FrameInactiveError
FrameClosedError
```

这些不是 wire protocol errors。

---

## 13. Input API

Input 是独立 capability，不挂在 Runtime，也不挂成 `frame.input` namespace。

但创建时应绑定 `Frame` object，而不是裸 `frameId`：

```ts
export interface CreateInputListenerOptions {
  readonly frame: Frame;
  readonly channels: readonly InputChannel[];
}

export interface InputListener {
  on<T>(
    channel: InputChannel,
    handler: (value: T) => void
  ): Unsubscribe;

  setChannels(channels: readonly InputChannel[]): void;
  close(): void;
}
```

这样：

```text
Frame object
    supplies identity + Subsystem-instance owner binding

InputListener
    remains independent capability
```

无需 module-global current runtime，也不能把另一个 Subsystem instance 的 `frameId` 误传进来。

---

## 14. InputManager / Interest Registry

多个 listener 对同一 Frame 的 channel contribution 做 union：

```text
Listener A: F1 → keyboard.event
Listener B: F1 → pointer.state
Listener C: F2 → gamepad.event

local desired registry:
F1 → keyboard.event, pointer.state
F2 → gamepad.event
```

内部：

```text
Map<frameId, Set<channel>>
```

publication：

```text
full Frame Interest Registry snapshot
```

不是 per-listener/per-channel subscribe patch。

InputManager 必须先/原子更新 local desired registry，再发布 shrink snapshot，使 removed-channel in-flight input 能被 local receive gate drop。

---

## 15. Input Lifecycle

### Suspension / resume

```text
F1/A1 active
listener(F1) alive
Interest[F1] alive

frame.call
→ A1 revoked
→ F1 suspended
→ listener remains
→ Interest[F1] remains
→ ordinary delivery stops

frame.resume(F1,A2)
→ fresh A2 installed
→ same listener reused
```

如果同一 Data carrier 存活，不需要重新发布 unchanged `Interest[F1]`。

但旧 Activation retained State/Event 永远不能跨到 A2。

### New Frame

新 F2 没有自己的 `Interest[F2]` 时即使 active 也不收 ordinary input；创建 listener/更新 registry 后才可能 effective。

### Frame close

local Frame Context terminalize 时：

```text
close all listeners bound to F
remove Interest[F]
next full registry snapshot omits F
```

stale remote/cache Interest 不能创建 Main authority。

---

## 16. Data Reconnect

old carrier retired：

```text
business InputListener remains
local desired Interest Registry remains
business RenderDomain remains
local desired Render State remains

wire child-protocol state discarded
```

fresh carrier：

```text
User Input
    remote registry starts empty
    InputManager republishes current full local registry

Render
    RenderManager publishes current Domain Registry
    then fresh Snapshots
```

业务不参与 reconnect。

---

## 17. Input Receive Gate

收到 Renderer input 时 SDK 检查：

```text
message belongs to current Data carrier
local frameId exists
Frame active
activationId == current local Activation
channel ∈ local Interest[frameId]
mutation gate open
```

否则 drop，不把 stale/in-flight ordinary input 转成 Runtime failure。

---

## 18. Render API

Render 是独立 presentation capability，不挂在 Frame，也不通过 `runtime.render` service locator 暴露。

```ts
export interface CreateRenderDomainOptions {
  readonly name?: string;
  readonly zIndex?: number;
}

export interface RenderDomain {
  set(state: RenderTree): void;
  event(target: string, name: string, data?: JsonObject): void;
  close(): void;
}
```

业务：

```ts
const world = createRenderDomain({
  name: "world",
  zIndex: 0,
});

world.set(nextTree);
```

SDK SHOULD 自己 mint protocol `domainId`；业务 `name` 不默认等于 one-shot protocol identity。

---

## 19. RenderManager / Data Lifetime

```text
RenderDomain
    ↓
RenderManager
    ↓
RendererDataPlane
    ↓
current carrier
```

Data reconnect 时 `RenderDomain` object 不变。

fresh carrier：

```text
current Domain Registry
→ fresh Snapshot current Domains
→ ordinary Patch/Event
```

业务默认只表达 desired authoritative state：

```ts
world.set(nextTree);
```

不暴露 `world.patch()` 或要求业务手写 protocol revision。

---

## 20. Frame / Input / Render Independence

```text
Frame
    control-flow capability

InputListener
    Frame-scoped input-flow capability

RenderDomain
    independent presentation-state capability

ContentClient
    logical readonly content capability
```

必须保持：

```text
Frame close != RenderDomain close
Frame suspend != Render hide
Activation replacement != Interest deletion
Data carrier replacement != capability recreation
```

业务若希望某 Domain/Listener 与某业务 scope 同生共死，应显式 cleanup 或由 SDK 的确定性 local ownership helper 管理；不能把这种 policy 升级成 protocol lifecycle。

---

## 21. Runtime Lifecycle Surface

不建立大而全 `SubsystemRuntime` public object。

真正 Runtime-scoped author concerns 保持很小：

```text
initialize hook
shutdown hook
failed hook/diagnostics
instance AbortSignal
shared business closure state
```

不重复同时提供：

```text
runtime.on("shutdown")
+ definition.shutdown()
```

需要取消长任务时优先使用 scoped `AbortSignal`。

---

## 22. Platform Independence

Core package MUST NOT：

```text
probe Desktop/PWA
import WebSocket/MessagePort concrete API
spawn process/Worker
own DataConnectionBroker
open Hostra window
read platform-global current Subsystem
```

System Platform Composition 分别在 Hostra Desktop / PWA 上实现相同 Subsystem Platform Ports。

同一个业务 definition 不修改即可跨平台运行。

---

## 23. Internal Structure

目标边界：

```text
packages/subsystem/
├── DESIGN.md
├── src/
│   ├── definition/
│   ├── frame/
│   │   ├── frame.ts
│   │   ├── context.ts
│   │   ├── registry.ts
│   │   └── mutation-gate.ts
│   ├── input/
│   │   ├── input-manager.ts
│   │   ├── listener.ts
│   │   ├── interest-registry.ts
│   │   └── dispatcher.ts
│   ├── render/
│   │   ├── render-manager.ts
│   │   ├── domain.ts
│   │   └── desired-state.ts
│   ├── content/
│   ├── platform/
│   │   └── ports.ts
│   └── internal/
│       ├── runtime-control-plane.ts
│       └── renderer-data-plane.ts
└── test/
```

public exports 不应 re-export：

```text
RuntimeControlPeer
JsonRpcMessage
MessageCarrier
wire validators
activationId helpers
Data generation manipulation
```

Host/composition side 可以从受控 integration subpath 获取必要 Platform Port types；author main entry 保持业务友好。

---

## 24. Testing

至少覆盖：

```text
Memory RuntimeControlBinding one-shot
Control loss → Runtime failure
Control+Frame shared request ID namespace
Frame activation hidden from author
frame.call suspend/fresh-resume continuation
handler resolution → one frame.return
mutation gate

multiple listeners same Frame union Interest
new Frame waits own Interest
suspended Frame retains Interest
fresh Activation reuses Interest config
fresh Activation does not reuse Input State/Event
Frame close removes listeners/interest
fresh Data carrier republish full registry
stale/in-flight input receive gate

RenderDomain survives Data reconnect
fresh carrier Registry + Snapshots
Frame close does not auto-close Domain

same business definition under
    fake Hostra-like ports
    fake PWA-like ports
produces same abstract application trace
```

---

## 25. Non-goals

当前不做：

```text
万能 game framework
platform-global service locator
automatic Runtime restart
business-visible activationId
per-Frame Data Connection
per-RenderDomain Data Connection
Input subscription ACK/revision/tombstone
Render history replay/resync RPC
Hostra/PWA special business API
```

---

## 26. Final Invariants

1. `@loomrealm/subsystem` 是 platform-neutral Subsystem role SDK；
2. System Platform Composition 拥有完整物理 topology；本包只消费 Subsystem role-local ports；
3. `MessageCarrier` 表示已建立 transport，不表示 establishment/lifecycle policy；
4. Runtime Control 与 Renderer Data 使用独立 binding/lifetime；
5. RuntimeControlPlane / RendererDataPlane 长期存在，capability 不直接绑某条 carrier；
6. author API 不使用万能 `runtime.input/render/content` service locator；
7. author factories 是 per-Subsystem-instance bound closures，不使用 module-global current context；
8. Frame 只表达 control flow；初始化业务参数叫 `params`；
9. handler 正常 completion 由 SDK 转成 `frame.return`；
10. InputListener 独立但绑定 `Frame` capability，Interest 语义 Frame-scoped；
11. fresh Activation 可复用 Frame Interest config，不复用旧 Input State/Event；
12. fresh Data Connection child-protocol state重新 baseline，业务 capability object继续存在；
13. RenderDomain 与 Frame/Data carrier lifecycle 独立；
14. business code 不知道 Hostra/WebSocket/MessagePort/Worker；
15. 同一个 Subsystem definition 应能在 Hostra Desktop 与 PWA Platform Composition 上运行。
