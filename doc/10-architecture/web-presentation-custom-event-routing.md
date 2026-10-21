# Web Presentation Custom Event Routing

> 状态：Proposed / Architecture Design / 未实现 / 未冻结 / 未 Qualification  
> 更新：2026-10-21  
> 目的：定义 LoomRealm Framework 如何把 WebPresentationContext.emitCustomEvent 从 User Input reverse capability 演进为通用 Web Presentation custom-event 路由能力。  
> 上层用例：[Game Common Controls](../../game-libs/game-common-controls/DESIGN.md)  
> 相关现行规范：[Web Presentation API v1](../15-contracts/web-presentation-api-v1.md)、[User Input v1](../15-contracts/user-input-v1.md)、[Session Events v1](../15-contracts/session-events-v1.md)、[Main Renderer Control v1](../15-contracts/main-renderer-control-v1.md)、[Renderer Data Profile v1](../15-contracts/renderer-data-profile-v1.md)

本文描述目标架构，不改变现有 Frozen v1 的当前事实。

## 1. 目标

Framework 最终只提供以下能力：

~~~text
RenderNode / Web Component hosting
        +
Web Presentation Context
        +
trusted custom-event publication
        +
trusted broadcast=true Session publication
        +
Session Events delivery
~~~

Framework 不再拥有：

~~~text
Keyboard
Pointer
Gamepad
Input Interest
Input State/Event/Reset
InputTarget
InputGate
InputManager
physical input producer
~~~

User Input 成为 game-libs / game application 的业务协议。Presentation 可以按需挂载多个彼此独立的设备 Web Components，例如 game-keyboard-input、game-pointer-input、game-gamepad-input；Framework 不创建默认全局输入组件，也不要求这些设备能力同时存在。

## 2. API

目标接口：

~~~ts
interface CustomEventOptions {
  /**
   * Exact Session Events routing channel for broadcast publication.
   * Omitted means WEB_PRESENTATION_EVENT_CHANNEL_V1.
   */
  readonly channel?: string;
  readonly broadcast?: boolean;
}

interface WebPresentationContext {
  readonly resources: PresentationResourceClient;

  emitCustomEvent(
    name: string,
    data?: JsonObject,
    options?: CustomEventOptions,
  ): void;
}
~~~

语义：

~~~text
options omitted
    => broadcast=false; legacy owner-only path

{ broadcast: false }
    => owner-only

{ broadcast: true }
    => Session-scope broadcast on the default
       WEB_PRESENTATION_EVENT_CHANNEL_V1

{ broadcast: true, channel: "keyboard.state" }
    => Session-scope broadcast on exact channel
       "keyboard.state"

channel without broadcast=true
    => invalid options; synchronously throw TypeError
~~~

CustomEventOptions 保留对象形态。broadcast 是当前唯一字段，但不是把整个第三参数设计成 boolean；未来可以在 options 中增加新的正交能力。

broadcast 选择 Web Presentation publication path / recipient scope。对于 broadcast=true，options.channel（若提供）决定真实的 SessionEvent.channel；省略时使用默认 WEB_PRESENTATION_EVENT_CHANNEL_V1。name 仍然是 SessionEvent.type，channel 不会被塞进 payload。


## 3. Channel、type、payload、broadcast 职责

概念必须分离：

~~~text
Channel
    = Web Presentation event routing domain
      （仅 broadcast=true 新路径进入 Session Events）

type
    = emitCustomEvent(name, ...) 的 name

payload
    = {
        domainId,
        targetKey,
        data
      }

broadcast
    = Web Presentation 边界上的路径选择
      false -> 迁移期 legacy owner-only path
      true  -> trusted Session broadcast path
~~~

### 3.1 固定 Channel

broadcast=true 的 Web Presentation custom event 使用 Framework 固定 Channel。

现行代码已有：

~~~ts
WEB_PRESENTATION_EVENT_CHANNEL_V1 =
  "x.loomrealm.web-presentation.event";
~~~

目标设计保留该 Channel 的职能，但把其 ownership 从 User Input custom event 迁移到 Web Presentation / generic event infrastructure。

业务代码不得通过 emitCustomEvent options 设置或修改 Channel。

### 3.2 name 不是 Channel

custom-event name 是事件业务类型。对于 broadcast=true：

~~~ts
context.emitCustomEvent(
  "controls.event",
  { action: "confirm" },
  { broadcast: true },
);
~~~

概念事件：

~~~text
channel = x.loomrealm.web-presentation.event
          // options.channel omitted: default route
type    = controls.event
payload = {
  domainId,
  targetKey,
  data: { action: confirm }
}

For device input:
channel = keyboard.state
type    = input.state
payload = {
  domainId,
  targetKey,
  data: { down: ["KeyW"] }
}
~~~

不得把 controls.event 作为 Session Events channel。

### 3.3 broadcast 不成为 Session Events routing metadata

broadcast=true 的含义是：进入 trusted Session broadcast path，并按现有 Session Events exact-Channel 规则投递给 options.channel 指定的 Channel；若未指定，则投递到默认固定 Channel 的 matching subscriptions。

broadcast=false / options omitted 在迁移阶段保持现行 owner-only v1 行为，不进入新的 Session Events broadcast path。

因此本设计不向 SessionEventHub 增加 owner/session audience，不改变 Channel-only recipient selection。


## 4. 逻辑路由

本设计新增的是 broadcast=true 路径：

~~~text
Business Web Component
        |
        | emitCustomEvent(name, data, { broadcast:true })
        v
WebProjector
        |
        | stable Context bound to RenderNode
        v
Renderer Presentation seam
        |
        | currentness validation
        | bind trusted provenance
        | validate name/data/options
        v
Presentation Event Publisher
        |
        v
Platform Presentation Event Binding
        |
        v
Trusted Session Host ingress
        |
        | resolved Channel (options.channel or default)
        | source = authenticated RenderNode owner
        v
Session Event routing
        |
        +-> all matching subscriptions of that exact Channel
~~~

broadcast=false / options omitted 的 owner-only 路径在迁移期继续使用现行实现。本设计不通过修改 SessionEventHub 来统一这两条路径。

## 5. Renderer 改动

当前主要实现接缝：

~~~text
packages/renderer/src/internal/web-projector.ts
packages/renderer/src/internal/presentation-seam.ts
packages/renderer/src/control.ts
~~~

### 5.1 WebProjector

WebProjector 创建的 Context 增加 options 参数：

~~~ts
emitCustomEvent(name, data, options)
~~~

WebProjector 只负责：

- 将调用与当前 LiveElement 绑定；
- 把 name/data/options 传给 Renderer presentation seam；
- detached/teardown 后 Context 无法继续产生有效事件。

它不决定 Channel，也不理解业务输入。

### 5.2 Presentation seam

RendererPresentationNodeEvent 增加 options：

~~~ts
interface RendererPresentationNodeEvent {
  readonly sessionId: string;
  readonly subsystemKey: string;
  readonly generation: number;
  readonly domainId: string;
  readonly targetKey: string;
  readonly name: unknown;
  readonly data: unknown;
  readonly options: unknown;
}
~~~

subsystemKey/generation/domainId/targetKey 来自 trusted LiveElement，不来自 business payload。

### 5.3 ControlHolder

现有 ControlHolder 对 reverse event 的 currentness 检查应抽取并复用：

~~~text
current Renderer Control
current Session
current Data authority
matching generation/profile
current Render Store target
current Presentation attachment
~~~

之后进入新的 Presentation Event publication 路径：

~~~text
emitPresentationNodeEvent
    |
    +-- validate current RenderNode
    +-- validate options/name/data
    +-- resolve options.channel or default Channel
    +-- bind source provenance
    +-- if broadcast=true: enqueue PresentationEventPublisher
    +-- otherwise: keep current owner-only compatibility path
~~~

最终不再：

~~~text
wrap InputEventV1
-> custom Input channel
-> InputGate
~~~

过渡阶段旧双参数行为可以保留兼容分支，但该分支最终删除。

## 6. Platform Port

新增窄能力，不把 Hub 暴露给 Renderer：

~~~ts
interface PresentationEventPublication {
  readonly sessionId: string;
  readonly ownerSubsystemKey: string;
  readonly generation: number;
  readonly domainId: string;
  readonly targetKey: string;
  readonly name: string;
  readonly data: JsonObject;
}

interface RendererPresentationEventBinding {
  publish(event: PresentationEventPublication): Promise<void>;
}
~~~

这是 trusted Renderer -> Platform 的内部能力，不是业务 API。

服务端必须二次验证 session / document / owner / generation，不因为 Renderer request 中带有字段就自动信任。


## 7. Host / Session Events 边界

### 7.1 Session Events v1 routing 保持不变

Session Events 继续：

~~~text
Channel = exact routing scope
type    = business discriminator
payload = business data
~~~

对于 trusted broadcast=true publication：

~~~text
Host accepts trusted Presentation publication
    -> materialize one Session Event on the resolved exact Channel
    -> existing SessionEventHub exact-Channel routing
    -> every matching subscription receives it
~~~

本设计不增加：

~~~text
PresentationEventAudience
owner/session recipient filter
subscription-owner filtering
Hub-side presentation-specific routing branch
~~~

因此不会改变 Frozen Session Events v1 的 recipient semantics。

### 7.2 owner-only 不在本阶段统一

broadcast=false / options omitted 的 owner-only custom event 仍保持现行 Web Presentation v1/InputGate 路径，直到后续独立设计替代它。

如果未来要让 owner-only 也脱离 InputGate，必须单独定义一个不破坏 Session Events v1 routing 的机制或新版本；不能通过给当前 Hub 增加 owner filter 来实现。

### 7.3 source

推荐 source 使用 RenderNode owner delegated publication。

可信链：

~~~text
Live RenderNode
 -> Renderer binds owner subsystemKey/generation
 -> Host checks current Session authority
 -> Event source.subsystemKey = authenticated owner
~~~

禁止：

- payload 自报 source；
- 创建 fake input subsystem；
- Renderer 获取 arbitrary SessionEventClient；
- Renderer 创建任意 Runtime binding；
- WC publish 到任意 Session Event Channel。

这仍然扩展了现行 Session Events v1 的 publisher-origin integration semantics，因此需要单独 Integration Profile / ADR / conformance；但不修改 Hub recipient routing。

## 8. PWA

新增 Window -> Session Worker 的受限 Presentation Event publication lane：

~~~text
PWA Window
  WebProjector
  Renderer
      |
      | MessagePort / platform binding
      v
Session Worker
  trusted Presentation Event ingress
      |
      v
SessionEventHub
~~~

要求：

- 绑定当前 sessionEpoch；
- Window/session restart 使旧 binding 立即失效；
- Host 再验证 owner/generation；
- Window 只有 publish 权限，无 subscribe/admin Hub 权限；
- 不把 common-controls 业务 schema 放进 PWA bridge。

## 9. Desktop

新增：

~~~text
BrowserWindow
  Renderer
      |
      | authenticated per-document publication binding
      v
Desktop process
  trusted Presentation Event ingress
      |
      v
SessionEventHub
~~~

要求：

- 每个 document/session binding 独立；
- top-level navigation / window close / session retire 撤销；
- Browser 只能发布 Web Presentation Event；
- 不复用 Runtime SessionEventClient 身份；
- 不把 Keyboard/Gamepad 协议放进 Desktop Host。

## 10. User Input Framework 删除

当新 Presentation Event path 和 common-controls 完成 Qualification 后，LR 删除输入专属 Framework：

~~~text
Renderer
  RendererInputSource
  browser-input-source
  InputGate
  input source lifecycle

Data
  InputInterestV1
  InputStateV1
  InputEventV1
  InputResetV1
  keyboard/pointer/gamepad input payload
  input-codec
  input.* profile family
  input data peers

Subsystem
  createInputListener
  InputManager
  InputListener / InputHandler
  retained input state / interest

Renderer Control / Main
  RendererInputTargetV1
  snapshot.inputTarget
  Main currentInputTarget
  InputTarget-specific semantics
~~~

不删除：

~~~text
Frame
Activation
Session
Runtime
Frame params
Render
Viewport
Shared State
Session Events
Content
~~~

Main 当前命名中的 initial.input / frame initialize input 是 Frame 参数，不属于 User Input；不能因为名称相同误删。

## 11. 迁移顺序

~~~text
1. Freeze new Web Presentation custom-event Contract
2. Implement Renderer Presentation Event publisher
3. Implement trusted Host/Session broadcast ingress without changing Hub routing
4. PWA E2E
5. Desktop E2E
6. Implement per-device game WCs: keyboard / pointer / gamepad
7. Migrate business consumers away from createInputListener
8. Independently design owner-only replacement before removing InputGate
9. Remove Data input family / Subsystem InputManager
10. Remove Renderer input producer / InputGate
11. Remove Main / Renderer Control InputTarget
12. Retire User Input v1 Contract and qualification
~~~

## 12. 关键 Conformance

必须覆盖：

1. options omitted == broadcast=false。
2. broadcast 仅接受 boolean/undefined。
3. broadcast=false/options omitted 保持现行 owner-only compatibility behavior。
4. broadcast=true 在 options.channel 指定的精确 Channel（或默认 Channel）上投递给匹配订阅者。
5. SessionEventHub 不增加 owner/session audience filter。
6. broadcast=true 的 type 来自 name。
7. name 永远不被解释成 Channel。
8. business code 可通过 options.channel 选择实际路由 Channel；source/session/owner/domain/target 始终由可信 Framework 绑定，不能由业务 Payload 伪造。
9. stale Context 仍满足 currentness-first。
10. InputTarget 不参与 broadcast=true 新路由；legacy owner-only path 的现行依赖不在本阶段重写。
11. Session restart / generation replacement 不串发旧消息。
12. PWA/Desktop 实现具有相同 logical observables。
13. 删除 User Input 后 Render/Viewport/Frame/Activation/Session Events 仍独立通过各自 Qualification。

## 13. 未决事项

- 新 Context shape 的正式版本号。
- 默认 Web Presentation Channel 常量迁移到哪个 package/contract ownership；显式 channel 的允许范围是否需要更窄的 Host-side capability policy。
- event payload envelope 是否继续保持 domainId/targetKey/name/data 结构，或在 SessionEvent.type=name 后从 payload 移除 name。
- delegated owner publication 对 Session Events v1 source 语义如何版本化描述。
- publication queue/backpressure/diagnostic 的正式限制。
- User Input v1、Renderer Data Profile、Renderer Control 的版本升级与废止节奏。

## 14. 结论

最终模型：

~~~text
LR Framework
    Web Presentation
    generic custom-event routing
    Session Events

game-libs
    per-device User Input protocols
    keyboard / pointer / gamepad WCs
    independent device state / recovery
    optional controls mapper / aggregator
~~~

emitCustomEvent 的 options.broadcast 在迁移期选择 legacy owner-only path 或新的 trusted Session broadcast path；broadcast=true 时 options.channel 指定真实的 SessionEvent.channel，省略则使用默认 Web Presentation Channel，name 继续履行业务 event-type 职责。

迁移完成后，LR Framework 不再拥有 User Input 领域协议。


## 15. Per-device composition boundary

Web Presentation custom-event routing does not assume one global input producer.

A game may mount:

~~~text
keyboard only
pointer only
gamepad only
keyboard + pointer
keyboard + gamepad
keyboard + pointer + gamepad
~~~

Each device WC owns its own browser listeners/polling and current physical state. The initial migration deliberately does not require new epoch/revision wire fields. Device loss converges through that device's neutral State, plus the game-lib State refresh/stale-timeout policy; one device becoming unavailable must not invalidate another device producer.

Cross-device gameplay actions such as move/confirm/cancel are not Framework concerns and are not owned by the routing layer. They may be derived by an optional game-lib Mapper/Aggregator after device events are delivered.

For the User Input v1 compatibility migration, the intended business envelope is:

~~~text
event.type = input.state | input.event

event.payload.data = {
  channel: keyboard.state | keyboard.event
         | pointer.state  | pointer.event
         | gamepad.state  | gamepad.event,
  payload: <User Input v1-compatible device payload>
}
~~~

The Framework does not validate those six device channels or their payload schema. They remain game-lib protocol data inside the generic Web Presentation event. frameId, activationId, Input Interest, InputTarget, InputResetV1 and RendererInputSource availability are not added to this generic routing contract.

Therefore the Framework contract must remain valid even when no input WC exists at all. Web Presentation Event routing is a generic capability; input is only one business use of it.
