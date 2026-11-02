# PokeMan Battle Integration v1 设计

> 状态：**Proposed / Design-only**
>
> 范围：将已完成 closed-loop qualification 的 Battle v0 组合进真实 PokeMan Game Package / Subsystem / Map / Host 流程。
>
> 本文不重新定义 Battle gameplay rules、Decision protocol、Simulation Runtime 或 Presentation ABI。它们分别以 Battle v0 Spec、Contracts、Simulation、Decision、Presentation 和 Integration 文档为准。
>
> 本文只冻结 PokeMan 侧的组合方式、第一条集成验证路径、数据边界、已知跨模块阻塞与验收标准。

## 1. 目标

PokeMan 当前已经有 Base、Map、Dialogue 三个实际运行的 Subsystem。下一步增加 Battle Subsystem，验证一个真实游戏流程：

~~~text
Map 上看见并接近敌对人物
        ↓
Map 停止当前 controls activation
        ↓
Map 通过 child Frame 调用 Battle
        ↓
Battle 解析 Content / Shared State
        ↓
Decision 提交 PlanSubmission
        ↓
Simulation 自己驱动 200 ms Tick 并权威结算
        ↓
Presentation 显示战斗场景与最终状态
        ↓
Battle Frame 结束
        ↓
Map 创建新的 controls activation 并继续运行
~~~

这次集成至少要证明：

1. Battle Content 能从 PokeMan FSDB 正确解析为 Simulation input。
2. Battle Simulation 能作为独立 child Frame 运行，而不是由 Map 驱动 Tick。
3. Decision 能替换为 Script / Fake 和真实 DeepSeekDecision。
4. Battle Presentation 能在 PokeMan 的 Browser / PWA / Desktop Presentation topology 中加载。
5. Frame abort、Battle cancel、normal result、Presentation failure 能正确收敛。
6. Battle 结束后，Map 能以全新的 controls activation 恢复，不留下重复输入消费者或失效 listener。

**本设计把 Map → Battle → Map 作为第一条必须通过的纵向集成链。** Contract Integrity 的跨战斗连续性也是产品目标，但当前 Battle v0 的 Resolved Actor input 存在一个必须先解决的字段缺口，见第 8 节。没有解决之前，不得宣称完整的 Contract Integrity 持久化闭环已经实现。

## 2. 当前仓库基线

以下是本设计依据的当前 main 状态；它们是实现前提，不代表 Battle 已经接入：

| 位置 | 当前事实 | 对集成的影响 |
| --- | --- | --- |
| PokeMan game.json | 当前注册 base / map / dialogue | 需要注册 battle |
| launch.hostra.json | 当前显式绑定 base / map / dialogue | 需要加入 battle module |
| package.json | 当前没有 Battle package dependency | 需要添加 workspace dependency 并更新 lockfile |
| presentation.json | 当前只有 Schema Form / controls / Map / Dialogue assets | 需要加入 Battle browser JS/CSS |
| map.mjs | 当前 Map 5 有静态 road-bandit placement | 可作为第一条技术验证触发点，但不是正式 Encounter authority |
| map.mjs | 目前只有 Professor placement 标记 interactable | road-bandit 还不能触发 child Frame |
| FSDB Encounter | 当前有 Encounter/2，没有 Encounter/5 | 不应把 Map 5 静态 placement 描述成已完成的 Encounter generation |
| BattleActor | 已有 rival、road-bandit、player | 可复用现有 actor Content |
| BattleSkill | 已有 firebolt、grab | 可复用现有 skill Content |
| BattleEffect | 当前 PokeMan Record 与 Battle v0 contract 不一致 | Presentation 初始化前必须修复 |
| DeepSeek Gate | Base 已把验证后的 key 写入 Session-only Shared State | Battle 可以在同一 Session 中读取并构造 PokeMan-private Transport |

当前已有的关键内容：

- BattleActor/rival：max_hp 18，skills 为 firebolt / grab，角色资源 Characters/RivalCasual。
- BattleActor/road-bandit：max_hp 12，skill 为 grab，角色资源 Characters/RoadBandit。
- BattleSkill/firebolt：damage 7，windup 3 ticks，recovery 2 ticks，effect firebolt。
- BattleSkill/grab：damage 4，windup 1 tick，recovery 1 tick，effect firebolt。
- NPC/road-bandit：名称和角色图片已存在。
- Map 5 的 road-bandit 当前来自 map.mjs 静态 placement；它不是 Encounter/5 Content 解析出来的实例。

当前 PokeMan 的真实启动拓扑仍然是 base → map，Map 可以通过 child Frame 调用 dialogue。新增 Battle 不应改变 Base 的 controls producer ownership，也不应让 Map 直接依赖 Battle Simulation / Presentation concrete classes。

## 3. 第一条集成验证场景

### 3.1 选择 Map 5 的 road-bandit

第一条技术验证使用：

~~~text
Map 5 / 第一条道路

玩家当前随身 Card：
  Relationship(player → rival).contract
  CarriedCards(player) contains rival

Battle：
  ally  = rival Battle Manifestation
  enemy = road-bandit 本体
~~~

这符合 PokeMan 的产品模型：玩家主要以主公身份探索，当前随身从者是主要 Battle 调用对象；敌对普通人物本体也可以直接成为 Battle Actor。

这是一条**技术资格验证场景**，不修改序章的叙事顺序，也不声称已经完成道路 Encounter 系统。当前 Map 5 的静态 placement 只用于尽快验证 child Frame / Battle Runtime / Browser Presentation 的组合。

### 3.2 临时触发边界

第一阶段允许对当前 road-bandit 静态 placement 增加 interactable，并在 Map Subsystem 中识别这个具体 interaction。该触发只服务于集成验证：

- 不新增通用 Encounter Runtime。
- 不新增 EncounterState / defeatedIds 等 Shared State。
- 不把 BattleActor id 的硬编码映射提升为永久 Map 业务规则。
- 不把静态 MAP_ONLY_NPC_PLACEMENTS 变成正式世界数据 authority。

后续 Encounter Content / Story Resolver 落地后，Battle 的来源应来自已解析的 Encounter / Story source；Map 仍只负责把明确的 battle request 交给 Battle Subsystem。

### 3.3 测试状态前置条件

第一条测试场景需要一个有效的当前随身契约：

~~~text
CarriedCards / player
  contains servantCharacterId = rival

Relationship / player:rival
  exists
  contract exists
  contract.integrity is valid
  contract.skills contains existing BattleSkill ids
~~~

目前这些业务流程尚未由当前 Map-only / Dialogue vertical slice 完整建立。第一阶段测试可以通过 Shared State fixture 预置这些记录；不得为了 Battle 集成临时建立第二套 Relationship / Card schema。

若测试只验证 Map → Battle → Map，而尚未完成第 8 节的 initialHp 合同修订，fixture 必须令 contract.integrity = BattleActor/rival.max_hp，并且不得把该次测试描述成验证了跨战斗受损状态恢复。

## 4. 目标组合结构

~~~text
Game Entry
└─ Base Subsystem
   ├─ DeepSeek Session Configuration Gate
   ├─ game-controls-input producer
   └─ frame.call("map")
      └─ Map Subsystem
         ├─ RPGMapBuilder / Map Runtime
         ├─ Map controls activation
         ├─ NPC interaction rendezvous
         │
         ├─ frame.call("dialogue")
         │
         └─ frame.call("battle")
            └─ Battle Subsystem
               ├─ Battle Content Resolver
               ├─ PokeMan DeepSeekTransport
               ├─ DeepSeekDecision
               ├─ BattlePresentationBuilder
               ├─ PokeMan BattleClock
               └─ BattleSimulationBuilder
                  └─ BattleRuntime
~~~

依赖方向：

~~~text
PokeMan Map
  → Battle child Frame contract
      → PokeMan Battle Subsystem
          → Battle public package exports

Battle Subsystem
  → Content / Shared State / Frame / SubsystemScope
  → Battle Decision / Simulation / Presentation public APIs

Battle Simulation
  → BattleClock + AbortSignal + DecisionPort + PresentationPort
  → 不依赖 SubsystemScope / Frame / DOM / RPGMap Runtime
~~~

职责固定：

| 组件 | 职责 | 不负责 |
| --- | --- | --- |
| Map Subsystem | 地图交互、暂停当前 Map controls activation、发起 Battle child Frame、恢复 Map | 解析 BattleSkill、驱动 Battle Tick、写 Battle HP |
| Battle Subsystem | Content / State 解析、构造三层、管理 Battle Frame 生命周期、结算业务结果 | 自己实现战斗规则或 scheduler |
| Content Resolver | 将 FSDB Content / Resource 转成合法的 ResolvedBattleDefinition | 创建第二套 Battle schema |
| DeepSeekTransport | 封装当前 Session credential 与 HTTP transport | 读取或改变 Battle State |
| DeepSeekDecision | 消费 DecisionRequest 并返回 DecisionCompletion | 执行移动、伤害、胜负判定 |
| Simulation | Tick、Plan validation、movement、skill、damage、BattleResult、Replay | 读取 FSDB、DOM、Host lifecycle |
| Presentation | Map / Actor / Effect 的视觉呈现、插值、camera、viewport、资源释放 | 决定任何 Battle Rule |

## 5. Map → Battle child Frame

### 5.1 Map 侧流程

Map 当前已经有可复用的 Dialogue child-Frame 模式。Battle 沿用同一模式：

1. Map 的 NPC interaction callback 只向当前等待中的 interaction waiter 投递事件。
2. Map 先停止当前 controls activation：清空 move intent、reset directional tracker、close consumer。
3. Map 检查 Map Runtime 是否已经 terminal；若仍有效，调用 battle child Frame。
4. 等待 child Frame outcome。
5. 对正常完成的 Battle，Map 不重建 RPGMap Handler；只创建新的 controls tracker / consumer，继续当前地图。
6. Map Frame finally 中仍需 disarm waiter 并幂等关闭当前 activation。

Battle child Frame 期间不能保留 Map controls Consumer，否则同一份 south/start 输入可能同时作用于 Map 和 Battle / Result acknowledgement。

每次恢复都必须创建新的 activation；不得复用已 close 的 Consumer 或已 reset 的 Directional Tracker。

### 5.2 Battle Frame 输入

建议的最小输入只携带来源身份和本次交互时的 Map Runtime 事实，不传递已解析的 Battle 定义：

~~~ts
type PokeManBattleFrameInput = {
  source: {
    mapId: number
    npc: {
      instanceId: string
      npcId: string
      x: number
      y: number
    }
    player: {
      x: number
      y: number
      direction: 2 | 4 | 6 | 8
    }
  }

  // 仅供当前 Map 5 静态 placement qualification bridge 使用。
  // Encounter / Story source 正式落地后，由其 ContentRef 替代此临时来源。
  enemyBattleActor: {
    namespace: "struct.BattleActor"
    key: string
  }
}
~~~

输入约束：

- mapId 必须是正 safe integer。
- instanceId / npcId 必须是非空字符串。
- 坐标必须是 safe integer。
- enemyBattleActor 必须是合法的 struct.BattleActor ContentRef。
- 不接受调用方直接传入 BattleActor / Skill / Effect 的可变对象。
- 不接受 apiKey、transport、DecisionRequest、ResolvedBattleDefinition 或 BattleRuntime。
- Battle Subsystem 必须重新读取和验证 Content / Shared State；不能把 Map caller 当作数据权威。

第一阶段的临时来源映射为：

~~~text
mapId = 5
npc.instanceId = road-bandit
npc.npcId = road-bandit
enemyBattleActor = struct.BattleActor / road-bandit
~~~

Battle 的 ally 不由 Map 任意指定；Battle Subsystem 从 CarriedCards/player 解析当前随身 Card，再读取对应 Relationship / Contract。第一阶段序章随身上限为 1，因此必须恰好解析到 rival。未来多个随身位解锁后，Battle 开始前的出战卡选择是独立产品功能，不在本设计范围内。

### 5.3 Actor 初始位置

第一阶段使用 Map interaction event 提供的玩家位置和 NPC 位置作为两个 Actor 的初始 tile：

- ally rival manifestation：玩家当前 tile / direction。
- enemy road-bandit body：road-bandit 当前 tile；方向从当前 placement/source facts 解析。
- 两个 tile 必须不同、位于 Map bounds 内，且在 Battle passability grid 中可通行。
- 不合法时在初始化 Presentation / 启动 Simulation 前返回明确的 Battle input/content failure；不得悄悄把 Actor 放到任意 tile。

Map interaction event 的现有字段应优先复用；如果未来 Map public event contract 不提供 Battle 所需的来源事实，应先评估 Map public API，而不是读取 RPGMap Runtime internal state。

## 6. Battle Subsystem 组合

### 6.1 Content Resolver

Battle Subsystem 负责把 FSDB Content 转成 Battle v0 的纯数据输入：

1. 读取来源 Map、Tileset、Autotile 与 Battle Presentation 所需资源。
2. 将 Map / Tileset authored movement facts 转成 Battle Simulation 要求的 width / height / passable[y][x]。
3. 读取 ally 的基础 BattleActor，验证 Relationship Contract 的 integrity 与 skills。
4. 读取 enemy BattleActor。
5. 读取双方实际使用的 BattleSkill。
6. 对每个 Skill.effect 读取对应 BattleEffect。
7. 验证所有 record key 与 definition id 一致，所有 ContentRef / ResourceRef 存在，资源 contentVersion 合法。
8. 生成 detached、immutable 的 ResolvedBattleDefinition。

PokeMan 直接复用 Battle v0 的 BattleActor / BattleSkill / BattleEffect contracts，不建立 PokeMan 私有的 BattleProfile、Skill 或 Effect schema。

Simulation 只接收纯数据；Battle Presentation 仍由 BattlePresentationBuilder 使用 SubsystemScope / Frame 读取视觉资源。Battle Subsystem 不得把 RPGMap Handler、Map timer 或 Map movement completion 注入 Battle Core。

Battle passability 是 Battle 的 Simulation input，不是 RPGMap Runtime authority。实现必须按 Battle v0 Integration 对 Map 内容的要求生成纯数据；不得把 RPGMap Runtime movement、timer、transfer 或 Browser completion 当作 Battle Rule。若现有 Map public API 不足以复用 passability 计算，应使用受测试保护的纯 Content projection，而不是导入 Map package internal / dist/internal。

### 6.2 三层构造顺序

推荐组合顺序：

~~~ts
const presentation =
  new BattlePresentationBuilder(scope, frame).build()

const decision =
  new DeepSeekDecision({ transport })

const runtime =
  new BattleSimulationBuilder({
    clock,
    signal: frame.signal,
    decision,
    presentation,
  }).build(resolvedDefinition)

const result = await runtime.run()
~~~

这是概念调用顺序，不是要求把所有代码写在一个函数中。Content / Shared State 验证应在启动 Runtime 前完成；每场 Battle 必须创建新的 Builder / Handler / Runtime。Presentation Builder 和 Simulation Builder 都是 one-shot，不得跨 Battle 复用。

Simulation 自己拥有 BattleClock、200 ms scheduler、Tick reducer 和 Decision lifecycle。业务层不得建立第二个 setInterval，也不得在 Map callback 中调用公开 tick。

Runtime 注入 Presentation 后，pause / resume / close 的 lifecycle ownership 归 Runtime。Application 不直接操作 Presentation Handler。

### 6.3 BattleClock

PokeMan 提供最薄的 BattleClock adapter：

~~~ts
interface BattleClock {
  nowMs(): number
  schedule(delayMs: number, callback: () => void): () => void
}
~~~

生产实现使用 monotonic time source 和可取消的 scheduler wake；测试使用 FakeBattleClock。Scheduler callback 只唤醒 Simulation 自己的调度器，不承载 Battle Rule，也不把 wall-clock calendar time 作为 gameplay authority。

## 7. Content 与 Presentation 资源

### 7.1 已有 BattleActor / Skill

当前可复用：

| Content | 已有定义 | 本场用途 |
| --- | --- | --- |
| BattleActor/rival | 18 HP、firebolt / grab、Characters/RivalCasual | Ally 基础 Actor |
| BattleActor/road-bandit | 12 HP、grab、Characters/RoadBandit | Enemy 本体 Actor |
| BattleSkill/firebolt | 7 damage、3 windup / 2 recovery、effect firebolt | Rival skill |
| BattleSkill/grab | 4 damage、1 windup / 1 recovery、effect firebolt | 双方近身 skill |

Ally 的实际技能来源遵循 PokeMan Contract 语义：已有 Contract 使用 contract.skills[]；BattleActor.skills[] 是基础 baseline / 新 Contract 初始化来源。不得每场 Battle 都用 BattleActor.skills[] 覆盖已经成立 Contract 的技能集。

### 7.2 BattleEffect 当前不符合 v0 contract

这是当前内容层的明确阻塞：

- PokeMan 的 BattleEffect/.info.meta 目前仍是旧的 graphics / name / id shape。
- BattleEffect/firebolt.json 目前只有 id / name。
- Battle v0 要求 exact fields：id、image、anchor、timing。
- image 必须指向 resource.Graphics，key 必须位于 BattleEffects/ 前缀。
- anchor 固定为 tile-center。
- timing 必须包含 fade_in_ticks、hold_ticks、fade_out_ticks；总时长不能为零。
- 当前 PokeMan Graphics 还没有 BattleEffects 资源目录。

实施时必须同步修正 BattleEffect schema / Record，并提供至少一个可加载的 BattleEffects/firebolt 资源。不要通过放宽 Battle Core validator 或把 BattleEffect 改成 Skill-local animation 来绕过跨层合同。

### 7.3 Browser artifact

PokeMan Presentation 需要注册 Battle package 已发布的 browser artifacts：

~~~text
@loomrealm-game/battle/browser/battle.browser.js
@loomrealm-game/battle/browser/battle.css
~~~

在 PokeMan：

- presentation.json 增加 Battle CSS / JS resource entries。
- [resource]Presentation 增加对应同步产物。
- 现有 scripts/sync-map-presentation.mjs 扩展 Battle browser artifact 的 build / copy / SHA-256 verification；不要建立一条与现有同步流程竞争的旁路。
- sync script 的 check-only 路径必须验证 Battle source / dist / FSDB target 一致。
- Desktop / play.bat 和 PWA build 都使用同一组 Presentation resource identity。

Battle package 已提供 browser JS/CSS exports；PokeMan 只消费 package exports，不复制或 fork Battle Browser implementation。

## 8. Contract Integrity 与 Battle initial HP 缺口

### 8.1 PokeMan 的目标语义

对 rival Battle Manifestation：

~~~text
BattleActor/rival.max_hp
  = Contract Integrity 上限

Relationship/player:rival.contract.integrity
  = 本场 Battle 初始 HP

Relationship/player:rival.contract.skills[]
  = 本场实际可用 Skill ids

BattleSnapshot ally actor.hp
  = 本场结束后的 Contract Integrity 候选值
~~~

BattleResult 本身只表示 ally_win / enemy_win / simultaneous_defeat / cancelled / failure；最终 HP 必须从 BattleRuntime.getSnapshot() 读取，不得从 BattleResult 推导。

Enemy road-bandit 是本体参战，其本场 HP 不写入 rival Contract，也不创建临时 Relationship。

### 8.2 当前 Battle v0 无法表达受损 Contract 的初始 HP

当前 ResolvedBattleActor 只有 maxHp，没有 initialHp；Simulation 初始化时固定：

~~~text
ActorRuntimeState.hp = ActorRuntimeState.maxHp
ActorRuntimeState.maxHp = ResolvedBattleActor.maxHp
~~~

因此当前 public contract 无法同时表达：

~~~text
maxHp     = BattleActor/rival.max_hp
initialHp = Relationship/player:rival.contract.integrity
~~~

如果把 maxHp 直接设置成 contract.integrity，Battle HUD 的最大值也会变成当前完整度，受损卡片在每场 Battle 开始时又会显示为满血；这不是正确的产品语义，不能作为 workaround。

**设计结论：完整 Contract Integrity 闭环需要一个独立的 Battle Core contract amendment。** 建议由单独的 Battle Core 变更审议一个明确的 initialHp 输入（或等价的初始 Actor HP 字段），其约束为：

- maxHp 仍来自 BattleActor.max_hp。
- initialHp 来自 Contract.integrity。
- 0 <= initialHp <= maxHp；如果 initialHp 为 0，PokeMan 不应启动该 Contract 的 Battle Manifestation。
- 未提供 initialHp 的既有 Battle callers 保持以 maxHp 初始化的兼容语义。
- Simulation validator、initial snapshot、RenderProjection、Replay definition / validation 和 deterministic tests 同步覆盖该字段。
- Battle Core 不读取 Relationship、Contract 或 PokeMan Content；它只接收已解析的数值。

该字段不在本设计 PR 中修改 Battle Core，也不允许 PokeMan 通过伪造 maxHp 绕过它。

### 8.3 分阶段状态结算

在 initialHp contract amendment 完成前：

- 可以先用 integrity = max_hp 的 fixture 验证 Map → Battle → Map。
- 不宣称已经验证受损 Contract 的跨战斗恢复。
- 不把当前 Snapshot HP 写回长期 Contract，避免下一场 Battle 丢失正确的最大值语义。

initialHp contract amendment 完成后，PokeMan Battle Subsystem 才启用完整结算：

1. Battle 开始前读取 Relationship Record 和 version，验证 Contract / Card / BattleActor invariant。
2. 将当前 integrity 作为 initialHp，将 BattleActor.max_hp 作为 maxHp。
3. Battle 正常结束后读取 final Snapshot。
4. 只把 ally rival 的最终 hp 作为该 Contract 的 integrity 更新候选值。
5. 用 Shared State version condition 提交 Relationship Record 更新；保留 affinity、hostile、relationshipText、skills 等其他字段。
6. 对 CONFLICT / OUTCOME_UNKNOWN 做读取与结果 reconciliation；不得盲目覆盖或无条件重试。
7. cancelled / failure 不提交本场部分 HP 损耗；Frame abort 也不得留下半提交 Contract。

Shared State 写入只发生在 Battle 正常 terminal 之后，不按 Tick 写入。不得新增 BattleRuntime HP Record，也不得把 live BattleSnapshot 变成 Shared State 的第二份 authority。

## 9. DeepSeek Decision 与 credential 边界

当前 PokeMan 已经由 Base Gate 把验证成功的 key 保存到 Session-only Record：

~~~text
pokeman.SessionConfig / deepseek
  { apiKey }
~~~

PokeMan 当前阶段明确采用 product-private transport 例外：

~~~text
Battle Subsystem
  → read pokeman.SessionConfig/deepseek
  → construct PokeMan-private DeepSeekTransport
  → new DeepSeekDecision({ transport })
  → inject DecisionPort into BattleSimulationBuilder
~~~

DeepSeekDecision 的 public constructor 只接收 configured DeepSeekTransport，不接收 apiKey。Transport 实现 provider HTTP / request body / Authorization header；Battle Simulation、Replay、Presentation 和 Frame params 都不能获得 credential。

固定约束：

- 不新增通用 Framework credential service / network service。
- 不把 key 放入 Battle Frame params、ResolvedBattleDefinition、DecisionRequest、Replay、RenderProjection、logs 或 error metadata。
- Transport 使用当前 Frame signal 取消 in-flight request。
- Base startup probe 通过不等于后续每次 Decision 都一定成功；Battle 必须按已冻结的 Decision failure / availability circuit semantics 处理运行期错误。
- PWA Worker 和 Hostra / Desktop 必须分别验证真实 provider request 可达；不得用 Mock 结果声称真实网络已通过。

第一轮 deterministic integration tests 使用 ScriptDecision / fake DecisionPort，不需要真实 key。之后再做真实 DeepSeek qualification。

## 10. Frame、Pause 与 Result 生命周期

### 10.1 Abort / Cancel

Battle Runtime 使用当前 Battle Frame 的 frame.signal：

~~~text
Frame signal abort
  → BattleRuntime cancel authority
  → stop Battle scheduler
  → cancel in-flight Decision best-effort
  → Presentation cleanup
  → run() returns cancelled
~~~

Battle Subsystem 负责观察 run() 的 BattleResult，并将可预期结果映射为 Subsystem Frame outcome。不得让同一个可预期的 Battle failure 一部分通过 BattleResult、另一部分又以普通 Promise rejection 暴露。

Programmer error / contract invariant violation 仍按 Battle Core contract throw / reject，不包装成普通 gameplay outcome。

### 10.2 Normal Result

Normal BattleResult 后，Simulation 进入 SETTLED 并保留 final Projection / Presentation。Battle Frame 在结算和最小结果确认完成前持有本场 Handler；真正离开 Battle Frame 时才调用 battle.close()，由 Runtime 关闭 Presentation。

Map 不应在 Battle Result 同一时刻提前 close Battle Presentation，也不应在 Battle child Frame 尚未返回时重新激活 Map controls。

Battle Result acknowledgement 只用于“查看结果后继续”，不等于 PlayerGuidance，也不向 Simulation 提交战术 Plan。

### 10.3 Decision circuit pause 与 Host background

Battle v0 已冻结 Decision availability circuit：达到阈值后 Runtime 进入现有 PAUSED lifecycle，需要显式 resume。PokeMan 必须处理 paused 状态，不能让用户无限等待。

但当前 BattleSnapshot 公开的 status 只有 paused，没有可区分 circuit pause / Host background / application pause 的 reason。Battle Integration 也明确把产品级 pause-reason / retry UI 与 Host lifecycle composition 留作 OPEN。

因此：

- PokeMan 不得根据某个 HTTP error 猜测 Runtime pause reason。
- Host foreground 不得无条件 resume 任意 paused Battle，否则可能错误地解除 Decision circuit pause。
- Host background → Battle.pause()、Host foreground → 对应 external pause resume 的来源和 ownership 必须在 Host lifecycle 接线时单独验证。
- 若产品要求显示精确 pause reason，先审议最小公开 diagnostics / lifecycle signal；不得由 PokeMan 读取 Simulation internal state。

这是进入真实 Host qualification 前的明确 OPEN，不因 Frame abort 已经接通而自动解决。

## 11. Battle Frame 返回值

Map 只需要知道 child Frame 是否正常完成、Battle 的业务结果类别，以及是否完成必要的持久化结算。Map 不需要 Snapshot、Replay、Content 或 provider data。

建议 Battle Frame 的正常业务结果保持为小型 detached value：

~~~ts
type PokeManBattleOutcome = {
  battleId: string
  result: "ally_win" | "enemy_win" | "simultaneous_defeat"
  settlement: "not-applicable" | "committed"
}
~~~

第一阶段没有 initialHp / Contract Integrity 写回时，settlement 使用 not-applicable；完成 Core amendment 后才允许 committed。

cancelled / failure 通过 Subsystem 的标准 Frame outcome 表达。Battle Result、Snapshot、Replay 不能被 Map 当作新的长期状态源。

## 12. 测试与验收

### 12.1 Content Resolver

- 正确解析 rival / road-bandit BattleActor。
- BattleActor record key 与 value.id 不一致时拒绝。
- Skill 引用缺失、effect 引用缺失、ResourceRef 不存在或 contentVersion 非法时拒绝。
- BattleEffect exact schema 校验通过；旧的 graphics/name shape 被拒绝。
- Map bounds、passability、初始 tile 重叠或不可通行时拒绝。
- 输出为 detached immutable ResolvedBattleDefinition。

### 12.2 Battle Subsystem

使用 FakeBattleClock、ScriptDecision / fake DecisionPort、RecordingPresentation：

- 正常 ally_win / enemy_win / simultaneous_defeat。
- Presentation initialize / render / failure / close 的生命周期。
- Frame signal pre-abort 与 active abort。
- Decision failure、circuit pause、显式 resume。
- Battle Frame 每次创建新的 Builder / Handler / Runtime。
- close / abort / failure 后不残留 scheduler、resource listener 或 controls consumer。

### 12.3 Map child-Frame integration

沿用 dialogue-gameplay-vertical-slice 的测试风格：

- road-bandit 是当前唯一新增的 Map 5 interaction target。
- south / start 的重复输入不会重复发起 Battle。
- 调用 battle 前 Map move intent 被清空，旧 controls Consumer 已 close。
- child Frame 正常返回后创建新的 controls Consumer / Directional Tracker。
- Battle 运行期间 Map terminal、Frame abort 和 child failure 不会产生双重恢复或重复 child call。
- Battle 返回后 Map Handler 仍是原来的 session，不重建地图或重置玩家位置。

### 12.4 Browser / Product qualification

- Battle browser JS/CSS 通过统一 Presentation sync script 进入 FSDB。
- Browser E2E 验证地图、两个 Actor、移动、技能效果、HP 与最终状态。
- PWA / Chromium 验证真实 Worker / Presentation 资源路径。
- Desktop / Hostra 验证 launch manifest、Frame lifecycle、provider transport 和 Browser assets。
- 至少重复进入两场 Battle，验证资源和 listener 正确释放。
- 在真实 DeepSeek qualification 中验证请求、合法 PlanSubmission、Decision failure 与 circuit pause / resume。
- initialHp amendment 合并后，额外验证受损 Contract 进入下一场 Battle 时保留原始 maxHp 和正确的初始 HP，并验证 OCC settlement / conflict / outcome-unknown reconciliation。

未运行的真实 PWA、Desktop、Hostra 或 DeepSeek 测试不得用 unit / Mock 结果代替。

## 13. 实施顺序

建议分成以下可独立验收的阶段：

| 阶段 | 内容 | 通过标准 |
| --- | --- | --- |
| P0 — Contract / baseline | 先审议 initialHp 缺口、Host pause reason / lifecycle OPEN；记录 PokeMan 当前基线 | 不在实现中临时发明 Core API |
| P1 — Content / package | 添加 Battle dependency、BattleEffect 修正、Battle graphics、Browser artifact sync | Content validator / package / sync check 通过 |
| P2 — Headless composition | 新建 Battle Subsystem、Resolver、FakeClock、ScriptDecision composition | 不启动 Browser 也能完成确定性 1v1 |
| P3 — Map vertical slice | Map 5 road-bandit 临时交互、child Frame、Map controls fresh resume | Map → Battle → Map 可重复运行 |
| P4 — DeepSeek transport | 从 SessionConfig 构造 PokeMan-private transport，接入 DeepSeekDecision | PWA / Hostra 的真实 provider request 可观察且可取消 |
| P5 — Contract continuity | Battle Core initialHp contract amendment + OCC settlement | 受损 Contract 可正确跨多场 Battle 持续 |
| P6 — Product qualification | Browser / PWA / Desktop / Host lifecycle / failure / replay | 真实宿主的端到端证据完整 |

P0 中的 Battle Core contract amendment 应由独立变更审议和落地；本设计 PR 不修改 Battle Core。P2–P4 可以先用满 Integrity fixture 验证 Battle flow，但不能把该阶段标记为 Contract Integrity closed-loop complete。

## 14. 明确非目标

本轮不做：

- PlayerGuidance、手动提交战术 Plan 或 Battle 内玩家操控。
- 多 Actor / 2v2 / 多张随身卡选择。
- 通用 Encounter generation、Map 5 Encounter Content、随机 spawn / defeated persistence。
- Story Graph、完整 Relationship / Contract 建立剧情或 Card 管理 UI。
- Save / Load 与跨 Session credential persistence。
- 通用 Framework credential / network capability。
- 修改 Battle movement / skill / damage / LOS / stalemate 等 Core gameplay rules。
- 为 PokeMan 复制 Battle Simulation、Decision 或 Browser Renderer。
- 把 Map Runtime timer / movement / Browser completion 复用为 Battle authority。

## 15. 参考文档

PokeMan：

- [30-battle.md](./30-battle.md) — Battle、Contract Integrity、1v1 与长期产品语义。
- [40-encounter-loop.md](./40-encounter-loop.md) — Visible Encounter、Hostile / Challenge 与 Map 回流。
- [50-mvp-prologue.md](./50-mvp-prologue.md) — 序章地图绑定与第一次 Battle。
- [66-data-authority.md](./66-data-authority.md) — Content / Shared State / Runtime Memory authority。
- [67-shared-state-records.md](./67-shared-state-records.md) — Relationship / Contract / CarriedCards 物理 Record。
- [76-deepseek-session-configuration.md](./76-deepseek-session-configuration.md) — Session credential 与 PokeMan-private DeepSeek Transport 边界。
- [73-dialogue-gameplay-vertical-slice.md](./73-dialogue-gameplay-vertical-slice.md) — Map child Frame / controls activation 参考实现。

Battle：

- [BATTLE_V0_INTEGRATION.md](../../../game-libs/battle/docs/BATTLE_V0_INTEGRATION.md)
- [BATTLE_V0_CONTRACTS.md](../../../game-libs/battle/docs/BATTLE_V0_CONTRACTS.md)
- [BATTLE_V0_SIMULATION.md](../../../game-libs/battle/docs/BATTLE_V0_SIMULATION.md)
- [BATTLE_V0_DECISION.md](../../../game-libs/battle/docs/BATTLE_V0_DECISION.md)
- [BATTLE_V0_PRESENTATION.md](../../../game-libs/battle/docs/BATTLE_V0_PRESENTATION.md)
