# Game Common Controls：业务层 User Input 协议与跨 Subsystem 广播设计

> 状态：**Proposed / 设计方案，尚未实现、尚未冻结、尚未 Qualification**  
> 位置：game-libs/game-common-controls/  
> 目标包：**@loomrealm-game/common-controls**  
> 目标设备组件：**game-keyboard-input / game-pointer-input / game-gamepad-input**  
> 可选业务聚合层：**Controls Mapper / Aggregator（非必须 WC）**  
> 设计核心：**用户输入属于 game-libs 业务协议，而非 LoomRealm Framework 协议。**  
> Framework 细化方案：[Web Presentation Custom Event Routing](../../doc/10-architecture/web-presentation-custom-event-routing.md)  
> 相关现行契约：[Web Presentation API v1](../../doc/15-contracts/web-presentation-api-v1.md)、[User Input v1](../../doc/15-contracts/user-input-v1.md)、[Session Events v1](../../doc/15-contracts/session-events-v1.md)、[Render Update v1](../../doc/15-contracts/render-update-v1.md)、[ADR 0031](../../doc/decisions/0031-business-owned-web-component-projection.md)

> **定位说明**：本文描述未来目标和迁移方案，不修改上述已冻结正式契约的现行事实。当前的 Web Presentation 仍只有 owner-targeted 双参数 emitCustomEvent，Renderer 仍有 User Input v1/InputGate；本文要求先实现、验证新的通用广播基础设施，再有序迁移和移除旧输入专属能力。本文中的接口和消息结构均为候选设计，不得视作已发布 ABI。

## 1. 核心目标与架构原则

本项目不是重新发明一套输入协议，也不是把 LM User Input v1 原样保留在 Framework。

**目标是在 ownership 迁移的同时最大限度保持 User Input v1 的设备语义和实现一致性：Keyboard、Pointer、Gamepad 拆成可按需挂载的业务 Web Components，但继续沿用 v1 的标准 channel 名、payload shape、采样/归一化规则、事件顺序和限制；主要替换 transport、authority gate 与 Framework ownership。**

核心原则：

1. **按设备拆分 Producer**：Keyboard、Pointer、Gamepad 各自独立 WC，业务按需挂载。
2. **协议迁移优先保持兼容**：保留 keyboard.state/event、pointer.state/event、gamepad.state/event 六个标准标识。
3. **Payload 尽可能原样复用**：KeyboardCode、PointerSample、GamepadSample、按钮名、数值范围、排序/数量限制和事件顺序第一阶段不改变。
4. **只替换 transport/gate**：RendererInputSource -> InputGate -> Renderer Data 迁移为 device WC -> emitCustomEvent -> Web Presentation Event -> Session Events。
5. **不迁移 Frame authority 字段**：frameId、activationId、Input Interest、InputTarget 不进入新的设备消息。
6. **不机械迁移 input.reset / availability**：设备失效优先使用 neutral State；再用 bounded State refresh + stale timeout 补足 Session Events 无 replay 的收敛问题。
7. **跨设备 action 聚合独立**：move/confirm/cancel 等 gameplay action 仍由可选 Mapper/Aggregator 或游戏业务层处理。
8. **LM 不理解输入语义**：Framework 只承载 generic Web Presentation custom events。
9. **迁移完成后删除 LR User Input**：等价行为 Qualification 后删除 Renderer Input Source、InputGate、InputManager、input.* Data family、InputTarget 等输入专属设施。

这里的“保持 User Input v1 一致性”指保留设备协议可观察行为，不是保留旧 Frame-scoped authority、Interest Registry 或 Data Plane。

## 2. 现状与目标边界

### 2.1 当前实现（现行事实）

~~~text
Browser Renderer Input Source
  (Keyboard / Pointer / Gamepad)
          |
          v
Renderer User Input / InputGate
  [InputTarget x Frame/Activation x Interest x Data currentness]
          |
          v
   owning Subsystem Runtime
    input.state / input.event / input.reset

Web Component -- context.emitCustomEvent(name, data)
                        |
                        v
                owner-targeted InputGate
~~~

现行 Web Presentation API v1 的 emitCustomEvent(name, data) 只向所属 Subsystem 发送 User Input custom event，且受现有 InputGate/currentness 约束；它**没有跨 Subsystem 广播能力**。Session Events v1 的发布者身份当前绑定到 Subsystem Runtime，Renderer 不能直接持有一个任意发布权限的 SessionEventClient。

### 2.2 目标结构

~~~text
Browser Window

 Keyboard                  Pointer                  Standard Gamepad
    |                         |                           |
    v                         v                           v
<game-keyboard-input>   <game-pointer-input>      <game-gamepad-input>
    |                         |                           |
    | v1 payload              | v1 payload                | v1 payload
    +-------------------------+---------------------------+
                              |
                              v
             WebPresentationContext.emitCustomEvent(
               "input.state" | "input.event",
               { channel, payload },
               { broadcast: true }
             )
                              |
                              v
              LM Web Presentation Event path
                fixed Framework Channel
                event.type = input.state | input.event
                              |
                              v
                     Session Events
                              |
                    +---------+---------+
                    |                   |
                    v                   v
              compatible input    optional Controls
                 consumer          Mapper/Aggregator
~~~

### 2.3 迁移后的消息映射

旧 User Input v1：

~~~ts
{
  type: "input.state",
  frameId,
  activationId,
  channel: "keyboard.state",
  payload: { down: [...] }
}
~~~

新 WC：

~~~ts
context.emitCustomEvent(
  "input.state",
  {
    channel: "keyboard.state",
    payload: { down: [...] },
  },
  { broadcast: true },
);
~~~

保留：type semantics、channel identity、payload shape、device normalization、event ordering。

删除：frameId、activationId、Input Interest、InputTarget、InputGate、Renderer Data input transport。

分界原则：

| 内容 | 归属 |
| --- | --- |
| Web Component / RenderNode / Context | LM Web Presentation |
| 固定 Web Presentation Event Channel 与 broadcast=true trusted publication | LM Framework |
| keyboard.state/event payload | game-keyboard-input |
| pointer.state/event payload | game-pointer-input |
| gamepad.state/event payload | game-gamepad-input |
| v1-compatible types/constants/validators | game-common-controls |
| neutral-state refresh / stale-state helper | game-common-controls |
| action mapping / cross-device aggregation | 游戏业务 / optional mapper |
| Frame / Activation / Session / Runtime authority | LM Main |

特别禁止：

- keyboard.state 等不是 Session Events Channel；它们作为 data.channel 保留 User Input 设备 channel identity。
- 不得为了 WC 化顺便改变 v1 payload shape、数值范围或按钮命名。
- 不得把 frameId/activationId 搬进业务协议。
- 不得把 Input Interest/InputTarget 换名字搬进 common-controls。

## 3. 包交付、组件挂载和依赖

建议目录：

~~~text
game-libs/game-common-controls/
  DESIGN.md
  README.md
  package.json
  src/
    protocol/
      common.ts
      keyboard.ts
      pointer.ts
      gamepad.ts

    elements/
      game-keyboard-input.ts
      game-pointer-input.ts
      game-gamepad-input.ts

    devices/
      keyboard-source.ts
      pointer-source.ts
      gamepad-source.ts

    controls/
      mapper.ts
      aggregator.ts
      consumer.ts

    index.ts

  test/
    keyboard/
    pointer/
    gamepad/
    controls/
    integration/
~~~

目标 Custom Elements：

~~~html
<game-keyboard-input></game-keyboard-input>
<game-pointer-input></game-pointer-input>
<game-gamepad-input></game-gamepad-input>
~~~

这些组件彼此独立，业务方可以只挂载其中一个，也可以组合多个：

~~~html
<!-- keyboard-only -->
<game-keyboard-input></game-keyboard-input>

<!-- desktop action game -->
<game-keyboard-input></game-keyboard-input>
<game-pointer-input></game-pointer-input>
<game-gamepad-input></game-gamepad-input>
~~~

### 3.1 每设备唯一实例

唯一性按设备类型计算，而不是整个 common-controls 包只能有一个组件。

一个 Renderer Window 的同一输入 ownership scope 中，默认最多允许：

~~~text
1 x game-keyboard-input
1 x game-pointer-input
1 x game-gamepad-input
~~~

重复挂载同类型 Producer 必须拒绝、禁用或显式隔离，不能静默产生双份物理事件。不同类型组件可以同时存在。

每个组件独立拥有：

~~~text
physical current state
DOM listeners / polling resources
device-local canonical ids
state refresh timer when required
~~~

组件 disconnected 或 Context 失效时，只清理自己的设备状态，并在 Context 仍可用时 best-effort 发布本设备 neutral State；不影响其他设备组件。第一阶段不额外引入 epoch/revision wire 字段。

### 3.2 组件归属

设备组件仍然是普通业务 Custom Elements：

~~~text
Subsystem RenderDomain
    -> RenderNode
    -> WebProjector
    -> device WC
    -> WebPresentationContext
~~~

LM 不建立 Keyboard Host、Gamepad Host 或 GlobalInput Subsystem。由 presentation/game composition 决定挂载哪些组件、由哪个业务 Subsystem 持有 RenderNode。

### 3.3 可选 Controls Mapper/Aggregator

设备 WC 默认输出 canonical device protocol。跨设备 action mapping 是另一层职责：

~~~text
keyboard state/event ----+
                         |
gamepad state/event -----+--> Controls Mapper/Aggregator
                         |        |
pointer state/event -----+        +--> move / confirm / cancel / menu
~~~

Aggregator 可以是普通 TypeScript helper、Subsystem 内业务服务或其他 game-lib；**不要求做成 WC**。

它解决：

- 多物理 binding 映射同一个 action；
- Keyboard + Gamepad 同时控制同一 action；
- 松开一个来源时其他来源仍保持 action；
- deadzone / chord / long-press / remap；
- 游戏层 focus、priority、modal ownership。

设备 WC 不承担这些跨设备聚合职责。

### 3.4 依赖方向

~~~text
game / presentation
    |
    +--> device WCs
    |      +--> browser standard APIs
    |      +--> WebPresentationContext
    |
    +--> optional controls mapper
           +--> common device protocol
           +--> Session Events author API
~~~

common-controls 不应导入 LM 内部 InputGate、RendererInputSource、Input Interest Registry、InputTarget wire schema 或 SessionEventHub 内部类型。

## 4. User Input v1 兼容迁移协议

### 4.1 迁移策略

第一阶段目标不是设计新的 device protocol，而是把 User Input v1 的设备部分从 LR Framework 搬到 game-common-controls。

保留六个标准 input channel：

~~~text
keyboard.state
keyboard.event
pointer.state
pointer.event
gamepad.state
gamepad.event
~~~

Web Presentation custom event 只使用两个 name/type：

~~~text
input.state
input.event
~~~

统一 data shape：

~~~ts
interface MigratedInputStateData {
  readonly channel: "keyboard.state" | "pointer.state" | "gamepad.state";
  readonly payload: JsonObject;
}

interface MigratedInputEventData {
  readonly channel: "keyboard.event" | "pointer.event" | "gamepad.event";
  readonly payload: JsonObject;
}
~~~

因此迁移关系是：

~~~text
User Input v1:
  type + frameId + activationId + channel + payload

WC:
  emitCustomEvent(type, { channel, payload }, { broadcast:true })
~~~

只移除旧 authority envelope 的 frameId / activationId。

### 4.2 Keyboard：完全复用 v1 payload

State 继续使用 KeyboardStatePayloadV1：

~~~ts
{ down: readonly KeyboardCodeV1[] }
~~~

Event 继续使用 KeyboardEventPayloadV1：

~~~ts
{
  action: "down" | "up";
  code: KeyboardCodeV1;
  repeat: boolean;
}
~~~

发送方式：

~~~ts
context.emitCustomEvent(
  "input.state",
  { channel: "keyboard.state", payload: { down: [...held].sort() } },
  { broadcast: true },
);

context.emitCustomEvent(
  "input.event",
  { channel: "keyboard.event", payload: { action, code, repeat } },
  { broadcast: true },
);
~~~

第一阶段保留 KEYBOARD_CODES_V1、held set、排序、repeat 规则、keyup repeat=false、event.isTrusted 和原 payload validation。

### 4.3 Pointer：完全复用 v1 payload

继续使用 User Input v1 的 PointerKindV1、PointerButtonV1、PointerSampleV1、PointerStatePayloadV1、PointerEventPayloadV1。

第一阶段保留：canonical pointerId、mouse/touch/pen、viewport-relative x/y normalization、1_000_000 scale、pointer limit 32、canonical button order、pointercancel、State 先于对应 button Event、resize/surface validity、event.isTrusted。

发送仍是：

~~~text
name = input.state
data.channel = pointer.state
data.payload = PointerStatePayloadV1

name = input.event
data.channel = pointer.event
data.payload = PointerEventPayloadV1
~~~

### 4.4 Gamepad：完全复用 v1 payload

继续使用 GamepadAxesV1、GamepadButtonsV1、GamepadSampleV1、GamepadStatePayloadV1、GamepadEventPayloadV1 和 GamepadButtonNameV1。

第一阶段保留：

- navigator.getGamepads()；
- mapping === "standard"；
- requestAnimationFrame polling；
- gamepad limit 16；
- canonical local gamepadId；
- axes -1_000_000..1_000_000；
- buttons 0..1_000_000；
- pressed threshold >= 500_000；
- button crossing down/up；
- crossing canonical sort；
- full State 仅在 sample 变化时发送。

第一阶段不新增 deadzone、新量化算法或新的按钮模型；这些属于后续业务协议演进。

### 4.5 input.reset：不机械迁移

旧 InputResetV1 是 Activation-scoped retained-State teardown barrier，由 InputTarget/Activation/Data/Producer gate 驱动，不是某一个物理设备的自然事件。

因此三个 WC 不发送等价的全局 input.reset。设备失效时继续使用 v1 已有的 neutral State：

~~~text
keyboard.state -> { down: [] }
pointer.state  -> { pointers: [] }
gamepad.state  -> { gamepads: [] }
~~~

这与现有 browser-input-source 的 leaveUsable() 行为一致：清空 local state 后发送空 State。

### 4.6 availability：保持内部实现，不公开迁移

现有 RendererInputSourceChange 的 availability 只服务 InputGate 的 Producer(C) 计算，不是 User Input v1 的业务 wire message。

新 WC 继续在内部维护 window usable、pointer surface valid、navigator.getGamepads availability 和 device connected；availability loss 转换为 clear local state + neutral State，不新增 input.availability。

### 4.7 State baseline 的最小补偿

旧 InputGate 在 Effective false -> true 时会立即发送 fresh self-contained State baseline。Session Events 没有 replay，late subscriber 可能错过之前的 State。

第一阶段采用最小增量方案，不重新设计 epoch/revision wire：

~~~text
State changed
    -> immediate full State

State is non-neutral
    -> bounded low-frequency full-State refresh

State becomes neutral
    -> immediate neutral State
    -> stop refresh

Consumer stale timeout
    -> locally converge to neutral
~~~

具体 refresh/timeout 数值由 Qualification 决定，不在设计阶段提前冻结。


### 4.8 类型与 validator ownership 迁移

迁移期间不得为了提前移动 ownership，让 Framework package 反向依赖 game-lib。

因此采用单向依赖的两阶段方案：

~~~text
迁移期
  @loomrealm/data
      继续作为旧 User Input v1
      device types/constants/validators 的 canonical source

  game-common-controls
      可以临时 import @loomrealm/data
      以复用已经 Qualification 的定义和 validator

退役切换
  当 LR User Input / Data input family 正式删除时：
      将仍需保留的 Keyboard/Pointer/Gamepad
      types/constants/validators
      在同一个版本化变更中迁到 game-common-controls

      同时从 @loomrealm/data 删除对应 User Input ownership
~~~

禁止形成：

~~~text
@loomrealm/data
    -> @loomrealm-game/common-controls
~~~

这种 Framework -> game-lib 反向依赖。

迁移完成后，新业务代码只从 game-common-controls 获取设备协议定义；迁移期间允许 game-common-controls 暂时依赖 @loomrealm/data，直到旧 Framework User Input 被正式退役。

### 4.9 可选 Consumer compatibility layer

common-controls 可以提供薄兼容层，使业务继续按六个标准 channel 注册 handler：

~~~ts
const input = createCommonInputClient(scope.events);
input.on("keyboard.state", handler);
input.on("keyboard.event", handler);
input.on("pointer.state", handler);
input.on("pointer.event", handler);
input.on("gamepad.state", handler);
input.on("gamepad.event", handler);
~~~

内部只订阅固定 Web Presentation Event Channel，过滤 event.type == input.state | input.event，读取 event.payload.data.channel，校验 v1-compatible payload 后 dispatch(channel, payload)。

这样大部分原业务 handler 不需要理解新的 transport，也不再依赖 createInputListener / InputManager / Frame-scoped Interest。

### 4.10 跨设备 Controls 聚合

设备协议保持 v1-compatible，不意味着 gameplay action 回到 Framework。Keyboard W 与 Gamepad leftY 等仍由可选 Mapper/Aggregator 合并；action mapping/focus/priority 与设备 WC 迁移分离。

## 5. 通用 emitCustomEvent 跨 Subsystem 广播扩展

### 5.1 目标签名

现行 Web Presentation API v1 的 emitCustomEvent(name, data) 是 owner-targeted User Input reverse capability。目标是把它演进为 Web Presentation 自身的通用 custom-event capability，并只在可扩展 options object 中增加一个布尔字段：

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

options 必须保持对象形态。broadcast 是当前第一个扩展项，未来新增与 custom-event 正交的行为时仍可继续扩展 options，而无需再次改变函数参数结构。

### 5.2 broadcast 的唯一职责

~~~text
options omitted
    => broadcast = false

{ broadcast: false }
    => owner-only

{ broadcast: true }
    => cross-Subsystem broadcast
~~~

broadcast 只改变 audience。它不得改变：

- Web Presentation Event Channel；
- custom-event name；
- payload 格式；
- source identity；
- Frame / Activation authority；
- Session Events Channel 的职责。

示例：

~~~ts
context.emitCustomEvent(
  "controls.event",
  {
    protocol: "@loomrealm-game/common-controls/1",
    action: "confirm",
    phase: "pressed",
  },
  { broadcast: true },
);
~~~

controls.event 是 custom-event 的业务 name/type，不是 Channel。

### 5.3 固定 Web Presentation Event Channel

现行实现已经存在保留标识：

~~~ts
const WEB_PRESENTATION_EVENT_CHANNEL_V1 =
  "x.loomrealm.web-presentation.event";
~~~

目标架构保留这一“Web Presentation Event Channel”职能，但将其从 User Input v1 的 custom-input ownership 中迁出，改由 Web Presentation / generic event infrastructure 拥有。

逻辑映射：

~~~text
SessionEvent.channel
    = x.loomrealm.web-presentation.event
      // Framework-owned routing domain

SessionEvent.type
    = emitCustomEvent 的 name
      // business event discriminator

SessionEvent.payload
    = {
        domainId,
        targetKey,
        data
      }

SessionEvent.source
    = trusted RenderNode owner

broadcast=true
    = publish into the fixed Web Presentation Event Channel

broadcast=false
    = does not enter this Session Events broadcast path during migration
~~~

职责必须保持分离：

- Channel：这是 Web Presentation custom event；
- name/type：这条业务事件是什么；
- data：业务协议数据；
- broadcast：谁可以收到。


### 5.4 owner-only 与 broadcast 的迁移边界

当前迁移只新增 broadcast=true 的跨 Subsystem 路径：

| 调用 | 迁移期行为 |
| --- | --- |
| emitCustomEvent(name, data) | 保持现行 owner-only v1 行为 |
| emitCustomEvent(name, data, { broadcast: false }) | 与现行 owner-only 行为一致 |
| emitCustomEvent(name, data, { broadcast: true }) | 进入新的 trusted cross-Subsystem Presentation Event path |

因此本项目**不通过修改 SessionEventHub 来实现 owner-only filtering**。

broadcast=true 才进入固定 Web Presentation Event Channel，并由现有 Session Events exact-Channel 规则投递给该 Channel 的全部 matching subscriptions。

broadcast=false / options omitted 在迁移阶段继续走现有 owner-only 路径。将 owner-only custom event 最终从 InputGate 脱离，是后续独立设计/版本化工作；在该工作完成前，不得为了统一实现而改变 Frozen Session Events v1 的 routing semantics。

### 5.5 校验和版本边界

- options 省略合法；提供时 broadcast 只能是 boolean 或 undefined，不做 truthy coercion。
- stale/detached/currentness 仍先于业务参数校验。
- name 按 Web Presentation event name / Session Event type 职责验证，不按 Channel 解释。
- data 使用 Web Presentation 通用 JSON payload 约束，长期从 InputEventV1 payload 类型所有权中迁出。
- Framework 自己绑定固定 Channel、RenderNode provenance 和 source，business code 不能覆盖。
- void 只表示同步验证和本地接受，不承诺所有消费者完成处理；无 ACK、replay 或 exactly-once。

现行 WebPresentationContext v1 是 Frozen closed shape，所以 options 和 owner-only 新交付语义必须通过正式版本化 Contract / compatibility profile / conformance 发布，不得静默重定义 v1。


## 6. Trusted Presentation Event Bridge：broadcast=true 专用通用机制

当前迁移中的新 Bridge 只处理显式 broadcast=true：

~~~text
business WC
  |
  | emitCustomEvent(name, data, { broadcast: true })
  v
WebProjector / Renderer currentness
  |
  | Framework binds:
  | fixed Web Presentation Channel
  | RenderNode owner provenance
  | event type = name
  v
trusted Renderer/Host presentation ingress
  |
  v
Session Events routing
  |
  +-> every matching subscription of the fixed Channel
~~~

Bridge 必须满足：

1. 只有当前 live RenderNode Context 可以发起 broadcast publication。
2. Framework 使用固定 Web Presentation Event Channel；业务不能选择或覆盖该 Channel。
3. name 作为 event type，data 作为业务 payload；两者不得与 Channel 职责混用。
4. source、Session、subsystemKey、generation、domainId、targetKey 均由可信 Framework 绑定。
5. SessionEventHub 仍按现有 exact Channel 规则路由，不增加 owner/session recipient filter。
6. Renderer 不获得任意 SessionEventClient、Hub binding、subscribe 或 arbitrary-channel publish 能力。
7. Desktop/PWA 可有不同物理 Carrier，但 logical publication semantics 相同。
8. 慢订阅者、overflow、listener failure 复用现有 Session Events 有界/隔离语义。

### 6.1 不修改 Session Events v1 recipient semantics

Frozen Session Events v1 的规则继续成立：

~~~text
publish accepted on Channel C
    -> every live subscription matching exact Channel C
~~~

本设计不增加：

~~~text
PresentationEventAudience
owner recipient filter
session recipient filter
subscription-owner filtering
~~~

broadcast 不是交给 Hub 的新 routing metadata。它只在 Web Presentation 边界决定：

~~~text
false
    -> 迁移期继续 legacy owner-only path

true
    -> trusted publication into fixed Web Presentation Event Channel
       -> existing Session Events routing
~~~

这样 Channel 仍然独立承担 Session Events routing scope，不被第二套 audience 规则覆盖。

### 6.2 source identity

推荐使用 RenderNode owner delegated publication：

- Renderer 从 current RenderNode 取得 owner subsystemKey/generation；
- Session Host 再以可信 authority 验证；
- 消费者看到真实业务 owner；
- WC 不能自行声明 source；
- 不创建虚假的 input subsystem；
- 不向 Renderer 暴露可任意伪造 source 的 SessionEventClient。

该能力会扩展 Frozen Session Events v1 的 publisher-origin integration semantics，因此需要单独 Integration Profile / ADR / conformance；它不通过修改 Hub recipient routing 来实现。

## 7. 消费方输入处理属于业务策略，而非 LM

跨 Subsystem 广播的目的，是让多个业务模块观察同一组 v1-compatible input state/event，而不是让 LR Framework 决定哪个模块应该响应游戏动作。

低迁移成本方案是由 common-controls 提供 compatibility consumer：

~~~ts
const input = createCommonInputClient(scope.events);

input.on("keyboard.state", (state) => {
  // 原有 keyboard.state handler 可基本原样迁移
});

input.on("gamepad.event", (event) => {
  // 原有 gamepad.event handler 可基本原样迁移
});
~~~

compatibility client 内部订阅固定 WEB_PRESENTATION_EVENT_CHANNEL，接受 event.type 为 input.state / input.event 的消息，再按 event.payload.data.channel 分发。

因此业务侧继续使用六个标准设备 channel 作为输入分类，而不需要直接理解 Web Presentation transport。

更上层的 gameplay、对话、菜单、战斗焦点以及 move/confirm/cancel 聚合仍由 game-libs / game application 决定。InputTarget / Input Interest 不重新引入。

## 8. 浏览器设备组件与现有代码迁移

### 8.1 先拆 Source，再包 WC

不要直接重写三套 WC 设备逻辑。先把现有 createBrowserRendererInputSource(window) 机械拆成：

~~~ts
createKeyboardInputSource(window)
createPointerInputSource(window)
createGamepadInputSource(window)
~~~

三者继续输出近似现有的 DeviceInputChange：

~~~ts
type DeviceInputChange =
  | { kind: "state"; channel: "keyboard.state" | "pointer.state" | "gamepad.state"; payload: JsonObject }
  | { kind: "event"; channel: "keyboard.event" | "pointer.event" | "gamepad.event"; payload: JsonObject };
~~~

availability 可在 source 内部保留实现事实，但不通过 WC 对外发布。

### 8.2 共享 transport adapter

三个 WC 共用薄 adapter：

~~~ts
function emitDeviceInput(context: WebPresentationContext, change: DeviceInputChange): void {
  context.emitCustomEvent(
    change.kind === "state" ? "input.state" : "input.event",
    { channel: change.channel, payload: change.payload },
    { broadcast: true },
  );
}
~~~

因此 WC 本身只负责 connected/context-installed/disconnected 生命周期和 source start/stop。

### 8.3 game-keyboard-input

直接迁移 browser-input-source 中的 KEYBOARD_CODES_V1、keyboardCodes、held、keyboardState、onKeyDown、onKeyUp、focus/blur/visibility usable handling 和可选 onKeyboardCapture hook。

保持原顺序：

~~~text
keydown non-repeat -> held.add -> state -> event
keydown repeat     -> event only
keyup              -> held.delete -> state -> event
~~~

迁移难度：低。

### 8.4 game-pointer-input

直接迁移 pointerButtons、TrackedPointer、coordinate、pointerKind、buttonsOf、samePointer、pointers map、pointerState、surfaceValid、onResize、onPointer 和 pointerdown/move/up/cancel listeners。

保持 pointercancel、button diff 和 State/Event 顺序。迁移难度：低到中。

### 8.5 game-gamepad-input

直接迁移 gamepadButtonNames、TrackedGamepad、normalized、gamepadSample、pressedOf、sameGamepad、gamepads map、gamepadState、pollGamepads、baselineGamepads、RAF lifecycle 和 navigator.getGamepads。

第一阶段完整保留 standard mapping 和 500_000 pressed threshold，不增加 deadzone。迁移难度：中，主要来自 RAF lifecycle 与 disconnect/reconnect，而不是协议重写。

### 8.6 Window usable 拆分

现有 createBrowserRendererInputSource 共用 windowUsable/enterUsable/leaveUsable。拆分后可抽成轻量共享 helper，每个 WC 独立响应 visible && document.hasFocus()：

~~~text
Keyboard unusable -> held.clear -> keyboard neutral State
Pointer unusable  -> pointers.clear -> pointer neutral State
Gamepad unusable  -> stop polling -> gamepads.clear -> gamepad neutral State
~~~

这样保持当前可观察行为，但三个 Producer 生命周期互不耦合。

### 8.7 不迁移到 WC 的 InputGate 逻辑

以下逻辑不进入任何 WC：

~~~text
Lease(frameId, activationId)
InputTarget lookup
Interest Registry
effective channel calculation
producer availability gate
InputResetV1 generation
Data peer publication
Frame/Activation baseline trigger
~~~

其中 fresh State baseline 的最终效果由 bounded State refresh / stale timeout 替代。

## 9. 部署与跨平台约束

| 方面 | Desktop / Hostra | PWA |
| --- | --- | --- |
| WC 运行位置 | Renderer BrowserWindow | PWA Window |
| 物理输入 | Window Keyboard/Pointer/Gamepad | Window Keyboard/Pointer/Gamepad |
| WC 协议 | 相同 User Input v1-compatible channel/payload | 相同 |
| Event bridge | 通用可信 Renderer→Session ingress | 通用可信 Renderer→Session ingress |
| Event Hub 位置/传输 | 按 Desktop 既有宿主拓扑 | 按 PWA 既有 Worker/Port 拓扑 |
| Subsystem 消费方式 | SessionEventClient exact-channel subscribe | 相同 |

Bridge 必须用平台通用接口表达所需能力，并由 Desktop/PWA composition 各自接线；不把 ipcRenderer、WebSocket、MessagePort 或 ServiceWorker 放进 common-controls 业务代码。

要验证设备 Producer 的可用性，还须为各设备 RenderNode 确定持有者。Keyboard/Pointer/Gamepad 可以由同一个 presentation-shell Subsystem 挂载，也可以按业务拆开；Runtime/Window 重建时各 WC 重新建立本地 current state 并重新开始 State publication。**这由游戏组合决定**，不是 LM 内建一个 GlobalInput Subsystem。

## 10. 失败、顺序和性能语义

- Event Bridge/Session Events 不提供跨 Plane 全局事务顺序。
- State 保持 User Input v1 的 self-contained current truth；Event 保持 future-only transient impulse。
- 同一设备 Source 内继续保持现有 state-before-edge 等局部发送顺序；跨设备之间不定义全局顺序。
- 不引入新 revision/epoch 作为第一阶段 wire requirement。
- Session Events 不 replay，因此 non-neutral State 必须有 bounded refresh，late subscriber 最终才能获得 current truth。
- Consumer 在超过 stale timeout 未收到仍应存在的状态刷新时，必须本地退回 neutral，防止 stuck input。
- neutral transition 立即发送；neutral 状态不需要持续 heartbeat。
- 瞬时 Event 不自动重试，避免重复动作；协议不声称 exactly-once。
- State refresh 必须有界并允许 coalescing/backpressure，不能按每帧无限广播。
- 单个 subscriber failure/overflow 不应阻断其他 subscriber，也不升级为 Main Session fatal。
- Unknown/invalid migrated input payload 在 common-controls compatibility layer 拒绝或忽略，不要求 LR Framework 理解设备 schema。

## 11. 从 LR User Input v1 迁移并删除 Framework 输入层

最终目标不是长期双轨，而是从 LR Framework 删除 User Input 领域能力。

### 11.1 最终删除范围

~~~text
Renderer
  browser-input-source.ts
  renderer/input.ts
  RendererInputSource
  InputGate
  startInputSource / stopInputSource
  Desktop/PWA Renderer input-source wiring

@loomrealm/data
  StandardInputChannelV1
  InputInterestV1 / FrameInputInterestV1
  InputStateV1 / InputEventV1 / InputResetV1
  UserInputMessageV1
  keyboard/pointer/gamepad input payload types（迁移期继续由 @loomrealm/data canonical 持有；LR User Input 退役时再原子迁到 game-common-controls）
  input-codec（迁移期继续复用；LR User Input 退役时将仍需设备 validator 与 ownership 一并迁出）
  input.* Data Profile family
  RendererInputDataPeer / SubsystemInputDataPeer

@loomrealm/subsystem
  createInputListener()
  InputListener / InputHandler / InputPayload
  InputManager
  Input Interest
  retained input state
  Frame activation 与 InputManager 的输入耦合

Renderer Control / Main
  RendererInputTargetV1
  snapshot.inputTarget
  Main currentInputTarget()
  InputTarget publication / validation

Contracts / Qualification
  User Input v1
  Renderer Data Profile 的 input.* slice
  Renderer Control 的 InputTarget slice
  对应 User Input qualification
~~~

这里描述最终目标，不要求在单个 PR 中直接删除全部内容。

### 11.2 不应误删的 input

Main/Frame 中 bootstrap.initial.input、frame.initialize({ input }) 等字段表示 Frame 初始化/调用参数，作者侧表现为 frame.params，和 Keyboard/Gamepad User Input 不是一个领域。

这部分不因 User Input 删除。未来若要从 input 重命名为 params，应作为独立 Frame/Call 命名清理。

Frame、Activation、Session、Runtime authority 本身继续存在；只删除它们与用户输入路由之间的 InputTarget 耦合。

### 11.3 迁移阶段

| 阶段 | 交付 | 旧 User Input |
| --- | --- | --- |
| M0 | 冻结 options.broadcast、固定 Channel、input.state/input.event + { channel,payload } 映射 | 原样保留 |
| M1 | 实现 trusted Presentation Event path，Desktop/PWA E2E | 双参数旧行为兼容 |
| M2 | WC 临时直接复用 @loomrealm/data 的 v1 设备 types/constants/validators；不建立 Framework -> game-lib 反向依赖 | 旧实现继续编译 |
| M3 | 机械拆分 BrowserRendererInputSource 为 Keyboard/Pointer/Gamepad source，再包三个 WC | 新游戏可按需挂载 WC |
| M4 | 加 compatibility consumer、State refresh/stale timeout，业务迁离 createInputListener | 不再依赖 InputManager author API |
| M5 | 停止 Renderer 物理输入路径，删除 InputGate / Data input.* / Subsystem InputManager | Framework Input Plane 退出 |
| M6 | Renderer Control/Main 删除 InputTarget，更新 frozen profiles/Qualification | User Input v1 Framework 正式退役 |

最终验收：

1. 六个标准 channel 与 payload 的可观察行为和 User Input v1 一致。
2. Keyboard/Pointer/Gamepad 的采样、归一化、排序、限制和事件顺序通过 migrated conformance。
3. LR User Input 退役版本中，设备协议定义从 @loomrealm/data 原子迁到 game-common-controls；迁移期不做反向 re-export。
4. Renderer 不再主动采集物理用户输入。
5. Renderer Data 不再包含 input.* family。
6. SubsystemScope 不再有 createInputListener。
7. Main / Renderer Control 不再发布 inputTarget。
8. emitCustomEvent 不依赖 InputGate。
9. late subscriber/stale consumer 在无 replay transport 上仍能安全收敛。
10. Frame/Activation/Render/Viewport/Shared State/Session Events 在删除 User Input 后仍独立通过 Qualification。

## 12. 测试和 Qualification 清单

### Framework Web Presentation custom-event

1. options 省略与 { broadcast:false } 的目标语义一致。
2. broadcast 只接受 boolean/undefined。
3. broadcast=true 进入新的跨 Subsystem path；broadcast=false/options omitted 在迁移期保持现有 owner-only 行为。
4. 只有 broadcast=true 使用新的固定 Web Presentation Event Channel broadcast path；不得为 owner-only 修改 SessionEventHub routing。
5. input.state / input.event 是 event.type，keyboard.state 等仍只在 data.channel。
6. business code 无法覆盖 Channel/source/session/owner/domain/target。
7. stale RenderNode/Context 不产生事件。
8. InputTarget 不参与 broadcast=true 新 Event path；legacy owner-only path 的现行依赖不在本阶段重写。
9. Desktop/PWA logical observables 一致。

### User Input v1-compatible device migration

1. 六个标准 channel 名完全一致。
2. KeyboardCodeV1 集合一致。
3. Keyboard State/Event payload shape 与 repeat/排序语义一致。
4. Pointer kind/button/sample、坐标缩放、32 pointer limit、cancel 和事件顺序一致。
5. Gamepad standard mapping、16 device limit、axis/button ranges、500_000 crossing threshold 和 crossing sort 一致。
6. event.isTrusted、focus/blur/visibility、surface validity 的现有行为保持。
7. gamepad RAF polling 和 connect/disconnect 结果与现实现一致。
8. 不产生 input.availability wire event。
9. 不把旧 Activation-scoped input.reset 拆成三个设备 reset。
10. unusable/disconnect 时产生对应 neutral State。
11. non-neutral bounded State refresh 可让 late subscriber 收敛。
12. stale timeout 可在最终 neutral packet 丢失时退回 neutral。
13. compatibility consumer 可按 keyboard.state 等六个 channel 分发到原风格 handler。
14. 新旧路径并行迁移期不得让同一物理输入重复触发业务。

### User Input 删除回归

- Data Profile 移除 input family 后 Render/Viewport 保持不变。
- Subsystem 移除 InputManager 后 Frame lifecycle 保持不变。
- Renderer Control 移除 InputTarget 后 Runtime/Frame/Activation/DataAuthority publication 保持一致。
- 设备 payload conformance 转移到 game-common-controls，不因 LR User Input Contract 退役而丢失。

## 13. 实施顺序

1. Contract / ADR：冻结 CustomEventOptions.broadcast、固定 Web Presentation Channel、input.state/input.event + { channel,payload } envelope。
2. Framework Event path：实现 trusted Presentation Event publication，broadcast 路径不经过 InputGate。
3. 类型复用：迁移期由 game-common-controls 直接复用 @loomrealm/data 的 v1 device definitions；LR User Input 退役时再原子迁 ownership。
4. Source mechanical split：把 createBrowserRendererInputSource 拆成 keyboard/pointer/gamepad 三个 source，保持现有测试和行为。
5. WC thin wrappers：三个 WC 通过共享 emitDeviceInput adapter 发布 v1-compatible state/event。
6. 收敛补偿：实现 non-neutral State bounded refresh 和 consumer stale timeout。
7. Compatibility consumer：基于 Session Events 提供 keyboard.state 等原 channel 风格 handler。
8. 业务迁移：离开 createInputListener；需要时再接 Controls Mapper/Aggregator。
9. 删除旧 Producer/Data/Subsystem input：停止 Renderer BrowserInputSource，删除 Data input family/Subsystem InputManager；InputGate 仅在独立 owner-only replacement 完成后删除。
10. 删除 InputTarget：最后更新 Main/Renderer Control 和 frozen profile/version。
11. 退役 User Input v1 Framework Contract/Qualification；设备 payload protocol 的 canonical ownership 保留在 game-common-controls。

## 14. 待冻结事项

- 新 WebPresentationContext shape 的正式版本号。
- 固定 Web Presentation Event Channel 常量的新 ownership。
- migrated data envelope 是否正式冻结为 { channel,payload }。
- LR User Input 退役时，v1 设备 types/constants/validators 从 @loomrealm/data 原子迁往 game-common-controls 的版本切换点。
- non-neutral State refresh 与 stale timeout 的 Qualification 数值。
- component disconnect 时若 Context 仍 current，是否要求 best-effort neutral State。
- compatibility consumer 是否只覆盖六个标准 channel，还是暂时支持旧 x.* custom input channel。
- InputResetV1 在旧 Framework 退役后的 deprecated/removed 说明。
- User Input v1、Renderer Data Profile、Renderer Control InputTarget 的版本升级与废止节奏。
- Controls Mapper/Aggregator 的 action schema 属于后续业务层，不阻塞设备等价迁移。

## 15. 设计结论

**迁移原则是：ownership 改变，设备协议尽量不变。**

三个设备 WC 不重新发明 Keyboard/Pointer/Gamepad 协议，而继续生产 User Input v1 已经 Qualification 的六个标准 channel 和 payload：

~~~text
keyboard.state / keyboard.event
pointer.state  / pointer.event
gamepad.state  / gamepad.event
~~~

主要包装变化：

~~~text
旧：
InputStateV1 / InputEventV1
  + frameId
  + activationId
  + channel
  + payload

新：
Web Presentation custom event
  name = input.state | input.event
  data = { channel, payload }
  options.broadcast = true
~~~

设备采集实现优先从现有 browser-input-source.ts 机械拆分，而不是重写。Input Interest、InputTarget、InputGate、Frame/Activation input lease 不迁移；input.reset 与 availability 也不机械变成新的业务事件。

Session Events 无 replay 导致缺失的 fresh State baseline，用最小的 non-neutral State refresh + consumer stale timeout 补偿。

这样迁移复杂度集中在 Framework transport 与 lifecycle seam，而不是同时重写设备协议、业务 handler 和浏览器采集算法。


本文仍为 Proposed；任何尚未更新的 frozen Contract、尚未实现的 Bridge、尚未执行的 Qualification 都不得被写作已完成事实。
