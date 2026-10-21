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

本项目不是一个“大而全”的输入组件，也不是 LM User Input v1 的适配器。

**目标是把完整 User Input 领域从 LoomRealm Framework 迁移到 game-libs，并按物理输入类型拆成可按需挂载的业务 Web Components。LM 只提供 Web Component 承载、Web Presentation custom-event 发布和通用跨 Subsystem 事件分发。**

核心原则：

1. **按设备拆分 Producer**：Keyboard、Pointer、Gamepad 各自拥有独立 WC、独立生命周期、独立 epoch/revision 和独立状态机。
2. **业务按需引入**：游戏只挂载实际需要的设备组件；Framework 不默认创建任何浏览器输入 Producer。
3. **设备 WC 只拥有设备语义**：各组件负责 physical capture、canonical device state、device event、reset/recovery，不直接拥有跨设备最终 action 真值。
4. **跨设备 action 聚合独立**：WASD 与摇杆同时映射 move、Enter 与 Gamepad South 同时映射 confirm 等逻辑，由可选 Controls Mapper/Aggregator 或游戏业务层处理。
5. **LM 不理解输入语义**：不得解析或特判 keyboard/gamepad/pointer、pressed、deadzone、confirm、Input Interest 等业务字段。
6. **广播是通用基础能力**：设备 WC 通过 WebPresentationContext.emitCustomEvent 发布；options.broadcast 只改变 audience。
7. **不永久双轨**：旧 User Input v1 仅作为迁移来源；新链路覆盖并 Qualification 后删除 LR 内建输入 Producer、InputGate、InputManager、input.* Data family 与 InputTarget。
8. **跨平台协议一致**：Desktop/PWA 使用相同设备协议和 Web Presentation Event Contract；MessagePort/WebSocket/Worker/Hostra 细节不进入 game-common-controls。

这里的“与 LM 架构层完全解耦”指：**LM 不拥有任何 User Input 领域协议、设备采集、输入状态机、Interest 或 InputTarget 路由。** 业务组件仍使用 LM 提供的通用 Web Presentation 和 Session Events 基础设施。

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

  Keyboard                Pointer                  Standard Gamepad
     |                       |                           |
     v                       v                           v
<game-keyboard-input>  <game-pointer-input>      <game-gamepad-input>
     |                       |                           |
     | keyboard.*            | pointer.*                | gamepad.*
     | state/event/reset     | state/event/reset        | state/event/reset
     +-----------+-----------+-------------+-------------+
                 |
                 v
 WebPresentationContext.emitCustomEvent(
   name, data, { broadcast: true }
 )
                 |
                 v
 LM Web Presentation Event path
   fixed Framework Channel
   type = custom-event name
   payload = presentation envelope + device data
                 |
                 v
 Session Events
                 |
        +--------+---------+
        |                  |
        v                  v
 device-aware       optional Controls
 consumers          Mapper/Aggregator
                           |
                           v
                  move / confirm / cancel
                  game-owned focus/priority
~~~

分界原则：

| 内容 | 归属 |
| --- | --- |
| Custom Element、RenderNode 投影、Context 生命周期 | LM Web Presentation |
| 固定 Web Presentation Event Channel、可信来源、owner/broadcast audience | LM Framework |
| Channel 路由、订阅、队列与投递生命周期 | LM Session Events |
| Keyboard DOM 采集与 canonical state | game-keyboard-input |
| Pointer DOM 采集与 canonical state | game-pointer-input |
| Standard Gamepad polling/normalization | game-gamepad-input |
| 每设备 state/event/reset、epoch/revision/TTL | 对应设备 WC / common protocol |
| Keyboard + Gamepad 等跨设备 action 合并 | Controls Mapper/Aggregator 或游戏业务 |
| 游戏焦点、优先级、消费策略 | 游戏业务层 |
| Frame / Activation / Session / Runtime authority | LM Main |

特别禁止：

- 不得把多个设备 WC 重新包回一个 Framework-owned global input source。
- 不得让单个设备 WC 声称拥有其他设备的最终 action 状态。
- 不得把 custom-event name 重新解释成 Session Events channel。
- broadcast 只改变接收范围，不改变 Channel、type、payload schema 或 source identity。

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
producer epoch
revision
physical state
reset lifecycle
event listeners / polling resources
~~~

组件 disconnected 或 Context 失效时，只清理自己的设备状态，不影响其他设备组件。

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

## 4. 业务 User Input 协议的完整职责

### 4.1 设备层协议，而不是单一最终 controls 协议

每个设备 WC 自己完成：

~~~text
physical browser samples
   -> canonical device normalization
   -> current device state
   -> device edge event
   -> reset / recovery
   -> emitCustomEvent
~~~

设备层输出不要求提前转换成 confirm/move 等最终 gameplay action。

推荐事件名：

~~~text
input.keyboard.state
input.keyboard.event
input.keyboard.reset

input.pointer.state
input.pointer.event
input.pointer.reset

input.gamepad.state
input.gamepad.event
input.gamepad.reset
~~~

以上均为 Web Presentation custom-event name / Session Event type，**不是 Channel**。底层仍统一使用 Framework 固定 Web Presentation Event Channel。

### 4.2 公共 envelope

每个 Producer 独立维护 epoch/revision：

~~~ts
type InputDevice = "keyboard" | "pointer" | "gamepad";

interface DeviceMessageBase {
  readonly protocol: "@loomrealm-game/common-controls/1";
  readonly device: InputDevice;
  readonly epoch: string;
  readonly revision: number;
}
~~~

同一设备：

~~~text
epoch
    = 此 WC producer lifetime

revision
    = 此 epoch 内单调递增
~~~

不同设备之间不共享 revision，也不建立全局顺序。

### 4.3 Keyboard protocol

候选：

~~~ts
interface KeyboardState extends DeviceMessageBase {
  readonly device: "keyboard";
  readonly kind: "state";
  readonly down: readonly string[];
}

interface KeyboardEvent extends DeviceMessageBase {
  readonly device: "keyboard";
  readonly kind: "event";
  readonly action: "down" | "up";
  readonly code: string;
  readonly repeat: boolean;
}

interface KeyboardReset extends DeviceMessageBase {
  readonly device: "keyboard";
  readonly kind: "reset";
  readonly reason: "blur" | "hidden" | "disconnected" | "source-replaced";
}
~~~

### 4.4 Pointer protocol

候选：

~~~ts
interface PointerSample {
  readonly pointerId: number;
  readonly kind: "mouse" | "touch" | "pen";
  readonly x: number;
  readonly y: number;
  readonly buttons: readonly string[];
}

interface PointerState extends DeviceMessageBase {
  readonly device: "pointer";
  readonly kind: "state";
  readonly pointers: readonly PointerSample[];
}

interface PointerEvent extends DeviceMessageBase {
  readonly device: "pointer";
  readonly kind: "event";
  readonly action: "down" | "up" | "cancel";
  readonly pointer: PointerSample;
  readonly button: string | null;
}

interface PointerReset extends DeviceMessageBase {
  readonly device: "pointer";
  readonly kind: "reset";
  readonly reason: "blur" | "hidden" | "disconnected" | "surface-invalid" | "source-replaced";
}
~~~

组件名使用 Pointer 而不是 Mouse，因为浏览器 Pointer API 同时覆盖 mouse/touch/pen。游戏若只接受鼠标，应在业务配置中限制 pointer kind。

### 4.5 Gamepad protocol

候选：

~~~ts
interface GamepadState extends DeviceMessageBase {
  readonly device: "gamepad";
  readonly kind: "state";
  readonly gamepads: readonly GamepadSample[];
}

interface GamepadEvent extends DeviceMessageBase {
  readonly device: "gamepad";
  readonly kind: "event";
  readonly action: "down" | "up";
  readonly gamepadId: number;
  readonly button: string;
  readonly value: number;
}

interface GamepadReset extends DeviceMessageBase {
  readonly device: "gamepad";
  readonly kind: "reset";
  readonly reason: "hidden" | "blur" | "device-lost" | "disconnected" | "source-replaced";
}
~~~

标准 mapping、axes/buttons normalization、deadzone/threshold/quantization 属于 game-gamepad-input，不进入 LR。

### 4.6 State / Event / Reset 共同语义

State：

- self-contained current truth；
- 状态改变立即发送；
- 非中立持续状态可按有界周期重宣告，用于 late subscriber/reconnect 收敛；
- Consumer 不能靠历史 Event 重建 current state。

Event：

- future-only transient edge；
- 不 replay；
- 不自动重试；
- 丢失时不能伪装为 exactly-once。

Reset：

- producer 主动表示旧状态失效；
- 但正确性不能依赖 Reset 必达；
- Consumer 仍需 epoch replacement + TTL 退回 neutral。

### 4.7 availability 不迁移成 Framework 协议

旧 RendererInputSource 的 availability 是 InputGate 内部机制，不需要一比一公开迁移。

每个 WC 内部维护：

~~~text
window usable
device available
surface valid
gamepad connected
~~~

availability loss 应转换为本设备的：

~~~text
clear local state
+ reset
+ neutral state when appropriate
~~~

如果某个游戏需要“当前是否连接手柄”等信息，可以由 game-gamepad-input 作为业务设备状态另行定义，不恢复 LR 的 Producer(C) Framework 概念。

### 4.8 跨设备 Controls 聚合

例如：

~~~text
Keyboard W --------+
                   +--> move-forward
Gamepad leftY -----+
~~~

若 Keyboard W 松开，但 Gamepad 仍向前：

~~~text
keyboard source inactive
gamepad source active
        |
        v
move-forward remains active
~~~

因此设备 WC 不应各自直接宣布“最终 move-forward released”。Aggregator 应按 source set / contribution model 合并：

~~~text
ActionState[action]
    = aggregate(contributions from keyboard/pointer/gamepad)
~~~

跨设备 mapper 可以输出另一个纯业务协议，例如 controls.state / controls.event，但这属于 game-libs 上层协议，不改变设备 WC 或 LR Framework。

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

## 8. 浏览器设备组件

### 8.1 game-keyboard-input

职责：

- 监听 keydown / keyup；
- 使用稳定 code 建立 canonical held set；
- 处理 repeat；
- blur / visibility hidden / disconnect 时清空；
- 产生 keyboard state/event/reset；
- 自己维护 keyboard epoch/revision；
- 可按配置处理 preventDefault，但不得默认吞掉文本/表单输入。

不负责 Gamepad、Pointer，也不负责 confirm/move 等跨设备 action 聚合。

迁移难度：低到中。大部分行为可参考现有 browser-input-source 的 Keyboard slice。

### 8.2 game-pointer-input

职责：

- pointerdown / pointermove / pointerup / pointercancel；
- mouse/touch/pen canonicalization；
- canonical pointerId；
- buttons state；
- coordinate normalization；
- resize/surface validity；
- blur/hidden reset；
- pointer state/event/reset。

不把组件命名为 mouse，因为旧协议和浏览器 Pointer API 都覆盖 mouse/touch/pen。

迁移难度：中。主要风险是 pointer lifecycle、surface resize 和 cancel。

### 8.3 game-gamepad-input

职责：

- navigator.getGamepads()；
- requestAnimationFrame polling；
- standard mapping；
- stable local gamepad identity；
- axes/buttons normalization；
- button crossing detection；
- deadzone、threshold、quantization；
- connect/disconnect/reset；
- bounded state update frequency。

迁移难度：中高。物理采集本身已有实现参考，重点是节流、状态重宣告和设备断连收敛。

### 8.4 每设备恢复独立

每个 WC 独立执行：

~~~text
blur / hidden / disconnected
    -> clear own physical state
    -> recreate/advance producer epoch as defined
    -> emit own reset / neutral state
~~~

Keyboard reset 不能清空 Gamepad state；Gamepad disconnect 也不能让 Pointer epoch 失效。

消费者分别追踪：

~~~text
keyboard epoch/revision/TTL
pointer epoch/revision/TTL
gamepad epoch/revision/TTL
~~~

Aggregator 再基于这些独立 source state 计算最终 controls。

## 9. 部署与跨平台约束

| 方面 | Desktop / Hostra | PWA |
| --- | --- | --- |
| WC 运行位置 | Renderer BrowserWindow | PWA Window |
| 物理输入 | Window Keyboard/Pointer/Gamepad | Window Keyboard/Pointer/Gamepad |
| WC 协议 | 相同 keyboard/pointer/gamepad device protocols | 相同 |
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
