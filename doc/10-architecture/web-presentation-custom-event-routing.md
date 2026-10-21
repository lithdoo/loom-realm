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
owner/session audience routing
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

User Input 成为 game-libs / game application 的业务协议。

## 2. API

目标接口：

~~~ts
interface CustomEventOptions {
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
    => broadcast=false

broadcast=false
    => owner-only

broadcast=true
    => Session-scope broadcast
~~~

CustomEventOptions 保留对象形态。broadcast 是当前唯一字段，但不是把整个第三参数设计成 boolean；未来可以在 options 中增加新的正交能力。

broadcast 只改变 recipient audience，不改变事件其他组成部分。

## 3. Channel、type、payload、audience 职责

这四个概念严格分离：

~~~text
Channel
    = Web Presentation event routing domain

type
    = emitCustomEvent(name, ...) 的 name

payload
    = {
        domainId,
        targetKey,
        data
      }

audience
    = owner | session
      由 options.broadcast 决定
~~~

### 3.1 固定 Channel

Web Presentation custom event 使用 Framework 固定 Channel。

现行代码已有：

~~~ts
WEB_PRESENTATION_EVENT_CHANNEL_V1 =
  "x.loomrealm.web-presentation.event";
~~~

目标设计保留该 Channel 的职能，但把其 ownership 从 User Input custom event 迁移到 Web Presentation / generic event infrastructure。

业务代码不得通过 emitCustomEvent options 设置或修改 Channel。

### 3.2 name 不是 Channel

custom-event name 是事件业务类型。

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
type    = controls.event
payload = {
  domainId,
  targetKey,
  data: { action: confirm }
}
~~~

不得把 controls.event 作为 Session Events channel。

### 3.3 broadcast 不是权限标识

broadcast=true 的含义仅为：

~~~text
允许当前 custom event 在当前 Session 范围内
投递给匹配 Web Presentation Event Channel 的订阅者
~~~

它不代表：

- Frame activation；
- InputTarget；
- Runtime ownership；
- State write permission；
- Main control permission；
- durable broadcast；
- replay；
- acknowledgement。

## 4. 逻辑路由

目标路径：

~~~text
Business Web Component
        |
        | emitCustomEvent(name, data, options)
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
        | fixed Channel
        | source = authenticated RenderNode owner
        | audience = owner/session
        v
Session Event routing
        |
        +-- owner   -> owner Runtime subscriptions only
        |
        +-- session -> all matching Runtime subscriptions
~~~

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
    +-- bind fixed Channel
    +-- bind source provenance
    +-- map broadcast -> audience
    +-- enqueue PresentationEventPublisher
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
  readonly broadcast: boolean;
}

interface RendererPresentationEventBinding {
  publish(event: PresentationEventPublication): Promise<void>;
}
~~~

这是 trusted Renderer -> Platform 的内部能力，不是业务 API。

服务端必须二次验证 session / document / owner / generation，不因为 Renderer request 中带有字段就自动信任。

## 7. Host / Session Events 改动

### 7.1 不改变 Session Events Channel 职责

Session Events 继续以 Channel 做路由域，以 type 做事件 discriminator。

Web Presentation 增加的是 trusted publication ingress 和 audience 过滤，而不是改变 Channel 的定义。

### 7.2 audience

内部 audience：

~~~ts
type PresentationEventAudience =
  | { readonly kind: "owner"; readonly subsystemKey: string }
  | { readonly kind: "session" };
~~~

处理规则：

~~~text
first:
  select subscriptions by fixed Web Presentation Channel

then:
  owner
    -> retain subscriptions whose binding belongs to owner subsystem

  session
    -> retain all matching subscriptions
~~~

audience metadata 不进入业务 payload，也不允许 WC 提供 subsystemKey。

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
3. Implement trusted Host/Session ingress + audience
4. PWA E2E
5. Desktop E2E
6. Implement game-common-controls
7. Migrate business consumers away from createInputListener
8. Move owner-only custom event off InputGate
9. Remove Data input family / Subsystem InputManager
10. Remove Renderer input producer / InputGate
11. Remove Main / Renderer Control InputTarget
12. Retire User Input v1 Contract and qualification
~~~

## 12. 关键 Conformance

必须覆盖：

1. options omitted == broadcast=false。
2. broadcast 仅接受 boolean/undefined。
3. broadcast=false 不泄漏给其他 Subsystem。
4. broadcast=true 可被多个匹配订阅者接收。
5. 两种模式 Channel 相同。
6. 两种模式 type 都来自 name。
7. name 永远不被解释成 Channel。
8. business code 无法覆盖 Channel/source/session/owner/domain/target。
9. stale Context 仍满足 currentness-first。
10. InputTarget 不参与新路由。
11. Session restart / generation replacement 不串发旧消息。
12. PWA/Desktop 实现具有相同 logical observables。
13. 删除 User Input 后 Render/Viewport/Frame/Activation/Session Events 仍独立通过各自 Qualification。

## 13. 未决事项

- 新 Context shape 的正式版本号。
- 固定 Channel 常量迁移到哪个 package/contract ownership。
- event payload envelope 是否继续保持 domainId/targetKey/name/data 结构，或在 SessionEvent.type=name 后从 payload 移除 name。
- delegated owner publication 对 Session Events v1 source 语义如何版本化描述。
- owner audience filter 放在 Hub trusted ingress 还是独立 Router。
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
    User Input protocol
    device capture
    input state
    mapping
    recovery
~~~

emitCustomEvent 的 options.broadcast 只控制 audience；固定 Channel 继续履行 Web Presentation routing-domain 职责；name 继续履行业务 event-type 职责。

迁移完成后，LR Framework 不再拥有 User Input 领域协议。
