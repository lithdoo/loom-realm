# Battle v0 集成说明

> 状态：**Presentation integration FROZEN + IMPLEMENTED + TESTED + CLOSED-LOOP QUALIFIED；Core Runtime/Decision integration 仍为草案**。本文说明 Battle Core 如何与 LoomRealm Resource、Presentation、Decision Adapter、Host/Frame 生命周期及 workspace 工程集成。
>
> Gameplay 语义只以 [BATTLE_V0_SPEC.md](./BATTLE_V0_SPEC.md) 为准；数据结构以 [BATTLE_V0_CONTRACTS.md](./BATTLE_V0_CONTRACTS.md) 为准。

## 1. 集成职责边界

`game-libs/battle` 的目标是提供可复用 Battle 组件，而不是预先固定一个完整的业务 Subsystem。实现阶段应让三层可以独立导出和替换；exact package export path 属于工程细节，但概念上至少包含：

```text
@loomrealm-game/battle
  contracts
  decision
  simulation
  presentation
```

共享依赖方向：

```text
                    contracts / ports
                  /        |          \
                 /         |           \
          Decision     Simulation     Presentation
```

三层运行职责：

- **Decision / Plan**：消费 Observation/Constraints/Guidance，产生 `PlanSubmission`。Mock/Script/Manual/Random/LLM 可以替换。
- **Simulation / Execute**：完整 Battle Runtime。自己拥有 Battle clock、200 ms scheduler、event queue、Tick reducer、Decision lifecycle、accepted-plan execution、Battle State、Result 与 Replay。
- **Presentation / Present**：初始化 Map/Actor 视图并表现 Simulation 已决定的 movement/turn/effect/state；自己拥有插值、camera、viewport 和视觉资源生命周期。

使用 Battle 的 Application/Subsystem 只做 **composition**：

```text
Application / Subsystem
  ├─ choose/create Decision implementation
  ├─ choose/create Presentation implementation
  ├─ create BattleRuntime and inject required Ports/capabilities
  └─ after injection, only control BattleRuntime lifecycle
```

它不负责 Battle scheduler，不调用公开 `tick()` 来实施战斗，也不在每个 Decision/Projection 之间承担规则转发。Simulation 根据自己的 Runtime 状态请求 Decision，并把已决定的视觉事实交给 Presentation Port。

### 1.1 Port 的概念边界

PresentationPort / BattlePresentationHandler 的 lifecycle surface 已由 Contracts/Presentation 冻结；这里不再保留另一套 method naming。其余非 Presentation 的 package export organization 与尚未冻结的外部 provider detail 仍可在实现阶段按仓库惯例落位：

```ts
DecisionPort
  decide(DecisionRequest, AbortSignal) -> Promise<DecisionCompletion>

PresentationPort
  readonly failure: Promise<PresentationFailure>
  initialize(BattleSceneInit)
  render(RenderProjection)
  pause()
  resume()
  close()

BattleRuntime
  run() -> Promise<BattleResult>
  pause()
  resume()
  cancel()
  close()
  getSnapshot()
  getReplay()
```

`run()` 是 one-shot session entry，命名与现有 Map Handler 的 `run()` 习惯对齐；同一 Runtime 实例不得第二次 run。它在 Presentation 初始化与 initial Projection 发布完成后才启动 Battle clock。

`BattleRuntime` 的 public surface 不暴露“由业务每 200 ms 调一次”的 `tick()`。实现内部可以有可测试的 `processTick(currentTick)`、FakeClock 或 scheduler seam，但 Tick ownership 仍属于 Simulation。

Runtime 对注入的 Decision/Presentation lifecycle 负责：业务注入完成后不直接调用 `presentation.pause/resume/close`。

Simulation 依赖 `DecisionPort / PresentationPort` 并不意味着依赖 concrete implementation：业务可以注入 ScriptDecision、LLMDecision、BrowserPresentation、NullPresentation 或 RecordingPresentation，而 Simulation reducer 不随之改变。

`BattlePresentationHandler` 应直接实现 `PresentationPort`；不需要额外建立一个只做 method forwarding 的 adapter。

`failure` 是最小的 Presentation async fatal channel：Runtime 在 active session 中观察它，但 Presentation 只报告 failure fact，不创建或选择 `BattleResult`。channel one-shot；Presentation 在报告前先停止自己的 visual authority/cleanup；Runtime 才拥有停止 gameplay authority并把它归约为 `failure` 的职责。显式 close 后迟到 callback 不得完成该 channel。

Actor collection 同样遵循 `ARCH-006`：Runtime/Port 以唯一 `actorId` 寻址，不使用 `actorA/actorB` 或数组下标表达 identity。v0 Config validator 严格要求两个 combat Actor，并且恰好为 1 个 `ally` + 1 个 `enemy`；未来 N Actor 版本只扩展规则语义，不改变三层组合方式。

### 1.1.1 Simulation execution pipeline

Simulation implementation 应保持一条有界 pipeline，而不是通用 Task/Command framework：

```text
DecisionCompletion
      ↓
Decision Inbox
      ↓ Tick snapshot / validation
active or pending AcceptedPlan
      ↓ one intent at a time
ActionState
      ↓ dueTick
Scheduled Event Queue
      ↓
next Tick reducer
```

关键约束：

- path 不预展开成整串 scheduled tasks；只有当前 movement step 真正获得 reservation 后才 schedule 对应 `move_complete`；
- active plan 仍有 future intent 时不预取下一 Plan；
- active plan 的最后一个 intent 已 materialize 后，允许 Action execution 与 next Decision Thinking 重叠；
- next Plan 最多暂存一份 pending accepted plan；它不能绕过当前 action lock；
- Decision Inbox 与 Scheduled Event Queue 保持两套结构，不把 completion 转换成 `dueTick` event；
- Runtime shell 负责 async Ports / clock / lifecycle；Tick authoritative mutation 不等待 Decision、Browser 或其他外部 Promise。

`ready` Decision state、独立于 `ActionState.moving` 的第二份 `activeStep` authority、以及无界 accepted-plan FIFO 都不是 v0 implementation requirement。

### 1.2 Simulation 只依赖窄 capability

Presentation concrete implementation 可以依赖 `SubsystemScope / Frame`，因为它确实需要 Content、Viewport、RenderDomain；LLMDecision concrete implementation 也可以依赖 Host/service capability。

Simulation Core 不应直接接收整个 `SubsystemScope / Frame`。推荐概念：

```ts
const battle = new BattleSimulationBuilder({
  clock,
  signal,
  decision,
  presentation,
}).build(config)
```

其中 Simulation 只知道：

```text
BattleClock
AbortSignal
DecisionPort
PresentationPort
BattleConfig / resolved Battle content
```

它不知道 RenderDomain、Viewport、DOM、InputListener 或 `frame.call()`。测试环境可直接注入 FakeClock + ScriptDecision + RecordingPresentation，不需要模拟整个 LoomRealm Subsystem。

## 2. RPGMap Resource 兼容

Battle 复用的是**素材/Content 形式**，不是 RPGMap Runtime 行为。

### 2.1 复用的 Content / Resource 概念

Battle 可以读取现有：

```text
struct.Map
struct.Tileset

resource.Graphics/Tilesets/...
resource.Graphics/Autotiles/...
resource.Graphics/Characters/...
```

当前已确认的兼容约定：

- Map 概念字段包括 `tileset_id`、`width`、`height`、ProjectedTable 风格的 tile `data` 和 `behaviors`；
- Tileset 概念字段包括 `id`、`tileset_name`、`autotile_names`、`passages`、`priorities`、`terrain_tags`；
- tile size = 32×32；
- direction 继续使用 `2 / 4 / 6 / 8`；
- Character pattern 使用 `0 / 1 / 2 / 3`；
- Graphics 资源身份沿用 `namespace + key + contentVersion`；
- 常用 namespace 为 `resource.Graphics`；
- Tileset key：`Tilesets/<tilesetName>`；
- Autotile key：`Autotiles/<name>`；
- Character key：`Characters/<characterName>`。

真正实现时，应优先复用仓库已有 shared type / reader，而不是平行复制一套结构。

### 2.2 Character atlas

Character 图片继续按 4×4 atlas 使用，图片宽高必须可被 4 整除：

```text
frameWidth  = image.width  / 4
frameHeight = image.height / 4

sourceX = pattern * frameWidth
sourceY = ((direction - 2) / 2) * frameHeight
```

Character frame 可以大于 32×32，Presentation 应以 Actor tile 为基准做底部居中显示。

### 2.3 Tileset / Autotile

普通 Tileset 沿用现有 32×32 tile 布局，当前格式每行 8 个 tile。

Autotile 继续使用现有 block/cell 形式。

这些只是资源/渲染格式，不能反向定义 Battle movement/timing。

### 2.4 明确不复用的 Runtime

Battle 不得把以下模块当作 Battle 权威：

- `RPGMapBuilder`；
- `RPGMapHandler`；
- RPGMap movement/timer；
- RPGMap Transfer / Bridge / exploration Runtime；
- RPGMap Browser movement completion。

`lr-map-view` / `lr-map-sprite` 属于 RPGMap Browser/Runtime 细节，不进入 Battle Core。

如果未来 Battle 需要探索语义，必须明确加入 Simulation，而不是从 RPGMap Runtime 隐式继承。

## 3. Presentation 集成

Presentation 的规范性实现合同见 [BATTLE_V0_PRESENTATION.md](./BATTLE_V0_PRESENTATION.md)。该文档当前状态为 **FROZEN + IMPLEMENTED + TESTED + CLOSED-LOOP QUALIFIED**，负责 Render Tree、Browser ABI、坐标/camera/viewport/effect/lifecycle 的 exact v0 行为；本 Integration 文档负责其外部 LoomRealm/Host 组合边界，不再把 Presentation exact ABI 留给实现自行决定。

Presentation 只负责显示，并且必须可以脱离 Decision/Simulation concrete implementation 独立初始化与测试。

业务在构造阶段选择 Presentation implementation；Simulation 通过共享 PresentationPort 提供 `BattleSceneInit` 与已经决定的 RenderProjection/表现命令。Presentation 不需要知道 Decision protocol 或 Simulation reducer 的内部实现。

职责包括：

- Map/Tileset/Autotile 绘制；
- Character Sprite；
- authoritative A→B step 的插值；
- BattleEffect；
- v0 fixed camera framing（无 zoom/focusHint/camera animation）；
- viewport/layout；
- resource load/dispose 生命周期。

### 3.1 Position Projection

active move step 期间：

```text
Simulation committed tile = origin
Presentation screen position = interpolated origin→destination
```

Presentation 不得把插值坐标 reverse-sync 回 Simulation。

### 3.2 Presentation diagnostics

Presentation 可以产生：

```text
animationFinished
assetFailed
viewportChanged
```

这些默认都不是 Battle Rule ACK。

Simulation 不得等待动画完成后才提交移动、扣血、死亡或 BattleResult。

Simulation 可以在权威状态已经由 reducer 决定后调用 `PresentationPort.render(RenderProjection)`。这只发布表现事实；Simulation 不得等待动画完成、Promise 顺序或 Browser ACK 后才推进 Battle Rule。

Simulation 不发布 `visualEpoch`。Presentation 将 RenderProjection 或本地 viewport/camera/layout 变化转换成 RenderDomain visual commit 时，自行维护 `visualEpoch`。

### 3.3 Camera

Camera 完全属于 Presentation。

Simulation 不拥有：

```text
cameraX
cameraY
zoom
focusHint
```

v0 RenderProjection 不携带 camera focus hint。Presentation 按 FROZEN spec 使用 alive actors（若无 alive 则全部 actors）的 movement.to-or-tile bounding midpoint 计算固定 camera，并 clamp 到 Map bounds；无 zoom、camera animation。collection 顺序不承载 camera priority。未来版本可以改变 framing 算法，但必须先修订 Presentation spec，不修改 Simulation authority。

## 4. BattleEffect 表现 — FROZEN

BattleEffect 是 Presentation-only Content。cross-layer 与 Browser 行为已经冻结，实施时不得重新选择另一套 effect model。

Content：

```text
subject = struct.BattleEffect
record key = effect id

image.namespace = resource.Graphics
image.key       = BattleEffects/<...>
anchor          = tile-center
timing          = fade_in_ticks / hold_ticks / fade_out_ticks
```

Simulation 只输出 one-shot `effectStarts[]`：

```ts
type SkillEffectProjection = {
  effectId: string
  result: "hit" | "immune" | "miss" | "invalid"
  effect: string
  tile: GridPosition | null
  startTick: number
}
```

Presentation v0 policy：

```text
hit
→ tile 必须非 null
→ 播放对应 BattleEffect
→ max opacity = 1.0

immune
→ tile 必须非 null
→ 播放同一 BattleEffect
→ max opacity = 0.6

miss / invalid
→ 消费 effectId
→ 不创建 visual
```

fade-in / hold / fade-out 使用 BattleEffect ticks × `tickDurationMs`；Browser 自己维护 ActiveVisualEffect、pause/resume elapsed time、natural cleanup。后续 Simulation Tick 不重复发送“仍在播放”的 effect，Browser 也不向 Simulation 回 ACK。

Browser effect image decode/load 失败只跳过该 transient visual并可发 diagnostic；`struct.BattleEffect` record/资源 identity 在 initialize 阶段无法解析则属于 Presentation fatal，Battle 不启动。

## 5. Decision 实现类型

Decision 是可替换组件，预期可以有：

```text
MockDecision
ScriptDecision
ManualDecision
RandomDecision
LLMDecision
```

Simulation 必须在**没有 Browser、没有真实 LLM**时也能被 Mock/Script 驱动跑完整 Battle。

Decision module 只负责“一次 request 如何得到一次 Plan/failure completion”。`decisionGeneration`、何时创建 Decision Request、Decision Inbox、stale generation fencing、Plan validation、correction retry、bounded active/pending accepted-plan pipeline 与 Replay consume/accept Tick 都属于 Simulation Runtime lifecycle；这些不能下放给业务 composition adapter。

## 6. LLM Decision Adapter

当前仓库公开的 Subsystem surface 还没有冻结 Battle 的最终 LLM 服务接口。

Adapter 最终需要解决：

- LLM 请求位于哪个 Host 层；
- authorization / credential；
- 接收 Simulation 提供的 AbortSignal；
- provider/network timeout 与 service error metadata；
- structured output 解析为 `PlanSubmission` / failure。

Adapter **不提供 gameplay completion timestamp，不计算 dueTick，不直接接受 Plan，也不自行 correction retry**。

固定数据流：

```text
Simulation
  → DecisionPort.decide(request, signal)
        ↓ async
DecisionCompletion
        ↓
Simulation-owned Decision Inbox
        ↓
next reducer snapshot that can see it
        ↓
generation / validation / correction
        ↓
bounded active/pending accepted-plan pipeline
```

Promise resolve / worker message / provider callback 只允许 enqueue completion。即使 Adapter 在同一个 JavaScript turn 中立即拿到结果，也不得重入正在处理的 Tick reducer。

Browser 不应持有模型密钥。

### 6.1 Provider timeout 与 Battle gameplay 分离

Provider/network timeout 是 infrastructure policy。例如模型服务在其配置的时限后返回 timeout，可以产生：

```ts
{
  type: "failed",
  requestId,
  generation,
  error
}
```

这个 failure 和普通 completion 一样进入 Decision Inbox，由后续 Tick reducer 消费。

v0 **没有 Battle gameplay Decision deadline**，也不根据真实 LLM wall-clock latency 计算 `dueTick`。Battle pause 时 LLM 可以完成并 enqueue，但没有 Tick 就不会产生 gameplay effect。

### INTEGRATION-OPEN-003 — Decision Adapter provider detail — OPEN

已经确定：

- 一次 `decide()` = 一次 attempt；
- DecisionCompletion 不带 gameplay timing / dueTick；
- completion callback 只 enqueue 到 Simulation-owned inbox；
- stale / validation / correction / bounded active/pending accepted-plan pipeline 属于 Simulation；
- Simulation 通过 AbortSignal best-effort 取消失效 attempt。

尚未冻结：

- `DecisionFailure` exact enum / provider metadata；
- provider cancel guarantee；
- provider/network timeout defaults；
- model/service limit；
- credential/authorization wiring。

## 7. Player Guidance

未来玩家作为“训练师”给我方下一次 Decision 提供临时 Guidance。

Guidance：

- 必须从授权的 Host/InputTarget 路径进入；
- 只成为下一次 Decision Observation/context；
- 不直接修改 HP、position、protection、damage；
- 不暂停对手时间轴；
- 不保证 AI 一定遵从。

产品方向仍是四张预配置 Guidance 卡。v0 Core 开发阶段可以固定 Guidance 或完全跳过。

### INTEGRATION-OPEN-004 — Guidance Host Wiring — OPEN

InputTarget / Host / Guidance exact contract 尚未冻结。

## 8. Frame / Abort / Subsystem 生命周期

Battle 可以被 LoomRealm Frame/Subsystem 组合使用，但 `game-libs/battle` 本身不等于一个预先构建好的独立 Subsystem 进程。

业务 composition 负责把 Frame/Host 生命周期映射给 Battle Runtime，例如 `frame.signal` abort → `battle.cancel()`、background → `battle.pause()`、resume → `battle.resume()`、Frame/session 离开 → `battle.close()`。真正的 Battle 内部终止/冻结语义仍由 Runtime 执行。

Frame abort / Battle cancel 遵循 `CTRL-001`：

```text
abort/cancel
→ 立即失效 Battle authority/epoch
→ 停 scheduler
→ best-effort cancel Decision/resource
→ Runtime 调用 Presentation.close()
→ Runtime 进入 CLOSED
```

不等待下一个 200 ms Tick。

所有迟到 Decision/Event 都必须因 generation/epoch 校验失败而失去提交权。

正常 BattleResult 使用不同的视觉生命周期：

```text
terminal gate
→ Simulation 产生最终权威状态 / BattleResult
→ 发布 final RenderProjection
→ 停止 Battle scheduler / 新 Action
→ BattleRuntime.run() resolve
→ Runtime 保持 SETTLED + final visual
→ 业务离开 Battle scene
→ battle.close()
→ Runtime 调用 Presentation.close()
→ CLOSED
```

Simulation 不等待 final animation ACK；“保留最终画面”只是 Presentation lifetime，不延长 Battle gameplay authority。这样 normal result 与 abort/cancel 的即时 cleanup 不再混为同一路径。

推荐 Runtime 生命周期：

```text
CREATED
  │ run()
  ▼
INITIALIZING
  │ initialize + initial render
  ▼
RUNNING ⇄ PAUSED
  │ normal result
  ▼
SETTLED
  │ close()
  ▼
CLOSED
```

`cancel()` / abort / fatal failure 可从 INITIALIZING、RUNNING、PAUSED 终止 active authority。`close()` 幂等；如果在仍运行时调用，应等价于“cancel authority + cleanup”，而不是留下半活跃 scheduler。

### 8.1 run() 的单一结果通道

可预期的 session 终止统一通过 `run(): Promise<BattleResult>` 返回：

```text
正常胜负             → ally win / enemy win / simultaneous defeat
cancel / active close → cancelled
已分类 Runtime/Presentation/Decision fatal → failure
```

不要同时维护“同一种失败既可能 `BattleResult.failure` 又可能 Promise rejection”两条业务通道。只有 programmer error / invariant violation（例如非法重复 `run()`、内部不变量被破坏）可以 throw/reject。

Presentation failure 最低分类：

```text
initialize 所需关键资源失败
→ Battle clock 尚未开始
→ Runtime cleanup
→ run() = failure

render / RenderDomain 同步 fatal
→ stop authority
→ cleanup
→ run() = failure

resize/resource/internal callback 的异步 terminal fatal
→ Presentation cleanup + resolve one-shot `presentation.failure`
→ Runtime 观察后 stop authority
→ run() = failure

Browser 可降级的异步视觉资源失败
→ fallback / diagnostic
→ 不改变 gameplay，不终止 Battle
```

## 9. Pause / Background

Pause/background policy 已由 Core `TIME-004` 冻结：

- Host 明确暂停 Battle，或 App/Host 进入 background 状态时，Battle monotonic clock 一起冻结；
- pause 期间不推进 `currentTick`；
- pause 期间 movement、windup、recovery、protection 等 Tick 生命周期不推进；
- Decision completion 可以在 pause 期间进入 inbox，但不会被消费、不会接受 Plan、不会启动 Action；
- resume 后从原逻辑时刻继续，不补算 pause 期间 Tick；已排队 completion 在后续实际 Tick 消费。

Core 的逐 Tick catch-up 仍保留，但只用于 Battle clock **仍在运行**时 scheduler/event loop 晚醒的情况。

## 10. LOS 与 Map 规则

LOS 已由 Core `SKILL-006` 冻结为：**v0 不做 LOS**。

- Tile passability 只影响 movement；
- 不推导 `unwalkable = blocks skill`；
- range matrix + direction + committed tiles 决定技能位置是否合法；
- 即使中间存在不可通行 Tile，只要 target 落在正 coefficient 格，技能范围规则仍成立。

未来如需墙体阻挡、弹道或视线，必须加入新的显式机制。

## 11. Stalemate

Core `RESULT-002` 已冻结：v0 **不设置正式 stalemate，也不设置强制 Battle 最大时长**。

继续记录非权威 diagnostics：

```text
ticksSinceLastDamage
ticksSinceLastPositionChange
decisionCountWithoutProgress
collisionRetryCount
```

这些数据只用于观察实际模拟是否存在长期追逐/无效规划，不改变当前 BattleResult。

如果以后确实需要 stalemate，应作为新版本规则显式加入。

## 12. Workspace / Build 状态

Battle v0 Presentation 已完成 closed-loop qualification；Core Simulation、Decision 与完整 Battle Runtime 仍未实现。

已验证工程状态：

- 根 `package.json` 通过 `game-libs/*` 识别 Battle 和 `@loomrealm-game/tile-presentation`；
- 根 `package-lock.json` 已通过干净 `npm ci`；
- `npm run test:battle` 明确构建 subsystem、renderer、tile-presentation、battle，并运行 Battle unit/Browser E2E；
- Battle package dry-run tarball 包含 `dist/browser/battle.browser.js` 与 `dist/browser/battle.css`。

## 13. 推荐实施顺序

```text
1. 完成其余非 Presentation Content/Contracts validator
2. 实现自驱动 headless Simulation Runtime：Battle clock + scheduler + event queue + reducer
3. 实现 frozen DecisionPort + Mock/Script Decision
4. 跑 frozen-rule deterministic Test Matrix
5. 已完成：@loomrealm-game/tile-presentation layout 抽取 + Map regression
6. 已完成：按 BATTLE_V0_PRESENTATION.md 的 Agent execution contract 完整实现并闭环验证 Presentation
7. 在业务 Subsystem 中做薄 composition：构造三层并映射 Frame/Host lifecycle
8. 接真实 LLM Decision Adapter，再接 Guidance / Host
9. Presentation 已完成：验证 package-lock / npm ci / unit / Browser E2E；未来 Runtime 实现仍需自己的 qualification
```

Presentation implementation 不需要等待真实 LLM、Guidance 或 provider-specific DecisionFailure schema；它只依赖已冻结的 Presentation contracts/ports 与 synthetic Projection fixtures。

## 14. Integration OPEN 汇总

Presentation blocking integration OPEN 已清零。仍未冻结的集成项只包括：

- **INTEGRATION-OPEN-003**：DecisionFailure/provider metadata/cancel guarantee/provider timeout defaults；Decision attempt/inbox/Tick-boundary/retry ownership已确定；
- **INTEGRATION-OPEN-004**：Guidance Host/InputTarget wiring；
- Host/Runtime Control 的具体 suspend/resume 来源如何映射到 `battle.pause()/resume()`；Presentation 的 pause/resume 行为本身已冻结；
- Runtime 开始后还需处理 package-lock / build 验证。

`@loomrealm-game/tile-presentation` 已落地且 Map 已迁移；Battle v0 明确不启用 viewport clamp/default/min/max normalization。Battle Presentation 已冻结、实现并完成 closed-loop qualification；Core Simulation/Decision/full Runtime 仍未实现。

Pause/background、LOS、stalemate 已进入 Core FROZEN 规则，不再属于 Integration OPEN。
