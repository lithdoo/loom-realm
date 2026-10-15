# 数据落点

> 独立技术设计记录。不改写 `../DESIGN.md`。本文只划分大模块的数据归宿，不冻结最终 Content key / JSON schema；Realm State 中 Event current state 已确认使用一个列表 Record。

## 三处归宿

| 归宿 | 是什么 | 这一局会不会变 |
| --- | --- | --- |
| Content | 安装包里的只读定义、剧情内容、派生索引与资源 | 不会 |
| Realm State | 这一局里跨 Subsystem 共享、不能只靠 Content 重建的业务事实 | 会 |
| 临时内存 | 当前 Frame、当前模拟或当前画面才需要的工作数据 | 会，但不作为长期 authority |

基本判断：

- 每个新游戏都一样、游玩过程中不改的定义与剧情规则，放 Content。
- 这一局真正发生了什么、关系如何变化、当前携带什么等 mutable facts，放 Realm State。
- 能由 **Content + Realm State 最小事实**重算出的表现，不为了存档方便再复制一份进 State。
- 只服务当前调用 / 当前 Battle / 当前画面的，留在 Runtime 内存。

Game Entry 的 `state.records` 是 Session bootstrap 时安装的 Realm State baseline。初始 Relationship、初始 Event state list、初始随身 Card 等 mutable baseline 可以从这里进入 State；Character、Dialogue、EventStateMutation、BattleActor / BattleSkill 等 immutable definition 仍属于 Content。

## Content：定义与剧情

当前主要 Content：

```text
Content
├─ Character definitions
│  ├─ identity / description / fixed AI text
│  ├─ default NPC instances
│  └─ Battle references
│     └─ @loomrealm-game/battle BattleActor Content
│        ├─ id / name / character graphics
│        ├─ max_hp
│        └─ skills[] → BattleSkill
├─ @loomrealm-game/battle BattleSkill Content
│  ├─ id / name
│  ├─ range
│  ├─ damage
│  ├─ timing.windup_ticks / recovery_ticks
│  └─ effect
├─ NPC definitions
├─ Visual definitions/resources
├─ Event / Event State
├─ EventStateMutation
├─ Dialogue definitions
├─ Encounter definitions
├─ Story Index (generated)
├─ Battle rules / scenarios
└─ Map content
```

PokeMan **不另建平行的 Skill schema**。当前战斗技能直接采用 `@loomrealm-game/battle` 的 `BattleSkill` Content contract；角色能使用哪些技能，由角色关联的 BattleActor Content 中 `skills[]` 引用表达。以后需要新的战斗能力时，应优先扩展 Battle package 的规范，而不是只在 PokeMan 内新增另一套 Skill 语义。

所有持久 Character 都准备好 Card / Battle 所需静态素材与数据。这只是 Content 完备性，不代表当前可以建立契约。

### 固定 Dialogue

固定 Dialogue 是 Content：

```text
Dialogue
├─ id
├─ lines[]
├─ choices?[]
│  └─ target Dialogue
└─ mutation? → EventStateMutation
```

一个 Dialogue 线性播放；Choice 只能在末尾，并只跳到另一个 Dialogue。

固定互斥约束：

```text
choices 存在
=> mutation 不允许存在

mutation 存在
=> choices 不允许存在
```

如果某个 Choice 分支需要改变 Event state，Choice 必须先跳到新的无 Choice Dialogue，再由目标 Dialogue 在完成时触发 `EventStateMutation`。

Content 只声明数据，不参与执行。真正解释 Dialogue graph、读取 Mutation、校验当前 Event state 并调用 `scope.state.commit()` 的是 **PokeMan Dialogue Subsystem**。底层 `@loomrealm-game/rpg-dialogue` 仍只负责当前 Conversation interaction / presentation。

### EventStateMutation

Event state 的声明式变化单独作为 immutable Content：

```text
EventStateMutation
├─ from
│  └─ eventId → stateId | null
└─ to
   └─ eventId → stateId | null
```

Mutation identity 由 Content key / reference 提供。

语义：

- `from` 中多个 Event 是 **AND**：全部当前 state 都匹配才允许应用；
- `null` 是合法的 Event 空状态；
- `from` 与 `to` 的 Event 集合、数量都不要求相同；
- 只在 `from` 中出现的 Event 只是前置条件；
- 只在 `to` 中出现的 Event 不要求与某个 `from` 项一一对应；
- `null → stateId` 表示启动 Event；
- `stateId → null` 表示清空当前 Event state；
- 需要 OR 时不增加 `anyOf` / 条件表达式，而是为每个分支定义独立 Mutation。

EventStateMutation 只读写 **Event current state**，不扩展为 Relationship / Card / Battle 等任意 Realm State mutation DSL。

# Realm State：长期业务事实

当前确认的 Realm State 主要包括：

```text
Realm State
├─ player current map / position / direction
├─ EventStateList                // 一个 Realm State Record
│  └─ entries[]
│     ├─ eventId
│     └─ stateId                 // 只保存非空 stateId
├─ directed Relationship[]
│  ├─ fromCharacterId
│  ├─ toCharacterId
│  ├─ affinity
│  ├─ hostile
│  ├─ dynamic relationship text
│  ├─ contract?
│  ├─ integrity?
│  └─ progression?
├─ current carried Card[]
│  ├─ holderCharacterId
│  ├─ servantCharacterId
│  └─ carried slot
├─ Encounter generated results that must persist
├─ Pocket / story facts that must persist
└─ player choices / random results that cannot be recomputed
```

## EventStateList：一个稀疏列表 Record

Event current state 的物理 State 模型已确认使用 **一个 Realm State Record**，Record value 是稀疏列表：

```text
EventStateList
[
  { eventId: "professor-intro", stateId: "waiting" },
  { eventId: "home-intro", stateId: "active" }
]
```

规则：

```text
列表中存在 eventId
→ 当前 state = 对应 stateId

列表中不存在 eventId
→ 当前 state = null
→ Event 当前未启动 / 空状态
```

列表本身不保存 `{ stateId: null }` 项。`null` 是读取 / Mutation 的业务语义；实际列表只保存非空状态。

安装初始化 baseline 直接安装这个 EventStateList Record，并且只列出开局已经启动的 Event，不要求列出 Content 中所有 Event，也不要求为未来 Event 造 `inactive` state。

Mutation 执行时：

```text
读取 EventStateList Record + version
↓
按 from 检查当前值
  - 有 entry → 比较 stateId
  - 无 entry → 视为 null
↓
全部匹配
↓
在内存生成新 EventStateList
  - to = stateId → upsert entry
  - to = null    → 删除 entry
↓
一次 Realm State commit
替换整个 EventStateList Record
```

因此一条 Mutation 同时更新多个 Event 时天然对应一次 Record replacement / 一次 Realm State commit，不会出现部分 Event 已更新、部分未更新的业务可见状态。

`eventId` 在 EventStateList 中必须唯一；每个非空 `stateId` 必须属于对应 Event Content。

EventStateList 的最终 namespace / key 名字仍可在实现 schema 冻结时决定，但“一个列表 Record”这一物理模型已确认。

## Relationship：长期关系、契约、Integrity 与成长

Relationship 是有方向的：

```text
A → B
= A 与 B 当前持续存在的关系状态
```

当前确认长期属于 Relationship 的事实包括：

```text
Relationship(A → B)
├─ affinity
├─ hostile
├─ dynamic relationship text
├─ contract?
├─ integrity?
└─ progression / training?
```

`contract` 表示 A 已经作为主公与 B 建立正式契约。Integrity 与训练 / 成长属于**这份有向契约关系的长期状态**，即使 B 当前不随身也继续存在。

同一个 Character 被不同主公契约时，各自 Relationship 的 affinity、Integrity、Progression 相互独立。

Contract **不建立独立 Realm State authority**。

## Card：只表示当前随身

Card 与 Relationship 分离，而且职责很窄：

```text
Card
├─ holderCharacterId
├─ servantCharacterId
└─ slot
```

它只表示：

> **这份已成立契约当前是否进入随身队伍，以及所在 slot。**

所以：

```text
Relationship(A → B).contract = true
Relationship(A → B).integrity = 48

Card(A, B) exists
→ 当前随身

Card(A, B) absent
→ 当前不随身
→ Relationship / integrity / progression 仍然存在
```

Card 不保存 Integrity、Progression、BattleActor / BattleSkill Content、人格或静态资源。

Card 的独立 `cardId` 是否需要存在仍未冻结。

# Battle：直接复用 Battle package 的数据模型

PokeMan 不定义第二套 Battle Actor / Skill 数据模型。静态战斗数据以 `@loomrealm-game/battle` 当前规范为准。

```text
BattleActor Content
├─ id
├─ name
├─ character graphics reference
├─ max_hp
└─ skills[] → BattleSkill

BattleSkill Content
├─ id
├─ name
├─ range
├─ damage
├─ timing
│  ├─ windup_ticks
│  └─ recovery_ticks
└─ effect

Relationship(holder → servant)
├─ integrity
└─ progression / training

Current Card
├─ holderCharacterId
├─ servantCharacterId
└─ slot

Battle Runtime
└─ @loomrealm-game/battle Simulation-owned actor state
   ├─ hp / maxHp
   ├─ tile / direction
   ├─ action
   ├─ protectedUntilTickExclusive
   ├─ resolved skills
   └─ Decision / Simulation working state
```

当前随身 Card 参战：

```text
Card(holder=A, servant=B)
+
Relationship(A → B).integrity / progression
+
Character B → BattleActor Content
↓
@loomrealm-game/battle Runtime Actor
```

对于 Card Battle Manifestation，初始 Battle HP 来自 Relationship.integrity；战斗结束后需要长期保留的 Integrity 结果写回同一 Relationship。

剧情 / Encounter 临时对手不需要制造 contract 或 Card：

```text
Story / Encounter Battle definition
+
BattleActor Content
↓
@loomrealm-game/battle Runtime Actor
↓
Battle 结束后 Runtime 丢弃
```

# Character 与 NPC Instance

Character 表示“这个人是谁”，NPC Instance 表示“当前场景具体出现的地图实例”。

PokeMan 对最终地图结果采用明确唯一性规则：

> **同一个 `npcId` 可以同时出现在多个不同 Map，但同一张 Map 的最终解析结果中，一个 `npcId` 最多出现一次。**

```text
(mapId, npcId) 唯一
```

不同 Event 可以重复声明同一个 NPC；同一个 Event state 也可以让同一 `npcId` 出现在多个不同 Map。只有最终解析后的 Map 场景必须满足 `(mapId, npcId)` 唯一。

`instanceId` 仍然作为 `@loomrealm-game/map` 的实例 identity 使用，但 PokeMan 不再用不同 `instanceId` 来允许同一 Map 出现多个相同 `npcId`。

Map Enter：

```text
读取 Story Index
→ 找到相关 Event / Character Content
→ 读取 EventStateList
→ 对当前 Map 相关 Event 查询 stateId
→ 缺 entry / null 的 Event 跳过
→ Story Resolver 合并当前来源
→ 校验最终 (mapId, npcId) 唯一
→ NPC Instance[]
→ NPCPlacement[]
→ @loomrealm-game/map
```

Builder 应检查缺失引用、非法 placement、派生索引一致性、安装初始化 EventStateList，以及单个 Event state 内可静态判断的重复 `(mapId, npcId)`。不同 Event 之间重复引用同一个 `npcId` 本身不报错；Runtime 合并当前来源后，如果最终同一 Map 出现重复 `npcId`，Story Resolver 必须确定性报冲突。

# AI 自由对话的数据边界

AI 自由对话不新增独立人格 authority：

```text
Character Content
= “我是谁”
= 固定人物资料 + fixed AI character text

Relationship B → A
= “B 当前怎么看 A”
= affinity + hostile + dynamic relationship text

Relationship A → B
= A 持有 B 这份契约的长期 integrity / progression（需要时）

Card(holder=A, servant=B)
= B 当前是否作为 A 的随身 Pocket / Battle Card
```

Card 自由对话可以组合以上信息和必要的当前剧情 context。LLM 输出默认只是一轮对话，不自动改写 Character Content 或 Relationship。

当前不建立独立 Conversation Memory。

# 模块归宿

| 模块 | Content | Realm State | 临时内存 |
| --- | --- | --- | --- |
| 会话 / Frame | — | — | Frame 栈、Activation、InputTarget |
| 系统菜单 | 菜单定义可本地持有 | 世界事实不放这里 | root / 游戏中菜单实例、光标 |
| 消息 | — | — | 当前模态消息 |
| 地图与玩家 | 地图、碰撞、传送、Story Index | 当前地图、玩家格与朝向、必要剧情事实 | Resolver、镜头、走步、输入、寻路 |
| 人物 | 身份、描述、fixed AI text、BattleActor Content 引用 | — | 当前解析出的 NPC Instance |
| 关系 / 契约 | — | Relationship：affinity、hostile、动态文本、contract、integrity、progression | 尚未提交的关系变化 |
| Card | Card / Battle 表现所需静态资源来自 Character / Visual / Battle Content | **当前随身 Card**：holder、servant、slot | Battle 中的 Card Manifestation |
| 对话 | 固定 Dialogue，包括可选 EventStateMutation ref | Mutation 执行时由 PokeMan Dialogue Subsystem 使用 Realm State | dialogue id / line index / pending choice；LLM working context |
| 剧情 | Event、states、EventStateMutation、NPC placement、Dialogue ref、Story Index | **一个 EventStateList Record** | 当前解析 / mutation validation / 新列表计算 |
| 遭遇 | table、spawn point、template、BattleActor ref | 需要持续存在的生成结果 | 当前接触、视野、临时对手 |
| 战斗 | `@loomrealm-game/battle` 的 BattleActor / BattleSkill / rules / scenarios | Relationship.integrity / progression；当前 Card 编队 | Battle Simulation / Decision / Presentation 当前工作状态 |
| 表现 | tiles、sprites、portrait、UI skin | — | Renderer replica、动画 |
| 存档 | — | 选中的 Realm State snapshot | Load 临时缓冲 |

# 谁提交世界事实

```text
Main
  只持有控制面 / Frame 栈

PokeMan Dialogue Subsystem
  读取 Dialogue / EventStateMutation Content
  执行 Dialogue graph
  到达带 mutation 的无 Choice Dialogue 时：
    → scope.state 读取 EventStateList
    → 校验 Mutation.from
    → 生成新 EventStateList
    → scope.state.commit() 原子替换 EventStateList
  正常完成后返回 terminalDialogueId

@loomrealm-game/rpg-dialogue
  只负责当前 Conversation interaction / presentation
  不理解 Event / Mutation / Realm State 业务语义

Battle Subsystem
  Frame 内拥有当前战斗工作集
  Battle 结束后由对应游戏业务把需要持久的结果写回 Relationship 等 Realm State

World
  解释 Map / Event / Relationship / Card / Encounter 等世界业务
```

Content 永远只是定义数据，不执行 Mutation，也不是 State authority。

Runtime 不扫描全部 EventStateMutation 自动执行；Mutation 必须被明确 Dialogue 或其他业务结果引用。

# 存档边界

存档带走已确认的 Realm State，例如：

- EventStateList；
- Relationship 当前状态，包括 contract / integrity / progression；
- 当前随身 Card（holder / servant / slot）；
- 当前地图 / 玩家位置；
- 需要持续存在的 Encounter 生成结果；
- 其他已经提交的剧情 / Pocket 事实。

EventStateList 不要求列出 Content 中全部 Event；列表没有某个 `eventId` 就等价于该 Event 当前 `null`。

存档不重复保存：

- Character fixed AI text；
- BattleActor / BattleSkill Content；
- Dialogue definitions；
- Event definitions / EventStateMutation；
- Event state 中的 immutable placement；
- Story Index；
- Battle Runtime state；
- Frame 栈、Renderer replica。

# 序章当前 State 面

序章至少会用到：

- 当前地图和玩家位置；
- 安装 baseline 中的 EventStateList；
- `player → rival` 与 `rival → player` 的 Relationship / contract；
- 对应 Relationship 的 Integrity / 后续 progression；
- 玩家当前随身的宿敌 Card（slot）；
- 第一道路需要持久的 Encounter 结果；
- 已触发的 Pocket / 剧情事实。

Character、BattleActor / BattleSkill、Dialogue、EventStateMutation、默认 NPC Instance 与 Story Index 都留在 Content。