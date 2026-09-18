# Viewport 架构接口与最小实现设计草案

> 状态：**DRAFT / 待评审 / 未冻结 / 未实施 / 未验收**  
> 日期：2026-09-18  
> 工作分支：`dev/resize-viewport`  
> 评审基线：`24355f9f71d99e0a93c3292da1eaa0a4fdd9b42d`，其文件树与改造计划之前的 `3c10ae8eee2e4ef6e1de53b200425c5993d7ca6e` 一致。  
> 本次提交：**只新增本根目录草案；不修改生产代码、现有 Frozen 契约、Map 或任何测试。**

## 0. 目标和边界

本草案只设计架构层的一个窄能力：当前 Renderer 提供一个逻辑呈现区域的 CSS 像素宽高；Subsystem Runtime 可以读取最后一次有效宽高并订阅更新。新增能力必须独立于 User Input 的 InputTarget、Frame、Activation、Interest 和焦点；观察尺寸本身不能授予游戏输入或修改业务画面。

目标架构包仅为：

- `packages/data`：Viewport 消息模型、验证、现有 Profile 分流、单 writer 上的有界发布。
- `packages/renderer`：平台无关的尺寸源接口及其生命周期，按当前 Data carrier 发布最新尺寸。
- `packages/subsystem`：Runtime-scoped、只读、保留最后值的 `scope.viewport`，通过当前 Data peer 接收。

`packages/foundation`、`packages/wire`、`packages/main`、`packages/platform-ports`、`packages/runtime-control` 和 `packages/renderer-control` 的既有接口原则上不改；如果实施时发现真实缺口，暂停该项并提交明确的现有类型/调用链证据，另行评审，不扩大本草案的默认授权。

**不在本次实施范围：** `game-libs/map/**`、任何 Map/Camera/ProjectionWindow/Canvas/Sprite/RenderDomain 策略、`apps/desktop/**` 的真实 Window 采样、PWA、示例页面 CSS、`play.bat`、实际缩放效果及任何性能优化。架构包提供可注入的抽象 source，单元/集成测试使用可控 fake source；真实 Desktop source 和产品端到端测试必须列入单独后续任务，不能声称本阶段已解决实际拖窗。

## 1. 当前基线与设计来源

当前 `doc/15-contracts/renderer-data-profile-v1.md` 定义冻结的 `loomrealm.renderer-data/1 = Connection1 + Input1 + Render1`，现有 conformance fixture revision 2；`packages/data/src/model.ts` 的消息 union、terminal family 和 peer interfaces 也只有这两类业务 child。`packages/data/src/runtime.ts` 已有一个 read loop、serialized writer 和 1024 pending sends 的**实现容量**。`packages/renderer/src/control.ts` 的 `createRendererControlHolder(data?, input?)` 没有尺寸源；`packages/subsystem/src/model.ts` 的 Scope 只有 signal/content/input/render。

历史参考（**只用于复核，不自动恢复规范状态**）：

- [`Viewport State v1` 旧候选](https://github.com/lithdoo/loom-realm/blob/4cbf620ebe8aec0e7fb33743813c5d1f2885e6a9/doc/15-contracts/viewport-state-v1.md)：独立 geometry child、bounded latest-state、retained Scope。
- [`ADR0037` 旧候选决策](https://github.com/lithdoo/loom-realm/blob/4cbf620ebe8aec0e7fb33743813c5d1f2885e6a9/doc/decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)：优先讨论首次发布前协调修订 `/1` 而非无依据地引入 `/2`；其中兼容前提需要重新确认。
- [`Viewport conformance` 旧候选](https://github.com/lithdoo/loom-realm/blob/4cbf620ebe8aec0e7fb33743813c5d1f2885e6a9/doc/15-contracts/viewport-state-conformance-v1.md)：可复用测试思想，但不可继承 PASS/Freeze 状态。

旧 `ADR0036` 的强制 Profile `/2` 方案、历史 `x.*` User Input viewport 方案，以及两条实验分支的 Map 调度/性能数字，**均不因引用而获得批准**。

## 2. 待批准的协议与兼容性决策（实现前 Gate C0）

本草案倾向于对首次发布前的 `loomrealm.renderer-data/1` 做一次**显式、整体协调的设计修订**：增加独立 `Viewport State v1` child，但不创建 `/2`、双 parser、自动降级或 per-subsystem negotiation。它并不是对当前 Frozen `/1` 的无声扩展。现有协议和 fixture revision 2 在实施前保持有效；修订后的四 child 契约需另行评审并更新 conformance revision。

必须先记录：是否有已发布/部署的非 npm `/1` peer、持久化身份、rolling/rollback/mixed-binary 兼容要求，是否能保证 Main、Data、Renderer、Subsystem 使用同一构建 cohort。项目此前关于无 npm 消费者的说明不自动证明不存在其他兼容义务。若存在任何必须互操作的旧三 child `/1` peer，**STOP 原地修订**，提交具体 peer 和升级要求后另选带版本的迁移设计；不得让旧、新 `/1` 在同一 identity 下默默连接。

C0 未获批准时，只允许补充设计/测试，不允许实施 wire 变更或把旧 Profile 标为已替换。

## 3. 精确数据合同候选

### 3.1 Source observation 与 wire 分离

平台注入的 source 测量一个明确指定且身份稳定的 logical presentation surface；Core 只理解 CSS logical pixels，不认识 Window、DOM、DPR、devicePixelRatio、Map host 或画布。原始观测的 `width/height` 必须有限且大于零；对各维做 `Math.floor`，只有两者均为 positive safe integer 时才接受。非法观测忽略，不产生 0、null、默认 640×480，也不擦除最后有效样本；规范化后相同尺寸不重复通知。DPR 变化若没有改变 CSS 逻辑宽高，不应发布新的尺寸状态。

唯一新增 wire message：

```ts
export interface ViewportStateV1 {
  readonly type: 'viewport.state';
  readonly width: number;
  readonly height: number;
}
```

精确自有字段仅 `{type,width,height}`，width/height 是 positive safe integer；方向仅 Renderer → Subsystem。禁止掺入 time、revision、sequence、DPR、focus、Frame/Activation、Map、camera、chunk、scale 或 ACK。每条消息是完整的最新状态，不是要求逐条重放的 resize event。

沿用现有一个 UTF-8 JSON text application unit、共同 actual byte ≤1MiB、JSON depth ≤64、原始 Wire/JSON 检查和单向消息合法性；不得以 Viewport 绕过通用门槛。`viewport.state` 的 shape/value invalid 或显式 child fatal 归 `protocol:'viewport'`；**未知** `viewport.foo` 与其他未知 type 应归 Profile unknown-type 错误，不能因为字符串前缀就虚构成合法 child；已识别消息的错误方向在相应 child diagnostic 下拒绝。违规则只使当前 Data peer terminal，不自动导致 Runtime/Frame terminal 或 RenderDomain 消失。

### 3.2 Author API

```ts
export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

export interface Viewport {
  readonly current: ViewportSize | null;
  subscribe(listener: (value: ViewportSize | null) => void): () => void;
}

export interface SubsystemScope {
  readonly viewport: Viewport;
}
```

`scope.viewport` 与 Runtime/Scope 同生命周期，与任何 Frame/Activation 或 RenderDomain 独立。Runtime 创建时 `current=null`，没有有效样本绝不虚构默认值。活跃 Runtime 内 `subscribe()` 同步恰好交付一次当前值（可以为 null），随后仅在结构化宽高变化时通知；更新 getter 必须早于回调；输入/输出对象 detached、不可变。unsubscribe 幂等，调用后不得再投递；listener 同步 throw 和返回 rejecting thenable 必须局部隔离/消费，不污染 Data reader。Runtime abort/terminal 后旧回调失效；终止后新调用 `subscribe()` 仅返回 inert unsubscribe，**不得执行初次回调**。保留的 `current` 只代表最后一次接受的历史值，不保证当前 Renderer/DOM 可显示。

### 3.3 Renderer source API

```ts
export interface RendererViewportSource {
  start(emit: (sample: {
    readonly width: number;
    readonly height: number;
  }) => void): () => void;
}

// 待实施签名：在已有 data/input 后增添可选 source 参数；
// 兼容旧调用者的 TS 形状，整体 wire 兼容性仍受 C0 约束。
createRendererControlHolder(data?, input?, viewport?);
```

source `start` 在当前 Renderer participant 生效后启动，必须允许启动期间同步首个样本；需要有界的一个 latest-staging slot，防止同步启动/异步连接期间累积无限 resize。source stop 时解除 callback 并 fence 已排队事件；旧 Renderer 的 late source callback 不得注入新 Renderer 或新 Data peer。源错误仅局部隔离，不能将非法 raw size 发送出去。真实 Desktop/PWA adapter 怎样从物理窗口采样，留到后续产品实现单独定义。

## 4. 传输、权威与生命周期

目标路径：

```text
platform-injected RendererViewportSource
  -> Renderer normalized latest observation (not InputGate)
  -> current RendererDataPeer.viewport.sendState
  -> same existing DataRuntime serialized writer
  -> profile exact preflight/demux
  -> current SubsystemDataPeer.onViewportState
  -> Subsystem Runtime ViewportManager retained value
  -> read-only scope.viewport for future consumers
```

Viewport **不走** `x.*.state`、不经过 InputTarget/Interest/Frame gate；不写 Main size mirror，也不直接调用 RenderDomain、Renderer Store、Projector 或业务消费者。Main 仍是 Session、DataAuthority `{S,G,P}` 的唯一 authority，只有匹配 current carrier 可以更新 Runtime retained value。

发送端每个 current carrier 严格限 `≤1` 已交付 writer 或等待 `send()` outcome 的 Viewport unit，加 `≤1` 尚未 admission 的 pending latest slot。新变化覆盖 pending；当前 send settle 后，只在其最新待发布尺寸与已发送尺寸不同时 admission 下一条。不得先把每次 resize 都 `runtime.send()` 后才尝试去重，因为那会积压现有共享 writer 并触发 1024 queue 的容量保护；1024 仅是当前实现容量，**不是协议约束**。已经 admission 的消息不能撤回、改序或重发，Input/Render 仍共享唯一 writer；Viewport 自身不能使它们永久饥饿。`sent` 只表示本地 carrier 接受，不是 Subsystem ACK。Terminal 立即令旧 pending 和异步续写 inert。

Runtime 的 `current` 在 current Data carrier 丢失时保留最后值，不额外通知 null。相同 generation/profile 的 fresh carrier，Renderer 必须以当时最新合法物理观测发送独立 baseline；相同 size 不重复 author callback，不同 size 先更新 getter 再通知一次。新 generation 或新 Renderer 而 Runtime 仍存活时，保留相同 `Viewport` 对象，但以 current authority 和 source identity fence 旧消息、旧 callback 和旧 pending；如果 fresh source 尚无合法样本，不合成默认值。只要求 Input/Render/Viewport 各自收敛，不创建跨 child super-snapshot、事务、barrier、ACK 或固定 baseline 先后顺序。

Source observation 不授予 InputTarget、Activation 或 Frame mutation permit。Frame suspended/未持有输入权时 Runtime 仍可接收 geometry；是否根据它改变场景，只能由后续业务层依既有权限决定。

## 5. 预计代码改动边界（下一阶段，不在本次文档提交执行）

| 包 | 预计文件 | 最小工作 |
|---|---|---|
| `@loomrealm/data` | `src/model.ts`, `src/index.ts`, 新的 `src/viewport-codec.ts`, `src/profile-codec.ts`, `src/peers.ts`, `src/runtime.ts` | 导出类型、exact validator、严格 demux/direction/terminal family，增加 Renderer peer 的有界 Viewport sender 和 Subsystem handler；保持单 reader/writer。 |
| `@loomrealm/renderer` | 新的 `src/viewport.ts`、必要的 internal publisher，`src/control.ts`, `src/index.ts` | 加抽象 source 可选依赖；participant-scoped latest observation 和每 carrier 新发送 cursor；旧 source/data source identity fencing。 |
| `@loomrealm/subsystem` | 新的 `src/internal/viewport-manager.ts`，`src/model.ts`, `src/index.ts`, `src/host/run-subsystem.ts` | 给 Scope 一次性注入稳定的只读 Viewport；接收当前 peer、retention、同步 subscription、lifecycle cleanup。 |
| 测试 | 上述三个包的现有 `test/` 下补充测试及独立架构 vertical fixture | 不引入 Map/DOM/Hostra 依赖。 |

`@loomrealm/foundation`/`@loomrealm/wire` 不额外增加通用 geometry abstraction；其他包默认不改。如果 peer 类型需要为本次新增 `viewport` 分支，允许在 `packages/data` 内精确增量，不改 Input/Render 既有 message shape 或 writer 容量。实施前再逐个确认上述实际文件和 import/export 关系，不能凭本草案中的“预计”列表自动授权范围扩张。

## 6. 实现切片与每步退出条件

**C0 — 协议治理。** 明确兼容性、同一 build cohort 和 Frozen Profile `/1` 修订授权；增量修订 Profile、Viewport child 与 conformance 设计，原三 child 的所有既有义务保持。当前文件是 Draft，签署前不得称已 Frozen。

**C1 — Data 契约。** 首先实现 codec/model/peer，按原 `@loomrealm/data` 单 reader/writer 落地 exact three-field、direction、unknown-type、diagnostic 和有界 sender。通过新旧 codec、backpressure、terminal 单元测试才进入下一步。

**C2 — Renderer source seam。** 实现平台无关注入与当前 participant/source 生命周期；fake source 在 `start()` 内同步 emit、同尺寸重复、非法 raw、source replacement、carrier loss/reconnect/新 generation 均须可确定重现。验证每个 current carrier 只有自己的首次 baseline 和 pending slot。

**C3 — Subsystem read-only capability。** 实现稳定 Scope 对象与 retained manager；测试 getter-before-listener、同步初始 null/value、throw/reject containment、unsubscribe、Runtime terminal 以后 subscribe inert、fresh carrier latest，以及 Frame/InputTarget 独立性。

**C4 — 架构集成闭环。** 不加载 Map、不读取 DOM，通过可控 Renderer fake source + 真实 Data peers + 真实 Subsystem host 验证 A→B→C latest 收敛和双方 source/carrier retirement。使用同一个确切 executable SHA 运行所有受影响架构回归，记录命令、结果和未运行项。**此阶段不做 Desktop 适配、产品缩放、移动帧率或 Product Closed 宣告。**

## 7. 架构验收矩阵（必须自动化）

1. Message：exact own keys；fractional source 向下取整但 wire fraction 拒绝；0、负值、NaN、Infinity、unsafe、extra/missing、错误方向、unknown `viewport.*`、超字节/深度、不合法 JSON 等分别证明拒绝边界和 Data-local terminal，旧 Input/Render 全量回归。
2. Publisher：初次同步 sample；同值零增量；阻塞 `send()` 时 >1024 个尺寸变化加并发 Input/Render；至多一条 in-flight 和一个 latest pending；释放后最终仅收敛最新；admitted 顺序不变；terminal 无后续发送。
3. Consumer：null baseline；结构化相等 suppress；getter 先于回调；初始同步调用；listener throw/reject 隔离；幂等退订；旧引用 Runtime terminal 后 subscribe inert。
4. Authority：old carrier close / same-G fresh / new-G same Runtime / Renderer replace / stale sample / late Promise / fresh no valid sample；只 current peer 可以更新 retained state。丢连接保留历史值而非通知 null。
5. Independency：模拟两个 Runtime/Frame 与 InputTarget 变更；未拥有输入权、Frame suspended 和 input producer unavailable 时仍可收 viewport；尺寸消息不修改任何 InputTarget/Frame/Render facts。
6. Baseline build/regressions：`npm run test:data`、`npm test -w @loomrealm/subsystem`、`npm test -w @loomrealm/renderer`、`npm run test:m10:qualification`、`npm run test:m11:qualification`、`npm run test:m13:qualification`，以及适用的 `npm run build:desktop-stack`、`npm run test:m9`/`npm run test:m10`/`npm run test:m11`。先核对命令实际存在、逐项记录 stdout/exit/SHA；因尚未修改 Desktop 而无法验证真实 Window 采样时必须标 `NOT RUN`，不可由 fake source 推断通过。

禁止删除旧测试、修改已有 Frozen 断言使其无意义，或把文档规格通过等同于实现与产品资格通过。

## 8. 与后续 Desktop / Map 的交接合同（本次不实施）

后续 Desktop 任务必须显式选择真实 presentation surface，并验证 OS/Electron client area、CSS layout viewport、实际分配的业务 content box、letterbox 与可见像素之间的关系；`window.innerWidth/innerHeight` 只是待实测的产品 source 选择，不上升为所有架构实现的 DOM 要求。后续 Map 任务自行决定 default/clamp、camera、projection、resize 时机、运动 rebase、图层、缓存和性能门槛。**不得把旧 100ms trailing debounce、active-step defer、历史 P95 或 Cursor/GLM 的 Product Closed 记录作为本架构接口的默认语义。**

本阶段只能宣称“Viewport 架构接口在 fake source/真实 Data peers 上获得资格”（若届时测试确实通过）；是否解决 `play.bat` 原生动态窗口、地图空白、角色越界或移动卡顿，必须在后续同 SHA 的真实产品测试分别证明。

## 9. 本草案评审与签收栏

| Gate | 当前状态 |
|---|---|
| C0：旧 `/1` 非 npm/混合 peer 兼容性与修订授权 | PENDING |
| 新 Viewport child + Profile 修订正式冻结 | NOT FROZEN |
| 架构包接口/实现 | NOT IMPLEMENTED |
| 新旧架构 conformance 与 vertical 结果 | NOT RUN |
| Desktop 物理 source/真实窗口 | OUT OF SCOPE / NOT RUN |
| Map 功能与性能 | OUT OF SCOPE / NOT RUN |
| 审核者、批准日期与代码 SHA | PENDING |

**停止规则：** 如果实施需要改变 Main authority、Input/Render 语义、现有 wire limits、M13 Projector 或 Map 源码，或者发现旧 `/1` peer 互操作需求、无界排队、无从验证 currentness，则停止相关切片，给出文件路径、最小 fixture、expected/actual 与拟议独立设计变更；不得自行扩大范围或宣告完成。
