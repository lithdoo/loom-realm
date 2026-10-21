# Game Common Controls：业务层 User Input 协议与跨 Subsystem 广播设计

> 状态：**Proposed / 设计方案，尚未实现、尚未冻结、尚未 Qualification**  
> 位置：game-libs/game-common-controls/  
> 目标包：**@loomrealm-game/common-controls**  
> 目标组件：**`<game-common-controls>`**  
> 设计核心：**用户输入属于 game-libs 业务协议，而非 LoomRealm Framework 协议。**  
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
       game-libs business WC
       - physical capture
       - canonical device state
       - business User Input protocol
       - state/event/reset lifecycle
       - key mapping / dedup / throttling
                |
                v
 WebPresentationContext.emitCustomEvent(
   name, data, { audience: "all-subsystems", channel: ... }
 )
                |
                v
  LM trusted Presentation Event Bridge
       [generic only: currentness,
        authenticated provenance,
        channel capability, validation,
        bounded delivery]
                |
                v
      Session Event routing
         exact-channel subscriptions
          /          |          \
         v           v           v
      Map         Battle       Menu/other
       \            |            /
        business-owned input consumers
        (own focus/priority/handling policy)
~~~

**分界线**：

| 内容 | 归属 |
| --- | --- |
| Custom Element 注册、RenderNode 投影、Context 注入及失效 | LM Web Presentation |
| 通用 Presentation → Session 事件桥接、身份和权限校验 | LM Framework 通用事件基础设施 |
| 精确 Channel 路由、订阅、队列上界与投递生命周期 | LM Session Events |
| Keyboard / Pointer / Gamepad 采集与标准化 | game-common-controls |
| User Input 消息定义、状态快照、Event、Reset、重连/恢复规则 | game-common-controls 业务协议 |
| 输入映射、长按、轴过滤、重复输入抑制 | game-common-controls |
| 多消费者输入意图、焦点、优先级、动作消费策略 | 游戏业务层（可由 common-controls 提供可选模块） |
| Frame / Activation / Session 控制及运行故障收束 | LM Main（与输入协议独立） |
| 业务长期事实或需要恢复的持久状态 | 相应业务 authority；必要时复用通用 Shared State |

**特别禁止**：LM Bridge 不得硬编码 game-common-controls 包名、固定 controls Channel、语义动作白名单、特定设备事件格式，也不得自行维护 pressed 集合。

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

可把 Web Presentation 的 name 映射为 Session Event type（如 controls.event、controls.state、controls.reset），data 携带上述业务消息。Channel 由**业务配置**给出，例如 game.controls/1；LM 只将它视作不透明精确匹配字符串，不创建或保留 controls 专用的基础设施 Channel。

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

### 5.1 为什么必须扩展现有 API

[Web Presentation API v1 §8](../../doc/15-contracts/web-presentation-api-v1.md) 当前定义：

~~~ts
emitCustomEvent(
  name: string,
  data?: InputEventV1["payload"],
): void;
~~~

该接口目前是 owner-targeted User Input reverse capability：最终经 InputGate 投递到所属 Subsystem；不能单靠 WC 调用就实现广播。

**目标**是在保留原两参数行为的前提下，给这个 WC Context 能力增加显式的跨 Subsystem 通用事件发布模式。新增部分不是“User Input 的特例”，而是任何被授权 business WC 可使用的通用事件能力。

### 5.2 候选兼容 API（未冻结）

~~~ts
type CustomEventAudience = "owner" | "all-subsystems";

interface CustomEventOptions {
  readonly audience?: CustomEventAudience;
  // 仅 broadcast 模式使用，业务自定义的 opaque exact channel
  readonly channel?: string;
}

interface WebPresentationContext {
  readonly resources: PresentationResourceClient;
  emitCustomEvent(
    name: string,
    data?: InputEventV1["payload"],
    options?: CustomEventOptions,
  ): void;
}
~~~

示例：

~~~ts
context.emitCustomEvent(
  "controls.event",
  {
    protocol: "@loomrealm-game/common-controls/1",
    epoch: "local-controls-epoch",
    revision: 23,
    kind: "event",
    action: "confirm",
    phase: "impulse",
    device: "keyboard",
    control: "Enter",
  },
  { audience: "all-subsystems", channel: "game.controls/1" },
);
~~~

候选语义：

- 省略 options 时仍是 **owner**，不改变历史双参数调用的含义。
- all-subsystems 指进入跨 Subsystem 分发范围，**并非强迫每个 Runtime 无订阅收到回调**；同 Session Events v1，实际接收者是订阅对应 exact channel 的 Runtime。
- Channel 由业务选择，不能由 LM 把 common-controls 名称写死到 Bridge 中。
- options 不是新权威身份载体，组件不能自行指定 Session、owner subsystemKey、generation、Frame、Activation 或 Source provenance。
- 成功调用只代表通过同步检查并被本地异步投递路径接受，不代表所有目标成功处理；无业务 ACK、无自动重放、无默认重试。
- owner 模式使用既有 currentness/InputGate 语义；broadcast 模式**不得通过 InputGate 或借用 InputTarget 来控制收件人**。

版本策略尚待决定：由于 v1 Context 为 frozen closed shape，必须通过正式的 Web Presentation 新版本/可选扩展契约、适配兼容期与 conformance fixtures 发布，不得先改接口并声称仍符合原 v1。

## 6. Trusted Presentation Event Bridge：必须是通用机制

候选路径：

~~~text
business WC -- emitCustomEvent(... all-subsystems)
         |
   Web Projector context/currentness check
         |
   trusted Renderer/Host presentation ingress
         |  validate + authorize opaque channel
         |  attach authoritative provenance
         v
    Session event routing
         |
    exact channel subscribers
         v
    Subsystem SessionEventClient
~~~

### 6.1 能力与权限边界

Bridge MUST/SHOULD 满足：

1. 只有**当前、已挂载且受信任的 Context** 可发起广播；detached/expired RenderNode、旧 Session/generation、窗口 teardown 等不得产生新事件。
2. name/channel/payload 按通用 Contract 同步验证，拒绝非 JSON、循环引用、不可表示的数字、超大数据与非法标识。
3. 宿主注入经过验证的 provenance；业务字段不能覆盖 Source、Session、subsystemKey、generation、domain/key 等身份。
4. Channel 发布权限由通用 capability/Host 配置授予，可选 opaque allow-list、配额及流控；**Renderer 不获得无限制的 SessionEventClient 或 Hub 内部引用**。
5. Bridge 不推导 Frame/Activation/InputTarget，也不擅自让接收者变成 active；不解析 controls 业务字段。
6. 跨平台只要求同一套逻辑广播 Contract，Desktop/PWA 可以有不同物理 Carrier，但不改协议。
7. 对慢订阅者使用 Session Events 的有界消费语义，不让一个失败消费者拖住其他消费者；不建立历史队列或无限重试。
8. 与现有 WC reverse input 一样，明确同步参数失败、异步投递失败、回调重入和 FIFO 的区别，并用专门 conformance 验证。

### 6.2 一个必须先关闭的身份问题

现有 Session Events v1 把业务可见 **source.subsystemKey** 绑定到真实的 Runtime publisher identity。新广播的发起执行点却是 Renderer 中的 WC。

建议优先评估以下**通用**身份方案，并在正式 Contract 中二选一：

- **候选 A：按 RenderNode 业务 owner 归属发布。** Trusted Host 验证当前 RenderNode 所属的真实 Subsystem，并以该逻辑 owner 绑定受限发布端口；source.subsystemKey 表示发布行为的业务归属，而非代码实际运行进程。须明确这一语义是否仍满足 Session Events v1 已冻结的 publisher 真实性约束。
- **候选 B：扩展 Session Events 的来源模型。** 使用经过认证的 presentation producer 身份（例如 source.kind = presentation），需要单独的协议版本和订阅者兼容方案。

**禁止**为求方便伪造一个“input-subsystem”、用客户端 payload 填 source 或让 WC 直接调用任意 Hub Binding。身份方案及其跨平台落地在冻结之前，Bridge 仍属于未闭合设计。

## 7. 消费方输入处理属于业务策略，而非 LM

跨 Subsystem 广播的目的，是让多个独立的业务模块都**有机会观察**到相同输入，而不是自动赋予每个模块操作权。

~~~ts
const subscription = await scope.events.subscribe(
  ["game.controls/1"],
  async (event) => {
    if (event.type !== "controls.event") return;
    // validate business controls protocol/version/epoch/revision
    // test game-owned interaction/focus/priority policy
    // execute only if this Subsystem is the proper business consumer
  },
);
~~~

上述仅示意订阅模型；接口名字和具体消费 API 以现有 author-facing SessionEventClient 和最终业务包导出为准。

应在 **game-libs / game application** 侧决定：

- 当前 gameplay、对话、菜单、战斗等谁拥有动作优先权；
- 某些控制是全局观察事件还是独占消费动作；
- 多个订阅者可否同时响应，如何避免重复业务副作用；
- 模态窗口、焦点切换、暂停、角色切换时的输入重置和状态继承；
- 是否提供独立的 business input-focus/controller coordinator。

可以利用 LM 通用 Shared State 保存必要的业务焦点事实，但不得将其伪装成 LM InputTarget 或要求 LM 为 controls 维护输入兴趣表。

**安全边界**：即使某个订阅者收到了 confirm，也不能因此绕过 Main 的 Frame/Activation/Session 生命周期。若目标业务操作需要运行许可，必须由本来的 Subsystem/Frame 业务执行边界校验。这里保留 LM 通用控制权，不等于保留 LM 输入协议。

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

## 11. 从 LM User Input v1 迁移：显式退出路径

本设计不是让两套 User Input 机制永久并行。建议的迁移阶段：

| 阶段 | 交付 | 旧 User Input 状态 |
| --- | --- | --- |
| M0 语义与边界 | 冻结业务输入协议目标、LM 广播能力界面及身份方案 | 保持不变 |
| M1 LM 通用广播 | 新版本的 Web Presentation Broadcast、可信 Bridge、跨平台 Route、Conformance | 保持不变；旧双参数兼容 |
| M2 WC Producer | common-controls：键盘/手柄、状态/Event/Reset、生命周期、Consumer helpers | 新游戏可选择 WC-only |
| M3 业务接入 | Map + 至少另一 Subsystem 真实跨进程订阅；Desktop/PWA E2E | 对迁移游戏禁用旧输入业务处理路径 |
| M4 范围收敛 | Pointer 与全部需保留的旧输入能力，焦点策略、故障恢复、性能 Qualification | 确认无必需业务依赖 |
| M5 Framework 清理 | 经独立 ADR/Contract governance 废止 LM 输入专属 Producer、InputGate、Interest/State/Event/Reset 等 | 才能正式退役或移除 |

迁移前**不能擅自声称** LM 已完全解耦，因为当前 RendererInputSource、InputGate、Main InputTarget 和相关 Data/Control Contract 仍存在。必须逐项审计这些能力是否仅为旧输入协议服务；对 Main 控制流仍有其他用途的通用概念不得仅因同名而删除。

迁移验收的核心不是“两个 Subsystem 能收到键盘事件”，而是：

1. 新游戏只引用业务 User Input Contract，业务输入行为不需要 LM 输入专属 API。
2. LM Bridge 与 Session Events 不出现任何 common-controls、device、pressed、interest 等协议硬编码。
3. Keyboard/Gamepad/Pointer 以及被保留的 User Input v1 行为完成已声明的范围覆盖。
4. 新游戏无需经过旧 InputGate，也不出现两条输入路径造成重复业务动作。
5. 断连、恢复和跨 Subsystem 输入状态不会卡死；广播失败不会改变 Main 既有 authority。
6. Desktop/PWA 使用同一业务协议，通过正式 qualification。

## 12. 测试和 Qualification 清单

### Framework 通用广播 Conformance

1. 既有双参数 owner-targeted 行为不变。
2. 显式 all-subsystems 能通过通用通道到其他 Runtime 的匹配订阅者；未订阅不保证收到。
3. Business payload 无法伪造 publisher 身份或覆写 host provenance。
4. detached、stale、old Session/generation/RenderNode 不会成功广播。
5. channel、name、JSON/payload、大小/深度违规同步拒绝，无部分投递。
6. Channel 权限、绑定关闭、订阅失败、慢订阅者、overflow、FIFO 和回调重入有确定边界。
7. 广播不绕过 Main Frame/Activation，也不通过 InputGate/InputTarget 改写业务收件人。
8. Desktop/PWA 物理 realization 均符合相同广播逻辑 Contract。

### common-controls 业务协议测试

1. 键盘/手柄等价输入映射到相同 action，设备来源可按需区分。
2. 两个物理键绑定同一动作，释放其中之一不提前结束动作。
3. auto-repeat、deadzone、微小轴抖动、并发手柄、长按频率都被有界处理。
4. blur、hidden、disconnect、component detach、source epoch replacement 不残留 stuck input。
5. 慢/迟加入订阅者从完整当前状态或中立状态正确收敛，绝不误信历史 pressed。
6. 丢 release/reset、Runtime reconnect、发布失败时，Consumer 超时恢复中立态。
7. Map、Battle/另一个 Runtime 可同时观察广播，但只有游戏策略允许的模块执行独占动作。
8. PWA/Hostra 实际浏览器输入 E2E 和 Pointer 范围闭合。
9. 迁移模式下无旧 LM Input 路径重复触发；WC-only 游戏无需 LM input interest。

## 13. 实施顺序

1. **先关闭架构决策**：正式冻结 LM 通用 Broadcast Capability 的边界、Context 版本、Channel 授权、Publisher identity、跨平台桥接、会话/过期语义。
2. **建立独立通用资格测试**：不出现 controls 专用业务数据，也能够从任意被授权的业务 WC 向精确 Channel 发布。
3. **创建业务包**：定义独立 Controls Protocol v1、WC 生命周期、Keyboard/Gamepad 的完整状态/Event/Reset 行为。
4. **接入 Consumer**：使用 SessionEventClient 订阅，业务自行判断焦点、优先级及实际可执行范围。
5. **实现恢复验证**：epoch/revision、完整状态再同步、consumer TTL、blur/disconnect/断线。
6. **完成跨平台垂直切片**：至少两个真实 Subsystem，Desktop/PWA 及 Browser E2E。
7. **进行旧协议迁移与清理**：补齐 Pointer 和全部被声明保留的能力，通过 ADR/Conformance 后再移除旧 Framework User Input。

## 14. 待冻结事项

必须在实施之前明确：

- Context 广播 API 采用 Web Presentation v2、可选 extension，还是其他明确版本化契约？
- Broadcast Channel 由 Context options 传入、RenderNode 配置绑定，还是通用 Capability 预先授权？allow-list/额度如何表达？
- Renderer WC 的认证 publisher 身份选择“RenderNode 真实 owner”还是新版 presentation-origin 身份？如何保持 Session Events 来源契约真实？
- “all-subsystems”是否严格定义为订阅该 exact Channel 的 Subsystem（推荐），还是需要一种另立契约的无订阅强制投递？
- Controls 业务 schema、动作命名、epoch/revision、state refresh/TTL、reset、设备映射、数值范围的正式版本。
- game-common-controls 的 Window 唯一实例和 RenderNode 宿主 Subsystem 所有权。
- Pointer/IME/文本输入等功能边界，以及旧 User Input v1 的功能迁移矩阵。
- 游戏层 input focus/priority/消费仲裁机制是否由包附带 coordinator，还是由游戏独立实现。
- 旧 LM User Input 退出的兼容窗口、废止/删除顺序及 Qualification 证据。

## 15. 设计结论

**最终目标是“LM 通用事件承载 + 业务 WC 完整输入协议”，而不是“LM User Input v1 + 额外广播适配器”。**

LM 负责保真地承载/鉴权/路由 Web Presentation 事件，不关心它们是不是游戏输入；game-common-controls 才拥有完整用户输入领域逻辑和协议；Subsystem 消费方只依赖该业务协议及 LM 已有的通用 Session Events 能力。待新链路功能和跨平台 Qualification 完成后，旧 LM 内建 User Input 专属设施才进入有治理的退役阶段。

本文仍为 Proposed；任何尚未更新的 frozen Contract、尚未实现的 Bridge、尚未执行的 Qualification 都不得被写作已完成事实。
