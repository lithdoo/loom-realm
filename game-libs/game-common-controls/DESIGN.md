# Game Common Controls：业务层 User Input 协议与跨 Subsystem 广播设计

> 状态：**Proposed / 设计方案，尚未实现、尚未冻结、尚未 Qualification**  
> 位置：game-libs/game-common-controls/  
> 目标包：**@loomrealm-game/common-controls**  
> 目标组件：**`<game-common-controls>`**  
> 设计核心：**用户输入属于 game-libs 业务协议，而非 LoomRealm Framework 协议。**  
> Framework 细化方案：[Web Presentation Custom Event Routing](../../doc/10-architecture/web-presentation-custom-event-routing.md)  
> 相关现行契约：[Web Presentation API v1](../../doc/15-contracts/web-presentation-api-v1.md)、[User Input v1](../../doc/15-contracts/user-input-v1.md)、[Session Events v1](../../doc/15-contracts/session-events-v1.md)、[Render Update v1](../../doc/15-contracts/render-update-v1.md)、[ADR 0031](../../doc/decisions/0031-business-owned-web-component-projection.md)

> **定位说明**：本文描述未来目标和迁移方案，不修改上述已冻结正式契约的现行事实。当前的 Web Presentation 仍只有 owner-targeted 双参数 emitCustomEvent，Renderer 仍有 User Input v1/InputGate；本文要求先实现、验证新的通用广播基础设施，再有序迁移和移除旧输入专属能力。本文中的接口和消息结构均为候选设计，不得视作已发布 ABI。

## 1. 核心目标与架构原则

本项目不只是把键盘或手柄映射为 confirm/move 等动作，也不是 LM User Input v1 的附属适配器。

**目标是以 Render 层的业务 Web Component 为输入实现主体，将完整的 User Input 领域协议从 LoomRealm（下称 LM）架构层迁移到 game-libs；LM 仅提供 Web Component 承载、通用跨 Subsystem 事件分发及已有的通用 Session/Runtime 能力。**

具体要求：

1. **输入协议归业务层所有**：输入设备采集、设备标准化、状态快照、瞬时事件、重置、订阅消费规则、映射与焦点/优先级策略，在 common-controls 或其业务协作模块定义和演进。
2. **LM 不理解输入语义**：跨 Subsystem 路由只校验通用事件、来源、授权、大小、生命周期和流控；不得解析或特判 keyboard/gamepad/pointer、pressed、confirm、deadzone、Input Interest 等字段。
3. **Web Component 是实际生产者**：通过 Web Projector 挂载的 `<game-common-controls>` 直接采集浏览器设备事件，在组件内运行输入协议状态机，再调用注入的 WebPresentationContext.emitCustomEvent(...) 发布。
4. **广播是通用基础能力**：为 emitCustomEvent 增加显式的跨 Subsystem 广播模式；复用现有 Session Events 通路/语义，不另造 LM 输入专属 IPC 或第二个事件总线。
5. **广播不授予执行权**：观察者可能不止一个，但事件可见性不等于 Frame、Activation、Main 控制权或写状态权限；具体业务谁消费、谁执行由业务层决定。
6. **兼容地迁移，而不是永久双轨**：旧 User Input v1 作为迁移来源及兼容对象，不是新组件长期必须依赖的底层。达到覆盖和 Qualification 后，再独立决策废止其专属 Framework 协议/生产者。
7. **设备与宿主可替换**：同一个业务输入协议及 WC 面向 Desktop/PWA；LM 的物理 MessagePort/WebSocket、Worker/进程拓扑不能进入游戏输入包。

这里的“与 LM 架构层完全解耦”特指**LM 不拥有任何 User Input 领域契约、状态机、设备采集或专属路由策略**，并不是说业务组件不依赖 LM 通用的 Web Presentation 和事件承载接口。

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
  Keyboard / Pointer / Standard Gamepad
                |
                v
     <game-common-controls>
       - physical capture
       - business User Input protocol
       - state/event/reset lifecycle
                |
                v
 WebPresentationContext.emitCustomEvent(
   name, data, { broadcast: true }
 )
                |
                v
 LM Web Presentation Event path
   - currentness
   - authenticated provenance
   - validation / bounded delivery
                |
                v
 fixed Web Presentation Event Channel
 event type = custom-event name
 payload = presentation envelope + business data
                |
                v
 Session Event routing
      /        |        \
     v         v         v
   Map       Battle    Menu/other
~~~

分界原则：

| 内容 | 归属 |
| --- | --- |
| Custom Element、RenderNode 投影、Context 生命周期 | LM Web Presentation |
| 固定 Web Presentation Event Channel、可信来源、owner/broadcast audience | LM Framework 通用事件基础设施 |
| Channel 路由、订阅、队列与投递生命周期 | LM Session Events |
| custom-event name 的业务含义与 data schema | 业务层 |
| Keyboard / Pointer / Gamepad 采集与标准化 | game-common-controls |
| User Input state/event/reset、恢复与设备映射 | game-common-controls |
| 游戏输入焦点、优先级、消费策略 | 游戏业务层 |
| Frame / Activation / Session / Runtime authority | LM Main |

特别禁止：

- 不得把 custom-event name 重新解释成 Session Events channel。
- 不得在 emitCustomEvent options 中让业务选择 Framework 路由 Channel。
- 不得由 LM Bridge 理解 keyboard/gamepad/pointer 或 controls 动作。
- broadcast 只改变接收范围，不改变 Channel、type、payload schema 或 source identity。

## 3. 包交付、组件挂载和依赖

建议目录：

~~~text
game-libs/game-common-controls/
  DESIGN.md
  README.md
  package.json
  src/
    game-common-controls.ts   # WC / lifecycle
    device/                   # keyboard, pointer, gamepad producers
    protocol/                 # message, validation, epoch/sequence
    state/                    # held controls, reset, snapshots
    mapping/                  # bindings, axes, chords
    consumer/                 # optional author-facing helpers
  test/
    unit/
    browser/
    integration/
~~~

目录只表示职责拆分建议，不要求提前引入所有文件。

组件是业务拥有的 Custom Element，不是新的 Renderer，也不直接管理 Render Store。它必须由某个普通业务 Subsystem 的 RenderDomain 创建 RenderNode，再经 Web Projector 挂载并获得 WebPresentationContext。可以由游戏入口或 presentation-shell/controls-owner Subsystem 持有这个节点，但 LM 不得为它建立输入专属的特殊 Host。

建议每个 Renderer Window 在同一输入所有权范围内最多有一个启用中的全局实例。重复实例应有可测试的拒绝、禁用或明确多实例隔离规则，绝不能默默双份采集和广播。WC 应在 disconnectedCallback/过期 Context 及时停止事件源；重新挂载应产生新输入 epoch。

推荐依赖方向：

~~~text
examples / game Subsystems
         |
         v
@loomrealm-game/common-controls
         |
         +--> browser standard APIs (physical capture)
         +--> public Web Presentation Context (generic event publish)
         +--> public Session Events author interface (consumers)
~~~

common-controls 不应导入 LM 内部 InputGate、RendererInputSource、Input Interest Registry、InputTarget wire schema、SessionEventHub 内部类型，也不得按 Desktop/PWA 定制业务协议。

## 4. 业务 User Input 协议的完整职责

### 4.1 从设备到业务协议

WC 自身拥有完整处理流水线：

~~~text
DOM / Gamepad physical samples
   -> normalize (key, pointer, axis, device identity)
   -> aggregate current held/axis state
   -> map to game control semantics
   -> derive state / event / reset
   -> validate + bounded rate/size
   -> emitCustomEvent broadcast
~~~

例如 Enter/手柄 South 映射为 confirm，Escape/手柄 East 为 cancel，方向键/WASD/左摇杆为 move，Start 为 menu。这只是**业务默认映射**，不得冻结进 LM Contract。

业务库需要同时支持：
- **状态类输入**：当前按键集合、连续摇杆值、指针位置等，以自包含的当前状态表示，并具有恢复/失效机制。
- **瞬时类输入**：点击、确认、取消或其他 impulse，只表示某次发生，不承诺重放。
- **重置类输入**：设备断开、焦点丢失、WC 失活、Source epoch 更换时，使下游停止相信旧状态。
- **业务订阅意图**：业务 Consumer 可根据 Channel、动作或游戏上下文选择处理；若需要类似旧 Input Interest 的能力，应由业务协议定义，不复用 LM InputGate。

### 4.2 候选消息格式（未冻结）

建议将整个业务协议版本放进 payload，并按逻辑消息类型区分：

~~~ts
type ControlsProtocol = "@loomrealm-game/common-controls/1";

interface ControlsBase {
  readonly protocol: ControlsProtocol;
  readonly epoch: string;       // WC 输入生产者生命周期；非 LM Session/Activation
  readonly revision: number;    // 本 epoch 内单调递增的业务序号
}

interface ControlsEvent extends ControlsBase {
  readonly kind: "event";
  readonly action: string;
  readonly phase: "pressed" | "released" | "impulse";
  readonly device: "keyboard" | "pointer" | "gamepad";
  readonly control: string;
  readonly value?: number;
}

interface ControlsState extends ControlsBase {
  readonly kind: "state";
  // 有界、自包含的当前 held/axis 状态，不是局部增量 patch
  readonly values: Readonly<Record<string, number>>;
}

interface ControlsReset extends ControlsBase {
  readonly kind: "reset";
  readonly reason:
    | "blur"
    | "hidden"
    | "disconnected"
    | "device-lost"
    | "source-replaced";
}

type ControlsMessage = ControlsEvent | ControlsState | ControlsReset;
~~~

这份示例用于说明 **User Input 协议由业务包拥有**，不代表最终必须保留全部字段或原样继承 User Input v1 wire。消息仍须满足通用 JSON 安全边界、长度、深度、字节上限，数值均为有限数；明确 action/value 的合法范围和协议版本策略。

Web Presentation 的 name 映射为 Session Event type（如 controls.event、controls.state、controls.reset），data 携带上述业务消息。底层始终使用 Framework 固定的 Web Presentation Event Channel；业务协议不拥有、不选择、也不重定义该 Channel。

### 4.3 状态与事件的区别不可抹平

瞬时事件可按按下边沿发布，但松开事件也可能丢失，因此不能仅凭旧 pressed 永久保持状态。对于持续移动、摇杆或组合键，主要消费依据应为**有界有效期的完整当前状态**，而不是无期限累积事件。

推荐的业务协议不变量：

1. 同一动作的多个物理绑定使用引用计数/来源集合聚合，释放其中一个键不应误释放动作。
2. Keyboard auto-repeat 默认不生成重复 pressed；长按重复是显式业务配置。
3. 摇杆含 deadzone、量化、变化阈值、节流与最终中立值；不得将每一帧完整设备数据不加限制地广播。
4. WC 每个 epoch 内的 revision 单调递增；消费者可抑制过期消息。epoch 切换时必须丢弃旧 epoch 的业务输入状态。
5. 消费者在订阅建立时以“尚未获得当前状态”或中立态开始，不能从过去事件推导真值。
6. 因现有 Session Events **不回放、不保证断线事件到达**，协议应规定可恢复的完整状态重发策略（例如状态变更时发送、活跃状态按受限周期重宣告）及 Consumer 超时退回中立态。
7. 重置优先尝试发布 reset，但不能依赖它必然到达；消费者本地 TTL/epoch 替换规则是防 stuck input 的最终兜底。
8. 对瞬时 confirm/cancel 的丢失，v1 可选择 best-effort；若玩法要求严格交付，需单独定义业务层 ACK/幂等/恢复机制，不能谎称 Session Events 已提供 exactly-once。

状态周期、TTL、轴阈值和具体限额必须经跨进程及浏览器测试后冻结，不能在本提案中虚构为现行 Framework 保证。

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

## 8. 浏览器设备支持与状态机

### 8.1 Keyboard

- 统一使用稳定的物理 code（必要时允许业务键位按 key 映射）；排除不该影响游戏的文本输入/IME。
- 处理 repeat、组合键、多个物理来源到同一 action 的聚合。
- 遵循浏览器焦点和默认行为策略，按业务配置决定 preventDefault，不得全局吞掉表单输入。

### 8.2 Standard Gamepad

- 使用浏览器标准 Gamepad API 采样与连接/断连事件，不引入厂商专有 SDK。
- 标准 button/axis 映射、deadzone、量化、阈值、抗抖、节流。
- 手柄缺失和采样失败时发布中立状态或 reset，并终止依赖旧设备的 held action。
- 多手柄冲突的选择/合并策略是业务配置，不进入 LM。

### 8.3 Pointer 与原协议覆盖范围

旧 User Input v1 已包含 Pointer；若目标是**完整取代** LM User Input 专属能力，则不能只实现 Keyboard + Gamepad 就宣称功能等价。初期可以先交付 Keyboard/Gamepad 最小链路，但正式退役旧协议之前，需要明确 Pointer（以及旧协议支持的全部其他通道）的迁移、替代或经过批准的范围缩减。

### 8.4 单实例及恢复

- Window blur、visibility hidden、disconnectedCallback、Gamepad disconnect 及时本地清零。
- 组件不可依赖“最后一条 reset 必到”；消费方需要 epoch + TTL 等恢复策略。
- 重连、重挂载产生新的 producer epoch；旧 Context 即使被业务保存，也不能继续有效发送。
- 同一物理事件不应同时通过旧 LM InputGate 和新 Controls 通道触发**同一个游戏逻辑**，过渡期必须选择单一消费者路径。

## 9. 部署与跨平台约束

| 方面 | Desktop / Hostra | PWA |
| --- | --- | --- |
| WC 运行位置 | Renderer BrowserWindow | PWA Window |
| 物理输入 | Window Keyboard/Pointer/Gamepad | Window Keyboard/Pointer/Gamepad |
| WC 协议 | 相同 common-controls 业务协议 | 相同 |
| Event bridge | 通用可信 Renderer→Session ingress | 通用可信 Renderer→Session ingress |
| Event Hub 位置/传输 | 按 Desktop 既有宿主拓扑 | 按 PWA 既有 Worker/Port 拓扑 |
| Subsystem 消费方式 | SessionEventClient exact-channel subscribe | 相同 |

Bridge 必须用平台通用接口表达所需能力，并由 Desktop/PWA composition 各自接线；不把 ipcRenderer、WebSocket、MessagePort 或 ServiceWorker 放进 common-controls 业务代码。

要验证全局 controls 的可用性，还须为 RenderNode 确定持有者：组件是否由持续存活的 presentation-shell Subsystem 挂载，以及该 Runtime 重启期间的输入中断/重建行为。**这由游戏组合决定**，不是 LM 内建一个隐式 GlobalInput Subsystem。

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
| M2 | common-controls 实现 Keyboard/Gamepad/Pointer 与业务 state/event/reset | 新游戏切 WC 输入 |
| M3 | Subsystem 业务消费者切到 common-controls + Session Events | createInputListener 不再用于新游戏 |
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
7. game-common-controls 只依赖 browser API、Web Presentation Context 和通用事件消费能力。
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

1. 键盘/手柄等价输入映射到相同 action，设备来源可按需区分。
2. 两个物理键绑定同一动作，释放其中之一不提前结束动作。
3. auto-repeat、deadzone、微小轴抖动、并发手柄、长按频率有界处理。
4. blur、hidden、disconnect、component detach、source epoch replacement 不残留 stuck input。
5. 慢/迟加入订阅者从完整当前状态或中立状态正确收敛。
6. 丢 release/reset、Runtime reconnect、发布失败时 Consumer 能恢复中立态。
7. 多个 Subsystem 可观察 broadcast，但游戏业务自己决定谁执行动作。
8. PWA/Hostra 实际浏览器输入 E2E 和 Pointer 范围闭合。
9. 新输入链路不存在与旧 Renderer Input Source 的重复业务触发。

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
6. common-controls：实现业务 Input protocol 与设备 Producer。
7. owner-only 切换：默认 broadcast=false 也走通用 Presentation Event path。
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
- Controls 业务 schema、epoch/revision、state refresh/TTL、reset、设备映射和游戏层 focus/priority。

## 15. 设计结论

**最终目标是“LM 通用事件承载 + 业务 WC 完整输入协议”，而不是“LM User Input v1 + 额外广播适配器”。**

LM 负责保真地承载/鉴权/路由 Web Presentation 事件，不关心它们是不是游戏输入；game-common-controls 才拥有完整用户输入领域逻辑和协议；Subsystem 消费方只依赖该业务协议及 LM 已有的通用 Session Events 能力。待新链路功能和跨平台 Qualification 完成后，旧 LM 内建 User Input 专属设施才进入有治理的退役阶段。

本文仍为 Proposed；任何尚未更新的 frozen Contract、尚未实现的 Bridge、尚未执行的 Qualification 都不得被写作已完成事实。
