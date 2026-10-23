# Frame-targeted Web Presentation Events：设计与本地 Agent 完整落地计划

> 状态：Proposed / Implementation Plan；**本文提交不代表功能已实现或测试已通过**
> 日期：2026-10-23
> 目标：为 `WebPresentationContext.emitCustomEvent(..., { broadcast: "top-frame" })` 增加严格的 Top Frame 精确投递能力
> 历史参照：PR #102 之前 `d8578e0855a35407dc42d3980bbdf7e22afdde25` 的 User Input v1 精确 Frame 投递
> 当前基线：Web Presentation API v2、Renderer Control v2、Renderer Data Profile v2
> 边界：**本功能不修改 Session Events、SessionEventHub、Session Events Carrier 或其 Subsystem↔Subsystem 业务语义**

## 0. 先锁定边界

本任务只解决一件事：

```ts
context.emitCustomEvent(
  "input.event",
  { action: "down", button: "south", repeat: false },
  {
    broadcast: "top-frame",
    channel: "controls.event",
  },
);
```

使该 reverse Web Presentation Event：

1. 在 Renderer 接受时绑定 Main 当前 Top Active Frame 的 `subsystemKey + frameId + activationId`；
2. 按 exact `channel` 检查该 Frame 的 Presentation Interest；
3. 通过 **Renderer → 目标 Subsystem Data Connection** 直接发送；
4. 在目标 Runtime 内再次检查 `frameId + activationId + deliveryOpen`；
5. 只调用该 Frame 的 Presentation listener；
6. Frame/Activation 已变化时旧 Event 直接丢弃，不改投新的 Top Frame。

### 0.1 本文中的“Render 侧事件”指什么

需要避免三个概念混淆：

```text
A. RenderDomain.emit(...)
   Subsystem → Renderer
   wire type: render.event

B. WebPresentationContext.emitCustomEvent(...)
   Renderer / Web Component → Runtime
   reverse Presentation Event

C. Session Events
   Subsystem Runtime ↔ Subsystem Runtime
   Session-scoped business event
```

本任务修改的是 **B 的 `"top-frame"` 分支**。

本任务：

- **不修改 A 的 `render.event` 正向协议语义**；
- **不修改 C 的 Session Events**；
- 仅因为 B 的新分支需要 Renderer→Subsystem 直达，所以会为 Renderer Data Profile 增加新的 `presentation.*` 子协议。

### 0.2 现有 `false/true` 行为保持原样

当前：

```text
broadcast omitted / false
broadcast true
    ↓
existing Presentation Event publication
    ↓
Desktop/PWA Platform
    ↓
SessionEventHub
```

本任务不重构这一既有行为。

新增：

```text
broadcast "top-frame"
    ↓
Renderer Frame Gate
    ↓
Renderer Data
    ↓
exact target Frame
```

因此：

```ts
switch (options.broadcast) {
  case false:
  case true:
    // existing path, unchanged
    publishExistingPresentationEvent(...);
    break;

  case "top-frame":
    // new direct Renderer -> target Subsystem Data path
    publishTopFramePresentationEvent(...);
    break;
}
```

**`"top-frame"` MUST NOT 进入 SessionEventHub。**

## 1. 修改范围：明确 MUST CHANGE / MUST NOT CHANGE

### 1.1 MUST CHANGE

| 层 | 主要路径 | 修改内容 |
| --- | --- | --- |
| Web Presentation public ABI | `packages/renderer/src/internal/web-projector.ts`、`packages/renderer/src/control.ts` | `broadcast?: boolean \| "top-frame"`；currentness-first；新增 top-frame 分支 |
| Renderer Frame Gate | 建议新增 `packages/renderer/src/internal/presentation-frame-gate.ts` | 复用 InputGate 的 lease / interest / queue 思路，按 Top Frame 精确投递 |
| Renderer Data model/profile | `packages/data/src/model.ts`、`peers.ts`、`runtime.ts`、exports/tests | 新 Renderer Data Profile `/3`；新增 `presentation.interest` / `presentation.event` |
| Renderer Data ingress | `packages/renderer/src/control.ts` | 接收目标 Runtime 的 `presentation.interest`；把 target Data peer 安装到 Frame Gate |
| Subsystem Presentation manager | 建议新增 `packages/subsystem/src/internal/presentation-event-manager.ts` 与 public type 文件 | Frame-scoped listeners、Interest registry、本地 Frame/Activation/deliveryOpen gate |
| Subsystem FrameRuntime | `packages/subsystem/src/internal/frame-runtime.ts` | 提供只读 Frame delivery facts；Frame close/Activation 切换通知 manager |
| SubsystemScope | `packages/subsystem/src/model.ts`、`host/run-subsystem.ts` | 暴露 Presentation-specific Frame listener capability；不复用 `scope.events` |
| Main Data profile selection | `packages/main/src/internal/main-session.ts` 及相关测试 | current Renderer Data profile 从 `/2` 升到 `/3`；**不改 Frame authority 逻辑** |
| Data provisioning expectations | Desktop/PWA/Hostra 的 Data Broker / fixtures / tests（仅实际硬编码 profile 时） | 仅适配 `loomrealm.renderer-data/3`，不加入 Top Frame 路由逻辑 |
| Contracts | 新 Web Presentation API v3、Renderer Data Profile v3、Frame-targeted Presentation Event contract | 冻结新 schema / ordering / lifecycle / limits |
| Game common-controls draft | `game-libs/game-common-controls/game-controls-input.md` | 新组件未来使用 `broadcast:"top-frame"` 和 Presentation Frame listener |
| Qualification | 新 `doc/30-implementation/*qualification*.md` + package scripts | 自动化证明 Frame 精确投递闭环 |

### 1.2 MUST NOT CHANGE

以下模块不是本功能的实现层，除回归测试或文档引用外不得改造：

| 模块 | 约束 |
| --- | --- |
| `packages/session-events/**` | **不修改 API、Hub、Carrier、wire、routing、subscription semantics** |
| `SessionEventHub` | 不增加 `frameId`、`activationId`、`publishToFrame` 或 Frame selector |
| `scope.events` | 继续 Runtime-scoped；不接收 `"top-frame"` Event |
| Desktop `createDelegatedPublisher` 路径 | `false/true` 保持原样；`"top-frame"` 不进入 |
| PWA Presentation Event Platform endpoint | `false/true` 保持原样；`"top-frame"` 不进入 |
| Hostra Session Events provisioning | 不增加 Frame routing |
| Renderer Control v2 schema | 已有 `snapshot.stack` 足够；不恢复 `inputTarget`，不增加 TopFrame 字段 |
| Main Frame stack / call / return authority | 不新增第二套 TopFrame authority，不增加 Platform sink |
| `platform-ports` | 不增加 Main→Platform TopFrame sink |
| `packages/renderer/src/presentation-event.ts` | 现有 Platform publication wire 仍服务 boolean `false/true`，**不为 top-frame 升级** |
| User Input v1 | 保持历史冻结；不恢复 `input.*`、InputTarget、InputGate、InputManager、RendererInputSource |
| `RenderDomain.emit / render.event` | 正向 Render Event 契约不变 |

如果实现过程中发现必须修改上述 MUST NOT CHANGE 项才能让 `"top-frame"` 工作，应停止并重新检查设计，而不是扩大范围。

## 2. 为什么以 User Input v1 为实现模板

历史 User Input v1 的关键路径是：

```text
Main
  stack.at(-1)
  → InputTarget(S,F,A)
        │ Renderer Control
        ▼
RendererInputGate
  current Data(S)
  ∩ Main target(S,F,A)
  ∩ mirrored F active/A
  ∩ Interest[F][channel]
        │
        ▼
Renderer → target Subsystem Data
  input.event { frameId, activationId, channel, payload }
        │
        ▼
Subsystem InputManager
  inspectById(frameId)
  ∩ activationId
  ∩ deliveryOpen
  ∩ local Interest[F][channel]
        │
        ▼
exact Frame listener
```

本任务要保留的是这套**authority 与 delivery topology**，而不是旧 Input 业务协议。

对应关系：

| User Input v1 | 新能力 |
| --- | --- |
| `InputTarget(S,F,A)` | 从当前 Renderer Control `snapshot.stack.at(-1)` 派生的 `TopFrameLease(S,F,A)` |
| `InputGate` | `PresentationFrameGate` |
| `input.interest` | `presentation.interest` |
| `input.event` | `presentation.event` |
| `InputManager` | `PresentationEventManager` |
| `createInputListener({frame,channels})` | Presentation-specific Frame listener |
| Input Producer availability | **不需要**；Web Presentation live RenderNode currentness 已是 producer/currentness gate |
| `input.state/reset` | **不恢复**；Presentation Event 全部按 transient event 处理 |

### 2.1 必须保留的三个历史不变量

1. **发送时绑定 F/A**：Event 一旦 accepted，目标 `frameId + activationId` 固定；不能在稍后发送时重新读取最新 Top Frame。
2. **Sender-side Effective Gate**：Renderer 在进入目标 Data writer 前同时检查 current Data、Top Frame lease、Active/Activation、Interest channel。
3. **Receiver-side Gate**：Runtime 真正执行 callback 前再次检查 Frame 当前仍 live/active、Activation 相同、`deliveryOpen`。

这三个不变量共同解决 delayed event、同 Subsystem 多 Frame 与 Activation 重用问题。

## 3. Public API

Web Presentation API v3 建议：

```ts
type WebPresentationBroadcast =
  | false
  | true
  | "top-frame";

interface CustomEventOptions {
  readonly broadcast?: WebPresentationBroadcast;
  readonly channel?: string;
}
```

兼容：

- 省略或 `false`：现有 owner-only Session Event publication；
- `true`：现有 Session-wide Session Event publication；
- `"top-frame"`：新的 Renderer Data direct lane。

`name`、`channel`、`data`、options closed-shape validation 延续 v2；`channel` 保持 exact routing key。

对 stale Web Presentation Context，继续保持 currentness-first：

```text
stale/revoked source
→ silent drop
→ do not validate user arguments
```

Current source 才验证 `broadcast/name/channel/data`。

## 4. Renderer：TopFrameLease 与 PresentationFrameGate

### 4.1 不恢复 `inputTarget`

Renderer Control v2 已有：

```ts
interface RendererFrameStateV2 {
  readonly frameId: string;
  readonly subsystemKey: string;
  readonly lifecycle: "starting" | "active" | "suspended" | "closing";
  readonly activationId?: string;
}

interface RendererAuthoritySnapshotV2 {
  readonly stack: readonly RendererFrameStateV2[];
  // ...
}
```

因此：

```ts
interface TopFrameLease {
  readonly subsystemKey: string;
  readonly frameId: string;
  readonly activationId: string;
}

function currentTopFrameLease(
  snapshot: RendererAuthoritySnapshotV2,
): TopFrameLease | null {
  const top = snapshot.stack.at(-1);
  if (
    top === undefined ||
    top.lifecycle !== "active" ||
    top.activationId === undefined
  ) return null;

  return Object.freeze({
    subsystemKey: top.subsystemKey,
    frameId: top.frameId,
    activationId: top.activationId,
  });
}
```

Main 仍通过 Control snapshot 是唯一公共 Frame authority；不新增 Main→Platform route。

### 4.2 `emitCustomEvent` 接受时固定 lease

Renderer 已验证 source：

```text
Session current
AND source subsystem Data authority current
AND source generation current
AND source Data carrier current
AND RenderNode(domainId,targetKey) current
```

之后解析 options。

若 `broadcast !== "top-frame"`，完全走现有 publication queue。

若为 `"top-frame"`：

1. 从**同一当前 Control snapshot**取得 `TopFrameLease`；
2. lease 为空则 drop；
3. 构造不可变 accepted event，把 F/A 固定下来；
4. 交给 `PresentationFrameGate`，之后绝不重新寻址。

建议 accepted shape：

```ts
interface AcceptedTopFramePresentationEvent {
  readonly sourceSubsystemKey: string;
  readonly sourceGeneration: number; // Renderer internal currentness/fencing fact
  readonly frameId: string;
  readonly activationId: string;
  readonly targetSubsystemKey: string;
  readonly channel: string;
  readonly name: string;
  readonly domainId: string;
  readonly targetKey: string;
  readonly data: JsonObject;
}
```

`sourceGeneration` 可以只用于 Renderer 内部 queue/currentness bookkeeping；business wire 是否暴露 generation 由新 contract 决定，默认不需要业务可见。

### 4.3 Effective Gate

对已绑定事件 `E(S,F,A,C)`：

```text
Effective(E)
=
current Control still belongs to same Session
AND current target Data Connection for S
AND current Top Frame == (S,F,A)
AND mirrored F exists
AND mirrored F lifecycle == active
AND mirrored F activationId == A
AND C ∈ published PresentationInterest[S][F]
```

注意：这里检查“current Top Frame 仍是原 lease”，不是为了 retarget，而是为了决定旧 event 是否仍可发送。

如果任何条件失效：

```text
not-yet-started Event → discard
already in-flight Event → cannot retract; receiver local gate drops if stale
```

### 4.4 队列语义复用旧 InputGate

`PresentationFrameGate` 应复用旧 `BoundedInputPublisher` 的关键行为：

- 每个 current target Data peer 单 writer / one send in flight；
- Event FIFO；
- queue bounded；
- lease 改变时丢弃尚未开始的旧 lease Event；
- Interest 缩小时丢弃对应尚未开始的 channel Event；
- Data peer retired 时清空未开始 work；
- already-started physical send 不尝试回滚；
- fresh Data carrier 从 empty remote Interest 开始，Subsystem 自动 republish full registry。

本任务没有 Framework-retained State，因此：

- 不实现 `input.reset`；
- 不做 State coalescing；
- `controls.state` 只是 name/channel 上的普通 transient Presentation Event；
- 新 Frame 状态收敛依赖未来 `game-controls-input` 的周期 State refresh / fresh-state tracker。

## 5. Renderer Data Profile v3

当前 `loomrealm.renderer-data/2` 是 closed message set：

```text
Subsystem → Renderer
  render.domains
  render.snapshot
  render.patch
  render.event

Renderer → Subsystem
  viewport.state
```

因此不能偷偷加入新消息。必须创建：

```text
loomrealm.renderer-data/3
```

### 5.1 v3 消息方向

```text
Subsystem → Renderer
  render.domains
  render.snapshot
  render.patch
  render.event
  presentation.interest

Renderer → Subsystem
  viewport.state
  presentation.event
```

`render.*` 与 `viewport.*` 的既有语义不变。

Data `protocol-fatal` family 增加 `"presentation"`（或项目最终 contract 采用的等价名称）。

### 5.2 `presentation.interest`

建议 wire：

```ts
interface PresentationFrameInterestV1 {
  readonly frameId: string;
  readonly channels: readonly string[];
}

interface PresentationInterestV1 {
  readonly type: "presentation.interest";
  readonly frames: readonly PresentationFrameInterestV1[];
}
```

语义直接复用 User Input v1 Registry：

```text
PresentationInterestRegistry
=
Map<frameId, Set<channel>>
```

规则：

- current Data carrier 上 full replacement；
- fresh carrier remote registry 初始为空；
- unknown/stale Frame interest 保存为 inert configuration，不创造 authority；
- Frame id 在 Session 内不应复用；
- Frame close 前本地 listener 必须关闭/remove desired interest；
- multiple local listeners 对同一 Frame/channel 做 union；
- Interest 是 configuration，不是 Frame authority。

建议复用旧 Input v1 限制：

```text
0..128 frame entries
1..64 channels per present frame
<=4096 frame×channel pairs

frames sorted by frameId
channels sorted lexically
no empty frame entry
{"type":"presentation.interest","frames":[]} clears all
```

channel 验证必须与 Web Presentation `options.channel` 完全一致：

- Unicode scalar string；
- 不允许 C0/DEL；
- 1..256 UTF-8 bytes。

### 5.3 `presentation.event`

建议 wire：

```ts
interface PresentationEventV1 {
  readonly type: "presentation.event";

  // trusted source provenance from the live RenderNode
  readonly sourceSubsystemKey: string;
  readonly domainId: string;
  readonly targetKey: string;

  // trusted destination lease from Main Renderer Control snapshot
  readonly frameId: string;
  readonly activationId: string;

  // business routing/content
  readonly channel: string;
  readonly name: string;
  readonly data: JsonObject;
}
```

该消息运行在**目标 Subsystem 的 Data Connection**上，因此：

```text
Data binding owner = destination Subsystem
sourceSubsystemKey = source Web Presentation RenderNode owner
```

两者允许不同：

```text
source WC owner = world
top Frame owner  = battle
→ message physically sent over battle Data peer
→ sourceSubsystemKey remains "world"
```

业务不能提供或覆盖 `sourceSubsystemKey/frameId/activationId/domainId/targetKey`；这些字段由 Renderer 可信绑定。`channel/name/data` 来自 current Web Component 调用并经过验证。

## 6. Subsystem：PresentationEventManager

### 6.1 不使用 `scope.events`

新增独立 Presentation capability，建议形态：

```ts
interface PresentationFrameEvent {
  readonly channel: string;
  readonly name: string;
  readonly data: JsonObject;
  readonly source: {
    readonly subsystemKey: string;
    readonly domainId: string;
    readonly targetKey: string;
  };
}

interface PresentationEventListener {
  on(
    channel: string,
    handler: (
      event: PresentationFrameEvent,
    ) => void | Promise<void>,
  ): () => void;

  setChannels(channels: readonly string[]): void;
  close(): void;
}

interface PresentationEventClient {
  createListener(options: {
    readonly frame: Frame;
    readonly channels: readonly string[];
  }): PresentationEventListener;
}

interface SubsystemScope {
  // existing fields...
  readonly presentationEvents: PresentationEventClient;
}
```

最终命名可以按 package 风格微调，但必须满足：

- listener 显式绑定真实 `Frame` object；
- Frame ownership 通过 `WeakMap<Frame, FrameContext>` 校验，不允许业务用字符串伪造 foreign frame；
- Channel contribution 与 handler registration 分离，语义可直接参考旧 InputManager；
- listener close 幂等；
- Frame close 自动关闭其 listeners；
- Runtime terminal 自动全部关闭。

### 6.2 Frame delivery facts

`FrameRuntime` 提供内部只读检查：

```ts
type FrameDeliveryFacts =
  | { readonly kind: "closed" }
  | {
      readonly kind: "live";
      readonly frameId: string;
      readonly activationId: string | null;
      readonly deliveryOpen: boolean;
    };
```

其中：

```ts
deliveryOpen = context.state === "active";
```

以下均为 false：

```text
initialized
activating
calling
awaiting-resume
resuming
suspending
admin-suspended
returning
closing
closed
```

### 6.3 receiver-side gate

`PresentationEventManager.onEvent(message)`：

```ts
const view = frameRuntime.inspectById(message.frameId);

if (
  view?.kind !== "live" ||
  !view.deliveryOpen ||
  view.activationId !== message.activationId ||
  !desired.get(message.frameId)?.has(message.channel)
) {
  return accepted; // stale/ineligible: drop only
}

deliverToExactFrame(
  message.frameId,
  message.channel,
  event,
);
```

`deliverToExactFrame` 只扫描绑定同 `frameId`、同 channel、仍 active 的 registrations。

这一步是**同 Subsystem 多 Frame 精确隔离的最终保证**。

## 7. Activation / Frame 切换时序

### 7.1 World A1 → Battle B1

```text
T0 Renderer current top = World / A1
T1 WC emits Event
T2 Renderer binds Event to World/A1
T3 World frame.call(Battle)
T4 Control snapshot changes to Battle/B1
```

行为：

- `PresentationFrameGate` 看到 lease 改变，丢弃尚未开始发送的 World/A1 Event；
- 如果 Event 已进入物理 Data send，则消息仍携带 World/A1；
- World Runtime 此时 `deliveryOpen=false` 或 activation 已撤销；
- receiver drop；
- **绝不改投 Battle/B1**。

### 7.2 World A1 → Battle → World A2

即使恢复后是同一个 `frameId`：

```text
A1 != A2
```

因此旧 A1 Event 不能执行于 A2。

Interest MAY 跨 fresh Activation 保留，只要 Frame 仍 live 且业务 listener 未关闭；但 Event 永不跨 Activation replay。

### 7.3 同 Subsystem parent/child

这是不能只做 `targetSubsystemKey` 的原因：

```text
Subsystem "rpg"
  Frame parent F1
  Frame child  F2
both listen controls.event
```

如果当前 top = F2/A2，只能 F2 listener 执行。

F1 的 listener 即使仍注册、Interest 仍保留，也因为 wire target `frameId=F2` 不匹配而完全不会被调用。

## 8. 与现有 Presentation `false/true` 路径的隔离

新逻辑必须在 Renderer 内明确分叉：

```text
emitCustomEvent
  |
  +-- broadcast false / true
  |      existing accepted publication
  |      existing presentation-event.ts
  |      Platform
  |      Session Events
  |
  +-- broadcast "top-frame"
         AcceptedTopFramePresentationEvent
         PresentationFrameGate
         target RendererDataPeer.presentation.sendEvent()
```

因此下面文件**不应因为新 top-frame wire 而变化**：

- `packages/renderer/src/presentation-event.ts`；
- `apps/desktop/src/presentation-events-websocket.ts`；
- Desktop `product-composition.ts` 的 `createDelegatedPublisher` routing；
- `apps/pwa/src/pwa-platform.ts` Presentation Event server routing；
- `packages/session-events/**`。

若 TypeScript control flow 需要更清晰，可以把 `AcceptedPresentationEvent` 改为 discriminated union：

```ts
type AcceptedPresentationEvent =
  | {
      readonly kind: "existing-publication";
      readonly publication: PresentationEventPublication; // boolean only
    }
  | {
      readonly kind: "top-frame";
      readonly event: AcceptedTopFramePresentationEvent;
    };
```

但 `PresentationEventPublication.broadcast` 本身继续保持 boolean。

## 9. Data Profile / Platform 的跨界边界

从 `/2` 升到 `/3` 会触及 Data provisioning identity，这属于不可避免的 profile 版本切换，但不是新的 routing authority。

### 9.1 Main

Main 只需把 committed Data authority 中：

```text
loomrealm.renderer-data/2
```

更新为：

```text
loomrealm.renderer-data/3
```

Main 的：

- Stack；
- Frame lifecycle；
- Activation；
- `validateFrameSource`；
- call/return/suspend/resume；

全部保持原语义。

### 9.2 Desktop/PWA/Hostra Data Broker

Broker 当前按 authority tuple：

```text
subsystemKey + generation + dataProfile
```

做 provisioning/currentness。

允许修改：

- profile constant / tests / fixture expectation；
- 为新 `/3` 建立同一条 Data carrier。

禁止修改：

- Broker 解析 top Frame；
- Broker 解析 `presentation.event`；
- Broker 决定目标 Frame；
- Platform 增加 Main TopFrame sink。

Frame routing 全部停留在 Renderer + target Runtime 两端。

## 10. 文件级实施清单

### 10.1 预期代码修改

```text
packages/data/
  src/model.ts
  src/peers.ts
  src/runtime.ts
  src/index.ts
  test/*
  + presentation validation/sender helper（如需要）

packages/renderer/
  src/control.ts
  src/internal/web-projector.ts
  src/internal/presentation-frame-gate.ts   [new]
  test/*
  NOTE: src/presentation-event.ts should remain unchanged for top-frame

packages/subsystem/
  src/model.ts
  src/host/run-subsystem.ts
  src/internal/frame-runtime.ts
  src/internal/presentation-event-manager.ts [new]
  src/presentation-events.ts                  [new, if public types separated]
  test/*

packages/main/
  src/internal/main-session.ts
  test/*
  only dataProfile /3 selection + expectations

apps/desktop/, apps/pwa/, packages/game-launcher-hostra/
  only Data Profile /3 provisioning tests/fixtures if hard-coded
  no Frame routing logic

game-libs/game-common-controls/
  game-controls-input.md
  future implementation/tests only when this component is actually implemented

doc/15-contracts/
  web-presentation-api-v3.md                  [new]
  renderer-data-profile-v3.md                 [new]
  frame-targeted-presentation-event-v1.md     [new or equivalent]
  README.md navigation

doc/30-implementation/
  frame-targeted-presentation-events.md       [this plan]
  frame-targeted-presentation-events-qualification.md [new at implementation completion]
```

### 10.2 明确不允许出现的 diff

实施 PR 中如出现以下改动，应逐项解释；正常设计下应为 **zero functional diff**：

```text
packages/session-events/src/**
packages/session-events protocol version
SessionEventHub routing
SessionEventClient API
Session Events carrier schema

MainPlatform TopFrame sink
platform-ports TopFrame authority

apps/desktop Session Events routing
apps/pwa Session Events routing
Hostra Session Events provisioning

Renderer Control v2 frame schema
snapshot.inputTarget

Framework input.* / InputGate / InputManager restoration
```

## 11. 实施顺序

### P0：先冻结新 contract 与 failing tests

写明：

- `broadcast:"top-frame"`；
- Data Profile `/3`；
- `presentation.interest` / `presentation.event` closed schema；
- TopFrameLease / Effective Gate；
- receiver delivery gate；
- queue / replacement / stale drop；
- source provenance；
- profile upgrade compatibility。

先加入至少以下 failing tests：

1. 同 Subsystem parent/child 同 Channel；
2. World/A1 Event 在 Battle/B1 成为 top 后不执行；
3. World/A1 → World/A2 旧 Event 不执行；
4. owner=World、target=Battle 时 source provenance 仍为 World；
5. `scope.events` 绝不会收到 `"top-frame"` Event。

### P1：Data Profile v3 + Subsystem manager

先实现新 Data 消息和 Frame-scoped Presentation listener：

- Data codec/closed message set；
- full replacement Interest；
- listener registry union；
- fresh carrier Interest republish；
- receiver F/A/deliveryOpen gate；
- frame close / runtime terminal cleanup。

此阶段可用 synthetic Renderer Data peer 验证，不涉及 Session Events。

### P2：Renderer PresentationFrameGate

实现：

- top lease from current Control snapshot；
- target Data slot currentness；
- target Interest；
- queue / one send in flight；
- lease replacement discard；
- Data retirement fencing；
- source provenance；
- accepted top-frame Event 不 retarget。

### P3：接入 `emitCustomEvent`

修改 options union 与 `control.ts` branch：

- stale source currentness-first；
- `false/true` regression untouched；
- `"top-frame"` 进入 Frame Gate；
- top-frame 不调用 `this.presentationEvents?.publish(...)`。

### P4：Profile rollout、业务草案与端到端

- Main 切 Data Profile `/3`；
- 更新必要 Data Broker fixture/expectation；
- 更新 `game-controls-input.md`；
- Desktop 与 PWA 各做真实 Renderer→Data→Runtime Frame callback 闭环；
- 跑全套回归及 docs。

## 12. 必测矩阵

| ID | 场景 | 预期 |
| --- | --- | --- |
| F01 | 省略 / `broadcast:false` | 现有 owner-only 路径不变 |
| F02 | `broadcast:true` | 现有 Session-wide 路径不变 |
| F03 | `"top-frame"` + no active top | drop；不进入 Platform/Session Events |
| F04 | owner=World，top=Battle | Battle Frame 收到，source=World |
| F05 | World/A1 accepted，发送前切到 Battle/B1 | queue 中旧 Event discard |
| F06 | World/A1 已在-flight，随后切 Battle | World Runtime receiver drop；Battle 不收到 |
| F07 | World/A1 → Battle → World/A2 | A1 Event 不在 A2 执行 |
| F08 | same Subsystem parent/child 同 Channel | 仅 target `frameId` listener 执行 |
| F09 | target Frame calling/awaiting-resume | `deliveryOpen=false`，drop |
| F10 | target Frame closing/closed | drop + listener cleanup |
| F11 | Interest-first / authority-first | 两种顺序最终 Effective 一致 |
| F12 | Interest shrink 时 Event 尚未发送 | 对应 queued Event discard |
| F13 | fresh Data carrier | remote Interest empty，然后自动 republish full desired registry |
| F14 | target Data retirement / generation replacement | old queue fenced，不能复活 |
| F15 | stale RenderNode + invalid args | stale-first silent drop，不抛业务参数错误 |
| F16 | invalid current `broadcast:"bad"` | synchronous `TypeError` |
| F17 | `presentation.event` forged F/A/source from Runtime side | schema/direction拒绝；Runtime 不能发送 Renderer→Subsystem message |
| F18 | Frame listener callback throw/reject | callback-local isolation，Data peer 不因此 terminal |
| F19 | normal `scope.events` subscribes same channel | 不收到 top-frame Event |
| F20 | top-frame listener exists, ordinary Session Event same channel | Presentation listener 不收到普通 Session Event |
| F21 | `render.event` forward path | 完全保持既有行为 |
| F22 | Renderer Data `/2` old message set historical contract | 不篡改历史 contract；current runtime 明确使用 `/3` |
| F23 | Desktop actual Data carrier end-to-end | browser source → exact Frame callback |
| F24 | PWA actual Data carrier end-to-end | browser source → exact Frame callback |

## 13. Qualification 与回归

建议新增：

```text
test:frame-targeted-presentation:qualification:run
test:frame-targeted-presentation:qualification
```

Qualification 至少覆盖：

- Data `presentation.*` validation；
- PresentationFrameGate；
- Subsystem PresentationEventManager；
- Frame lifecycle race；
- Renderer Web Presentation branch；
- Desktop Data vertical；
- PWA Data vertical。

现有 Session Events 不属于本实现，但仍可通过全仓 regression 验证“没有被影响”；**不需要新增或修改 Session Events qualification case 来证明 top-frame**。

实施完成后执行实际可用命令，例如：

```bash
npm test -w @loomrealm/data
npm test -w @loomrealm/renderer
npm test -w @loomrealm/subsystem
npm test -w @loomrealm/main

npm run test:frame-targeted-presentation:qualification

npm run test:game-common-controls-input:qualification
npm run test:regression
npm run docs:check-links
npm run docs:build
```

测试结果必须记录实际 PASS/FAIL/SKIP；没有运行的命令不得写成 PASS。

## 14. 明确禁止的实现捷径

- 给 `SessionEventHub` 增加 Frame awareness。
- 新建 Session Events v2 只为 `"top-frame"`。
- 增加 `scope.frameEvents` 但底层仍走 Session Events。
- 在 Platform/Host 收到事件后才重新读取 top Frame。
- 新增 Main→Platform TopFrame authority sink。
- 只按 `targetSubsystemKey` 投递，忽略同 Subsystem 多 Frame。
- 把 `frameId` / `activationId` 放进 business `data` 让消费者自己过滤。
- 让业务 Web Component 指定目标 Frame。
- 复活 `InputTarget`、`InputGate`、`InputManager`、`input.*`。
- 修改 frozen Renderer Control v2 只为添加现成已有的 top-frame 信息。
- 把 `presentation.event` 做成 `render.event` 的反向同名消息；两者方向和职责必须保持清晰。
- 将 existing `PresentationEventPublication` 的 boolean wire 扩展为 `"top-frame"` 并发送 Platform；top-frame 必须在 Renderer 内分叉。
- 因 Data Profile `/3` 升级而把 Desktop/PWA Broker 变成 Frame router。

## 15. Definition of Done

只有全部满足，才可宣布完成：

- [ ] `broadcast:"top-frame"` public API 可用；`false/true` 无行为改变。
- [ ] top-frame Event 不进入 Platform Presentation Event endpoint，不进入 SessionEventHub。
- [ ] Renderer 只从 current Control v2 `stack.at(-1)` 派生 `S/F/A`，没有第二套 Frame authority。
- [ ] Event 在 acceptance 时绑定 F/A；之后永不 retarget。
- [ ] Renderer sender-side gate 包含 current target Data + current top F/A + exact Interest channel。
- [ ] Data Profile `/3` 有 closed `presentation.interest` / `presentation.event` 双向 schema。
- [ ] fresh Data carrier 从 empty Interest 开始并自动 republish full desired registry。
- [ ] Subsystem listener 绑定真实 Frame object，foreign Frame 被拒绝。
- [ ] receiver 在 callback 前检查 exact frameId、activationId、deliveryOpen、local Interest。
- [ ] 同 Subsystem parent/child 同 Channel 测试证明仅 target Frame 执行。
- [ ] A1→B1、A1→A2 delayed Event 测试证明旧 Event 不改投、不复活。
- [ ] owner 与 target 不同 Subsystem 时 source provenance 正确。
- [ ] `render.event`、Viewport、Session Events 全部保持原契约。
- [ ] Session Events 源码无本功能性修改；没有 Hub/Carrier Frame routing。
- [ ] Main 无 TopFrame sink、Renderer Control v2 无 schema 扩展、无 `inputTarget` 回流。
- [ ] Desktop/PWA 只承担既有 Data profile provisioning，不承担 Frame 决策。
- [ ] 新 contracts、qualification、docs navigation 与代码一致。
- [ ] F01–F24 均有自动化证据或明确记录的环境阻断。
- [ ] regression / docs checks 有实际结果。

## 16. 交给本地 Agent 的实施指令

> 以本文为实施主线。先用历史 `d8578e0` 的 `currentInputTarget`、`RendererInputGate.currentLease/recompute`、`InputManager.onEvent/deliver`、`FrameRuntime.inspectById` 校准行为，然后把这一精确 Frame 投递模式泛化为 Presentation Event。新增 `broadcast:"top-frame"` 时必须在 Renderer 内与现有 boolean publication 分叉：`false/true` 保持现有 Session Events 路径，`"top-frame"` 通过 Renderer Data Profile `/3` 的 `presentation.interest/event` 直接投递到目标 Runtime，再由本地 Frame/Activation/deliveryOpen gate 精确执行。不得修改 Session Events、Hub、Carrier、Hostra Session Events，不得新增 Main→Platform TopFrame authority，不得只做 target Subsystem 定向，也不得恢复 Framework User Input。按 P0→P4 完成代码、自动测试、Desktop/PWA Data vertical、contracts、qualification 与回归，并以实际运行结果闭环。
