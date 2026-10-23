# Frame-targeted Web Presentation Events：设计与本地 Agent 完整落地计划

> 状态：Proposed / Implementation Plan；**本文提交不代表功能已实现或测试已通过**
> 日期：2026-10-23
> 范围：`broadcast: "top-frame"`、可信 Frame/Activation 绑定、Frame-scoped Channel 订阅与 Desktop/PWA 对等实现
> 当前基线：Web Presentation API v2、Renderer Control v2、Renderer Data Profile v2、Session Events v1
> 历史基线：PR #102 之前提交 `d8578e0855a35407dc42d3980bbdf7e22afdde25` 的 User Input v1
> 目标：本地 Agent 按本文完成编码、测试、资格验证、文档升级与最终证据记录，不停留在架构分析

## 0. 执行约束与入口

**只完成这份文档不等于交付功能。** 本地 Agent 接到实施任务后，应从仓库最新工作树起步，逐阶段修改实现并执行测试，最终给出更改文件、协议版本、测试命令及实际结果。不得将尚未运行的测试写为 PASS；如有环境限制，应明确报告。

开始先读取：

- `doc/15-contracts/web-presentation-api-v2.md`、`doc/15-contracts/main-renderer-control-v2.md`、`doc/15-contracts/session-events-v1.md`、`doc/15-contracts/session-events-runtime-profile-v1.md`。
- `doc/15-contracts/renderer-data-profile-v2.md`、`doc/10-architecture/web-presentation-custom-event-routing.md`。
- `game-libs/game-common-controls/game-controls-input.md`（新组件的设计草案，不能当作已有实现）。
- 历史 `git show d8578e0:packages/main/src/internal/main-session.ts`、`:packages/renderer/src/internal/input-gate.ts`、`:packages/subsystem/src/internal/input-manager.ts`、`:packages/subsystem/src/internal/frame-runtime.ts` 与 `:doc/15-contracts/user-input-v1.md`；历史测试 `packages/renderer/test/input-gate.test.mjs`、`packages/subsystem/test/input-manager.test.mjs`（需用 `git show` 从历史查看）。

实施原则：

1. **Main 仍是唯一 Frame 栈/Activation Authority**；Renderer、Platform、Hub 仅使用经过绑定或验证的派生事实，不创建第二套 Frame 栈。
2. **不恢复** InputTarget、InputGate、Input Interest、RendererInputSource、Data `input.*`、`createInputListener` 或旧设备 Framework 协议。
3. `false`、省略 `broadcast`、`true` 的既有行为必须保持。`"top-frame"` 是新增且显式 opt-in 的投递模式。
4. Channel 仍为原始 exact Channel；不能把所有帧事件广播成一个固定公共 Channel 并要求消费者根据 `payload.data.channel` 过滤。
5. 已冻结 v1/v2 协议必须通过**新版本及适配层**演进；不得静默扩充旧 closed schema。
6. **不能把“只投递给栈顶 Subsystem”当成“只有栈顶 Frame 响应”。** 完成标准包含同 Subsystem 多 Frame 隔离。
7. 内部绑定的目标 Frame 不能由 Web Component 或普通 Subsystem 自行提供/覆盖；业务只决定 `name`、`data`、`options`。

## 1. 功能定义、边界及非目标

新增 Web Presentation 调用：

```ts
interface CustomEventOptions {
  readonly broadcast?: boolean | "top-frame";
  readonly channel?: string;
}

context.emitCustomEvent(
  "input.event",
  { action: "down", button: "south", repeat: false },
  { broadcast: "top-frame", channel: "controls.event" },
);
```

三种模式：

| 模式 | Hub 逻辑路由 | 接收 API | Frame 限制 |
| --- | --- | --- | --- |
| 省略 / `false` | 只到 RenderNode owner Subsystem | 既有 `scope.events.subscribe` | 无 |
| `true` | Session 内所有 exact Channel 订阅者 | 既有 `scope.events.subscribe` | 无 |
| `"top-frame"` | 只到当前 Top Active Frame 所属 Subsystem，并匹配 exact Channel | **新 Frame-scoped 订阅** | FrameId + ActivationId + 本地执行资格 |

约束：

- 发送 WC 可以由 World 的 RenderDomain 拥有，而目标可以是 Battle 的栈顶 Frame。**source owner 不等于 target Frame owner**；`SessionEvent.source.subsystemKey` 始终由发送 WC 的所属 Subsystem 派生。
- 栈为空、栈顶非 `active`、没有 `activationId`、Renderer/Platform 对 Frame 身份认识不一致时均 fail-closed/drop，**不可改投下一帧或降级为 `true`**。
- 此能力属于通用 Frame-targeted Presentation Event，不感知 Keyboard、Gamepad、ControlsButton 或具体 action。
- Frame-targeted Event 非持久、不可重放；UI DOM currentness 与 Session/owner/generation 检查仍然先于正式业务发布。
- 与现有普通 Session Events 消费者隔离：即使对 `controls.event` 有 `scope.events.subscribe`，也**不能**因 `"top-frame"` 而收到该事件。相反，新 Frame-scoped 订阅也不能收到不带 Frame Target 的普通 Session 广播，除非未来另有明确模式。
- **不实现**整个 `<game-controls-input>`（它目前仍是设计草案）；本任务只落地通用路由及验证用的模拟源/消费端，并更新草案的使用方式。不要意外修改已有三个设备组件 `broadcast: true` 的既有默认行为。
- 不改变 `RenderDomain.emit`（Subsystem → Renderer 的 `render.event`）正向路径；本任务针对 `WebPresentationContext.emitCustomEvent` 的 Renderer → Runtime 反向路径。

## 2. 历史方案中必须保留的语义

历史 Main 的 `currentInputTarget()` 只从栈顶 `this.stack.at(-1)` 取得 `{subsystemKey,frameId,activationId}`，且只在栈顶 `active`、`currentActivationId` 非空时有效。旧 Renderer InputGate 的 `currentLease()` 比较 `inputTarget` 和 Active Frame；发布 `input.event/state` 时带上 `frameId`、`activationId`。旧 Subsystem `InputManager.onEvent()` 又检查 `inspectById(frameId)`、`deliveryOpen`、Activation 一致性、Frame Interest，并只执行该 Frame 的 listeners。

由此得到三个必须恢复、但与旧 `input.*` 无关的不变量：

1. **Ingress 绑定**：事件产生时固定 `(sessionId, subsystemKey, frameId, activationId)`，不得在延迟到达时重新寻址到新的 top Frame。
2. **双端栅栏**：Renderer 依据 Main 镜像栈绑定；Platform 依据 Main 当前权威状态再次验证；接收 Runtime 在真正调用回调之前再次验证本地 Frame/Activation 与 `deliveryOpen`。
3. **隔离**：Frame A、Frame B 即使同属一个 Subsystem，也只能分别处理绑定给自己的事件。旧 Frame 撤销 Activation 后，其未执行 Event 直接丢弃。

不要照搬旧 Interest Registry、`input.reset` 或旧 Data 连接：Session Events 已经有 exact Channel 订阅；Frame 目标和消费资格是本任务的新增正交维度。

## 3. 冻结的目标语义

### 3.1 可信路由身份

建议独立内部类型（名字可以按包惯例调整，但字段及条件不能变）：

```ts
type TopFrameLease = Readonly<{
  sessionId: string;
  subsystemKey: string; // receiver, NOT source
  frameId: string;
  activationId: string;
}>;

type PresentationBroadcast = false | true | "top-frame";

type PresentationEventPublicationV2 = Readonly<{
  sessionId: string;
  ownerSubsystemKey: string; // trusted source identity
  generation: number;
  domainId: string;
  targetKey: string;
  channel: string;
  type: string;
  payload: { domainId: string; targetKey: string; data: JsonObject };
  broadcast: PresentationBroadcast;
  topFrame?: TopFrameLease; // required iff broadcast === "top-frame"
}>;
```

`topFrame` 仅由 Renderer Control 快照生成，且在 Host 入口重新验证；`payload` 的原有 `{domainId,targetKey,data}` 不变。不让业务在 `data` 内指定 `frameId/activationId/source/owner`；这些字段即使作为普通 data 存在，也不得被解释为投递凭据。

当 `broadcast !== "top-frame"` 时必须**不存在** `topFrame` 字段；当 `broadcast === "top-frame"` 时字段必须齐全、经过严格格式校验。不得使用 truthiness 把字符串解释成普通 `true`。

### 3.2 事件生命周期的精确时点

```text
T0: WC emitCustomEvent(...)
    Renderer 先查验 live RenderNode、Session、owner、generation、carrier、target；
    验证 options/name/data；仅在 "top-frame" 模式下从当前 Control snapshot
    的 stack.at(-1) 派生且固定 TopFrameLease；若没有 Active top -> drop。
T1: Renderer 的有界队列与 Desktop WebSocket / PWA MessagePort 传输，
    不得覆盖/重算 T0 绑定的 topFrame。
T2: Host 再次验证来源当前性、Session 及 topFrame 与 Main 的当前权威事实严格相等。
    不一致 -> drop；不 retarget；无异步验证-发布空档。
T3: Hub 对 exact channel ∩ target subsystem ∩ target frame-scoped subscriptions
    做路由准入，传送可信 targetFrameId + activationId。
T4: Subsystem 开始业务 listener 之前检查本地 Frame 当前仍 active、
    activationId 相同、deliveryOpen，且订阅仍属于该 Frame；不成立 -> drop。
```

同一事件的目标 F/A **只能确定一次**。若 Renderer 观察到滞后的快照，Host 可丢弃本来合法的事件（瞬时 Event best-effort），但绝不把其转发给新 Frame。不要在 Host 只读取“收到事件时的当前 top”然后重新定向。

Host 检查与 Hub admission 之间不允许引入 `await`、消息队列转交或依赖可能发生变化的宽松缓存；使用同一平台 JS 事件循环中的同步校验/路由准入，或者等效的原子串行化。若 Main 的权威 Frame 变化与 Host 接收处于不同并发单元，必须提供明确串行化/代次 fencing，不得只声称比较一次即可保证无竞态。

### 3.3 Main Authority 的 Host 可验证镜像

Renderer 已有 Control v2 `snapshot.stack`，所以**不恢复** `snapshot.inputTarget`。Renderer 只从当前 `stack.at(-1)` 且 `lifecycle === "active"`、存在 `activationId` 的条目派生 lease。

但 Desktop/PWA Host 当前无法直接访问 Renderer 镜像，且不能信任它作为 Host 二次校验的唯一权威。需要通过 `MainPlatform` 的**窄、内部、只读派生 authority sink**，或者等价的 Main 当前状态验证方法，将 `{sessionId,topFrame|null}` 交给 Host。推荐：

```ts
interface TopFrameRouteSnapshot {
  readonly sessionId: string;
  readonly topFrame: null | {
    readonly subsystemKey: string;
    readonly frameId: string;
    readonly activationId: string;
  };
}

interface MainTopFrameRouteSink {
  replace(view: TopFrameRouteSnapshot | null): void;
}
```

此 sink 只镜像 `MainSession` 的事实，**不是新的 authority**。Main 初始、Frame activate/call/return/resume/suspend/close、失败展开、Session 终止以及 Renderer replacement 时必须正确发布/清除。尤其注意 `onFrameCall` 开始撤销调用者 Activation 的时刻；不能仅在异步 `mutate` 尾部最终刷新，导致过渡期仍能使用过期 Host 镜像。为状态变化写一条统一同步更新路径，保证 Main 栈/Activation 的变更和 Host 路由镜像不会跨越可观察的异步间隙。

Host 对应验证：

```ts
function isCurrentTopFrame(
  event: PresentationEventPublicationV2,
  authority: TopFrameRouteSnapshot | null,
): boolean {
  const bound = event.topFrame;
  const top = authority?.topFrame;
  return event.broadcast === "top-frame" &&
    bound !== undefined &&
    top !== null && top !== undefined &&
    authority?.sessionId === event.sessionId &&
    bound.sessionId === event.sessionId &&
    bound.subsystemKey === top.subsystemKey &&
    bound.frameId === top.frameId &&
    bound.activationId === top.activationId;
}
```

此外继续校验当前 Renderer/Session/owner/generation 与 live Source currentness。不可只比较 F/A 而忽略 Session 或 owner generation。Session/generation 轮换一律 fail-closed。

### 3.4 Frame-scoped 订阅必须是一等能力

**现有 `scope.events.subscribe` 是 Runtime-scoped；不可把 `"top-frame"` Event 直接送到它。** 否则即使 Hub 仅限定 Subsystem，同 Subsystem 内父子 Frame 的旧监听器仍可执行。

建议新建**独立** author-facing capability，避免修改冻结的普通 `SessionEventClient`：

```ts
interface FrameEventClient {
  subscribe(
    frame: Frame,
    channels: readonly string[],
    listener: (event: SessionEvent) => void | Promise<void>,
  ): Promise<SessionEventSubscription>;
}

interface SubsystemScope {
  // existing capabilities...
  readonly frameEvents: FrameEventClient;
}
```

这是目标接口草案；实现必须给它独立的版本化 public contract。Frame 对象通过 `FrameRuntime` 原有 `WeakMap<Frame,FrameContext>` 验证 ownership；业务不得传字符串冒充其他 Frame。订阅应关联 `frameId`、当前 Runtime 与 exact Channels；同一 Frame 的新 Activation 可保留所需 Channel 配置，但**旧 Event 不可跨 Activation 执行**。Frame close/Runtime terminal 自动 close 对应订阅；手工 `close()` 幂等。

恢复旧 FrameRuntime 的内部只读 inspect 能力，至少返回：

```ts
type FrameDeliveryFacts =
  | { kind: "closed" }
  | {
      kind: "live";
      frameId: string;
      activationId: string | null;
      deliveryOpen: boolean; // context.state === "active"
    };
```

在最终监听器执行**当下**检查 `frameId`、`activationId`、`deliveryOpen`、subscription currentness。`calling`、`awaiting-resume`、`suspending`、`admin-suspended`、`resuming`、`returning`、`closing` 均不得打开 delivery gate。入队时有效不代表执行时仍有效；异步 listener 已经开始之后发生的 suspension 不会神奇回滚副作用，业务异步续体仍应检查自己的取消/Activation token；文档不可承诺强制抢占已运行 handler。

`scope.frameEvents` 的普通业务可见 event 可以保持 `{channel,type,payload,source}`；目标 F/A 只用于可信 routing metadata，不必暴露给业务 callback。普通 `scope.events` 语义与队列上限不变。

### 3.5 Hub 的 Channel ∩ Frame 选择，而非客户端过滤

对 `"top-frame"` 的 Hub 逻辑 eligibility：

```text
subscription.channels contains event.channel
AND subscription.owner.subsystemKey === topFrame.subsystemKey
AND subscription.kind === "frame-scoped"
AND subscription.frameId === topFrame.frameId
```

普通发布只匹配普通 Runtime-scoped subscription；两类订阅隔离，且每次 publish 只选择一类。Host 指定 frameTarget 的入口只能由受信 Platform 使用；普通 `SessionEventClient.publish` 不得伪造。保留 `source.subsystemKey = ownerSubsystemKey`（来自受信 RenderNode），不是接收 Frame 的 Subsystem。

当前 `SessionEventHub.createDelegatedPublisher` 只有可选 `targetSubsystemKey`，不具备 Frame targeting；不能把 `publisher.publish(channel,type,payload,top.subsystemKey)` 当作最终实现。应新增受信 `publishToFrame`/`routeToFrame` 或等效 API，并使 Hub 从自己的 exact Channel 索引直接筛选 Frame-scoped subscription。不得先把事件广播到所有 Runtime 后交给业务 code 判定。

### 3.6 Session Events transport 的版本要求

当前 `packages/session-events/src/carrier.ts` 使用冻结 `loomrealm.session-events/1`：`subscribe` 请求只含 `channels`，`event` schema 仅有 `channel/type/payload/source`。单独增加 Host 端 `targetFrameId` 而不升级 wire，会因为 closed schema 或缺少订阅类型无法完成功能。

因此实施必须：

1. 设计、实现、记录新的 **Session Events frame-routing transport/profile v2**（可与 v1 implementation 共存）；增加可信 Frame-scoped subscribe request 与 targeted delivery envelope，严格封闭字段和上下行校验。
2. 旧 v1 `publish`、`subscribe`、事件 payload、source binding、limits、terminal、ordering 仍按冻结规范运行；v1 接收方不得误把 v2 消息解析成 v1。生产 Hostra/PWA 的 Host/Runner 使用明确的新 profile/version；不要隐式混用。
3. `FrameEventClient.subscribe(frame, ...)` 在 Subsystem Runtime 侧通过受信 frame binding 建立对 Host 的 frame-scoped subscription；客户端自己的 `FrameRuntime` 再执行最后一道资格校验。
4. Hub 的目标 Frame 元数据必须端到端受信、per-event 固定，不能让普通 Runtime publish 通过伪造 data 或 source 注入。对远端的 frame-scoped subscribe `frameId` 同时验证其所绑定的 Runtime 身份；如需要 Host 校验 Frame ownership，消费 Main 的派生只读 Frame authority，不建立新权威。
5. 针对 frame-scoped Event 明确定义 **stale frame drop**（入队后取消/Activation 变化时允许在进入业务回调前丢弃），不得误套普通 Session Events v1“健康订阅入队后必须回调”的承诺；这是独立 v2 eligibility 语义。排序与 bounded queue、overflow terminal、订阅建立/关闭 race 必须有对应测试。

**实现选择已确定：采用 explicit v2 frame-scoped subscription/transport；不要使用固定秘密 Channel + payload.channel 伪路由，也不要把所有顶帧事件偷送给普通 Runtime listener 再期望消费者自行过滤。**

### 3.7 Presentation Event wire 版本要求

`packages/renderer/src/presentation-event.ts` 的 `PresentationEventPublishRequestV1` 目前 `formatVersion: 1`，`broadcast: boolean`，closed event schema。

新增 `"top-frame"` + `topFrame` 时，须定义新 `PresentationEventPublishRequestV2`（及 result v2 或显式版本配对）。保留 v1 编解码验证既有 boolean/default 行为；v2 强制 `broadcast` 与 `topFrame` 的形状关联。Desktop WebSocket / PWA MessagePort 都要更新，不能只改 public TypeScript type 而不改 codec。统一限定大小、UTF-8、JSON 深度和 FIFO；畸形消息 fail-closed。将版本/compatibility 正式写入新的 Web Presentation API v3 contract；保持既有 frozen v2 不变。

### 3.8 State、事件顺序与新 Frame

`controls.state` / `controls.event` 的业务载荷仍与 `game-controls-input.md` 一致。Frame-targeted transport **不**存储手柄物理当前状态，不实现通用 State cache，不创建新版 `input.reset`。

- 同一有效发送 binding 依旧保证 State 先于对应 edge Event 交给按序发布通道；同一个 Frame-scoped 订阅含两个 Channel 时维持顺序。
- Frame 变化后，旧 Activation 的 State cache 必须在 Frame consumer/其 fresh tracker 中清空；不可把旧 Frame 的 `down` 当作新 Frame 的按键状态。
- 未来 `game-controls-input` 新实现仍可按其草案每 1000ms 刷新非空 State，2500ms stale fallback；新 Frame 获取下一次 State 后收敛。**不能假称现有路由提供切换瞬间 State baseline**。
- Event future-only、不重放，不复制“旧 Frame 的确认”给新 Frame；没有订阅或尚未建立时允许丢失。跨不同发布者没有全局顺序。
- 普通 Session Event `broadcast:true` 原有业务顺序/语义不受本功能影响。

## 4. 文件级实施清单

| 层 | 必查/必改路径 | 工作 |
| --- | --- | --- |
| Presentation ABI | `packages/renderer/src/internal/web-projector.ts`、`packages/renderer/src/control.ts` | 扩展 option；解析/校验；从 Control v2 stack 派生 top Frame lease；stale fail-closed |
| Presentation wire | `packages/renderer/src/presentation-event.ts`、`packages/renderer/test/presentation-event.test.mjs` | V2 closed codec；wire/result 对等；v1 不变 |
| Main | `packages/main/src/internal/main-session.ts`、`packages/main/src/model.ts`、`packages/main/test/runtime.test.mjs` | Main-derived Host current Top Frame route 镜像；精确更新/清空时点 |
| Main Platform port | `packages/platform-ports/src/*` | 为 Main→Platform 增加窄只读路由 sink；不向业务暴露 |
| Hub | `packages/session-events/src/hub.ts`、`packages/session-events/src/model.ts`、`packages/session-events/test/hub.test.mjs` | trusted Frame-targeted publish + typed Frame-scoped subscription；exact Channel 且无 Runtime listener 泄露 |
| Carrier | `packages/session-events/src/carrier.ts`、`packages/session-events/src/client.ts`、对应测试 | v2 frame-scoped subscribe/delivery 及 v1 compatibility；Queue、rebind、terminal fencing |
| Subsystem | `packages/subsystem/src/model.ts`、`packages/subsystem/src/host/run-subsystem.ts`、`packages/subsystem/src/internal/frame-runtime.ts` | 新 `scope.frameEvents`；验证 Frame 对象/目标 F/A、deliveryOpen、关闭及恢复 |
| Desktop | `apps/desktop/src/product-composition.ts`、`apps/desktop/src/presentation-events-websocket.ts`、相关测试 | source/host authority 双验证；Frame-targeted Hub routing；event carrier v2 |
| PWA | `apps/pwa/src/pwa-platform.ts`、`apps/pwa/src/runner-session-events.ts`、`apps/pwa/src/runtime-hosting.ts`、相关测试 | 与 Desktop 同语义；PWA Worker/MessagePort 版本对齐及退出/重连 fencing |
| Hostra | `packages/game-launcher-hostra/src/runtime-hosting.ts`、Runner Session Events 接线 | frame-scoped 订阅可穿过 Hostra 传输；Host 与 Runner v2 一致 |
| 业务草案 | `game-libs/game-common-controls/game-controls-input.md` | 将未来 `game-controls-input` 的推荐发送改为 `broadcast:"top-frame"`、订阅改为 Frame-scoped；注明实现前提和 State 冷启动 |
| 文档 | `doc/15-contracts/`、`doc/30-implementation/`、相关导航 | 新 Web Presentation v3、Session Events frame routing v2 与 Qualification；冻结旧文档不回写 |
| 回归 | `packages/renderer/test/*`、`packages/session-events/test/*`、`packages/subsystem/test/*`、`apps/{desktop,pwa}/test/*` | 单元、平台对等、真实传输及 Frame 竞争回归 |

`packages/platform-ports/src/*` 与各 Runner 接线具体文件应以工作树实际 import/re-export 关系确定；不要凭本表猜测不存在的路径。仅新增本任务必要的 API；不要顺手重构完整 Session Events v1。

## 5. 分阶段执行顺序（每阶段必须可验证）

### P0：固定契约和可执行证据

- 先写独立的新协议/ABI 文档，定义 `Presentation broadcast` 三模式、TopFrameLease、wire v2、Hub frame-target eligibility、callback gate、错误/丢弃与兼容性。
- 将旧 Input v1 历史测试的语义转成当前目标测试矩阵，不复制旧 `input.*` 的数据格式或设备协议。
- 补一条针对同 Subsystem 父/子 Frame 的 failing test，避免只验“目标 Subsystem”。

**完成标志：** 代码实现前即可准确列出所有 expected pass/fail；新协议为 closed schema，旧 v1/v2 不变。

### P1：Hub + Carrier + Subsystem Frame-scoped capability

- 优先落地受信 targeted routing、frame-scoped selector 和新运输版本；接收侧 `FrameRuntime` 在 listener 执行前二次校验。
- 旧 `scope.events` 订阅仍仅接收 `false/true` 对应的普通事件。
- 测试同 Subsystem 多 Frame、父 Frame suspended、Activation 更新、Frame close、subscription close、队列未开始执行时 stale drop、v1/2 兼容。

**完成标志：** 不依赖 Renderer 的 Host/Runner synthetic frame event 集成测试可以通过。

### P2：Renderer + Presentation wire v2

- 让 Renderer 对 `"top-frame"` 取栈顶 lease 并绑定到 accepted publication；保留原有 live RenderNode/currentness/provenance。
- 新 V2 codec，Desktop/PWA 的发布能力可处理三态，畸形 V1/V2 分别按其 schema 判定。
- 测试发送者 owner 与目标 top 不一致、无 active Frame、从 T0 到 T1 的队列过期、Session/generation 退役、FIFO。

**完成标志：** Renderer 不重新定向；发布对象里有可信目标而业务无法注入目标。

### P3：Main Authority + Desktop/PWA Host ingress

- 用 Main 当前栈导出只读派生路由镜像，在状态变化的同步边界更新；平台收到 V2 时 revalidate。
- 将 Desktop/PWA 重复的 top-frame 判定尽量抽成共享纯逻辑 helper，避免行为差异。
- 重点模拟：World A1 → Battle B1、World 恢复 A2、异步 transport 延迟、两个同 Subsystem Frames、window/session replacement。

**完成标志：** 旧事件不投给新 Frame；两个产品平台有等价证明。

### P4：业务用法、资格证据、回归

- 更新 `game-controls-input.md` 中两条发送和订阅示例，但**不默认为新 WC 已经实现**。
- 用真实 Web Component 或测试专用 synthetic WC + 两个真实 Subsystem Runtime / Frame stack 构建跨 Renderer→Host→Hub→Runner→Frame listener 的垂直测试。
- 同时回归原始 `broadcast:false/true`、Map、Dialogue、Schema Form、设备三个现有组件。
- 新建 qualification entry，并更新受影响的文档导航/索引、变化边界和证据。

**完成标志：** 从浏览器 Custom Event 到正确 Frame callback 的一次真实闭环可复现；文档与代码一致。

## 6. 必测矩阵（写成可执行断言，而非人工口头核对）

| ID | 场景 | 必须断言 |
| --- | --- | --- |
| F01 | 省略/`false`、原默认 Channel | 原 owner-only 行为不变 |
| F02 | `true` + 任意合法 exact Channel | 原 Session-wide 订阅路由不变 |
| F03 | `"top-frame"`，World top、World/Battle 均订阅 | 仅 World 的 frame-scoped listener 收到，普通 Runtime 订阅均收不到 |
| F04 | WC owner=World，top=Battle | Battle 接收；`source.subsystemKey` 仍为 World |
| F05 | Frame Stack 为空、top starting/suspended/closing | 事件丢弃，不降级广播 |
| F06 | Renderer 捕获 World A1，Host 时已切到 Battle B1 | drop；Battle 不接到旧 Event |
| F07 | World A1 → Battle → World A2 | A1 的 queued Event 不能打到 A2 |
| F08 | 同 Subsystem 内父子 Frame 有同 Channel listener | 只有指定 F/A 的 listener 可执行 |
| F09 | 入队后父 Frame 进入 calling/awaiting-resume，回调尚未启动 | local deliveryOpen=false → 不执行 |
| F10 | 同 Subsystem Frame close、subscription close、Runtime terminal | 无新回调，释放资源，延迟消息不复活 |
| F11 | State 后接对应 Event，同订阅多 Channel | State-before-Event；无跨 Activation State 继承 |
| F12 | 订阅尚未存在、Event 发布后订阅 | Event 不重放 |
| F13 | 非法 `broadcast`、伪造 `topFrame`、缺字段、V1/V2 schema 混用 | fail-closed；按 currentness-first 规则处理 stale source |
| F14 | PWA/Hostra carrier reconnect、Renderer Session 更换、Data generation 更换 | old source/target/queue 被 fencing；没有跨 Session 泄漏 |
| F15 | Frame-scoped 监听器抛错或 reject、其他监听器正常 | 错误隔离，协议连接/业务 sibling 不误终止 |
| F16 | 同一 Frame 的快速连续 `controls.state`/`controls.event` | exact Channel 路由、FIFO、bounded delivery；不改造业务 payload |
| F17 | v1 Session Events 与当前 map/dialogue/schema-form 回归 | 既有 channel/订阅/序列化/桥接契约不退化 |
| F18 | 完整 Desktop 与 PWA 各一条端到端覆盖 | 出现实际 browser source → 正确 top Frame 消费，而非仅 mocked Hub |

特别加入 **invalid input + stale RenderNode** 的边界测试：沿用 Web Presentation v2 currentness-first；已经失效的来源先静默丢弃，不能让失效 Context 通过新的 option 验证路径制造异常或发布。

## 7. 本地执行与证据

以 `package.json` 的实际脚本为准，新增资格入口建议名 `test:frame-targeted-presentation:qualification`，其 `:run` 先执行有针对性的 Hub/Carrier/Subsystem/Renderer、Desktop/PWA 纵向测试。下面列出当前已存在、可作为回归的入口（本计划文档提交时**未运行**）：

```bash
npm run build:game-common-controls-input
npm run test:session-events:qualification
npm run test:game-common-controls-input:qualification
npm run test:regression
npm run docs:check-links
npm run docs:build
```

另在修改后执行至少：

```bash
npm test -w @loomrealm/session-events
npm test -w @loomrealm/subsystem
npm test -w @loomrealm/renderer
npm test -w @loomrealm/main
```

先构建依赖再运行涉及 `dist` 的 Node tests；平台测试遵循既有 Desktop/PWA 构建入口。若某项测试依赖 Chromium、操作系统权限或符号链接而无法执行，必须逐条记录「环境限制 / 实际跳过数量 / 无法提供的证据」，不得把 skip 当成 PASS。

完成报告至少包含：修改文件清单、v2/v3 协议版本及兼容策略、所有实际运行的命令与结果、Desktop 与 PWA 验证、关闭/切换时序证据、剩余风险及下一步（若有）。将可复现的结果记录在新增 `doc/30-implementation/` qualification 文档，并把相关新契约加入 `doc/15-contracts/README.md` 及文档导航。

## 8. 明确禁止的实现捷径

- 只改 `WebPresentationContext` 的 TypeScript union，而不改 wire codec 和 Platform。
- `"top-frame"` 在 Platform 简单执行 `publisher.publish(channel,type,payload,top.subsystemKey)` 后宣称已实现 Frame 独占。
- 让 `scope.events.subscribe` 直接接收 frame-targeted Event，然后在业务 callback 内约定“自己判断”。
- 在 Host 收到事件时重新查 top，丢掉原始 `frameId/activationId`，导致旧输入投给新帧。
- 在公共 payload 内加 `data.frameId`/`data.channel` 让业务自筛，或使普通 Runtime 自行指定 Frame target。
- 修改冻结 v1/v2 closed schema 而不版本化；将普通 Session Events v1 无条件改成 Frame-scoped。
- 恢复 InputGate、InputTarget、Interest、`input.*` 或把平台键盘/手柄采集移回 Framework。
- 将 `game-controls-input.md` 草案当成当前代码已实现；或者为了本功能无差别迁移现有三个设备 WC 的广播模式。
- 只跑 mocked Hub unit test，不做 Hostra/PWA 与 Renderer 的端到端通路。

## 9. Definition of Done

只有同时满足以下清单，才允许本地 Agent 宣布功能完成：

- [ ] 新 `broadcast: "top-frame"` 可从 Web Component 安全调用；`false/true` 兼容。
- [ ] Renderer 在 T0 绑定 Main Control v2 栈顶有效 `FrameId+ActivationId`，无目标时安全丢弃。
- [ ] Host 在发布前按 Main 当前权威再次验证，不把旧输入改投新 Frame；Session/owner/generation 也通过。
- [ ] Hub 对 frame-scoped Channel + target Frame 做受信精确路由；普通 Runtime subscribers 不能接收 target-only 事件。
- [ ] Subsystem 自动以拥有的 `Frame` 建立/关闭 frame-scoped subscription，并在 listener 执行前二次检查 Active/Activation。
- [ ] 同 Subsystem 父子 Frame 以及跨 Subsystem World/Battle、Frame A1→A2 的竞态测试通过。
- [ ] Desktop/WebSocket、PWA/MessagePort、Hostra/Runner 版本与桥接对等。
- [ ] Presentation Event wire 及 Session Events Frame Routing 均显式版本化，冻结旧契约不破坏。
- [ ] `game-controls-input.md` 更新成新路由使用方式但不虚报统一操控 WC 的实现状态。
- [ ] F01–F18 转成自动测试，至少真实跑通一条 Desktop 和一条 PWA 端到端。
- [ ] 新 qualification + 回归 + docs check/build 有实际证据；未通过项明确记录，不隐藏失败。
- [ ] 无 InputGate/InputTarget/Input Interest/Data `input.*` 回流。

## 10. 交给本地 Agent 的实施指令

> 以本文为实施主线，先验证仓库现状和历史 `d8578e0` 的 Main/InputGate/InputManager 语义。完整实现 `broadcast: "top-frame"` 的 Renderer 可信绑定、Main Host 二次验证、Hub 精确 Frame 路由、版本化 Carrier、Subsystem Frame-scoped callback gate，覆盖 Desktop/PWA/Hostra。不得只做到 Subsystem 定向。保持 `false/true` 与现有 Session Events v1 不变；不恢复 Framework User Input。按 P0→P4 分阶段提交代码与测试，完成全部适用的资格验证和文档更新，用可复现的运行结果证明 Definition of Done。除真实阻断项外不要把关键架构问题留给后续实现者。
