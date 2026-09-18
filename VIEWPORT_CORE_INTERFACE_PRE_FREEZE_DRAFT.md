# Viewport 架构接口与最小实现设计草案

> 状态：**Implementation-ready design candidate / 待正式契约同步与设计签署 / 未实施 / 未测试**  
> 日期：2026-09-18；分支：`dev/resize-viewport`；原始开发基线：`24355f9f71d99e0a93c3292da1eaa0a4fdd9b42d`（文件树与改造前 `3c10ae8` 相同）。  
> **本次仅修订根目录设计草案，不修改任何 Frozen 正式契约、生产代码、测试、Desktop 或 Map。** 文中 `MUST` 代表实施目标，不代表现有代码已提供该行为。

## 0. 唯一目标、范围与完成定义

建立一条单一、平台无关的 Renderer → Subsystem **logical presentation viewport size** 通道。Renderer 提供当前明确指定的一个逻辑呈现区域的 CSS logical pixel 宽高；Subsystem Runtime 持有最后一次成功接收的合法尺寸，业务通过 `scope.viewport.current` / `subscribe()` 只读观察。

```text
platform-injected RendererViewportSource
  → Renderer participant-scoped latest valid sample
  → current Renderer Data peer bounded viewport publisher
  → existing Data Profile /1 common preflight + single writer/reader
  → current Subsystem Data peer
  → Runtime-scoped ViewportManager
  → readonly scope.viewport
```

**只准改的生产包：** `packages/data/**`、`packages/renderer/**`、`packages/subsystem/**`。可在这三个包和现有 `test/` 下增补自动化测试；正式规范的增量修改限定为现有 `doc/15-contracts/renderer-data-profile-v1.md`、同名 conformance、对应新增 Viewport child contract/conformance 及必要的既有文档入口。`packages/foundation`、`wire`、`main`、`platform-ports`、`runtime-control`、`renderer-control` 的 production API 不改。发现必须越界的真实依赖时给出文件/调用链及失败 fixture，停止该项并重新评审，不假定可以自行改。

**明确排除：** `game-libs/map/**`、Map/Camera/RenderDomain/Canvas/Sprite/性能策略、`apps/desktop/**` 实际窗口采样、PWA adapter、示例 CSS、`play.bat` 和真实窗口拖动。架构测试使用可控 fake source，但必须走**真实 Renderer holder、Data peers 与 Subsystem host**；不允许三个孤立 mock 通过就称架构闭环。阶段完成只能称“架构尺寸通道合格”，不能称产品动态缩放完成。

## 1. 协议决策已定：原地修订 `/1`，不兼容混版

**项目负责人于 2026-09-18 明确确认：npm 包当前没有外部依赖，可以直接修改现有协议。** 据此，本任务**获准直接协调修订**现有 `loomrealm.renderer-data/1`；不再设置 npm 查询、npm 消费者调查或另建 `/2` 为 C0 前置工作。此授权不等于旧三-child二进制与新四-child二进制能够相互通信：相同字符串不能识别不同 build，必须整体升级本次实际相连的 Main/Data/Renderer/Subsystem/adapter；禁止旧、新 `/1` 混连，不增加双解析器、协商、自动降级或兼容别名。若实施中出现**具体、已存在且必须共存的非 npm 旧 peer**，记录证据并停止混连部署，另开迁移决策；不凭空重新进行泛化兼容调查。

现有 Frozen Profile `/1` 生产实现仍是 `Data Connection v1 + User Input v1 + Render Update v1`；目标明确改为：

```text
loomrealm.renderer-data/1 (coordinated pre-release revision)
  = Data Connection v1 + User Input v1 + Render Update v1 + Viewport State v1
```

Viewport 是新 child，**不是** `x.*.state` 或 User Input 绕过 InputTarget 的特例。Main 仍选择唯一 DataAuthority `{subsystemKey,generation,dataProfile}`，不存/转发尺寸；不修改 Control、Connection、Input、Render wire、现有 1MiB/depth64 共同限制、M13 Projector 或 Store。原旧三-child Profile/conformance 的未更改义务须完整保留；旧测试仍需通过，新增 fixture revision 记录新义务，但旧 PASS 不能冒充四-child PASS。

**正式实施门槛 C0：** 将本草案通过评审的增量同步到正式 Profile、child 和 conformance，记录修订的规范 SHA 与负责人批准，再改生产代码。这里待完成的是规范同步/签署，不再是已获项目负责人批准的“是否允许修改 `/1`”问题。根目录草案本身不是 Frozen 正式协议。

## 2. 最小且封闭的公共接口

### 2.1 只传递尺寸

平台注入一个身份稳定的 logical presentation surface。Core 只认 CSS logical pixels，不要求 DOM/Window、DPR、OS 窗口、Map content box、camera 或画布。每个 Renderer participant 生命周期绑定恰好一个 surface；不能无声明地切换到另一独立 surface。其所有 current Data peers 使用同一份归一化源样本。

Raw sample 的 width/height 必须是 finite positive number；分别 `Math.floor` 后均是 positive safe integer 才接收。有限正小数合法，例如 `640.9 → 640`；负数、零、NaN、Infinity、floor 为零及 unsafe 都忽略。**不发送非法值，不清除已知合法值，也不合成默认 640×480。** DPR-only 变化但 CSS size 不变时没有消息。

```ts
// @loomrealm/data，唯一新增 wire type：Renderer → Subsystem。
export interface ViewportStateV1 {
  readonly type: "viewport.state";
  readonly width: number;
  readonly height: number;
}

// @loomrealm/renderer：平台可注入的唯一 source seam。
export interface RendererViewportSource {
  start(emit: (sample: Readonly<{ width: number; height: number }>) => void): () => void;
}
// 原有 data/input 两个位置参数保持不变，第三个为可选 viewport source。
createRendererControlHolder(data?, input?, viewport?);

// @loomrealm/subsystem：业务只读，不暴露 source、transport 或窗口身份。
export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}
export interface Viewport {
  readonly current: ViewportSize | null;
  subscribe(listener: (value: ViewportSize | null) => void): () => void;
}
export interface SubsystemScope {
  readonly viewport: Viewport; // 在原有 signal/content/input/render 基础上增加
}
```

Wire 必须是精确自有字段 `{type,width,height}`；两维是正 safe integer，不接受 wire fractional 值、extra keys、原型继承字段或别的 metadata。每个 message 是一份完整状态，不是必须逐条交付的 resize event；不增加 timestamp/sequence/revision/ACK/request/reset。原有 UTF-8 JSON text、actual bytes≤1,048,576、depth≤64、Wire representation/preflight 先于任何业务 mutation，保持现有一个 inbound reader 和单 serialized writer。

明确错误归属：已识别 `viewport.state` 的非法 shape/value/方向或 child explicit fatal → `protocol:"viewport"`；未知 `viewport.foo`/其他 unknown type → `protocol:"profile"`。既有 Input/Render diagnostic 不变。错误只 terminal 当前 Data peer，不能自动杀 Runtime/Frame 或删除 RenderDomain。

### 2.2 Peer API：只表示最新状态，不伪造逐事件 ACK

目标 `@loomrealm/data` 公共形状增量：

```ts
export type RendererDataMessageV1 = UserInputMessageV1 | RenderUpdateMessageV1 | ViewportStateV1;
export type DataProtocolFamily = "profile" | "input" | "render" | "viewport";
export interface SubsystemDataHandlers {
  // 原三个 onInput* handler 保持原样；新增：
  onViewportState(message: ViewportStateV1): DataInboundDisposition | Promise<DataInboundDisposition>;
}
export interface RendererViewportDataPeer {
  publishState(message: ViewportStateV1): void;
}
export interface RendererDataPeer {
  // 原 binding/input/terminal/close 保持原样；新增：
  readonly viewport: RendererViewportDataPeer;
}
```

`publishState()` 返回 `void` 是刻意的：一次 sample 可能被 newer sample 替换；不向调用者承诺逐 sample 的 `sent` 或远端 ACK。内部按现有 `DataRuntime.send()` 结算发送结果；出错以既有 `peer.terminal` 暴露。Renderer 只向已安装的 current peer publish；不能对 retired peer 继续调用。`@loomrealm/data` 自己不能读取 source/DOM，也不得建立第二个 writer。其他原有类型和 peer API 逐字段保全；新增接口不能以 `unknown` 扩展袋代替封闭类型。

## 3. Source 首次样本和 Renderer 安装时序（唯一顺序）

`RendererViewportSource.start(emit)` 的责任：**若启动时能取得合法尺寸，必须在 `start()` 返回前同步 emit 一次当前观测；若暂时没有合法观测，可以不 emit，但当首次合法尺寸可获得时必须 emit。** 后续每次 CSS logical size 实际变化均须发出观测；源恢复可见/重新绑定其原定 surface 后须重新采样，修复曾经无法测量而漏掉的尺寸变化。平台 source 实际监听机制属于以后 Desktop/PWA 实现；本阶段 fake source 必须验证这个合同。源不能仅等待一次用户 resize 才提供本来已可取得的初值。没有有效样本时 `current=null`，不合成默认值。

Renderer Control holder 在每个 participant 依序执行：

1. **撤销旧身份**：使旧 source token 失效，调用旧 stop，退休旧 Data peers / 清理其待发送；旧源晚到回调、旧发送 Promise 结算一律不能影响新身份。不得把旧 participant 的 raw last 样本继承给新 participant。
2. **安装新身份**：在确认新 Control current 后、Data acquire/reconcile 前，启动新 source；source 启动期的同步 callback 只覆盖**一个** participant-scoped latest staging slot，不直接发送。`start()` 成功返回有效 stop 函数后，提交这份 latest；随后每次合法变化更新同一个 latest sample。无 source 时该 participant 永远没有样本，而不是生成默认值。
3. **失败的 bootstrap**：如果 `start()` 抛错或未返回函数，丢弃本次 staged sample、fence token，能够调用的 stop 做 best-effort cleanup；将 source 标为 locally unavailable，不伪造尺寸、不 terminal Control/Data。该 source 不得在此 participant 内悄悄自动重启；新的 participant 可重新 start。记录可观察的 source failure 供测试；不能把它记作 Viewport 成功。
4. **安装 current Data peer**：原有 `startDataAcquire`/`installDataAcquire` currentness check 不变；只有 `slot.current=peer` 成功后才让该 peer 的**全新** publisher 从此刻最新合法 sample 发布 baseline。即使 source 在 acquire 期间更新十万次，也仅保存最新一份。Source 如果尚无样本则先不发，首个合法观测一到立即发布。相同 participant 的每个 current Subsystem carrier 都独立获得一次 baseline。
5. **生命周期**：Control snapshot 更新但 participant 未替换时不重启 source；只 reconcile 发生变化的 Data authority。Data carrier close/reacquire、新 generation 均新建 publisher cursor，source 不必重启；Control participant 真正替换/terminal 时停止 source。每次异步 continuation 必须核 `participantToken + slot.current peer identity` 才能发布。

该顺序是对现有 `createRendererControlHolder(data?,input?)` 与 Data-slot 机制的窄增量；不能重排现有 Input/Render 行为。任何 source/peer 同步回调、Promise、退订可能重入的地方，先做 current identity 检查，再进行状态 mutation。

## 4. 有界 latest-wins 发布器：精确状态机

**状态归 `@loomrealm/data` 的每个 RendererDataPeer 独有 publisher**，不得在外层为每次 raw resize 调用一次 `DataRuntime.send()`。仅持有 `active:boolean`、`lastSent:Size|null`、`inFlight:Size|null`、`pending:Size|null`；另由 Renderer participant 持有一份最新合法观测。这里 `inFlight` 包括已提交现有 writer 队列、但 `send()` outcome 尚未返回的 unit；`pending` 从未交给 writer。相同归一化尺寸按 `(width,height)` 结构比较。每个 peer cursor 的初始 `lastSent=null`，所以 reconnect 即使与旧尺寸相同仍必须重新发布 baseline。

唯一转移规则：

```text
offer(V) while inactive       → ignore

offer(V) with no inFlight:
  if V == lastSent            → no send; pending=null
  else                       → inFlight=V; call existing runtime.send(V) exactly once

offer(V) with inFlight=A:
  pending = (V == A ? null : V)     // 覆盖旧 pending；B→A 时删除过时的 B

send(A) settles with sent:
  if inactive                 → ignore outcome; no new send
  else:
    lastSent=A; inFlight=null
    take P=pending; pending=null
    if P != null && P != lastSent  → inFlight=P; call runtime.send(P) once

send(A) settles with terminal / peer retired:
  active=false; inFlight=null; pending=null; never retry on this peer

fresh current peer            → fresh active cursor(lastSent=null), offer(latest legal sample)
```

`pending` 的最新观测来源以 Renderer 每次 source 变化为准。**关键回退测试：** A 正在发送，后续 B→A，则 pending 归零；A 成功后不得发送过时的 B。A 已经 admitted 后，B admitted 也不可撤回；如果 C 在 B 已 admitted 后到来，只能 B 结算后再发最新 C。Writer 上其他 Input/Render 消息的既有 FIFO/容量/terminal 不修改。最多一条 Viewport admitted 或等待 outcome + 一条未 admitted pending；因此 Viewport burst 自身不能耗尽现有 1024 发送队列。`sent` 仅是本地 carrier acceptance，不是 Subsystem ACK；不添加 timer/debounce/通用优先级 scheduler、无限重试、跨 carrier pending 迁移。Ordinary source 最新值在 writer 最终恢复且 peer 仍 current 时最终收敛；若其他 traffic 永久堵住 shared writer，本协议不承诺凭空突破底层阻塞。

`publishState()` 不因每个被 coalesce 的 observation 创建未结算 Promise。Publisher 内部必须消费 `runtime.send()` 结果及异常，避免 unhandled rejection；单次 terminal 已由原 DataRuntime first-wins 处理。任何 retire/terminal 先令 active=false，然后才能允许旧异步结算，旧结果不得更新新 cursor。

## 5. Subsystem retained capability：唯一生命周期规则

ViewportManager 为每个 **Subsystem Runtime** 创建恰好一个 `Viewport` 对象，并在 definition factory 执行前放入 frozen Scope；不归属于 Frame、InputListener、RenderDomain、Data carrier 或 Generation。

```text
Runtime start                        → current=null
live subscribe(L)                    → 同步恰好 L(current) 一次，随后仅结构尺寸变化通知
current peer accepts A              → 更新 detached/frozen current=A，之后通知
current peer accepts equal A        → 无重复通知
current carrier lost                → 保留历史 A，不通知 null
same G/P fresh peer sends A          → 新 wire baseline 必发，业务 equal suppress
fresh peer sends B                   → setter 先改 B，再通知 B 一次
new G / new Renderer, Runtime alive  → 对象不换；旧 peer fenced；等待 current peer baseline
no valid fresh source               → 历史 A 可保留，但不保证现在可绘制
Runtime abort/shutdown/terminal      → 关闭 manager，移除 listeners，旧回调与 late delivery inert
post-terminal subscribe(L)           → 立即返回 inert/幂等 unsubscribe，L 一次也不调用
```

`current` 和 callback 对象均 immutable/detached；不能被订阅者 mutation 改变。活跃期间每个新 subscription 的 initial delivery 同步执行且 getter 已是对应 current，解决 read→subscribe race。Listener 同步 throw 及返回 rejecting thenable 均局部捕获/report，不使 reader 或 Data terminal；不阻塞其他 listener。退订幂等，退订后无新通知；listener 在回调期间退订/新增 listener 时，按当前 listeners 的稳定快照遍历，并在逐次调用前再次检查 active subscription 和 Runtime lifetime，新 listener 仅获得其自身同步初始 delivery，不重复收到当前那轮 broadcast。通知仅在成功接受 current Data message 后发生；Source invalid/ordinary carrier loss 不把 `current` 改为 null。

Subsystem `run-subsystem.ts` 先创建 manager、向 Scope 注入同一对象；`onViewportState` handler 和原 Input handlers 一样只接受 `this.currentDataPeer===peer` 且 Runtime 未 terminal 的消息，否则合法旧消息只 drop、不 mutation。安装 Data peer 后才允许有效 baseline 进入当前 manager；peer terminal 时只解除 peer，manager retained value 不销毁；正常/异常 Runtime 关闭时 manager close，保证 late callbacks inert。Viewport 的接收/订阅**不受** Frame active/suspended、InputTarget、Activation、Interest、focus 或 Input producer availability 门控；它也不 mint Frame mutation permit，不主动提交 RenderDomain 或 Renderer Store。

## 6. 代码边界与架构集成测试

| 归属 | 实施文件 | 唯一职责 |
|---|---|---|
| `@loomrealm/data` | `src/model.ts`, `src/index.ts`, 新 `src/viewport-codec.ts`, `src/profile-codec.ts`, `src/peers.ts`, `src/runtime.ts` | exact validator、namespace/direction/terminal；按 peer 的 publisher 状态机，保留单 reader/writer。 |
| `@loomrealm/renderer` | 新 `src/viewport.ts`、所需内部 helper、`src/control.ts`, `src/index.ts` | 注入 source、participant 生命周期、latest observation、Data peer initial baseline 和 identity fencing。 |
| `@loomrealm/subsystem` | 新 `src/internal/viewport-manager.ts`, `src/model.ts`, `src/index.ts`, `src/host/run-subsystem.ts` | 稳定 read-only Scope、retention、当前 peer 路由及 Runtime terminal cleanup。 |
| Tests | 三包现有测试目录和适用现有根目录 `test/` | fake source + **真实 holder、Data peers、Subsystem host**，无需 DOM/Map/Hostra。 |

测试必须有一个可复现的 vertical：构造真实 Renderer holder 和 Subsystem host，连接真实 Data peers、注入 fake viewport source；同步首次 640×480 → Scope 同步 subscription 观察 null/随后 640×480 → 800×600；暂停 writer 注入 10000 个交替大小及 Input/Render 消息，核 Viewport admission≤1、pending≤1、最终最后值、无 Data queue overflow；断开 Data 并在同 participant 重连，核 wire 重新发送 baseline、Scope 对相同值不重复通知；再替换 Renderer participant/Generation，在旧 source callback、旧 send Promise 和旧消息晚到时证明 retained 未被旧值覆盖；Runtime 结束后旧引用 subscribe 不触发。由测试直接观测应用消息与 Scope 值，不能以 mock manager 或仅断言函数被调用取代真实链路。需要虚拟时钟时复用现有 fixture，不把 Wall Clock/跨进程 now 当协议证据。

新旧回归必须覆盖：

- Codec：positive fraction source floor、wire fraction reject；extra/missing/inherited keys、NaN/Infinity/zero/unsafe、错误方向、unknown `viewport.*`、bad JSON/common bytes/depth；各自 terminal family 无混淆；Input/Render 原测试原义仍 PASS。
- Publisher：同步初值、未测量不发送、同值去重、A→B→A 回退、A→B→C、B 已 admitted 时 C、send failure/retire、fresh cursor、阻塞队列下共存 Input/Render、无 unhandled rejection。
- Renderer：source `start()` 同步 emit 与无初值后恢复、start 抛错或 stop 非函数、source replace、Control replacement/terminal、Data acquisition in-flight、same participant reconnect/new G、late callback fencing；不改变原 Input/Render 顺序。
- Subsystem：初值 null、getter-before-callback、同步订阅、listener throw/reject、在 broadcast 中退订/订阅、冻结对象、Data loss retain、fresh baseline、post-terminal inert、InputTarget/Frame suspend 独立。
- 真实架构 vertical：源→Renderer holder→Data peer→Subsystem host→`scope.viewport`；两个 current peer 情况同一 source baseline；仅受 current identity 的消息生效。不得使用 Map、真实 DOM 或现有产品窗口来代替上述验证。

已在根 `package.json` 确认可用的回归入口：`npm run test:data`、`npm test -w @loomrealm/subsystem`、`npm test -w @loomrealm/renderer`、`npm run test:m10:qualification`、`npm run test:m11:qualification`、`npm run test:m13:qualification`、`npm run build:desktop-stack`；视影响补跑 `npm run test:m9`、`npm run test:m10`、`npm run test:m11` 与 `npm run test:regression`。新的 Viewport/Profile conformance runner 必须在实施阶段显式新增并运行，不能假定旧命令已经包含它们。每个结论记录**同一个最终 executable SHA、命令、exit code、raw logs、测试 fixture SHA**；若有任何改动必须重新跑受影响集合。文档不得写不存在的 PASS 或复用别的分支/旧版本结果。

## 7. 唯一实施与签收流程

| 阶段 | 工作 | 退出门槛 |
|---|---|---|
| C0 规范同步 | 按第1节已获授权原地修订 Profile `/1` 与 conformance，新增 Viewport child 与 conformance；交叉检查旧三 child 义务并签署规范 SHA。 | 正式文档 coherent、设计签署；不得谎称已实现。 |
| C1 Data | 先做 exact message、peer API、单 writer 上有界 publisher/terminal。 | Codec + sender + 原 Data/Input/Render 回归。 |
| C2 Renderer | 接入 source seam、首次样本、current participant/peer 生命周期。 | 启动/替换/断线/重连、无过时消息测试。 |
| C3 Subsystem | Runtime-scoped readonly manager、scope 和 handler。 | Callback/retention/terminal/Frame 独立测试。 |
| C4 架构闭环 | 真实 holder + Data peers + host 的 vertical 与同 SHA 回归。 | 全部适用自动化 PASS、异常矩阵有原始证据、无 Map/Desktop production diff。 |

架构层的 **Done** 必须同时满足：正式规范已批准；只改允许范围；一次完整源→业务只读接口测试可重现；currentness、latest wins、断线与异常矩阵通过；新旧协议和受影响架构回归来自同一执行 subject；所有未运行/失败逐项记录。Docs Freeze、代码已实现、测试 PASS 是三个不同状态。若无法达到，状态必须保留 NOT CLOSED，不能用文字签收绕过测试。

后续 Desktop 任务单独指定真实 presentation surface，并测量 OS/Electron client area、CSS viewport、实际业务 content box/letterbox、真实首次采样及拖窗；后续 Map 自行决定默认值、clamp、camera、resize 时机、运动 rebase、建筑图层和性能。**绝不从本次导入旧 100ms trailing debounce、active-step defer、历史 synthetic P95 或 Cursor/GLM 的 Product Closed 结论。** 本阶段不承诺 `play.bat` 已能动态缩放。

## 8. 当前签收事实

| Item | State |
|---|---|
| 用户明确允许直接修改现有协议；npm 无外部依赖 | OWNER DECISION RECORDED / 2026-09-18 |
| 旧三-child `/1` 与新四-child `/1` 混版兼容 | NOT SUPPORTED；单一 coordinated build cohort |
| 此根目录设计 | IMPLEMENTATION-READY CANDIDATE；待正式文档同步与签署 |
| 正式 Profile/Viewport contract + conformance | NOT UPDATED / NOT FROZEN |
| 架构三包 production 实现 | NOT IMPLEMENTED |
| 架构 vertical/回归 | NOT RUN |
| Desktop 真窗口与 Map 功能/性能 | OUT OF SCOPE / NOT RUN |

**STOP 条件：** 出现具体必须共存的旧 peer、无法在既有 writer 上保持有界/收敛、旧 source/peer currentness 无法证明、或必须修改 Main authority、旧 Input/Render 协议、M13、Desktop/Map 才能通过“架构”测试。只提交最小重现、expected/actual 和必要的独立设计修订；不私自扩大范围、不把项目负责人批准修改协议解释为批准未经验证的产品行为。
