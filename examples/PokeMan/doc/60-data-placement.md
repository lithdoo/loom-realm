# 数据落点

> 独立技术设计记录。不改写 `../DESIGN.md`。本文只划分大模块的数据归宿，不冻结最终 Record key / JSON schema。

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

Game Entry 的 `state.records` 是 Session bootstrap 时安装的 Realm State baseline。初始 Relationship、初始 contract、初始 Event state、初始随身 Card 等 mutable baseline 可以从这里进入 State；Character、Dialogue、EventStateMutation、BattleActor / BattleSkill 等 immutable definition 仍属于 Content。

Event 初始化采用稀疏语义：安装 baseline 只需要声明开局已经有非空状态的 Event，不需要为 Content 中所有 Event 预写 `inactive` 状态或空 Record。Event 业务读取统一视为：

```text
eventId → stateId | null
```

`null` / 没有当前状态表示 Event 当前为空状态，不参与 Event State 场景投影。

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

固定 Dialogue 也是 Content：

```text
Dialogue
├─ id
├─ lines[]
├─ choices?[]
│  └─ target Dialogue
└─ mutation? → EventStateMutation
```

一个 Dialogue 线性播放；Choice 只能在末尾，并只跳到另一个 Dialogue。

当前固定互斥约束：

```text
choices 存在
=> mutation 不允许存在

mutation 存在
=> choices 不允许存在
```

因此如果某个 Choice 分支需要改变 Event state，Choice 必须先跳到新的无 Choice Dialogue，再由目标 Dialogue 在完成时触发 `EventStateMutation`。

Dialogue 正常完成时仍返回最终的 `terminalDialogueId`，但 Event state mutation 不再依赖 caller 用这个 id 再查映射。

### EventStateMutation

Event state 的声明式变化单独作为 immutable Content：

```text
EventStateMutation
├─ from
│  └─ eventId → stateId | null
└─ to
   └─ eventId → stateId | null
```

Mutation 的 identity 由 Content key / reference 提供，所以概念数据本体只需要 `from` 和 `to`。

语义：

- `from` 中多个 Event 是 **AND**：全部当前 state 都匹配才允许应用；
- `null` 是合法 Event 空状态，可以出现在 `from` / `to`；
- `to` 中多个 Event state 在一次 Realm State commit 中一起写入；
- `from` 与 `to` 的 Event 集合、数量都不要求相同；
- 只在 `from` 中出现的 Event 只是前置条件；
- 只在 `to` 中出现的 Event 不要求与某个 `from` 项一一对应；
- `null → stateId` 表示启动 Event；
- `stateId → null` 表示清空当前 Event state；
- 需要 OR 时不增加 `anyOf` / 条件表达式，而是为每个分支定义独立 Mutation。

EventStateMutation 只读写 **Event current state**，不扩展为 Relationship / Card / Battle 等任意 Realm State mutation DSL。

## Realm State：长期业务事实

当前确认的 Realm State 主要包括：

```text
Realm State
├─ player current map / position / direction
├─ sparse Event current states
│  └─ eventId → stateId | null
├─ directed Relationship
│  ├─ affinity
│  ├─ hostile
│  ├─ dynamic relationship text
│  └─ contract?
├─ current carried Card[]
│  ├─ holderCharacterId
│  ├─ servantCharacterId
│  ├─ carried slot
│  └─ battle-facing state
│     └─ integrity
├─ Encounter generated results that must persist
├─ Pocket / story facts that must persist
└─ player choices / random results that cannot be recomputed
```

### Event current state

Event current state 是 Realm State 中的业务事实，但逻辑上是稀疏集合：

```text
Content 有 Event A / B / C / D

Realm State 当前只需要：
A → state-2
C → state-1

B / D → null
```

因此：

- 安装初始化 baseline 只声明开局已启动的 Event；
- Event 没有非空状态时不参与 Story Resolver 投影；
- Event 曾经启动后也可以通过 Mutation 写回 `null`；
- 业务上的 `null` 不等于“底层 Realm State Record 一定不存在”。

Realm State v1 的 `put(null)` 不会 dematerialize Record，所以 PokeMan 不能用 Record materialization / `list()` membership 判断 Event 是否启动。最终是一个总表 Record 还是多个 Event Record，目前仍不冻结。

### Relationship

Relationship 是有方向的：

```text
A → B
= A 与 B 当前持续存在的关系状态
```

`affinity`、`hostile`、动态关系描述和 `contract` 都在 Relationship。`contract` 表示 A 已经作为主公与 B 这个从者建立正式契约。

Contract **不建立独立 Realm State authority**。

### Card

Card 与 Relationship 分离。

当前技术定义：

> **Card 只表示当前随身、主要用于 Pocket / Battle 的角色卡。**

所以：

```text
Relationship(A → B).contract = true
```

可以长期存在，而当前没有：

```text
Card(holder=A, servant=B)
```

只有 B 被加入 A 的当前随身编队时，才存在对应 Card State。

Card 当前承载：

- holder / servant 关联；
- 当前随身 slot；
- 当前随身 Card 的 Battle-facing state，例如 Card Integrity。

Card 不复制 BattleActor / BattleSkill Content、人格或静态资源。

**Card 的独立 `cardId`、非随身时 Integrity / 训练 / 成长等长期状态最终住在哪里，目前尚未冻结。** 不在这里提前增加新的 State authority。

## Battle：直接复用 Battle package 的数据模型

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

Card Realm State
└─ 当前随身 Card 的 battle-facing state
   └─ integrity

Battle Runtime
└─ @loomrealm-game/battle Simulation-owned actor state
   ├─ hp / maxHp
   ├─ tile / direction
   ├─ action
   ├─ protectedUntilTickExclusive
   ├─ resolved skills
   └─ Decision / Simulation working state
```

这里不把尚未存在于 Battle v0 的 `attack / defense / speed / MP / accuracy / critical / element / universal cooldown / Buff / Debuff` 等概念写成 PokeMan 已定义字段。将来如果产品确实需要，先在 Battle 模块中设计并冻结，再由 PokeMan 使用。

当前随身 Card 参战：

```text
Character → BattleActor Content
+
Card State
↓
@loomrealm-game/battle Runtime Actor
```

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

Battle 结束后，World 决定哪些结果需要提交回 Realm State。

## Character 与 NPC Instance

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
→ 读取稀疏 Event current states
→ 跳过 currentState == null 的 Event
→ Story Resolver 合并当前来源
→ 校验最终 (mapId, npcId) 唯一
→ NPC Instance[]
→ NPCPlacement[]
→ @loomrealm-game/map
```

Builder 应检查缺失引用、非法 placement、派生索引一致性、安装初始化 State 中的非空 Event state 引用，以及单个 Event state 内可静态判断的重复 `(mapId, npcId)`。不同 Event 之间重复引用同一个 `npcId` 本身不报错；Runtime 合并当前来源后，如果最终同一 Map 出现重复 `npcId`，Story Resolver 必须确定性报冲突。

## AI 自由对话的数据边界

AI 自由对话不新增独立人格 authority：

```text
Character Content
= “我是谁”
= 固定人物资料 + fixed AI character text

Relationship B → A
= “B 当前怎么看 A”
= affinity + hostile + dynamic relationship text

Card(holder=A, servant=B)
= 当前 B 是否作为 A 的随身 Pocket / Battle Card
```

Card 自由对话可以组合以上信息和必要的当前剧情 context。LLM 输出默认只是一轮对话，不自动改写 Character Content 或 Relationship。

当前不建立独立 Conversation Memory。

## 模块归宿

| 模块 | Content | Realm State | 临时内存 |
| --- | --- | --- | --- |
| 会话 / Frame | — | — | Frame 栈、Activation、InputTarget |
| 系统菜单 | 菜单定义可本地持有 | 世界事实不放这里 | root / 游戏中菜单实例、光标 |
| 消息 | — | — | 当前模态消息 |
| 地图与玩家 | 地图、碰撞、传送、Story Index | 当前地图、玩家格与朝向、必要剧情事实 | Resolver、镜头、走步、输入、寻路 |
| 人物 | 身份、描述、fixed AI text、BattleActor Content 引用 | — | 当前解析出的 NPC Instance |
| 关系 / 契约 | — | Relationship：affinity、hostile、动态文本、contract | 尚未提交的关系变化 |
| Card | Card / Battle 表现所需静态资源来自 Character / Visual / Battle Content | **当前随身 Card State**：holder、servant、slot、battle-facing state | Battle 中的 Card Manifestation |
| 对话 | 固定 Dialogue，包括可选 EventStateMutation ref | AI 长期关系语境来自 Relationship | dialogue id / line index / pending choice；LLM working context |
| 剧情 | Event、states、EventStateMutation、NPC placement、Dialogue ref、Story Index | **稀疏 Event current states**：`eventId → stateId | null`；不可重算剧情事实 | 当前解析 / mutation validation / 执行步骤 |
| 遭遇 | table、spawn point、template、BattleActor ref | 需要持续存在的生成结果 | 当前接触、视野、临时对手 |
| 战斗 | `@loomrealm-game/battle` 的 BattleActor / BattleSkill / rules / scenarios | 当前随身 Card 的已提交 battle-facing state | Battle Simulation / Decision / Presentation 当前工作状态 |
| 表现 | tiles、sprites、portrait、UI skin | — | Renderer replica、动画 |
| 存档 | — | 选中的 Realm State snapshot | Load 临时缓冲 |

## 谁提交世界事实

```text
Main
  只持有控制面 / Frame 栈

Dialogue
  Frame 内拥有当前固定对话工作集
  无 Choice Dialogue 完成时，可读取并请求应用自己引用的 EventStateMutation
  正常完成后返回 terminalDialogueId

Battle
  Frame 内拥有当前战斗工作集
  完成后把结果交回调用方

World / Event state owner
  提供 Realm State authority 上下文
  以 stateId | null 读取 Event current state
  验证 Mutation.from
  原子提交 Mutation.to
  提交地图、Relationship、当前随身 Card、剧情、Encounter 等其他 mutable facts
```

Runtime 不扫描全部 EventStateMutation 自动执行；Mutation 必须被明确 Dialogue 或其他业务结果引用。

System Menu 可以发起 New Game / Load 意图，但不是第二个 State authority。

## 存档边界

存档带走已确认的 Realm State，例如：

- 稀疏 Event current states；
- Relationship 当前状态，包括 contract；
- 当前随身 Card State；
- 当前地图 / 玩家位置；
- 需要持续存在的 Encounter 生成结果；
- 其他已经提交的剧情 / Pocket 事实。

存档不要求列出 Content 中全部 Event；空 Event 的业务语义是 `null`。

存档不重复保存：

- Character fixed AI text；
- BattleActor / BattleSkill Content；
- Dialogue definitions；
- Event definitions / EventStateMutation；
- Event state 中的 immutable placement；
- Story Index；
- Battle Runtime state；
- Frame 栈、Renderer replica。

需要注意：**从者不随身时仍需跨存档保留的 Integrity / Progression 状态最终 owner 尚未确定。** 在这个问题冻结以前，本文不把它强行塞回 Relationship，也不新增一个未经确认的 Managed Card / Contracted Servant State。

## 序章当前 State 面

序章至少会用到：

- 当前地图和玩家位置；
- 安装 baseline 中开局已启动的少量 Event current state；
- 后续通过 `null → stateId` 启动的剧情 Event；
- `player → rival` 与 `rival → player` 的 Relationship / contract；
- 玩家当前随身的宿敌 Card；
- Card 当前 Integrity；
- 第一道路需要持久的 Encounter 结果；
- 已触发的 Pocket / 剧情事实。

Character、BattleActor / BattleSkill、Dialogue、EventStateMutation、默认 NPC Instance 与 Story Index 都留在 Content。