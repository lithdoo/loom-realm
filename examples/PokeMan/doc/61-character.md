# 人物

> 独立技术设计记录。不改写 `../DESIGN.md`。本文决定持久人物的 Content、长期 Relationship、当前随身 Card，以及人物如何投影成 Map NPC Instance。固定 Dialogue、Encounter 和 Battle 规则分别由对应模块定义。

归宿总表见 [数据落点](./60-data-placement.md)。

## Content 里的人物

一个持久的人一条 Character Content 记录。主角、家人、博士、宿敌、店主，以及以后可以建立契约的修行者，都是 Character。进图时随机生成的普通混混、路霸不要求建立持久 Character，可以走 Encounter template。

人物记录放稳定、不随这一局游玩改变的定义，例如：

- **身份**：`id`、名称。`id` 是人物级事实的稳定 identity，也是其他静态定义关联人物的稳定键。
- **描述**：职业、性格、经历等作者定义的静态资料。
- **功能标签**：研究者、店主、家人等世界职责。
- **固定 AI 人物描述**：一段供自由对话 AI 使用的自然语言人物说明，可以表达性格、说话习惯、背景、价值观等不值得拆成游戏规则字段的信息。
- **默认场景实例**：当当前所有 active Event State 都没有提到这个 Character 时，这个人默认如何出现在 Map；一个 Character 可以有 0..N 个默认 NPC Instance。
- **Battle 静态资料引用**：关联 `@loomrealm-game/battle` 的 BattleActor Content；技能直接使用 BattleActor 的 `skills[]` 所引用的 BattleSkill Content。

固定 AI 人物描述属于 immutable Content。它回答“这个人本来是什么样的人”，不会因为这一局与玩家关系变化而改写。需要被规则读取的事实仍然使用结构化数据。

所有持久 Character 都应准备好形成 Card / Battle 表现所需的静态素材与数据。这只是 **Content 完备性规则**，不表示当前游戏规则允许与这个人物建立契约，也不推导 `canContract = true`。

### Battle 数据直接复用 `@loomrealm-game/battle`

PokeMan 不在 Character 模块里再定义一套平行的 Skill / Battle stat schema。

当前 BattleActor Content 的逻辑数据包括：

```text
BattleActor Content
├─ id
├─ name
├─ character graphics reference
├─ max_hp
└─ skills[] → BattleSkill
```

BattleSkill 直接采用 Battle package 当前定义：

```text
BattleSkill
├─ id
├─ name
├─ range
├─ damage
├─ timing
│  ├─ windup_ticks
│  └─ recovery_ticks
└─ effect
```

因此 Character 只需要稳定关联到相应 BattleActor Content；“这个角色有哪些技能”由 BattleActor 的 `skills[]` 表达，不在 Character 上再复制另一份 Skill definition。

当前也不额外增加 `attack / defense / speed / MP / accuracy / critical / element / cooldown / Buff / Debuff` 等 Battle v0 没有定义的字段。将来 PokeMan 确实需要新的战斗机制时，优先在 `@loomrealm-game/battle` 中设计并冻结，再由 Character Content 引用。

## Character、NPC 与 Map Instance

Character 与 Map NPC Instance 是两个层次：

```text
Character
= “这个人是谁”

NPC Definition / npcId
= “地图上以哪种 NPC 模板出现”

Map NPC Instance
= “这个 NPC 当前在某张 Map 上的具体出现”
```

Character identity 与 `npcId` 不要求相同。一个 Character 可以关联不同 NPC Definition，例如不同服装或地图表现。

当前 PokeMan 对最终场景采用一个明确约束：

> **同一个 `npcId` 可以同时出现在多个不同 Map，但同一张 Map 的最终解析结果中，一个 `npcId` 最多出现一次。**

因此允许：

```text
Character rival
├─ map 1 → npcId: rival-normal
├─ map 2 → npcId: rival-normal
└─ map 3 → npcId: rival-normal
```

但不允许最终解析成：

```text
map 1
├─ npcId: rival-normal
└─ npcId: rival-normal
```

如果同一个 Character 在同一 Map 需要多个不同表现，它们必须至少是不同 `npcId`；是否有这种产品需求以后按具体场景决定。

`instanceId` 仍然是 `@loomrealm-game/map` 的实例 identity，但 PokeMan 不再把不同 `instanceId` 当成“同一 Map 可以出现多个相同 `npcId`”的依据。业务层最终唯一性看：

```text
(mapId, npcId)
```

PokeMan World 最终投影给 `@loomrealm-game/map` 的仍是：

```text
NPCPlacement
├─ instanceId
├─ npcId
├─ x
├─ y
├─ direction
└─ pattern?
```

`@loomrealm-game/map` 根据 `npcId` 读取 `[struct]NPC/<npcId>` 的窄 `name + sprite` 定义。Character Content 负责“这个人是谁以及人物 / Card / Battle 所需的静态数据引用”，Map NPC definition 负责地图表现，World / Story Resolver 负责“当前 Map 应该出现哪些实例”。

## Relationship：A → B 的长期关系与契约状态

Relationship 是 Realm State 中两个人之间、带方向的长期业务状态。

```text
A → B
= A 与 B 当前持续存在的关系状态
```

当前确认的概念字段：

```text
Relationship
├─ fromCharacterId
├─ toCharacterId
├─ affinity
├─ hostile
├─ dynamic relationship text
├─ contract?              // A 是主公，B 是从者
├─ integrity?             // 这份契约的 Battle Manifestation 长期完整度
└─ progression?           // 这份契约的训练 / 成长长期状态；精确 shape 后续设计
```

这里先表达语义，最终 Realm State key / JSON shape 后续再冻结。

`player → rival` 与 `rival → player` 是两份不同的 Relationship，不要求对称。双向契约就是两个方向分别成立：

```text
player → rival   contract
rival → player   contract
```

### affinity / hostile / 关系文本

`affinity` 是整数。**hostile 与 affinity 是独立事实，不由 `affinity < 0` 推导。**

例如：

```text
affinity = -20
hostile = false
```

可以表示 A 很不喜欢 B，但当前没有进入敌对冲突；反过来，也允许剧情直接让关系进入 hostile，而不要求先把 affinity 改成负数。

动态关系描述文本用自然语言表达这一局里 A 对 B 当前形成的关系语境，例如共同经历、认可、不满、习惯性的态度等。它属于 Realm State，并随存档恢复。

结构化状态和关系文本职责不同：

- `affinity`、`hostile`、`integrity`、未来 progression 等结构化状态给游戏规则使用；
- 动态关系描述文本主要给 AI 自由对话理解关系，不替代规则字段。

### Contract 与长期 Battle / 成长状态都属于 Relationship

当前不建立独立 Contract Realm State 对象。

`A → B` Relationship 上的 `contract` 表示：

> **A 已经以主公身份与 B 这个从者建立正式契约。**

Relationship 很好不代表一定有契约；契约成立以后 affinity / hostile 仍然继续变化。把 B 从随身 Card 编队移出，也不会解除这个 contract。

同一份契约长期存在的 Card Integrity、训练 / 成长等状态也归这条有向 Relationship 所有，而不是归当前随身 Card 所有：

```text
Relationship(A → B)
├─ contract = true
├─ integrity = 48
└─ progression = ...

Card(A, B)
= 可以存在，也可以当前不存在
```

因此从者不随身时，这些长期状态仍然自然保留。

同一个 Character 可以与多个主公分别建立契约：

```text
player → rival     contract / integrity / progression
lord-b → rival     contract / integrity / progression
```

它们共享同一个 `rival` Character Content，但各自拥有独立的有向 Relationship 和长期契约状态。

初始 affinity、hostile、关系文本、contract、integrity 与已定义的 progression baseline 都可以来自 Game Entry `state.records`。

## Card：当前随身状态

**Card 不嵌在 Relationship 里。** Card 是独立的 Realm State 业务对象，但职责非常窄：

> **Card 只表示一份已成立契约当前是否被主公带在身上，以及它位于哪个随身 slot。**

因此：

```text
Relationship contract
= 长期正式契约是否成立

Relationship integrity / progression
= 这份契约长期存在的 Battle / 成长状态

Card
= 这份已成立契约当前是否进入随身编队
```

有 contract 不代表当前一定有 Card：

```text
Relationship(player → rival)
contract = true
integrity = 48
progression = ...

Card(player, rival) exists      // 当前随身
```

或者：

```text
Relationship(player → rival)
contract = true
integrity = 48
progression = ...

Card(player, rival) absent      // 当前不随身
```

当前 Card 概念只需要表达：

```text
Card
├─ holderCharacterId
├─ servantCharacterId
└─ carried slot
```

其中：

- `holderCharacterId`：当前主公；
- `servantCharacterId`：Card 代表的从者；
- `carried slot`：当前随身编队位置；序章只有 1 个随身位。

Card 不保存 Integrity、训练 / 成长，不复制 BattleActor / BattleSkill、人物姓名、人格或固定 AI 描述。长期契约状态从对应 Relationship 读取；静态人物 / Battle 数据从 `servantCharacterId` 所对应的 Character / Battle Content 读取。

Card 的独立 `cardId` **尚未冻结**。是否直接使用 `(holderCharacterId, servantCharacterId)` 作为当前随身 Card identity，等 Card Record shape 最终设计时再决定。

## Battle 数据边界

PokeMan 的 Battle 数据直接接入 `@loomrealm-game/battle`：

```text
Character
→ BattleActor Content
   ├─ max_hp
   └─ skills[] → BattleSkill

Relationship(holder → servant)
├─ integrity
└─ progression / training

Card
├─ holderCharacterId
├─ servantCharacterId
└─ slot

Battle Runtime
= @loomrealm-game/battle Simulation authority
├─ hp / maxHp
├─ tile / direction
├─ action
├─ protectedUntilTickExclusive
├─ resolved skills
└─ Decision / Simulation working state
```

当前随身 Card 进入 Battle 时：

```text
Card(holder=A, servant=B)
+
Relationship(A → B).integrity / progression
+
Character B → BattleActor Content
↓
@loomrealm-game/battle Runtime Actor
```

Battle Simulation 拥有本场权威运行状态。对于 Card Battle Manifestation，Battle 初始 HP 来自 Relationship.integrity；战斗结束后需要持久的 Integrity 结果写回同一 Relationship。

普通剧情战斗或临时敌方本体不需要为了 Battle 制造 Relationship / contract / 持久 Card：

```text
Story / Encounter Battle definition
+
BattleActor Content
↓
Battle Runtime Actor
↓
Battle
↓
Runtime 丢弃
```

所以：

```text
Character != Relationship != Card != Battle Runtime Actor
```

## Card 自由对话如何使用 Character 与 Relationship

Card 自由对话不在 Card 上复制人格或关系资料。

对于 `Card(holder=A, servant=B)`：

```text
Card
→ servantCharacterId = B
→ 读取 B 的 Character 固定 AI 人物描述

Relationship B → A
→ 读取 B 当前怎么看 A

Relationship A → B
→ 读取 A 持有 B 这份契约的长期状态（需要时）

+
必要的当前剧情 / Card context
↓
LLM
```

LLM 当次生成的话默认只是对话输出，不自动修改 Character Content、Relationship 或其他 Realm State。是否形成长期关系变化，由游戏业务明确提交。

当前不建立独立 Conversation Memory；只有实际玩法证明 Relationship 动态文本不足时再讨论。

## 场景实例解析

Character 的 Content 默认场景实例是**纯 fallback**，不是与 Event scene source 并列竞争的来源。

对任意持久 Character `X`，Story Resolver 先检查当前所有 active Event State：

```text
是否存在任意 Event State scene directive
满足 characterId = X？
```

这里的 scene directive 包括 placement 和 `absent`。只写 `npcId`、没有 `characterId` 的 transient / 非 Character NPC 不会因此接管某个 Character 的默认场景。

规则：

```text
没有任何 active Event State 提到 Character X
→ 使用 Character X 的 default scene instances

至少一个 active Event State 提到 Character X
→ Character X 的所有 default scene instances 整体退出解析
→ Character X 当前场景完全由这些 Event sources 决定
```

因此 Event 不是“比 default 优先一点”，而是一旦提到 Character 就**接管这个 Character 当前的 scene projection**。

Event sources 之间继续正常合并：

```text
Event A → Character X absent
Event B → Character X placement at town

→ default 不参与
→ Event A 不提供 placement
→ Event B 提供 placement
→ 最终使用 town placement
```

`absent` 不压制其他 Event 的明确 placement，也不建立 Event priority。它只表示：

> **这个 Event 当前明确提到了这个 Character，但本 Event 不为它提供出现 placement。**

如果当前 active Event 已经接管 Character，而所有相关 Event 都没有提供 placement，则这个 Character 当前不出现。

同一个 NPC 可以在不同 Map 上各自有出现定义；最终每张 Map 内仍要求 `npcId` 唯一。

一个静态 NPC Instance 至少需要足够的信息生成 Map placement：

```text
instanceId
npcId
type: "static"
mapId
x
y
direction
pattern?
```

`mapId` 使用地图编号；`direction` 使用 Map 当前约定的 `2/4/6/8`。

## Builder 与 Runtime 检查

Builder 应检查构建期即可确定的错误，例如：

- 同一个 Event state 内重复 `(mapId, npcId)`；
- 单个定义中重复 `instanceId`；
- 引用了不存在的 Character / NPC / Map；
- 非法坐标、方向或不完整 placement；
- Character 引用了不存在的 BattleActor Content；
- BattleActor 引用了不存在的 BattleSkill / resource；
- Story Index 与源 Content 不一致。

Builder **不因为以下情况失败**：

```text
同一个 npcId 被多个不同 Event 引用
同一个 npcId 在同一 Event state 中出现在多个不同 Map
同一个 Character 被多个 Event 引用
同一个 Character 出现在多个不同 Map
同一个 Character 被多个不同主公的 Relationship / contract 引用
一个 Event 对 Character 声明 absent、另一个 Event 对同一 Character 提供 placement
```

Runtime 合并当前 Character / Event / Encounter 等来源时：

```text
active Event 没有提到 Character X
→ 才加入 Character X default scene instances

active Event 至少一个提到 Character X
→ 不加入任何 Character X default scene instance
→ 只合并 Event 对 X 的 scene directives
```

最终对每个 Map 必须保证：

```text
npcId 唯一
```

如果不同剧情来源最终在同一 Map 产生重复 `npcId`，Story Resolver 必须确定性处理为冲突，不能因为 `instanceId` 不同而同时保留。

## 进图与读档

Map Enter 概念流程：

```text
Map Enter
→ 读取该 Map 对应的 Story Index
→ 读取 EventStateList
→ 读取相关 active Event State
→ 收集这些 Event State 提到的 Character 集合
→ 对未被 Event 提到的 Character 使用 default scene instances
→ 对被 Event 提到的 Character 只使用 Event scene directives
→ 合并其他 NPC / Encounter 来源
→ 校验 npcId 唯一
→ 得到 NPC Instance 集合
→ 映射为 NPCPlacement[]
→ context.setNPC(...)
```

读档恢复的是 EventStateList、Relationship（包括 contract / integrity / progression）、当前随身 Card 以及其他已确认 mutable facts。Character 固定 AI 人物描述、BattleActor / BattleSkill Content、默认实例、Event state 中声明的场景实例和 Story Index 都继续从安装 Content 读取。