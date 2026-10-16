# 数据落点

> 独立技术设计记录。不改写 `../DESIGN.md`。本文只定义 Content / Realm State / Runtime Memory 的 authority 边界；Realm State 物理结构见 [67-realm-state-records.md](./67-realm-state-records.md)，Content FSDB 物理结构见 [68-content-fsdb.md](./68-content-fsdb.md)。

## 三处归宿

| 归宿 | 是什么 | 这一局会不会变 |
| --- | --- | --- |
| Content | 安装包里的只读定义、剧情内容、派生索引与资源 | 不会 |
| Realm State | 这一局里跨 Subsystem 共享的可变业务事实 | 会 |
| Runtime Memory | 当前 Subsystem / Frame / Battle / Map 的运行工作集 | 会，但不是跨模块长期 authority |

基本判断：

- 所有新游戏安装后都相同的规则、角色定义、剧情定义和资源，放 Content。
- 这一局已经发生并且需要跨 Subsystem 共享的业务事实，放 Realm State。
- 当前某个 Subsystem 自己正在执行的 live 状态，留在该 Subsystem Runtime Memory。
- 能由 Content + 最小 Realm State 事实稳定重建的派生结果，不为了方便重复存一份 State。
- 某个玩法“未来可能需要持久化”本身不是提前建立 Realm State shape 的理由。

需要特别避免一个常见误区：

```text
可存档
!= 一定属于 Realm State live authority
```

Realm State 的首要判断是 **session-level shared mutable business fact**，而不是“以后会不会写进存档文件”。Save / Load 可以把某个 Runtime 当前值投影成 durable checkpoint，但不能因此建立两个并行 live authority。

# Content

PokeMan 当前主要 Content：

```text
Content
├─ struct.Character
│  ├─ name / description / fixed AI text
│  ├─ stable base BattleActor ContentRef
│  └─ default scene definitions
├─ struct.NPC                         # @loomrealm-game/map contract
│  └─ name + resource.Graphics sprite
├─ struct.Dialogue
├─ struct.Event
├─ struct.EventStateMutation
├─ struct.Encounter
├─ struct.StoryIndex                  # Builder generated
├─ @loomrealm-game/battle BattleActor / BattleSkill Content
├─ Map Content
└─ resource.*
```

PokeMan 自有 Content 直接按 FSDB 组织。详细规则见 [68-content-fsdb.md](./68-content-fsdb.md)：

- `struct` record 的 FSDB key 就是 identity；PokeMan 自有 source 不重复保存 `id`；
- 固定目标 table 的引用只保存 key；
- BattleActor 这类正式 namespace 尚由外部 package 决定的引用使用 `{ namespace, key }` ContentRef；
- `resource` key 可以有 `Characters/Mage` 这样的层级路径，`struct` key 不靠子目录形成层级；
- `mapId` 业务值统一是正 safe integer；JSON object / FSDB key 中使用其十进制字符串形式。

## Character / NPC / BattleActor

```text
Character
= 谁

NPC Definition
= 地图上怎么表现

NPC Instance
= 当前场景里这一次具体出现

BattleActor
= Battle package 的静态战斗定义
```

持久 Character 稳定引用一个基础 BattleActor：

```text
Persistent Character
→ Character.battleActor
→ base BattleActor
```

同一 Character 的不同 NPC Definition / NPC Instance 可以换地图表现、服装和位置，但不改变基础 BattleActor identity。

transient Encounter / Story NPC 没有持久 Character 时，可以由 Encounter / Event 静态 source 直接引用基础 BattleActor：

```text
Transient NPC Instance
→ Encounter / Story static source
→ base BattleActor
```

PokeMan 不建立 NPC Instance 专属 Battle profile / variant / resolved battle data authority。

建立 Contract 时：

```text
目标 NPC Instance
↓ resolve base BattleActor
BattleActor
├─ max_hp
└─ skills[]
↓
Relationship.contract
├─ integrity = BattleActor.max_hp
└─ skills[] = copy(BattleActor.skills[])
```

Contract Integrity 上限同样来自 `BattleActor.max_hp`，不额外保存 `maxIntegrity`。

## Dialogue

固定 Dialogue 是 Content：

```text
struct.Dialogue
├─ speakerName?
├─ lines[]
│  ├─ speaker? → Character key
│  └─ text
├─ choices?[]
│  ├─ text
│  └─ target → Dialogue key
└─ mutation? → EventStateMutation key
```

固定规则：

```text
Line.speaker 存在
→ 持久 Character

Line.speaker 不存在 + speakerName 存在
→ transient/default display name

两者都没有
→ narration
```

`choices` 与 `mutation` 互斥。Choice 只跳到另一个 Dialogue；需要改变 Event state 的分支跳到新的 terminal Dialogue，再由那个 Dialogue 引用 EventStateMutation。

Dialogue.mutation 只表示 Event state 变化，不创建 Contract / Card / Relationship。

## Event / EventStateMutation

Event 是剧情阶段及其当前场景 / 交互定义：

```text
struct.Event/<eventId>
└─ states
   └─ <stateId>
      └─ maps
         └─ <mapId>
            └─ npcs
               └─ <npcId>
                  ├─ character?
                  ├─ placement XOR absent:true
                  ├─ battleActor?        # 仅 transient Story NPC
                  └─ interaction?
                     └─ dialogue
```

EventStateMutation：

```text
struct.EventStateMutation/<mutationId>
├─ from
│  └─ eventId → stateId | null
└─ to
   └─ eventId → stateId | null
```

当前物理规则：

- `from` 可以是 `{}`；
- `to` 至少有一个成员；
- `null` 表示逻辑 Event 空状态；
- EventStateMutation 只改变 Event current state；
- 不增加 trigger / action / command / generic state path mutation。

## Encounter

Encounter 是 Content，但 re-entry / defeated persistence 等是 Runtime / gameplay policy。

```text
struct.Encounter/<decimal-mapId>
├─ spawnPoints[]
└─ templates
   └─ <templateId>
      ├─ npc → struct.NPC
      ├─ engagement
      ├─ dialogue? → struct.Dialogue
      └─ battleActor → ContentRef
```

随机数量、概率、权重、seed、respawn 等尚未冻结，不提前造字段。

## StoryIndex

StoryIndex 是 Builder-generated Content：

```text
struct.StoryIndex/current
├─ byMap
├─ byCharacter
└─ byEvent
```

它用于避免 Runtime 为查询当前 Map 剧情 source 扫描所有 Character / Event。它不是业务 authority，可以从源 Content 重建。

# Realm State

Realm State 的 canonical physical records 已冻结在 [67-realm-state-records.md](./67-realm-state-records.md)：

```text
pokeman.PlayerWorld / current
→ durable resume/checkpoint { mapId, x, y, direction }

pokeman.EventStateList / current
→ [{ eventId, stateId }]

pokeman.Relationship / <from>:<to>
→ { affinity, hostile, relationshipText, contract? }

pokeman.CarriedCards / <holder>
→ [{ slot, servantCharacterId }]
```

## durable PlayerWorld checkpoint

`pokeman.PlayerWorld/current` 保存的是 **恢复位置**，不是 live player pose。

```text
live player map / position / direction / motion
→ Map Runtime

explicit durable resume/checkpoint
→ Realm State
```

`PlayerWorld.mapId` 是正 safe integer。

## EventStateList

```text
有 entry
→ current state = entry.stateId

无 entry
→ current state = null
```

Realm State 不保存 `{ stateId:null }` 项。

Mutation 执行时读取 EventStateList + version，校验全部 `from`，在内存生成新列表，再一次 commit 替换整个 Record。

## Relationship / Contract

```text
Relationship(A → B)
├─ affinity
├─ hostile
├─ relationshipText
└─ contract?
   ├─ integrity
   └─ skills[]
```

Relationship 可以存在而 Contract 不存在。存在 `contract` 才表示正式契约成立。

Contract 不建立独立 Realm State authority。

## CarriedCards

```text
pokeman.CarriedCards / <holder>
→ [{ slot, servantCharacterId }]
```

Card 只表示已成立契约当前是否进入随身编队。它不保存 Integrity、skills、BattleActor、人格或其他静态数据。

MVP 不建立 `cardId`。

固定 invariant：

```text
CarriedCards(A) contains B
→ Relationship(A → B).contract exists
```

# Runtime Memory

## Map Runtime live authority

```text
Map Runtime
├─ current mapId
├─ player x / y
├─ direction
├─ motion
├─ current scene
└─ current NPCPlacement[]
```

这些 live facts 由 Map Runtime authority 拥有。

如果产品需要 Save / Load 恢复位置，只在明确 checkpoint / save workflow 中把当前位置投影到 `pokeman.PlayerWorld/current`。

## NPC Instance / Story Resolver

```text
Content
+ EventStateList
↓
Story Resolver
↓
World-side NPC Instance
├─ instanceId
├─ npcId
├─ characterId? / source context
├─ x / y / direction / pattern
└─ base BattleActor resolution path
↓
@loomrealm-game/map NPCPlacement[]
```

`instanceId` 不保存到 Character / Event source Content。

最终每张 Map 仍要求：

```text
npcId unique
```

不同 source 在同一 Map 产生同一 `npcId` 是 deterministic conflict，不做 last-wins。

## Dialogue Runtime

```text
current dialogue id
current line index
pending choice interaction
terminalDialogueId completion result
```

这些是当前调用工作状态，不进入 Realm State。

## Battle Runtime

Battle Simulation 自己拥有：

```text
currentHp
tile
direction
actionState
activePlan
activeStep
protectedUntilTickExclusive
actionGeneration
decisionGeneration
```

Card Battle 开始时由：

```text
Character → base BattleActor
+
Relationship.contract.integrity / skills[]
```

构造 Runtime Actor；结束后只有需要长期持续的 Contract Integrity 等结果写回 Realm State。

## Encounter Runtime

当前 generated Encounter set / spawn assignments / transient body state 可以留在 Runtime Memory。

是否重进地图重抽、击败后是否保持消失、何时清空等属于 gameplay Runtime policy，不是当前 Realm State schema gap。

# Authority 对照

| 数据 | Authority |
| --- | --- |
| Character definition | Content |
| NPC definition / sprite | Content |
| BattleActor / BattleSkill | Content |
| Dialogue / Event / Mutation | Content |
| Encounter definition | Content |
| StoryIndex | generated Content |
| durable resume/checkpoint | Realm State |
| Event current state | Realm State |
| Relationship / Contract | Realm State |
| current Card party | Realm State |
| live map / player pose | Map Runtime Memory |
| current NPC Instances | World / Map Runtime Memory |
| current Dialogue cursor | Dialogue Runtime Memory |
| current Battle actor state | Battle Runtime Memory |
| current generated Encounter set | Encounter / World Runtime Memory |

一句话：

```text
Content = 这个游戏本来怎么定义
Realm State = 这一局跨系统共享的长期业务事实
Runtime Memory = 当前系统正在执行什么
```

# 当前仍开放的数据问题

Realm State 核心物理结构已由 `67` 冻结；PokeMan Content 主体 FSDB physical schema 已由 `68` 收口。

当前真正仍开放的主要数据问题：

1. Battle package 的 BattleActor / BattleSkill 正式 serialization namespace / key/reference encoding。
2. Encounter generation 的具体概率 / 数量 /权重 / spawn selection / seed 参数。
3. StoryIndex 最终为 Resolver 查询保留哪些派生字段。
4. 本地化与 richer presentation metadata。

以下不是当前 data physical-schema gap：

```text
Relationship / Contract Record layout
CarriedCards Record layout / uniqueness constraints
EventStateList namespace / key
PlayerWorld mapId type
Encounter re-entry / persistence policy
Mutation mismatch / OCC / OUTCOME_UNKNOWN handling
Dialogue / Contract write ordering
non-Dialogue business fact → Mutation Runtime handler
progression / training
Runtime instanceId generation
live player movement control
```