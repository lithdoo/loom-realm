# PokeMan Battle Integration v1 设计

> 状态：**Proposed / Design-only**
>
> 范围：将已完成 closed-loop qualification 的 Battle v0 组合进真实 PokeMan Game Package / Subsystem / Map / Host 流程。
>
> 本文不重新定义 Battle gameplay rules、Decision protocol、Simulation Runtime 或 Presentation ABI。它们分别以 Battle v0 Spec、Contracts、Simulation、Decision、Presentation 和 Integration 文档为准。
>
> 本文只冻结 PokeMan 侧的组合方式、第一条集成验证路径、数据边界、已知跨模块阻塞与验收标准。

## 1. 目标

PokeMan 当前已经有 Base、Map、Dialogue 三个实际运行的 Subsystem。第一条 Battle 纵向集成不再从道路路霸遭遇开始，而是采用序章中更有代表性的 **Map 4 研究所：博士 → 劲敌 → Battle → 战后 Dialogue** 流程。

~~~text
Map 4 / 研究所
玩家与博士交互
        ↓
Map 暂停当前 controls activation
        ↓
Dialogue child Frame：博士
        ↓ completed(ready)
Dialogue child Frame：劲敌
        ↓ completed(accepted-challenge)
Battle child Frame
  ally  = 玩家调用的「宿敌 Battle Manifestation」
  enemy = 劲敌调用的「主角 Battle Manifestation」
        ↓
Battle Simulation 自己驱动 200 ms Tick 并权威结算
        ↓
Battle Subsystem 原子结算双方 Contract Integrity
        ↓
Battle Frame 返回结构化 BattleOutcome
        ↓
Map 根据 ally_win / enemy_win / simultaneous_defeat
选择并调用对应的战后 Dialogue child Frame
        ↓
战后 Dialogue 完成
        ↓
Map 创建新的 controls activation，继续研究所地图
~~~

这次集成至少要证明：

1. 博士、劲敌和战后 Dialogue 能作为独立 child Frame 顺序运行。
2. Map 是这条固定序章流程的临时编排者；Dialogue 不直接调用 Battle，Battle 不直接调用 Dialogue。
3. Battle Content 能从 PokeMan FSDB / Shared State 正确解析为双方 Battle Manifestation。
4. Battle Simulation 能作为独立 child Frame 运行，而不是由 Map 驱动 Tick。
5. Decision 能替换为 Script / Fake 和真实 DeepSeekDecision。
6. Battle Presentation 能在 PokeMan 的 Browser / PWA / Desktop Presentation topology 中加载。
7. Battle 结束后，双方 Contract Integrity 能通过同一个 Shared State transaction 原子结算。
8. Map 能按 BattleResult 选择战后 Dialogue，并在整条流程结束后安全恢复输入。

**第一条产品纵向切片是 Map 4 的博士—劲敌—Battle—战后对话。** Map 5 的 road-bandit 保留为后续普通 Encounter / 本体参战验证，不再作为第一次 Battle 的入口。

当前 Battle v0 的 Resolved Actor input 仍存在 initialHp 字段缺口，见第 8 节。它不阻止两份全新、满 Integrity Contract 进行第一次教学战斗，但会阻止后续 Battle 正确恢复已经受损的 Integrity；不能把一次满血首战误报成完整的跨战斗连续性验证。

## 2. 当前仓库基线

以下是本设计依据的当前 main 状态；它们是实现前提，不代表 Battle 已经接入：

| 位置 | 当前事实 | 对集成的影响 |
| --- | --- | --- |
| PokeMan game.json | 当前注册 base / map / dialogue | 需要注册 battle |
| launch.hostra.json | 当前显式绑定 base / map / dialogue | 需要加入 battle module |
| package.json | 当前没有 Battle package dependency | 需要添加 workspace dependency 并更新 lockfile |
| presentation.json | 当前只有 Schema Form / controls / Map / Dialogue assets | 需要加入 Battle browser JS/CSS |
| map.mjs / Map 4 | 已有 professor 与 rival-lab 两个静态 placement；Professor 可交互，rival-lab 目前不可交互 | 可直接以 Professor interaction 启动序章链；rival-lab 作为劲敌对话 / 战斗场景定位 |
| map.mjs | 当前只等待 Professor interaction 并调用 professor-vertical-slice Dialogue | 需要扩展为多个 child Frame 的顺序编排 |
| Dialogue/lab-rival-intro.json | 已有劲敌开场对白与「接受挑战 / 再等等」选项，但两个 choice 当前都指向自身 | 需要把 choice 结果接入 accepted-challenge / deferred 分支 |
| BattleActor/player | 已有主角本体基础定义：max_hp 20、firebolt | 作为劲敌调用的主角 Battle Manifestation 基础定义 |
| BattleActor/rival | 已有宿敌本体基础定义：max_hp 18、firebolt / grab | 作为玩家调用的宿敌 Battle Manifestation 基础定义 |
| BattleActor/road-bandit | 已有路霸基础定义 | 后续 Map 5 Encounter 验证再使用 |
| BattleSkill | 已有 firebolt、grab | 可复用现有 skill Content |
| BattleEffect | 当前 PokeMan Record 与 Battle v0 contract 不一致 | Presentation 初始化前必须修复 |
| DeepSeek Gate | Base 已把验证后的 key 写入 Session-only Shared State | Battle 可以在同一 Session 中读取并构造 PokeMan-private Transport |
| PokeMan prologue design | 已定义玩家与宿敌建立双向 Contract，双方互持对方 Card，教学 Battle 为双方 Battle Manifestation 对战 | 本集成必须按双向 Relationship / Contract 解析，不得再把 road-bandit 当成第一场对手 |

当前已有的关键内容：

- Map 4 的 Professor placement：instanceId = professor，位置 (10, 6)，当前可交互。
- Map 4 的 rival-lab placement：instanceId = rival-lab，位置 (8, 5)，当前尚未接入 Dialogue / Battle 流程。
- Dialogue/lab-rival-intro 已存在，但当前 choice target 还没有表达 Battle 接受 / 延后语义。
- BattleActor/player：max_hp 20，skills 为 firebolt，角色资源 Characters/Player。
- BattleActor/rival：max_hp 18，skills 为 firebolt / grab，角色资源 Characters/RivalCasual。
- BattleSkill/firebolt：damage 7，windup 3 ticks，recovery 2 ticks，effect firebolt。
- BattleSkill/grab：damage 4，windup 1 tick，recovery 1 tick，effect firebolt。
- BattleActor/road-bandit 与 Map 5 的静态 road-bandit placement 仍然存在，但属于后续道路 Encounter 场景。

当前 PokeMan 的真实启动拓扑仍然是 base → map，Map 可以通过 child Frame 调用 dialogue。新增 Battle 不应改变 Base 的 controls producer ownership，也不应让 Map 直接依赖 Battle Simulation / Presentation concrete classes。

## 3. 第一条集成验证场景

### 3.1 Map 4：博士 → 劲敌 → Battle → 战后 Dialogue

第一条技术与产品验证固定在研究所 Map 4：

~~~text
玩家在 Map 4 与 Professor 交互
  ↓
Dialogue / professor-vertical-slice
  ├─ ready      → 继续序章链
  ├─ not-yet    → 返回 Map，等待以后再次交互
  └─ cancelled  → 返回 Map，不启动后续阶段
  ↓ ready
Dialogue / lab-rival-intro
  ├─ accepted-challenge → 进入 Battle
  ├─ deferred           → 返回 Map，不进入 Battle
  └─ cancelled          → 返回 Map，不进入 Battle
  ↓ accepted-challenge
Battle / lab-rival-tutorial
  ↓ normal BattleResult
Dialogue / lab-rival-after-ally-win
或 lab-rival-after-enemy-win
或 lab-rival-after-draw
  ↓ completed
恢复 Map controls
~~~

这是一个固定的序章流程，不是通用 Story Graph。v1 由 Map Frame 顺序调用 child Frame；Map 只负责流程推进和分支选择，不承载对话内容、战斗规则或 Contract mutation。

用户明确接受挑战后才进入 Battle。若本轮产品希望无选择地自动开战，也应由 Dialogue 的明确 completed outcome 表达，不允许 Map 根据对白文本或 choice label 猜测玩家意图。

### 3.2 Dialogue 的职责与返回值

博士 Dialogue 使用当前已有的 professor-vertical-slice 业务结果：

- ready：博士阶段完成，Map 继续调用劲敌 Dialogue。
- not-yet / cancelled：结束本次序章链，返回 Map。
- child Frame failed / lifecycle cancelled：不推进下一阶段。

劲敌 Dialogue 使用现有 lab-rival-intro Content 作为起点，但当前两个 choices 都指向自身，尚未形成可供 Map 消费的挑战结果。实现时需要让 Dialogue child 返回明确的业务结论，例如：

~~~ts
type RivalIntroConclusion =
  | "accepted-challenge"
  | "deferred"
  | "cancelled";
~~~

只有 accepted-challenge 才能调用 Battle。Dialogue 本身不调用 Battle，也不负责创建 Battle Runtime。

战后 Dialogue 是独立的 Dialogue child Frame。建议先定义三个明确的 Content key：

- lab-rival-after-ally-win
- lab-rival-after-enemy-win
- lab-rival-after-draw

它们分别承接 ally 胜利、enemy 胜利和平局 / simultaneous defeat。第一轮文案可以很短，但必须让结果有可观察的剧情反馈。

### 3.3 第一场 Battle：双方互相调用对方的 Battle Manifestation

这场教学 Battle 不是宿敌本体对路霸，而是序章既定的双向角色卡对战：

~~~text
玩家持有宿敌 Card
  → Relationship(player → rival).contract
  → BattleActor/rival
  → ally / 玩家一方的 Battle Manifestation

宿敌持有玩家 Card
  → Relationship(rival → player).contract
  → BattleActor/player
  → enemy / 劲敌一方的 Battle Manifestation
~~~

因此本场固定：

- ally Actor identity：rival，使用玩家持有的宿敌 Card 对应 Contract。
- enemy Actor identity：player，使用宿敌持有的主角 Card 对应 Contract。
- 两边都是 Battle Manifestation；战斗 HP 表示各自方向 Contract 的 Integrity，不是两个人物本体受到物理伤害。
- BattleActor/rival 与 BattleActor/player 只提供基础 max HP / baseline skills / character resource；已有 Contract 的实际 Integrity 和 skills 来自各自 Relationship。

### 3.4 Battle 前置业务状态

进入 Battle 前必须验证双向关系与随身事实：

~~~text
CarriedCards(player)
  contains servantCharacterId = rival

Relationship(player → rival)
  exists
  contract exists
  contract.integrity is valid
  contract.skills[] references valid BattleSkill ids

CarriedCards(rival)
  contains servantCharacterId = player

Relationship(rival → player)
  exists
  contract exists
  contract.integrity is valid
  contract.skills[] references valid BattleSkill ids
~~~

博士 / 劲敌阶段的序章状态推进必须建立这两份 Relationship Contract 和双方 Card。该业务 mutation 不属于 Battle，也不应隐藏在 Map 的 NPC callback 中；应由 PokeMan 当前正式的 Dialogue outcome / Event / Shared State business owner 完成。若现有 Dialogue slice 尚未具备该 mutation 能力，应将其作为本 vertical slice 的显式前置工作，不得通过 Battle Frame params 伪造已成立的 Contract。

第一场教学 Battle 使用刚建立的满 Integrity Contract，因此当前 Battle v0 默认 initialHp = maxHp 的行为可以正确启动首战。首战后的 Integrity 写回和后续 Battle 恢复规则见第 8 节。

### 3.5 后续场景：Map 5 road-bandit

Map 5 的 road-bandit 仍然是很好的第二条 Battle 验证路径，但它验证的是不同语义：

- enemy 是 road-bandit 本体，不是 Contract Battle Manifestation。
- 本体 HP 是本场战斗状态，不写入 rival / player Contract。
- 需要 Encounter / Story source 提供合法的 NPC instance 与 BattleActor identity。
- 当前 Map 5 只有静态 placement，尚没有 Encounter/5 Content。

因此 road-bandit 不再作为第一次 Battle 的入口；等 Map 4 教学链通过后，再用它验证普通 NPC 本体参战。

## 4. 目标组合结构

~~~text
Game Entry
└─ Base Subsystem
   ├─ DeepSeek Session Configuration Gate
   ├─ game-controls-input producer
   └─ frame.call("map")
      └─ Map Subsystem / Map 4 prologue sequence
         ├─ RPGMapBuilder / Map Runtime
         ├─ Map controls activation
         ├─ Professor NPC interaction rendezvous
         │
         ├─ frame.call("dialogue", professor-vertical-slice)
         │
         ├─ frame.call("dialogue", lab-rival-intro)
         │
         ├─ frame.call("battle", lab-rival-tutorial)
         │  └─ Battle Subsystem
         │     ├─ Bilateral Contract / Card Resolver
         │     ├─ Battle Content Resolver
         │     ├─ PokeMan DeepSeekTransport
         │     ├─ DeepSeekDecision
         │     ├─ BattlePresentationBuilder
         │     ├─ PokeMan BattleClock
         │     └─ BattleSimulationBuilder
         │        └─ BattleRuntime
         │
         ├─ frame.call("dialogue", result-specific post-battle key)
         │
         └─ Map creates a fresh controls activation
~~~

依赖方向：

~~~text
PokeMan Map
  → Dialogue child Frame contract
  → Battle child Frame contract
      → PokeMan Dialogue / Battle Subsystems

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
| Map Subsystem | Professor interaction、序章 child Frame 顺序、BattleResult → post-battle Dialogue 选择、恢复 Map controls | 对话内容、战斗规则、Contract HP 写入 |
| Dialogue Subsystem | 当前对话 session、choice / conclusion、返回结构化业务结果 | 直接调用 Battle 或修改 Battle Runtime |
| Battle Subsystem | 双向 Card / Contract 解析、Content 解析、构造三层、Battle 生命周期、双方 Integrity 结算 | 自己决定剧情台词或调用 Dialogue |
| Content Resolver | 将 FSDB Content / Resource / Contract facts 转成合法 ResolvedBattleDefinition | 创建第二套 Battle schema |
| DeepSeekTransport | 封装当前 Session credential 与 HTTP transport | 读取或改变 Battle State |
| DeepSeekDecision | 消费 DecisionRequest 并返回 DecisionCompletion | 执行移动、伤害、胜负判定 |
| Simulation | Tick、Plan validation、movement、skill、damage、BattleResult、Replay | 读取 FSDB、DOM、Host lifecycle |
| Presentation | Map / Actor / Effect 的视觉呈现、插值、camera、viewport、资源释放 | 决定任何 Battle Rule |

Map 在本阶段只是固定序章流程的临时编排者。不因为这条链就新增通用 Story Subsystem / Story Graph；未来出现多地图、多条件、多次回访和可存档剧情状态时，再单独抽取 Story / Event Orchestrator。

## 5. Map → Dialogue → Battle → Dialogue child Frame

### 5.1 Map 侧顺序编排

Map 4 的 Professor interaction 是整条序章链的唯一入口：

1. Map interaction callback 只向当前等待中的 Professor waiter 投递事件。
2. Map 先停止当前 controls activation：清空 move intent、reset directional tracker、close consumer。
3. Map Frame handler 自己依次 await frame.call：
   - professor-vertical-slice
   - 若结论为 ready，调用 lab-rival-intro
   - 若结论为 accepted-challenge，调用 battle / lab-rival-tutorial
   - Battle 正常结算后，按 BattleResult 调用对应的战后 Dialogue
4. Map controls 在整个连续序列期间保持关闭；每个 Dialogue / Battle child Frame 拥有自己的 controls activation。
5. 战后 Dialogue 正常完成后，Map 才创建新的 controls tracker / consumer，继续当前 Map，不重建 RPGMap Handler。
6. 如果博士结果为 not-yet / cancelled，劲敌结果为 deferred / cancelled，或 Battle 被取消，则不继续后续阶段，Map 返回正常交互循环。
7. Map Frame finally 中仍需 disarm waiter 并幂等关闭当前 activation。

不要在连续 child Frame 之间短暂重开 Map controls，否则玩家输入可能泄漏到下一段 Dialogue / Battle。Map Frame handler 必须在每个 child call pending 期间保持自身 async control flow pending；不得让 detached async task 拥有 frame.call()。

### 5.2 Dialogue Frame 输入 / 输出

Map 只传业务 key 和来源身份，不传 RPGDialogue request、台词、choice、sprite、Presentation data 或 controls object。

博士 Dialogue 沿用当前：

~~~ts
type ProfessorDialogueResult = {
  dialogueKey: "professor-vertical-slice";
  conclusion: "ready" | "not-yet" | "cancelled";
};
~~~

劲敌 Dialogue 建议返回：

~~~ts
type RivalIntroResult = {
  dialogueKey: "lab-rival-intro";
  conclusion: "accepted-challenge" | "deferred" | "cancelled";
};
~~~

战后 Dialogue 的结果只需要表达正常结束 / 用户取消，不反向驱动 Battle。真实 child Frame failed 或 lifecycle cancelled 不得被解释为正常剧情结论。

### 5.3 Battle Frame 输入

Battle Frame 输入表达场景请求，而不是让 Map 任意指定 actor / skill / resolved definition：

~~~ts
type PokeManBattleFrameInput = {
  scenarioId: "lab-rival-tutorial";
  source: {
    mapId: 4;
    rival: {
      instanceId: "rival-lab";
      npcId: "rival-lab";
      x: number;
      y: number;
      direction: 2 | 4 | 6 | 8;
    };
    player: {
      x: number;
      y: number;
      direction: 2 | 4 | 6 | 8;
    };
  };
};
~~~

输入约束：

- scenarioId 必须是受支持的 PokeMan Battle scenario key。
- 本场 mapId 必须为 4。
- rival 必须对应 Map 4 的 rival-lab placement。
- 坐标必须是 safe integer，两个 tile 必须不同且可通行。
- 不接受调用方直接传入 BattleActor / Skill / Effect 的可变对象。
- 不接受 apiKey、transport、DecisionRequest、ResolvedBattleDefinition 或 BattleRuntime。
- Battle Subsystem 根据固定 scenario mapping 和 Shared State 解析 ally=rival、enemy=player；Map caller 不是 Content / Contract authority。

未来 Encounter Battle 可以由 Encounter / Story source 提供受验证的 source identity；不把 lab-rival-tutorial 的固定映射提升为通用 Map 规则。

### 5.4 Actor 初始位置

第一场 Battle 的两个 Manifestation 在 Map 4 的可见场景中落位：

- ally rival manifestation：玩家当前 tile / direction。
- enemy player manifestation：rival-lab placement tile / direction。
- 两个 tile 必须不同、位于 Map bounds 内，且在 Battle passability grid 中可通行。
- 不合法时在初始化 Presentation / 启动 Simulation 前返回明确的 Battle input/content failure；不得悄悄把 Actor 放到任意 tile。

优先使用 Map public event / placement facts。如果现有 Map public event contract 不提供所需玩家位置，应评估并扩展 public contract；不得读取 RPGMap Runtime internal state。

## 6. Battle Subsystem 组合

### 6.1 Content / Contract Resolver

Battle Subsystem 负责把 FSDB Content 和 Shared State 转成 Battle v0 的纯数据输入：

1. 读取 Map 4、Tileset、Autotile 与 Battle Presentation 所需资源。
2. 将 Map / Tileset authored movement facts 转成 Battle Simulation 要求的 width / height / passable[y][x]。
3. 读取 CarriedCards(player)，确认宿敌 Card 在随身位。
4. 读取 Relationship(player → rival)，验证 Contract Integrity / skills；解析为 ally BattleActor/rival。
5. 读取 CarriedCards(rival)，确认主角 Card 在劲敌随身位。
6. 读取 Relationship(rival → player)，验证 Contract Integrity / skills；解析为 enemy BattleActor/player。
7. 读取双方 Contract 实际使用的 BattleSkill；对每个 Skill.effect 读取对应 BattleEffect。
8. 验证 Record key 与 definition id 一致、所有 ContentRef / ResourceRef 存在、资源 contentVersion 合法。
9. 生成 detached、immutable 的 ResolvedBattleDefinition。

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

### 7.1 首场 BattleActor / Skill

当前可复用：

| Content | 已有定义 | 本场用途 |
| --- | --- | --- |
| BattleActor/rival | 18 HP、firebolt / grab、Characters/RivalCasual | Ally：玩家调用的宿敌 Manifestation |
| BattleActor/player | 20 HP、firebolt、Characters/Player | Enemy：劲敌调用的主角 Manifestation |
| BattleActor/road-bandit | 12 HP、grab、Characters/RoadBandit | 后续 Map 5 本体 Encounter，不用于首场教学战 |
| BattleSkill/firebolt | 7 damage、3 windup / 2 recovery、effect firebolt | 双方可用技能 |
| BattleSkill/grab | 4 damage、1 windup / 1 recovery、effect firebolt | 宿敌额外可用技能 |

双方的实际技能来源遵循各自 Contract 语义：

- 玩家持有的宿敌 Contract：Relationship(player → rival).contract.skills[]。
- 劲敌持有的主角 Contract：Relationship(rival → player).contract.skills[]。

BattleActor.skills[] 是基础 baseline / 新 Contract 初始化来源；不得每场 Battle 都用基础 Actor skills 覆盖已经成立 Contract 的技能集。

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

## 8. 双向 Contract Integrity 与 Battle initial HP 缺口

### 8.1 双方 Manifestation 的 HP authority

首场 Battle 两个 Actor 分别来自相反方向的 Relationship Contract：

~~~text
BattleActor/rival.max_hp
  = Relationship(player → rival).contract Integrity 上限

Relationship(player → rival).contract.integrity
  = ally rival manifestation 本场初始 HP

Relationship(player → rival).contract.skills[]
  = ally 本场实际可用 Skill ids

BattleActor/player.max_hp
  = Relationship(rival → player).contract Integrity 上限

Relationship(rival → player).contract.integrity
  = enemy player manifestation 本场初始 HP

Relationship(rival → player).contract.skills[]
  = enemy 本场实际可用 Skill ids

BattleSnapshot ally.rival.hp
  = Relationship(player → rival).contract.integrity 更新候选值

BattleSnapshot enemy.player.hp
  = Relationship(rival → player).contract.integrity 更新候选值
~~~

BattleResult 本身只表示 ally_win / enemy_win / simultaneous_defeat / cancelled / failure；最终双方 HP 必须从 BattleRuntime.getSnapshot() 读取，不得从 BattleResult 推导。

这里的 HP 是两份有向 Contract 各自的 Battle Manifestation Integrity，不是主角或宿敌本体的生命值。

### 8.2 当前 Battle v0 无法表达受损 Contract 的初始 HP

当前 ResolvedBattleActor 只有 maxHp，没有 initialHp；Simulation 初始化时固定：

~~~text
ActorRuntimeState.hp = ActorRuntimeState.maxHp
ActorRuntimeState.maxHp = ResolvedBattleActor.maxHp
~~~

因此当前 public contract 无法同时表达：

~~~text
maxHp     = BattleActor.<actor>.max_hp
initialHp = Relationship(<holder> → <servant>).contract.integrity
~~~

**对本次第一次教学 Battle：** 两份 Contract 刚建立时都应以各自基础 BattleActor.max_hp 初始化 Integrity，因此默认 initialHp = maxHp 正好符合首战要求。该缺口不阻止满 Integrity 的第一次 Map 4 Battle。

**对后续 Battle：** 首战结束后，两份 Contract Integrity 会因战斗损耗而下降；下一场 Battle 必须把当前 integrity 作为 initialHp，同时保留 BattleActor.max_hp 作为 maxHp。当前 v0 做不到这一点。如果把 maxHp 直接设置成 contract.integrity，HUD 最大值会错误地变成当前 HP，不能作为 workaround。

完整的跨 Battle Contract Integrity 闭环需要一个独立的 Battle Core contract amendment，审议明确的 initialHp 输入（或等价的初始 Actor HP 字段），约束为：

- maxHp 仍来自 BattleActor.max_hp。
- initialHp 来自对应方向的 Relationship.contract.integrity。
- 0 <= initialHp <= maxHp；initialHp 为 0 时，PokeMan 不应启动该 Contract 的 Battle Manifestation。
- 未提供 initialHp 的既有 Battle callers 保持以 maxHp 初始化的兼容语义。
- Simulation validator、initial snapshot、RenderProjection、Replay definition / validation 和 deterministic tests 同步覆盖该字段。
- Battle Core 不读取 Relationship、Contract 或 PokeMan Content；它只接收已解析的数值。

该字段不在本设计 PR 中修改 Battle Core，也不允许 PokeMan 通过伪造 maxHp 绕过它。

### 8.3 双向结算与 Shared State transaction

正常 Battle terminal 后，Battle Subsystem 从 final Snapshot 读取双方最终 HP，并把两份 Relationship Contract Integrity 作为一个业务事务提交：

1. Battle 开始前读取 Relationship(player → rival) 与 Relationship(rival → player)，记录两者 version，并验证 Card / Contract / BattleActor invariant。
2. Battle 正常结束后，读取 ally rival 与 enemy player 的 final Snapshot HP。
3. 使用同一个 Shared State transaction：
   - conditions 同时包含两份 Relationship 的读取 version；
   - writes 同时替换两份 Relationship Record，保留各自 affinity、hostile、relationshipText、skills 等其他字段，只更新对应 contract.integrity；
   - 若需要处理 OUTCOME_UNKNOWN 的 exactly-once reconciliation，在同一事务写入普通业务 operation-marker Record。
4. 两份 Relationship 必须原子提交；不允许先写一边、再单独写另一边，避免双向契约出现半结算。
5. CONFLICT 表示零写入；重新读取并按业务规则 reconciliation，不做无条件覆盖或盲目重试。
6. OUTCOME_UNKNOWN 必须通过 operation marker 与相关 Records fresh-read reconciliation；Shared State 不自动重试。
7. cancelled / failure 不提交本场部分 HP 损耗；Frame abort 不得留下半提交 Contract。

Shared State 写入只发生在 Battle 正常 terminal 之后，不按 Tick 写入。不得新增 BattleRuntime HP Record，也不得把 live BattleSnapshot 变成 Shared State 的第二份 authority。

在 initialHp amendment 合并前，第一场满 Integrity 教学 Battle 可以使用 maxHp 启动，并将 final Snapshot 原子写回双方 Contract；但不能声称下一场 Battle 已能从受损 Integrity 恢复。Map 5 road-bandit 或任何需要再次调用这两份 Manifestation 的后续战斗，必须等 initialHp amendment 落地后再验收连续性。

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

## 11. Battle Frame 返回值与 Map 的剧情分支

Battle Subsystem 只返回战斗业务结果和结算证据，不直接选择或调用 Dialogue：

~~~ts
type PokeManBattleOutcome = {
  battleId: string;
  result: "ally_win" | "enemy_win" | "simultaneous_defeat";
  settlement: "committed" | "not-applicable";
};
~~~

对 Map 4 的 lab-rival-tutorial，正常结果必须在双方 Relationship transaction 成功提交后才返回 settlement = committed。若 settlement conflict / outcome unknown 尚未完成 reconciliation，不得把 Battle 当作已完成并启动战后剧情。

Map 收到正常 BattleOutcome 后按固定映射选择 Dialogue key：

~~~text
ally_win
  → lab-rival-after-ally-win

enemy_win
  → lab-rival-after-enemy-win

simultaneous_defeat
  → lab-rival-after-draw
~~~

Map 只需要 result enum；不读取 Snapshot / Replay / Content / provider data。Battle 的 cancelled / failure 不属于正常胜负分支，不得打开胜利、失败或平局剧情；按标准 Frame outcome 返回 / 展示可恢复错误。

## 12. 测试与验收

### 12.1 Content Resolver

- 正确解析 ally = BattleActor/rival、enemy = BattleActor/player。
- ally 必须绑定 Relationship(player → rival) 与玩家持有的 rival Card；enemy 必须绑定 Relationship(rival → player) 与劲敌持有的 player Card。
- 任一方向的 Card / Relationship / Contract 缺失、Integrity 越界或 Contract skill 引用无效时拒绝启动。
- 已有 Contract 使用各自 contract.skills[]；不得被 BattleActor.skills[] 覆盖。
- BattleActor record key 与 value.id 不一致时拒绝。
- Skill 引用缺失、effect 引用缺失、ResourceRef 不存在或 contentVersion 非法时拒绝。
- BattleEffect exact schema 校验通过；旧的 graphics/name shape 被拒绝。
- Map 4 bounds、passability、两个 Manifestation 初始 tile 重叠或不可通行时拒绝。
- 输出为 detached immutable ResolvedBattleDefinition。

### 12.2 Battle Subsystem

使用 FakeBattleClock、ScriptDecision / fake DecisionPort、RecordingPresentation：

- 满 Integrity 的 rival / player 双 Manifestation 可以启动首场确定性 1v1。
- 正常 ally_win / enemy_win / simultaneous_defeat。
- final Snapshot 的双方 HP 映射到正确方向的 Relationship Contract。
- 两份 Relationship 更新通过同一个 Shared State transaction 原子提交；验证任一 OCC condition 冲突时两边都零写入。
- 验证 OUTCOME_UNKNOWN 的 operation-marker reconciliation，不自动重试 mutation。
- Presentation initialize / render / failure / close 的生命周期。
- Frame signal pre-abort 与 active abort。
- Decision failure、circuit pause、显式 resume。
- Battle Frame 每次创建新的 Builder / Handler / Runtime。
- close / abort / failure 后不残留 scheduler、resource listener 或 controls consumer。
- 在 initialHp amendment 前，后续 Battle 仅使用满 Integrity fixture 做 Runtime 生命周期 / 清理测试，不宣称 Contract Integrity 恢复已通过。

### 12.3 Map child-Frame integration：Map 4 序章链

沿用 dialogue-gameplay-vertical-slice 的测试风格：

- Professor interaction 是 Map 4 序章链的唯一入口。
- Map 先关闭自己的 controls activation，再依次调用 professor Dialogue、rival Dialogue、Battle、result-specific post-battle Dialogue。
- Professor Dialogue ready 才进入 rival Dialogue；not-yet / cancelled 不得启动 Battle。
- Rival Dialogue accepted-challenge 才进入 Battle；deferred / cancelled 不得启动 Battle。
- Battle ally_win / enemy_win / simultaneous_defeat 分别只调用对应的 post-battle Dialogue key。
- Battle cancelled / failure 不得调用任何正常 post-battle branch。
- Map controls 在整个连续 child Frame 链期间保持关闭；Dialogue / Battle 各自拥有自己的 controls activation。
- 只有 post-battle Dialogue 正常完成后，Map 才创建新的 controls Consumer / Directional Tracker。
- 两份 Relationship Contract Integrity 通过同一个 Shared State transaction 原子提交；conflict / outcome unknown 不得造成单边更新或提前播放战后 Dialogue。
- south / start 的重复输入不会重复发起整条序章链或重复创建 child Frame。
- Map terminal、Frame abort 和任一 child failure 不会产生双重恢复、重复 child call 或残留 controls Consumer。
- Map Handler 仍是原来的 session，不重建地图或重置玩家位置。

后续 Map 5 road-bandit 另建 Encounter / 本体参战测试，不混入本条首要 vertical slice。

### 12.4 Browser / Product qualification

- Battle browser JS/CSS 通过统一 Presentation sync script 进入 FSDB。
- Browser E2E 验证 Map 4 研究所、rival / player 两个 Manifestation、移动、技能效果、双方 HP、BattleResult 和结果对应的战后 Dialogue。
- PWA / Chromium 验证真实 Worker / Presentation 资源路径。
- Desktop / Hostra 验证 launch manifest、Frame lifecycle、provider transport 和 Browser assets。
- 在同一宿主内重复启动 / 退出 Battle Runtime，验证资源和 listener 正确释放；在 initialHp amendment 前使用满 Integrity fixture，不把该测试描述成跨战斗 HP 恢复。
- 在真实 DeepSeek qualification 中验证请求、合法 PlanSubmission、Decision failure 与 circuit pause / resume。
- initialHp amendment 合并后，额外验证双方受损 Contract 进入下一场 Manifestation Battle 时保留各自原始 maxHp 和正确的初始 HP，并验证 OCC settlement / conflict / outcome-unknown reconciliation。
- Map 5 road-bandit 的 Browser / Product qualification 单独安排在 P7，不与 Map 4 教学链混合。

未运行的真实 PWA、Desktop、Hostra 或 DeepSeek 测试不得用 unit / Mock 结果代替。

## 13. 实施顺序

建议分成以下可独立验收的阶段：

| 阶段 | 内容 | 通过标准 |
| --- | --- | --- |
| P0 — Contract / lifecycle baseline | 审议 Battle initialHp 缺口、Host pause reason / lifecycle OPEN；确认双向 Contract 建立与 Dialogue outcome mutation 的业务 owner | 不在实现中临时发明 Core API 或把 Contract 写入 Map callback |
| P1 — Content / package | 添加 Battle dependency、BattleEffect 修正、Battle graphics、Browser artifact sync；校验 player / rival BattleActor 与双方 skills | Content validator / package / sync check 通过 |
| P2 — Headless composition | 新建 Battle Subsystem、双向 Contract Resolver、FakeClock、ScriptDecision composition | 不启动 Browser 也能完成确定性 rival-manifestation vs player-manifestation 1v1，并原子结算两份 Contract |
| P3 — Map 4 prologue vertical slice | Map 4 Professor → rival Dialogue → Battle → result-specific post-battle Dialogue；Map controls 整链暂停与最终 fresh resume | 四段 child Frame 顺序正确，三个 BattleResult 分支正确，取消 / failure 不误触发剧情 |
| P4 — DeepSeek transport | 从 SessionConfig 构造 PokeMan-private transport，接入 DeepSeekDecision | PWA / Hostra 的真实 provider request 可观察且可取消 |
| P5 — Contract continuity | Battle Core initialHp contract amendment + bilateral OCC settlement / reconciliation | 第二场及后续 Battle 从双方各自的 Contract Integrity 正确初始化，maxHp 保持不变 |
| P6 — Product qualification | Browser / PWA / Desktop / Host lifecycle / failure / replay | 真实宿主的端到端证据完整 |
| P7 — Map 5 Encounter follow-up | road-bandit visible Encounter / 本体参战 / Encounter source | 与 Map 4 教学链分离，证明普通 NPC 本体可进入同一 Battle Runtime |

P2–P4 可以先用两份满 Integrity Contract 验证第一次教学 Battle。首战 final Snapshot 可以原子写回双方 Contract；但在 initialHp amendment 合并前，不得把第二场 Manifestation Battle 标记为通过，也不得把 Contract Integrity 的跨战斗闭环标记为完成。

## 14. 明确非目标

本轮不做：

- PlayerGuidance、手动提交战术 Plan 或 Battle 内玩家操控。
- 多 Actor / 2v2 / 多张随身卡选择。
- Map 5 通用 Encounter generation、随机 spawn / defeated persistence；road-bandit 是后续单独阶段。
- 通用 Story Graph / Story Subsystem；当前只由 Map 编排固定序章链。
- 完整 Relationship / Contract 建立剧情以外的 Card 管理 UI。
- Save / Load 与跨 Session credential persistence。
- 通用 Framework credential / network capability。
- 修改 Battle movement / skill / damage / LOS / stalemate 等 Core gameplay rules。
- 为 PokeMan 复制 Battle Simulation、Decision 或 Browser Renderer。
- 把 Map Runtime timer / movement / Browser completion 复用为 Battle authority。
- 让 Dialogue 直接调用 Battle，或让 Battle 直接调用战后 Dialogue。
- 让 Map 自己写入单边 Contract Integrity，或按 Tick 持久化 HP。

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
