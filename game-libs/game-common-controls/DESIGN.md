# Game Common Controls 设计方案

> 状态：Proposed / 设计文档，尚未实现  
> 位置：`game-libs/game-common-controls/`  
> 目标组件：`<game-common-controls>`  
> 相关契约：[Web Presentation API v1](../../doc/15-contracts/web-presentation-api-v1.md)、[User Input v1](../../doc/15-contracts/user-input-v1.md)、[Session Events v1](../../doc/15-contracts/session-events-v1.md)、[ADR 0031](../../doc/decisions/0031-business-owned-web-component-projection.md)

## 1. 目标

提供一个独立、可复用的业务 Web Component，将键盘和标准手柄输入转换为平台无关的游戏控制事件，并通过 Web Presentation Context 的 `context.emitCustomEvent()` 将事件广播到其他 Subsystem。

核心原则：

- 输入设备采集和映射由 `<game-common-controls>` 负责。
- 组件输出游戏语义，不要求消费者理解 DOM KeyboardEvent 或 Gamepad API。
- 跨 Subsystem 传播复用 LoomRealm 现有事件基础设施，不另建一套通用事件总线。
- 广播是事件分发能力，不授予接收方 Frame、Activation、InputTarget 或 Shared State 写入权限。
- 现有 Web Presentation API 的 owner-targeted custom event 行为必须保持兼容；广播应是显式选择。

## 2. 包与组件边界

建议目录结构：

```text
game-libs/game-common-controls/
├── DESIGN.md
├── README.md
├── package.json
└── src/
    └── game-common-controls.ts
```

建议包名为 `@loomrealm-game/common-controls`，自定义元素名为 `game-common-controls`。

该库以独立 Web Component 为主要交付物，不依赖具体游戏 Subsystem，也不依赖 Desktop、PWA 或某一种 Runtime hosting 实现。

### 组件职责

1. 采集键盘按键和标准 Gamepad 输入。
2. 将设备输入映射为稳定的控制语义。
3. 在本地对高频状态变化进行去抖、合并或节流，避免无意义的事件风暴。
4. 使用注入的 `WebPresentationContext` 发布控制事件。
5. 在组件断开、Window 失焦或输入设备不可用时释放监听器，并按契约发送必要的释放/重置语义。

组件不负责：

- 创建、切换或关闭 Frame。
- 判定哪个 Subsystem 拥有 InputTarget。
- 写入 Shared State。
- 保存或重放历史输入。
- 管理游戏存档、键位设置 UI 或厂商专有手柄 API。
- 自行建立 IPC、MessagePort、Worker 或 SessionEventHub 连接。

## 3. 组件使用模型

组件作为业务拥有的 Custom Element，由现有 Web Projector 插入 DOM 并注入 Context。组件不应自行创建第二个 Renderer 或绕开 Web Projector。

示意：

```html
<game-common-controls></game-common-controls>
```

初版建议一个 Renderer Window 只存在一个启用的全局 controls 实例，避免重复采集同一物理输入并重复广播。重复实例的行为必须确定：开发环境给出诊断，不能静默地产生重复事件。

该组件可以不渲染可见 UI；它是输入适配组件，而不是输入配置面板。

## 4. 输入到语义事件

组件把物理输入转换成语义事件。例如：

| 物理输入 | 语义动作 |
|---|---|
| Enter、手柄 South | `confirm` |
| Escape、手柄 East | `cancel` |
| 方向键、WASD、手柄左摇杆 | `move` |
| 手柄 Start、配置的菜单键 | `menu` |

语义名称必须稳定、可扩展，并且不依赖具体设备。键位绑定与动作名称应可配置；默认映射不得成为 Runtime 协议的一部分。

建议的事件形状：

```ts
interface GameControlEvent {
  readonly action: string;
  readonly phase: "pressed" | "released" | "changed" | "reset";
  readonly device: "keyboard" | "gamepad";
  readonly control: string;
  readonly value?: number;
}
```

以上是业务 payload 的设计示例，不是已冻结的公共 TypeScript ABI。实际发布时仍须遵循 Web Presentation API 对 JSON payload 的校验、深度、大小和所有权隔离要求。

### 状态与事件的区别

- 按下、释放等离散动作适合转换为瞬时事件。
- 摇杆、方向轴等高频输入应只在值发生有意义变化时发布，并在组件端合并高频更新。
- 接收方不能假设所有瞬时事件都可重放，也不能仅依靠一条旧的 `pressed` 事件永久保持按下状态。
- Window 失焦、页面隐藏、组件断开、手柄断开时，应清理本地 pressed 集合，并按最终确定的契约发送释放或 reset 语义。
- 不得将每帧的完整摇杆值无节制地广播给所有 Subsystem。

## 5. `context.emitCustomEvent()` 的广播扩展

### 5.1 当前契约的限制

当前 [Web Presentation API v1 §8](../../doc/15-contracts/web-presentation-api-v1.md) 将 `emitCustomEvent(name, data)` 定义为反向投递能力，并且只向所属 Subsystem 投递；其路径受当前 RenderNode、Data 和 InputGate 等条件约束。

因此，当前实现不能仅靠在 Web Component 中调用 `emitCustomEvent()` 就获得跨 Subsystem 广播能力。也不能把“投递到所属 Subsystem”误认为“广播到整个 Session”。

### 5.2 建议的兼容 API 形状

保留既有两参数调用的语义，并增加显式 audience 选项：

```ts
type CustomEventAudience = "owner" | "all-subsystems";

interface CustomEventOptions {
  readonly audience?: CustomEventAudience;
}

interface WebPresentationContext {
  readonly resources: PresentationResourceClient;

  emitCustomEvent(
    name: string,
    data?: InputEventV1["payload"],
    options?: CustomEventOptions,
  ): void;
}
```

示意调用：

```ts
context.emitCustomEvent(
  "game.controls.action",
  {
    action: "confirm",
    phase: "pressed",
    device: "keyboard",
    control: "Enter",
  },
  { audience: "all-subsystems" },
);
```

规则：

- 未传 `options` 时默认 `audience: "owner"`，保持现有行为。
- `audience: "all-subsystems"` 是显式的跨 Subsystem 事件分发请求。
- 组件不得在 payload 中自行伪造 Session、Subsystem、generation、Frame、Activation、InputTarget 或来源身份；这些信息如需用于路由，只能由 LoomRealm trusted host 根据当前 Context 注入。
- 保留当前 Context 的 currentness 检查：已脱离、过期或结构失效的组件不得继续广播。
- 参数格式错误应遵循正式 API 的同步校验约定；广播投递本身仍是 fire-and-forget，不增加业务 ACK、历史回放或自动重试。

这是建议的 API 扩展，当前仓库尚未实现。由于 Web Presentation API v1 已冻结并完成 qualification，实施前必须更新正式契约与 conformance fixtures；不能只修改 TypeScript 接口而不更新语义规范。

## 6. 广播路由与 Session Events 的关系

广播应复用现有 Session 事件分发基础设施，而不是新建一套平行的 EventBus。建议由 LoomRealm trusted host 提供受限的 Presentation-to-Session-Events bridge：

```text
<game-common-controls>
    │ context.emitCustomEvent(..., audience: "all-subsystems")
    ▼
Web Projector / trusted host bridge
    │ 验证 Context currentness、payload、来源身份
    ▼
Session Events routing
    │ 通过约定的 controls channel 分发
    ▼
订阅该 channel 的 Subsystem Runtime
```

建议使用一个保留的精确 channel，例如：

```text
x.loomrealm.game-common-controls
```

事件名称映射到 Session Event 的 `type`，业务数据映射到 `payload`，来源身份由可信绑定产生。Renderer 不应获得任意的 SessionEventClient，也不应因此获得任意 channel 的发布权限；bridge 只允许发布 controls 专用 channel。

需要准确区分两件事：

- Session Events v1 的正常语义是向匹配 channel 的订阅者分发，不是无条件向每个 Runtime 注入事件。
- 因此，按本方案消费广播的 Subsystem 应订阅约定的 controls channel。若产品要求每个 live Subsystem 进程即使没有订阅也必须收到并执行回调，那是不同于现有 Session Events 语义的额外 Runtime contract，不应在本库里暗中实现。

广播是 transient、无历史回放的通知。不得假设所有 Subsystem 都在线、都订阅了该 channel，或都成功处理了某个事件。广播本身不构成业务事实；必须长期成立的事实仍应由相应 authority 持有。

## 7. 与 User Input v1 的边界

`<game-common-controls>` 的物理采集不应悄悄复制成第二份 User Input authority。

- 对于仍需由当前 InputTarget 独占处理的原始输入，应继续使用现有 User Input v1 路径。
- controls 广播表达的是“发生了一个可供多个 Subsystem 观察的控制语义事件”，不是向所有 Subsystem 授予普通输入权限。
- 广播接收方必须自行确认其业务上下文是否适用；接收到 `confirm` 或 `move` 不代表当前 Frame 自动成为 active，也不代表接收方可以越过 Main 的 Frame/Activation authority。
- 如果某些动作必须严格受当前 InputTarget 限制，应继续走 owner-targeted Input 路径，而不是使用广播模式。
- 不应同时把同一物理事件通过原始 Input 和 controls 广播重复交付给同一业务处理器。

这意味着 controls 组件主要负责跨 Subsystem 可观察的通用控制事件。对于连续移动状态或需要严格输入租约的玩法，后续必须根据实际需求决定是否使用原始 User Input、广播事件，或两者分工；不能把瞬时广播事件当作可恢复的状态流。

## 8. 生命周期与故障语义

- Context 是 Window presentation lifetime 的 capability；组件断开后停止采集并清理全部监听器。
- 旧 RenderNode、旧 Session 或过期 Context 发起的事件必须被丢弃。
- 失焦、页面隐藏、手柄断开时清除本地按下状态，避免 stuck key/stuck button。
- 键盘自动重复不得重复生成离散 `pressed` 事件；若需要长按重复，应作为明确的业务配置。
- 轴事件在发布前应进行 deadzone、阈值过滤和节流；数值必须有限且在定义的范围内。
- 广播失败不得自动重试，因为事件可能已经被接受；也不得把普通的单次投递失败自动升级为 Session fatal，除非正式契约明确规定。
- 接收方处理失败不应反向修改发送方状态，也不能阻塞其他订阅者。
- 不保存事件历史，不对重连前的事件补发。需要当前状态的消费者必须通过明确的状态机制重新收敛。

## 9. 安全、性能与验证

实施前应补充以下测试：

1. 默认 audience 仍只投递给所属 Subsystem，既有调用保持兼容。
2. `all-subsystems` 能通过正式的 trusted-host 路由到其他 Subsystem 进程中的匹配订阅者。
3. 业务 payload 不能伪造来源 Subsystem 或覆盖宿主注入的路由身份。
4. detached / stale Context 不会发出广播。
5. 无效 name、非 JSON payload、超限 payload 同步拒绝，且不产生部分广播。
6. 单个订阅者关闭或失败不会错误地改变其他订阅者的接收语义。
7. 按住多个绑定到同一动作的物理键时，释放其中一个不会误判整个动作已经释放。
8. Window blur、visibility change、Gamepad disconnect、WC disconnect 后不会留下 stuck input。
9. 高频轴输入经过合并和节流，不会无界积压。
10. 广播不会绕过 Main 的 Frame/Activation authority，也不会隐式改变 InputTarget。

## 10. 实施顺序

1. 冻结 controls 事件的 payload、动作名称和状态/事件语义。
2. 决定 Web Presentation API 的 audience 扩展版本，并更新正式契约及 conformance fixtures。
3. 在 trusted host 侧实现受限的 broadcast bridge，明确它与 Session Events 的边界。
4. 实现 `<game-common-controls>` 的键盘、标准手柄采集、映射、清理与节流。
5. 在至少两个不同 Subsystem Runtime 中验证跨进程分发。
6. 验证失焦、断连、旧 Context、订阅终止和高频轴输入等故障场景。

## 11. 当前未冻结事项

以下内容应在编码前确定：

- 广播 API 扩展属于 Web Presentation API v2，还是采用单独、版本化的扩展契约。
- “所有 Subsystem”是指所有订阅 controls channel 的 Subsystem，还是必须无条件向每个 live Runtime 投递。
- controls channel 的正式名称与事件 payload schema。
- 移动轴使用瞬时 `changed` 事件的阈值、节流和消费者状态恢复规则。
- controls 组件的全局单实例约束及重复实例错误处理。
- controls 广播和原始 User Input 同时存在时的明确分工。

在这些事项冻结之前，本文件是设计提案，不代表现有仓库已经实现了广播能力。
