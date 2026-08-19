# `@loomrealm/subsystem` 设计草案

> 状态：Draft  
> 阶段：Package boundary / host binding / capability instance model / implementation planning  
> 最近复核：2026-08-19  
> 目标：为 LoomRealm 业务 Subsystem 提供稳定、平台无关、协议细节不可见的 author-facing SDK，同时为 Desktop WebSocket、PWA MessagePort 等宿主提供明确的连接注入边界。  
> 核心原则：**先由 Host 提供已经正确绑定身份的物理连接能力，再建立长期存在的协议 Plane，最后从 Plane 创建业务 capability；业务 capability 不负责寻找、建立或重建物理连接。**

---

## 1. 为什么存在这个包

LoomRealm 的业务 Subsystem（例如 `loom.map`、`loom.battle`、`loom.menu`）不应分别实现：

```text
Subsystem Control bootstrap
Runtime Control dispatcher
JSON-RPC request / response correlation
request ID allocator
Frame / Call wire schema
Activation 管理
mutation gate
deadline / timeout
Control / Frame protocol error mapping
Data Connection current / retired lifecycle
User Input Interest publication / receive gate
Render Update Registry / Snapshot / Patch publication
Data reconnect recovery
WebSocket / MessagePort 差异
Content transport binding
```

但仅仅隐藏这些协议机械细节还不够。

Runtime Control、User Input、Render Update 最终都必须建立在真实物理连接之上。如果 SDK 没有明确的跨平台连接抽象，设计会被迫退化成以下任一种形式：

```text
把所有能力挂到一个万能 runtime 对象
用 module-global “current subsystem” 偷偷寻找连接
把 Control 与 Data 错当成同一条 carrier
让 Input / Render capability 自己建立或重建连接
把 WebSocket / MessagePort 直接泄漏给业务代码
```

因此 `@loomrealm/subsystem` 的第一责任不是“提供一个大 Runtime facade”，而是把下列层次完整闭合：

```text
Host / Platform physical environment
        ↓
Connection Binding
        ↓
Protocol Plane
        ↓
Capability Manager
        ↓
Author-facing capability
```

---

## 2. 总体分层

```text
Business
loom.map / loom.battle / loom.menu
        │
        │ Frame / InputListener / RenderDomain / Content
        ▼
Author API
        │
        ▼
Capability Managers
FrameRegistry / InputManager / RenderManager
        │
        ▼
Protocol Planes
RuntimeControlPlane / RendererDataPlane
        │
        ▼
Host Integration Bindings
RuntimeControlBinding / RendererDataBinding
        │
        ▼
MessageCarrier
        │
        ├── Desktop WebSocket adapter
        └── PWA MessagePort adapter
```

边界原则：

```text
Protocol boundary != npm package boundary
Protocol Plane != physical connection
Capability lifetime != carrier lifetime
Frame lifetime != Data Connection lifetime
Input Interest lifetime != Activation lifetime
Render Domain lifetime != Frame lifetime
```

`@loomrealm/subsystem` 可以理解 LoomRealm 协议，但 public author API 默认不得暴露：

```text
JSON-RPC
requestId
MessageCarrier
WebSocket
MessagePort
bootstrapToken
protocolVersions
Data generation
subsystem.hello
frame.activate / frame.resume
activationId
render revision / baseRevision
```

---

## 3. `MessageCarrier` 的边界

底层通用连接能力由 `@loomrealm/foundation` 提供一个极薄的、已经建立完成的消息 carrier abstraction：

```ts
export interface MessageCarrier {
  send(message: string): void | Promise<void>;
  messages(): AsyncIterable<string>;
  readonly closed: Promise<CarrierClosed>;
  close(): void | Promise<void>;
}
```

`MessageCarrier` 只回答：

> “这一条已经连上的、保持 application-message boundary 的双向消息管道如何收发？”

它不回答：

```text
这条连接属于 Control 还是 Data
什么时候建立
谁建立
能否 reconnect
reconnect 后是不是同一个 Data generation
新的 carrier 是否仍有 authority
连接丢失是否导致 Runtime failure
```

因此 `MessageCarrier` 不能直接作为整个 `startSubsystem()` 的唯一连接参数。

---

## 4. Host Integration：两类 Binding，不做假统一

Runtime Control 和 Renderer Data 的连接生命周期不同，必须使用两类独立 binding。

```ts
export interface SubsystemHostBindings {
  readonly runtimeControl: RuntimeControlBinding;
  readonly rendererData: RendererDataBinding;
}
```

不建立泛化的：

```ts
interface ConnectionBinding<T> { ... }
```

除非实现阶段证明两类 binding 有真正稳定的共同机制。当前优先让生命周期语义清楚，而不是为了抽象而抽象。

### 4.1 `RuntimeControlBinding`

Runtime Control 对一个 Launch Attempt 只存在一条成功建立的 Control Connection；同一 Launch Attempt 不允许连接丢失后恢复。

概念 API：

```ts
export interface RuntimeControlBinding {
  acquire(signal?: AbortSignal): Promise<MessageCarrier>;
}
```

约束：

```text
一个 Binding instance 对应一个 Subsystem Launch Attempt
acquire 成功至多一次
返回时 carrier 已完成平台级 establishment
Control carrier 丢失由 Runtime Control Plane 按协议进入 Runtime failure
Binding 不实现 application-level retry / reconnect
```

使用 `acquire` 而不是 `connect`，因为平台行为可能完全不同：

```text
Desktop:
    Subsystem 主动连接 localhost WebSocket

PWA:
    Host 将 MessagePort 交给 Worker / Subsystem
```

核心 SDK 不需要知道哪一方真正执行了 socket connect、listen、accept 或 port transfer。

### 4.2 `RendererDataBinding`

Renderer Data Connection 允许同一 DataAuthority generation 下 sequential carrier replacement，因此它不是一个一次性 Promise，而是一个连接序列。

概念 API：

```ts
export interface RendererDataConnection {
  readonly generation: number;
  readonly carrier: MessageCarrier;
}

export interface RendererDataBinding {
  connections(signal?: AbortSignal): AsyncIterable<RendererDataConnection>;
}
```

Binding 可以依次产生：

```text
generation=7 / carrier A
    ↓ lost / retired
generation=7 / carrier B
    ↓ authority replacement
generation=8 / carrier C
```

规则：

```text
每次 yield 的 carrier 在 yield 时已经通过 Host / Platform establishment 并绑定到当前合法 Data identity
generation 是 Data authority epoch，不是 reconnect count
同一时刻 Subsystem SDK 只安装一条 current Data carrier
旧 carrier 必须先 retired，fresh carrier 才能成为 current
Binding 不产生 child-protocol replay
```

`sessionId`、`subsystemKey`、current Renderer participant 等 identity 可以由该 Subsystem instance / enclosing Host binding 隐式绑定；上层必须至少获得 `generation`，以区分 authority epoch。

---

## 5. Bootstrap material 与物理连接分离

Runtime Control application bootstrap material 不应和物理连接 establishment 混成一个接口。

概念：

```ts
export interface SubsystemBootstrap {
  readonly key: string;
  readonly bootstrapToken: string;
  readonly protocolVersions: readonly number[];
}
```

组合关系：

```text
RuntimeControlBinding
    → 已建立 Control carrier

SubsystemBootstrap
    → subsystem.hello 所需 application material

二者
    ↓
RuntimeControlPlane
```

平台 adapter 可以从环境变量、Host 消息、Worker bootstrap payload 等不同来源取得这些数据，但核心 SDK 不把 transport establishment 与 Control hello 混为一件事。

---

## 6. `RuntimeControlPlane`

`RuntimeControlPlane` 是 SDK 内部长期对象，不是业务代码的“万能 runtime”。

它由：

```text
RuntimeControlBinding
+
SubsystemBootstrap
+
@loomrealm/runtime-control
```

建立。

职责：

```text
acquire Control carrier
subsystem.hello
identity / version binding
status(initializing / ready / failed)
Frame / Call peer
shutdown
Control loss → Runtime failure
Frame RPC deadline / protocol failure propagation
```

它向内部暴露稳定的 typed operations/events，而不是 raw JSON-RPC method names。

概念内部结构：

```ts
interface RuntimeControlPlane {
  readonly frames: InternalFrameRegistry;
  readonly signal: AbortSignal;

  start(): Promise<void>;
  markReady(): Promise<void>;
  fail(error: RuntimeFailure): Promise<void>;
}
```

精确签名在实现阶段按 `@loomrealm/runtime-control` 的真实 consumer 需求收敛。

---

## 7. `RendererDataPlane`

`RendererDataPlane` 是 User Input 与 Render Update 共享的长期数据面宿主。

```text
RendererDataBinding
        ↓
RendererDataPlane
       / \
      /   \
InputManager RenderManager
```

关键性质：

> **Data Plane lifetime 大于任意单条 Data carrier lifetime。**

例如：

```text
RendererDataPlane
────────────────────────────────────────────>

carrier A
────────────X

              carrier B
              ─────────X

                          carrier C
                          ───────────────────>
```

因此 InputListener / RenderDomain 不能直接持有某一条 `MessageCarrier`。

`RendererDataPlane` 负责：

```text
消费 RendererDataBinding.connections()
serialized install current carrier
retire old carrier
current generation observation
Data connection loss notification
child-protocol mux / demux
fresh-carrier baseline notification
bounded send scheduling
```

它不负责：

```text
Frame Stack authority
Activation creation
InputTarget creation
Input Interest business choice
Render Domain business state
```

### 7.1 单一 current Data carrier

Input 与 Render 绝不能各自建立连接。

禁止：

```text
createInputListener()
    → no carrier → connect()

createRenderDomain()
    → no carrier → connect()
```

必须统一为：

```text
RendererDataBinding
        ↓
RendererDataPlane
        ↓ one current carrier
       / \
      /   \
  Input   Render
```

这样才能天然满足每个 Subsystem 同时至多一个 current Data Connection。

---

## 8. Frame：控制流 capability，且绑定 Subsystem instance

Author-facing `Frame` 只表达控制流与业务调用上下文。

候选：

```ts
export interface Frame<TParams = JsonValue> {
  readonly id: string;
  readonly params: TParams;

  call<TResult = JsonValue>(
    subsystemKey: string,
    params: JsonValue
  ): Promise<TResult>;

  return(result: JsonValue): Promise<never>;
}
```

`params` 对应协议 `frame.initialize.input` 的业务参数，但 author API 不再使用属性名 `input`，避免和 User Input 概念永久冲突。

`Frame` object 内部还必须携带不可见的 owner binding：

```text
Frame public identity: frame.id
Frame internal identity: owner Subsystem instance + local Frame Context
```

因此业务 API 应优先传递 `Frame` capability，而不是裸 `frameId`。

业务不得手工使用 `activationId`。SDK 内部负责：

```text
A1 active
→ frame.call()
→ mutation gate
→ A1 revoked
→ caller suspended
→ child completes
→ frame.resume fresh A2
→ install A2
→ resolve frame.call()
```

`frame.return()` 的最终 ergonomics（显式 return capability、handler return value 或两者组合）在 Runtime Control vertical slice 中用真实业务 fixture 决定；本草案只冻结“业务不构造 `frame.return` wire / Activation”的边界。

---

## 9. Input：独立 capability，依赖 Data Plane + Frame identity

Input 不属于 Runtime，也不属于 Render。

Author-facing 创建入口属于 **per-Subsystem instance scope**，而不是 global singleton：

```ts
export interface CreateInputListenerOptions {
  readonly frame: Frame;
  readonly channels: readonly InputChannel[];
}

export interface InputListener {
  on(
    channel: InputChannel,
    handler: (message: InputMessage) => void
  ): Unsubscribe;

  setChannels(channels: readonly InputChannel[]): void;
  close(): void;
}
```

业务示例：

```ts
const input = createInputListener({
  frame,
  channels: [
    "keyboard.event",
    "pointer.state",
    "x.map.interact.event"
  ]
});
```

这里使用 `frame` 而不是 `frameId`，解决：

```text
传错 frameId
跨 Subsystem instance 错绑
依赖 module-global current context
```

### 9.1 `InputManager`

内部：

```text
InputListener(s)
        ↓
aggregate by Frame
        ↓
local Frame Interest Registry
        ↓
User Input full Registry Snapshot
        ↓
RendererDataPlane.current carrier
```

多个 listener 可以绑定同一 Frame；相同 Frame 的 channels 取 union。

`InputManager` 依赖：

```text
RendererDataPlane
InternalFrameRegistry
```

收到 Renderer 输入时重新验证：

```text
current Data carrier
Frame exists locally
Frame active
activationId current
channel ∈ local Interest[Frame]
mutation gate open
```

否则 drop。

### 9.2 Suspension / resume

```text
F1/A1 active
InputListener(F1) alive
Interest[F1] alive

frame.call()
→ A1 revoked
→ F1 suspended
→ listener remains
→ Interest[F1] remains
→ ordinary delivery stops

frame.resume(F1,A2)
→ fresh A2 installed
→ same listener reused
→ no listener recreation
```

Interest configuration 可以跨 fresh Activation 存活；旧 Activation 的 retained Input State/Event 不得跨越。

### 9.3 Data reconnect

当 current Data carrier 退役：

```text
business InputListener remains
local desired Interest Registry remains
wire Interest publication state discarded
retained remote Input State discarded
```

fresh carrier 安装后：

```text
InputManager
→ publish current full Frame Interest Registry
```

业务代码不参与 reconnect。

---

## 10. Render：独立 Runtime-owned presentation capability

Render 不挂在 Frame，也不通过 `runtime.render` service locator 暴露。

Author-facing 创建入口同样由 per-instance scope 注入：

```ts
export interface CreateRenderDomainOptions {
  readonly zIndex?: number;
  readonly name?: string;
}

export interface RenderDomain {
  set(state: RenderTree): void;

  event(
    target: string,
    name: string,
    data?: JsonObject
  ): void;

  close(): void;
}
```

业务：

```ts
const world = createRenderDomain({
  name: "world",
  zIndex: 0
});

world.set(nextTree);
```

### 10.1 Protocol identity 不直接等于业务 name

Render Update v1 的 protocol `domainId` 是 lifecycle identity，具有 one-shot 约束时，SDK SHOULD 自己 mint protocol domain identity。

业务可读的：

```text
name = "world"
```

不应默认直接成为：

```text
domainId = "world"
```

否则 close 后重新创建同名 Domain 很容易误用旧 protocol identity。

### 10.2 Domain 不绑定 carrier

```text
RenderDomain
    ↓
RenderManager
    ↓
RendererDataPlane
    ↓
current carrier
```

Data reconnect 时业务 `RenderDomain` object 继续存在；fresh carrier 后 `RenderManager` 根据 Render Update v1 执行：

```text
current Domain Registry
→ fresh Snapshot for current Domains
→ subsequent Patch / Event
```

业务不需要重建 Domain。

### 10.3 Declarative API

业务默认只表达 desired authoritative state：

```ts
world.set(nextTree);
```

不要同时暴露容易混淆的：

```ts
world.update(...)
world.patch(...)
```

SDK / RenderManager 自己决定如何从 desired state 产生 Snapshot/Patch。

Render Event 保持独立 transient presentation primitive。

---

## 11. Author Instance Scope，不再使用万能 `SubsystemRuntime`

业务需要一个明确的 **per-Subsystem instance dependency scope**，以绑定真实 managers，同时避免 module-global context。

候选：

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

`SubsystemScope` 的含义是：

> “这些 capability factory 属于同一个 Subsystem instance。”

它不表示：

> “Runtime 拥有 Input、Render、Content。”

因此不推荐：

```ts
runtime.input.createListener(...)
runtime.render.domain(...)
runtime.content.get(...)
runtime.frames...
```

也不推荐无作用域的 module-global：

```ts
createInputListener(...)
```

推荐通过 `defineSubsystem` factory 获取已经 instance-bound 的 closure：

```ts
export default defineSubsystem((scope) => {
  const {
    createInputListener,
    createRenderDomain,
    content,
    signal,
  } = scope;

  return {
    async initialize() {
      // Runtime-level business initialization
    },

    async frame(frame) {
      const input = createInputListener({
        frame,
        channels: ["keyboard.event"]
      });

      const world = createRenderDomain({
        name: "world",
        zIndex: 0
      });

      // business logic
    },

    async shutdown() {
      // bounded cleanup
    }
  };
});
```

factory 每启动一个 Subsystem instance 调用 exactly once，因此不会依赖 process-global singleton。

---

## 12. `defineSubsystem` 生命周期

候选模型：

```ts
export interface SubsystemDefinition {
  initialize?(): void | Promise<void>;
  frame(frame: Frame): void | Promise<void>;
  shutdown?(): void | Promise<void>;
  failed?(error: RuntimeFailure): void | Promise<void>;
}

export type SubsystemFactory = (
  scope: SubsystemScope
) => SubsystemDefinition;

export function defineSubsystem(
  factory: SubsystemFactory
): SubsystemFactory;
```

主生命周期使用 typed hooks，不机械暴露：

```text
frame.initialize
frame.activate
frame.resume
subsystem.status
```

默认不再提供：

```ts
runtime.on("shutdown", ...)
```

如果业务有需要被 shutdown/failure 取消的长期异步操作，使用 instance-scoped `AbortSignal`，而不是再造一个 Runtime EventEmitter。

---

## 13. `startSubsystem()`：Host side composition root

之前的单一：

```ts
startSubsystem({
  definition,
  carrier,
  bootstrap,
});
```

不成立，因为它把 Runtime Control 与 Renderer Data 混成了同一连接。

候选：

```ts
export interface StartSubsystemOptions {
  readonly definition: SubsystemFactory;
  readonly bootstrap: SubsystemBootstrap;
  readonly bindings: SubsystemHostBindings;
  readonly content: ContentClient;
}

export function startSubsystem(
  options: StartSubsystemOptions
): Promise<RunningSubsystem>;
```

启动组合：

```text
startSubsystem
    │
    ├─ create RuntimeControlPlane
    │      ↑ RuntimeControlBinding + bootstrap
    │
    ├─ create RendererDataPlane
    │      ↑ RendererDataBinding
    │
    ├─ create InternalFrameRegistry
    │
    ├─ create InputManager
    │      ↑ DataPlane + FrameRegistry
    │
    ├─ create RenderManager
    │      ↑ DataPlane
    │
    ├─ create per-instance SubsystemScope
    │
    ├─ definitionFactory(scope)
    │
    ├─ Control hello / identified
    │
    ├─ definition.initialize()
    │
    ├─ establish required local capability readiness
    │
    └─ subsystem.status(ready)
```

Data Connection 不要求在 `ready` 之前已经存在，除非最终正式 Runtime profile 明确将某个 Data capability 纳入 ready 条件；当前设计不自行制造该依赖。

---

## 14. Desktop / PWA adapter 映射

核心 `@loomrealm/subsystem` 不直接依赖 WebSocket 或 MessagePort。

### Desktop

平台 adapter 可以实现：

```ts
const bindings = {
  runtimeControl: createWebSocketRuntimeControlBinding(...),
  rendererData: createWebSocketRendererDataBinding(...),
};
```

内部可使用：

```text
localhost WebSocket
listen / connect / accept
token / endpoint establishment
```

但向 core 只交付 Binding / MessageCarrier。

### PWA

```ts
const bindings = {
  runtimeControl: createMessagePortRuntimeControlBinding(...),
  rendererData: createMessagePortRendererDataBinding(...),
};
```

内部可以处理：

```text
MessageChannel
MessagePort transfer
Worker bootstrap
port replacement
```

上层 `startSubsystem()` 与业务 definition 完全不变。

因此跨平台统一的是：

> **已经正确绑定身份的连接何时可供协议 Plane 使用。**

而不是强行统一：

```text
WebSocket.connect/listen
MessageChannel.create/transfer
```

---

## 15. Failure / recovery boundary

### Runtime Control loss

```text
Control carrier lost
→ Runtime Control protocol becomes ambiguous / failed
→ RuntimeControlPlane enters fatal path
→ stop normal Frame mutation/input dispatch
→ abort Subsystem scope signal
→ bounded cleanup
```

不得由 `RuntimeControlBinding` 自动 reconnect。

### Data carrier loss

```text
Data carrier lost
→ retire carrier
→ Input/Render wire traffic stops
→ Runtime itself remains healthy
→ Frame Stack not unwound
→ business InputListener / RenderDomain desired state remains locally alive
```

如果 `RendererDataBinding` 后续提供 fresh carrier：

```text
RendererDataPlane installs fresh current carrier
InputManager republishes full Frame Interest Registry
RenderManager republishes required fresh Render baseline
```

业务无 reconnect hook，也不手工恢复 protocol revision。

### Generation replacement

```text
old generation carrier retired
fresh generation connection installed
```

对 child protocol 来说是 fresh connection boundary；不能继承旧 carrier 的 Interest publication、Input State、Render transport continuation。

---

## 16. Error boundary

业务看到三类错误：

### Business error

```text
MapLoadError
BattleRuleError
Content interpretation error
```

由业务处理或映射成业务 Frame outcome。

### SDK usage error

```text
wrong-owner Frame used to create InputListener
closed Frame capability used
pending mutation 时第二次 call/return
closed RenderDomain used
invalid channel declaration
```

这些错误必须可诊断，但不是 wire semantic errors。

### Protocol / Runtime fatal

```text
Control loss
Frame RPC timeout / ambiguous commit
invalid resume
Runtime Control protocol divergence
```

SDK 统一进入 failure path；业务不得通过解析底层 wire code 手工恢复协议状态。

普通 Data loss、Input loss、Event overflow、Render carrier reconnect 本身不是 Runtime fatal。

---

## 17. Public / Host exports 边界

建议未来通过 subpath 明确两类消费者。

### Author exports

```text
@loomrealm/subsystem

  defineSubsystem
  Frame
  SubsystemScope
  InputListener
  RenderDomain
  author-facing value/error types
```

### Host integration exports

候选：

```text
@loomrealm/subsystem/host

  startSubsystem
  SubsystemBootstrap
  RuntimeControlBinding
  RendererDataBinding
  RendererDataConnection
  SubsystemHostBindings
```

Author root MUST NOT re-export：

```text
MessageCarrier
RuntimeControlPeer
JsonRpcMessage
wire validators
activationId manipulation
Data generation mutation helper
WebSocket / MessagePort adapter
```

`MessageCarrier` 属于 foundation/adapter integration，不属于业务作者 API。

---

## 18. 推荐内部结构

目标目录仅表达边界，不要求一次建立所有空文件：

```text
packages/subsystem/
├── DESIGN.md
├── package.json
├── src/
│   ├── definition/
│   │   ├── define-subsystem.ts
│   │   └── scope.ts
│   │
│   ├── frame/
│   │   ├── frame.ts
│   │   ├── context.ts
│   │   ├── registry.ts
│   │   ├── call.ts
│   │   └── mutation-gate.ts
│   │
│   ├── input/
│   │   ├── manager.ts
│   │   ├── listener.ts
│   │   ├── interest-registry.ts
│   │   └── dispatcher.ts
│   │
│   ├── render/
│   │   ├── manager.ts
│   │   ├── domain.ts
│   │   ├── registry.ts
│   │   └── publication.ts
│   │
│   ├── content/
│   │   └── binding.ts
│   │
│   ├── host/
│   │   ├── start-subsystem.ts
│   │   ├── bindings.ts
│   │   └── bootstrap.ts
│   │
│   └── internal/
│       ├── runtime-control-plane.ts
│       ├── renderer-data-plane.ts
│       └── data-dispatch.ts
│
└── test/
```

不要因为这个目标树一次创建所有目录；继续按真实 vertical slice demand-driven 落地。

---

## 19. 实现顺序

### Stage 0 — Boundary closure

当前文档关闭：

```text
Host Binding boundary
Control/Data connection separation
Protocol Plane lifetime
Author instance scope
Frame/Input/Render ownership
reconnect responsibility
```

### Stage 1 — Host binding + Control vertical slice

最小实现：

```text
MessageCarrier consumer
RuntimeControlBinding
SubsystemBootstrap
RuntimeControlPlane
startSubsystem()
defineSubsystem()
hello → initialize → ready → shutdown
```

使用 deterministic in-memory binding 测试，不先依赖真实 WebSocket。

### Stage 2 — Frame vertical slice

```text
Frame Context / Registry
initialize / activate
frame.call / return
mutation gate
fresh resume Activation
failure path
```

业务代码中保持 0 个 activationId / JSON-RPC method name。

### Stage 3 — RendererDataPlane

```text
RendererDataBinding
serialized current carrier installation
same-generation carrier replacement
fresh-generation replacement
retired carrier rejection
```

先只验证 Plane lifecycle，不急于实现完整 Input/Render payload。

### Stage 4 — Input

```text
InputManager
createInputListener({frame, channels})
Frame-scoped Interest aggregation
full Registry publication
suspend/resume reuse
fresh carrier republish
stale Activation receive gate
```

### Stage 5 — Render

```text
RenderManager
createRenderDomain()
SDK-minted domain identity
declarative set()
Registry/Snapshot/Patch publication
fresh carrier baseline recovery
```

### Stage 6 — Real platform adapters

```text
Desktop WebSocket bindings
PWA MessagePort bindings
```

同一 conformance fixture 必须证明两种 binding 对 core 产生等价连接语义。

---

## 20. 必须验证的端到端场景

### Runtime Control

```text
Host supplies RuntimeControlBinding
→ SDK acquires carrier
→ hello
→ initialize
→ ready
→ Frame traffic
→ shutdown
```

### Nested call + Input

```text
F1 active/A1
InputListener(F1) exists
Interest[F1] published

F1 call F2
→ F1 suspended / A1 revoked
→ listener survives
→ input delivery stops

F2 active
→ F2 own Interest required

F2 returns
→ F1 resume fresh A3
→ same F1 listener reused
→ no Interest recreation required on same Data carrier
```

### Data reconnect

```text
F1 active
InputListener alive
RenderDomain alive

carrier A lost
→ no Runtime failure
→ listener/domain objects remain

carrier B same generation
→ install fresh carrier
→ Input full Interest Registry republished
→ Render fresh baseline republished
```

### Platform equivalence

```text
Desktop WebSocket binding
and
PWA MessagePort binding
```

必须让上层 `RuntimeControlPlane` / `RendererDataPlane` 看见相同的 logical behavior；业务 definition 不包含任何平台分支。

---

## 21. Closure acceptance

当以下业务代码可以作为最终 acceptance fixture 时，`@loomrealm/subsystem` 的第一版边界才算闭合：

```ts
export default defineSubsystem(({
  createInputListener,
  createRenderDomain,
  content,
}) => ({
  async initialize() {
    await content.getJson("game/config");
  },

  async frame(frame) {
    const input = createInputListener({
      frame,
      channels: [
        "keyboard.event",
        "pointer.state",
        "x.map.interact.event"
      ]
    });

    const world = createRenderDomain({
      name: "world",
      zIndex: 0
    });

    world.set(buildWorld(frame.params));

    input.on("keyboard.event", event => {
      // business logic only
    });

    const result = await frame.call("loom.battle", {
      enemy: "pikachu"
    });

    // F1 已以 fresh Activation 恢复；input listener 无需重建。
    applyBattleResult(result);
  },

  async shutdown() {
    // bounded cleanup
  }
}));
```

该 fixture 中必须满足：

```text
0 WebSocket / MessagePort
0 MessageCarrier
0 JSON-RPC method name
0 request ID
0 bootstrap token
0 Data generation
0 activationId
0 manual reconnect
0 render revision / patch construction
0 runtime.input / runtime.render service locator
0 module-global current subsystem
```

同时 Host fixture 必须明确提供：

```text
RuntimeControlBinding
RendererDataBinding
SubsystemBootstrap
```

---

## 22. 最终不变量

1. 真实物理连接由 Host / Platform adapter 建立，核心 SDK 只消费抽象 Binding；
2. `MessageCarrier` 表示单条已建立管道，不表示 Control/Data lifecycle；
3. Runtime Control 与 Renderer Data 使用不同 Binding，绝不假设共用一条 carrier；
4. Runtime Control Binding 是 Launch-Attempt one-shot；Control loss不自动 reconnect；
5. Renderer Data Binding 可以顺序产生多条 carrier，并携带 Data generation；
6. `RuntimeControlPlane` / `RendererDataPlane` lifetime 大于单次协议消息，`RendererDataPlane` lifetime 大于单条 Data carrier；
7. Input 与 Render 共享唯一 current Data carrier，但各自拥有独立 child-protocol state；
8. InputListener / RenderDomain 不直接持有或建立物理 carrier；
9. Input 是独立 Frame-scoped capability；Frame capability 作为 author-side identity/owner anchor，不等于 `frame.input` ownership；
10. Frame suspension/fresh Activation不删除 InputListener/Interest；Data carrier replacement触发 wire baseline重建；
11. RenderDomain 与 Frame lifecycle独立，并跨 Data reconnect保持本地 desired state；
12. 业务 capability factory 必须绑定具体 Subsystem instance，禁止依赖 module-global current context；
13. `SubsystemScope` 是 dependency scope，不是万能 Runtime authority/service locator；
14. 平台差异停在 Binding/adapter 层；业务 definition 在 Desktop/PWA 上保持同形；
15. connection lifecycle、protocol lifecycle、capability lifecycle 三者明确分层，任何一层都不得偷偷替代另一层的 authority。

最终结构：

```text
Business Author
    Frame / InputListener / RenderDomain / Content
                    │
             SubsystemScope
                    │
      ┌─────────────┴─────────────┐
      │                           │
RuntimeControlPlane       RendererDataPlane
      │                     /           \
      │                InputManager   RenderManager
      │                           │
RuntimeControlBinding     RendererDataBinding
      │                           │
      └──────── MessageCarrier ───┘
                    │
          WebSocket / MessagePort
```

> **连接由 Host 提供；Plane 拥有协议生命周期；Manager 拥有 capability state；业务只持有 capability。**
