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
| 固定 Web Presentation Event Channel 与 broadcast audience | LM Framework |
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

为减少重复，User Input v1 的设备 types/constants/validators 应移动 ownership，而不是复制两份：

~~~text
Step 1  move Keyboard/Pointer/Gamepad payload types/constants/validators to game-common-controls
Step 2  @loomrealm/data temporarily re-export / alias for old User Input v1
Step 3  new WCs and consumers import only game-common-controls
Step 4  remove @loomrealm/data compatibility exports after LR User Input removal
~~~

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

publication audience
    = broadcast ? session : owner
~~~

职责必须保持分离：

- Channel：这是 Web Presentation custom event；
- name/type：这条业务事件是什么；
- data：业务协议数据；
- broadcast：谁可以收到。

### 5.4 owner-only 与 broadcast

| 调用 | 接收范围 |
| --- | --- |
| emitCustomEvent(name, data) | owner Subsystem 的匹配消费者 |
| emitCustomEvent(name, data, { broadcast: false }) | 同上 |
| emitCustomEvent(name, data, { broadcast: true }) | 当前 Session 中匹配 Web Presentation Event Channel 的消费者 |

两种模式使用同一个固定 Channel、同一种 event envelope、同一种 source provenance。

最终 owner-only 也不应依赖 InputGate/InputTarget。迁移期间，为兼容 Frozen v1，旧双参数调用可以暂时保持原 InputGate 行为；完成版本切换后，默认 false 也进入通用 Web Presentation Event path。

### 5.5 校验和版本边界

- options 省略合法；提供时 broadcast 只能是 boolean 或 undefined，不做 truthy coercion。
- stale/detached/currentness 仍先于业务参数校验。
- name 按 Web Presentation event name / Session Event type 职责验证，不按 Channel 解释。
- data 使用 Web Presentation 通用 JSON payload 约束，长期从 InputEventV1 payload 类型所有权中迁出。
- Framework 自己绑定固定 Channel、RenderNode provenance 和 source，business code 不能覆盖。
- void 只表示同步验证和本地接受，不承诺所有消费者完成处理；无 ACK、replay 或 exactly-once。

现行 WebPresentationContext v1 是 Frozen closed shape，所以 options 和 owner-only 新交付语义必须通过正式版本化 Contract / compatibility profile / conformance 发布，不得静默重定义 v1。

## 6. Trusted Presentation Event Bridge：必须是通用机制

候选路径：

~~~text
business WC
  |
  | emitCustomEvent(name, data, { broadcast? })
  v
WebProjector / Renderer currentness
  |
  | Framework binds:
  | fixed Web Presentation Channel
  | RenderNode owner provenance
  | event type = name
  | audience = owner | session
  v
trusted Renderer/Host presentation ingress
  |
  v
Session Events routing
  |
  +-- owner audience   -> owner Subsystem only
  |
  +-- session audience -> matching subscribers across current Session
~~~

Bridge 必须满足：

1. 只有当前 live RenderNode Context 可以发布。
2. Framework 使用固定 Web Presentation Event Channel；业务不能选择或覆盖该 Channel。
3. name 作为 event type，data 作为业务 payload；两者不得与 Channel 职责混用。
4. source、Session、subsystemKey、generation、domainId、targetKey 均由可信 Framework 绑定。
5. broadcast 只控制 audience，不推导 InputTarget，也不改变 Frame/Activation。
6. Renderer 不获得任意 SessionEventClient、Hub binding、subscribe 或 arbitrary-channel publish 能力。
7. Desktop/PWA 可有不同物理 Carrier，但逻辑 Contract 相同。
8. 慢订阅者、overflow、listener failure 复用 Session Events 有界/隔离语义。

### 6.1 owner recipient filter

Session Events v1 当前按 exact Channel 选择订阅者。Web Presentation custom event 还需要可信 audience metadata：

~~~ts
type PresentationEventAudience =
  | { readonly kind: "owner"; readonly subsystemKey: string }
  | { readonly kind: "session" };
~~~

该 metadata 是 Framework 内部路由事实，不属于 payload，也不是新的业务 Channel。

- broadcast=false：固定 Channel 匹配后，只投递给 owner Subsystem 的 subscription。
- broadcast=true：固定 Channel 匹配后，可投递给当前 Session 的所有 matching subscriptions。
- owner-only 不能先泄漏给其他 Runtime 再要求业务自行过滤。

recipient filter 可放在 SessionEventHub trusted ingress 或独立 Presentation Event Router；这是实现选择，不应修改 author-facing Session Events Channel 的职能。

### 6.2 source identity

推荐使用 RenderNode owner delegated publication：

- Renderer 从 current RenderNode 取得 owner subsystemKey/generation；
- Session Host 再以可信 authority 验证；
- 消费者看到真实业务 owner；
- WC 不能自行声明 source；
- 不创建虚假的 input subsystem；
- 不向 Renderer 暴露可任意伪造 source 的 SessionEventClient。

该能力会扩展 Frozen Session Events v1 的 publisher-origin integration semantics，因此需要单独 Integration Profile / ADR / conformance，但不要求重定义 Channel。

## 7. 消费方输入处理属于业务策略，而非 LM

跨 Subsystem 广播的目的，是让多个独立业务模块有机会观察相同的 Web Presentation custom event，而不是让 LR Framework 决定哪个模块应该响应游戏动作。

消费侧订阅 Framework 固定的 Web Presentation Event Channel，并通过 event.type/name 与业务 payload 识别具体事件：

~~~ts
const subscription = await scope.events.subscribe(
  [WEB_PRESENTATION_EVENT_CHANNEL],
  async (event) => {
    if (event.type !== "controls.event") return;

    // validate common-controls protocol
    // apply game-owned focus / priority / handling policy
  },
);
~~~

WEB_PRESENTATION_EVENT_CHANNEL 表示未来应正式导出的 Framework 常量；当前字符串实现仍为 x.loomrealm.web-presentation.event。业务代码不应自行构造 controls 专用 Channel 来替代该路由域。

应在 game-libs / game application 决定：

- gameplay、对话、菜单、战斗等谁拥有动作优先权；
- 某些控制是全局观察还是业务上的独占动作；
- 多个订阅者可否同时响应，如何避免重复业务副作用；
- 模态窗口、暂停、角色切换时如何处理输入状态；
- 是否提供 business input-focus/controller coordinator。

这些规则不得重新下沉成 LR InputTarget / Input Interest。Frame/Activation 仍是 LR Main 的运行生命周期与调用 authority，但不再承担用户输入路由资格。

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

要验证设备 Producer 的可用性，还须为各设备 RenderNode 确定持有者。Keyboard/Pointer/Gamepad 可以由同一个 presentation-shell Subsystem 挂载，也可以按业务拆开；Runtime 重启期间各 Producer 独立重建 epoch。**这由游戏组合决定**，不是 LM 内建一个 GlobalInput Subsystem。

## 10. 失败、顺序和性能语义

- Event Bridge/Session Events 不提供有序跨 Plane 事务；控制事件与 Shared State 写入不存在全局原子顺序。
- 同一发布源的业务序号用于发现丢失/过期状态；不能把跨 Runtime 到达顺序误认为完整输入因果顺序。
- 收到未知协议版本或无效 controls payload 的消费者应明确拒绝或忽略，不将业务验证下沉给 LM。
- Session Events 的投递失败或订阅关闭遵循现有通用契约；组件不得无条件自动重试瞬时输入，以免重复动作。
- 中断期间瞬时输入允许丢失，但连续状态必须通过业务快照、期限或重建策略**收敛到安全的中立状态**。
- 持续按住轴/键的活跃状态刷新应有界；使用吞吐上限、合并与背压，不能无限排队。
- 单个订阅者 throw、断开或 overflow 不应阻断其他订阅者，不应未经正式契约直接升级为 Main Session fatal。
- 不保存输入历史，不因新订阅者加入而回放已经完成的按键 impulse。

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
  keyboard/pointer/gamepad input payload types
  input-codec
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
| M0 | 冻结 options.broadcast、固定 Channel、name/type、owner/session audience | 原样保留 |
| M1 | 实现 trusted Presentation Event path，Desktop/PWA E2E | 双参数旧行为兼容 |
| M2 | 实现 game-keyboard-input / game-pointer-input / game-gamepad-input 及各自 state/event/reset | 新游戏按需挂载设备 WC |
| M3 | 设备消费者与可选 Controls Mapper/Aggregator 切到 Session Events | createInputListener 不再用于新游戏 |
| M4 | owner-only custom event 也切到通用 Presentation Event path | WC custom event 脱离 InputGate |
| M5 | 删除 Renderer Input Source / InputGate / Data input.* / Subsystem InputManager | Framework Input Plane 退出 |
| M6 | Renderer Control/Main 删除 InputTarget，更新 Data/Control Profiles 与 Qualification | User Input v1 正式退役 |

最终验收：

1. LR public API 不再暴露 Keyboard/Pointer/Gamepad User Input 类型。
2. Renderer 不再主动采集物理用户输入。
3. Renderer Data 不再包含 input.* family。
4. SubsystemScope 不再有 createInputListener。
5. Main / Renderer Control 不再发布 inputTarget。
6. emitCustomEvent 不依赖 InputGate。
7. 各设备 WC 只依赖对应 browser API + Web Presentation Context；可选 Mapper/Aggregator 只依赖业务设备协议 + 通用事件消费能力。
8. Frame/Activation/Render/Viewport/Shared State/Session Events 在删除 User Input 后仍独立通过 Qualification。

## 12. 测试和 Qualification 清单

### Framework Web Presentation custom-event

1. options 省略与 { broadcast: false } 的目标语义一致。
2. broadcast 只接受 boolean/undefined，不做 truthy coercion。
3. broadcast=false 只对 owner Subsystem 可见。
4. broadcast=true 可被当前 Session 中多个匹配 Web Presentation Event Channel 的 Subsystem 接收。
5. 两种模式使用相同固定 Channel。
6. 两种模式都以 custom-event name 作为 event type，而不是 Channel。
7. business code 无法覆盖 Channel、source、Session、owner generation、domainId、targetKey。
8. detached/stale/old Session/generation/RenderNode 不会成功产生事件。
9. invalid options/name/JSON/payload/limit 不产生部分投递。
10. InputTarget 不参与新 Event path；改变 InputTarget 不改变 owner/broadcast recipient selection。
11. Session restart / generation replacement 不串发旧消息。
12. Desktop/PWA 的物理 realization 符合同一 logical Contract。

### common-controls 业务协议

1. Keyboard、Pointer、Gamepad 可以分别单独挂载并独立工作。
2. 不挂载某设备 WC 时，不存在该设备的隐式 Framework Producer。
3. 同类型重复 Producer 的行为明确且可测试，不产生静默双份事件。
4. 每个设备拥有独立 epoch/revision；一个设备 reset 不影响其他设备。
5. Keyboard repeat、held state、blur/hidden reset 正确。
6. Pointer move/button/cancel/resize/surface-invalid lifecycle 正确。
7. Gamepad standard mapping、deadzone、button crossing、disconnect、poll throttling 正确。
8. late subscriber / reconnect 能通过完整 State refresh + TTL 收敛，不依赖历史 Event。
9. Controls Mapper 能正确合并多个物理来源；释放 Keyboard binding 时不会覆盖仍活跃的 Gamepad contribution。
10. PWA/Hostra 使用相同 device protocol。
11. 新链路不存在与旧 Renderer Input Source 的重复业务触发。

### User Input 删除回归

- Data Profile 移除 input family 后 Render/Viewport 行为保持不变。
- Subsystem 移除 InputManager 后 Frame lifecycle 行为保持不变。
- Renderer Control 移除 InputTarget 后 Runtime/Frame/Activation/DataAuthority publication 保持一致。
- 旧 User Input Contract 的退役必须有独立 migration evidence，不用 common-controls 测试替代 Framework conformance。

## 13. 实施顺序

1. Contract / ADR：冻结 CustomEventOptions.broadcast、固定 Web Presentation Channel、name -> event type、owner/session audience、delegated owner source。
2. Renderer seam：WebProjector 传递 options；ControlHolder currentness 后进入新 Presentation Event publisher；broadcast 路径不碰 InputGate。
3. Host/Hub audience：实现固定 Channel 的 trusted publication ingress 和 owner/session recipient filter，不改变 business Channel 职责。
4. PWA realization：Window -> Session Worker 受限发布链路和 E2E。
5. Desktop realization：BrowserWindow -> Desktop Host 受限发布链路和 E2E。
6. device WCs：分别实现 Keyboard / Pointer / Gamepad protocol、独立 lifecycle 与 Producer。
7. business controls：实现可选 Mapper/Aggregator，并迁移业务消费者；随后默认 broadcast=false 也切到通用 Presentation Event path。
8. Framework User Input 删除：清理 Subsystem InputManager、Data input family、Renderer sources/InputGate、Main/Renderer Control InputTarget，并同步更新 Contract/Qualification。

## 14. 待冻结事项

- 新 Context shape 采用 Web Presentation v2 还是 additive extension profile。
- 固定 Web Presentation Event Channel 是否沿用 x.loomrealm.web-presentation.event，以及常量迁移到哪个非 User Input ownership 的 package。
- name 映射到 Session Event type 的最终验证规则和 payload envelope。
- owner recipient filter 位于 SessionEventHub trusted ingress 还是独立 Presentation Event Router。
- delegated RenderNode owner publication 如何与现行 Session Events source.subsystemKey 契约衔接。
- Presentation Event publisher 的 queue/backpressure/异步失败诊断边界。
- owner-only 从旧 InputGate 切到通用 Event path 的版本切换点。
- User Input v1、Data Profile input slice、Renderer Control InputTarget 的废止版本与迁移窗口。
- Keyboard/Pointer/Gamepad 各自 schema、epoch/revision、state refresh/TTL/reset 规则，以及可选 Controls Mapper/Aggregator 的 action contribution/focus/priority 规则。

## 15. 设计结论

**最终目标是“LM 通用事件承载 + 按需设备 WC + 可选业务 Controls 聚合”，而不是“LM User Input v1 + 一个新的全局输入组件”。**

game-common-controls 是包和协议集合，不再等同于单一 game-common-controls 元素。Keyboard、Pointer、Gamepad 分别由独立业务 Web Component 采集和发布 canonical device state/event/reset；游戏只引入需要的设备能力。

跨设备的 move/confirm/cancel 等最终 action 不由任一设备 WC 单独拥有，而由可选 Mapper/Aggregator 或游戏业务层根据多个 source contribution 合并。这避免设备间状态互相覆盖，也保持每个组件职责单一。

LM 只负责 Web Component hosting、Web Presentation custom-event transport、可信 provenance 和 Session Events delivery，不知道当前页面是否安装 Keyboard、Pointer、Gamepad，也不理解它们如何组成游戏控制。旧 LR User Input 完成迁移后进入正式退役。


本文仍为 Proposed；任何尚未更新的 frozen Contract、尚未实现的 Bridge、尚未执行的 Qualification 都不得被写作已完成事实。
