# 人物

> 独立技术设计记录。不改写 `../DESIGN.md`。本文决定持久人物的 Content、长期 Relationship、当前随身 Card，以及人物如何投影成 Map NPC Instance。固定 Dialogue、Encounter 和具体 Skill 规则分别在对应模块继续设计。

归宿总表见 [数据落点](./60-data-placement.md)。

## Content 里的人物

一个持久的人一条 Character Content 记录。主角、家人、博士、宿敌、店主，以及以后可以建立契约的修行者，都是 Character。进图时随机生成的普通混混、路霸不要求建立持久 Character，可以走 Encounter template。

人物记录放稳定、不随这一局游玩改变的定义，例如：

- **身份**：`id`、名称。`id` 是人物级事实的稳定 identity，也是其他静态定义关联人物的稳定键。
- **描述**：职业、性格、经历等作者定义的静态资料。
- **功能标签**：研究者、店主、家人等世界职责。
- **固定 AI 人物描述**：一段供自由对话 AI 使用的自然语言人物说明，可以表达性格、说话习惯、背景、价值观等不值得拆成规则字段的信息。
- **默认场景实例**：没有更高优先级剧情覆盖时，这个人默认如何出现在 Map；一个 Character 可以有 0..N 个默认 NPC Instance。
- **Battle 静态资料**：形成 Battle Actor 所需的基础能力、可用技能与相关表现资源。具体 Skill 结构后续单独设计。

固定 AI 人物描述属于 immutable Content。它回答“这个人本来是什么样的人”，不会因为这一局与玩家关系变化而改写。需要被规则读取的事实仍然使用结构化数据。

所有持久 Character 都应准备好形成 Card / Battle 表现所需的静态素材与数据。这只是 **Content 完备性规则**，不表示当前游戏规则允许与这个人物建立契约，也不推导 `canContract = true`。

## Character 与 Map NPC Instance

Character 与 Map NPC Instance 是两个层次：

```text
Character
= “这个人是谁”

Map NPC Instance
= “当前场景里出现的一个人物表现实例”
```

Character identity 是唯一的，但它在 Content / 当前剧情投影中可以对应 **0..N 个 NPC Instance**。同一个 Character 可以出现在不同地图，也可以在同一张地图上出现多个 NPC Instance；这些实例仍然共享同一个 Character identity 和人物级 Relationship。

例如：

```text
Character rival
├─ instanceId: rival-lab-a
├─ instanceId: rival-lab-b
└─ instanceId: rival-town
```

真正区分 Map 实例的是 `instanceId`。`characterId` 或 `npcId` 重复出现本身不是错误。

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

`@loomrealm-game/map` 根据 `npcId` 读取 `[struct]NPC/<npcId>` 的窄 `name + sprite` 定义。Character Content 负责“这个人是谁以及人物 / Card / Battle 所需的静态数据”，Map NPC definition 负责地图表现，World / Story Resolver 负责“当前 Map 应该出现哪些实例”。

## Relationship：A → B 的长期关系状态

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
└─ contract?              // A 是主公，B 是从者
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

- `affinity`、`hostile` 等结构化状态给游戏规则使用；
- 动态关系描述文本主要给 AI 自由对话理解关系，不替代规则字段。

### Contract 是 Relationship 上的正式关系事实

当前不建立独立 Contract Realm State 对象。

`A → B` Relationship 上的 `contract` 表示：

> **A 已经以主公身份与 B 这个从者建立正式契约。**

Relationship 很好不代表一定有契约；契约成立以后 affinity / hostile 仍然继续变化。把 B 从随身 Card 编队移出，也不会解除这个 contract。

同一个 Character 可以与多个主公分别建立契约：

```text
player → rival     contract
lord-b → rival     contract
```

它们共享同一个 `rival` Character Content，但各自拥有独立的有向 Relationship。

初始 affinity、hostile、关系文本与初始 contract 都可以来自 Game Entry `state.records` baseline。

## Card：当前随身的战斗卡片状态

**Card 不再嵌在 Relationship 里。** Card 是独立的 Realm State 业务对象，但它的定义被进一步收窄：

> **技术数据模型里的 Card，只表示当前被主公带在身上、主要用于 Pocket / Battle 的角色卡。**

因此：

```text
Relationship contract
= 长期正式契约是否成立

Card
= 这份已成立契约当前是否进入随身编队，以及这张随身卡当前的 Battle-facing 状态
```

有 contract 不代表当前一定有 Card：

```text
player → rival
contract = true
Card(player, rival) exists      // 当前随身
```

或者：

```text
player → rival
contract = true
Card(player, rival) absent      // 当前不随身
```

当前 Card 概念至少需要表达：

```text
Card
├─ holderCharacterId
├─ servantCharacterId
├─ carried slot
└─ battle state
   └─ integrity
```

其中：

- `holderCharacterId`：当前主公；
- `servantCharacterId`：Card 代表的从者；
- `carried slot`：当前随身编队位置；序章只有 1 个随身位；
- `integrity`：Card Battle Manifestation 的完整度 / 稳定度，不是 Character 本体生命值。

Card 的独立 `cardId` **尚未冻结**。是否直接使用 `(holderCharacterId, servantCharacterId)` 作为当前随身 Card identity，等 Card Record shape 最终设计时再决定。

Card 不复制人物姓名、人格、基础能力、技能或固定 AI 描述。这些继续从 `servantCharacterId` 指向的 Character Content 读取。

### 当前仍未冻结：非随身时的长期 Battle / 成长状态

Card 被限定为“当前随身卡”以后，会留下一个需要后续单独解决的问题：

> **从者有 contract、但当前不随身时，Card Integrity、训练 / 成长等需要跨编队切换保存的事实最终放在哪里？**

现在不擅自增加 `ContractedServantState`、`ManagedCard` 等新 authority。等 Skill / Progression / Center 管理一起设计后再冻结。

因此当前只确认：

- Relationship 保存契约事实，不保存 Card Integrity；
- Card 独立于 Relationship，表示当前随身 Card；
- Battle Runtime 不直接成为长期状态；
- 非随身时需要继续存在的 Battle / 成长事实的最终 owner 仍待设计。

## Battle 数据边界

目前 Battle 相关数据分三层：

```text
Character Content
= 固定 Battle 定义
├─ base battle stats
├─ skills
└─ Battle presentation/resources

Card State
= 当前随身 Card 的 Battle-facing 状态
└─ integrity

Battle Runtime
= 这一场战斗的临时模拟状态
├─ currentHp / maxHp
├─ current stats
├─ resolved skills
├─ cooldown / status / buff / debuff
└─ simulation state
```

随身 Card 进入 Battle 时：

```text
Character Battle Content
+
Card battle state
↓
Battle Actor
```

Battle Simulation 拥有本场 `currentHp`、技能冷却、Buff / Debuff、Decision 等权威。战斗结束后，World 再解释哪些结果需要提交为长期业务事实。

普通剧情战斗或临时敌方 Card 不需要为了 Battle 制造 Relationship / contract / 持久 Card：

```text
Story / Encounter Battle definition
+
Character / Battle profile
↓
Battle Actor
↓
Battle
↓
Runtime 丢弃
```

所以：

```text
Character != Relationship != Card != Battle Actor
```

技能的具体 Content shape、参数和执行模型下一步单独设计。

## Card 自由对话如何使用 Character 与 Relationship

Card 自由对话不在 Card 上复制人格或关系资料。

对于 `Card(holder=A, servant=B)`：

```text
Card
→ servantCharacterId = B
→ 读取 B 的 Character 固定 AI 人物描述

Relationship B → A
→ 读取 B 当前怎么看 A

+
必要的当前剧情 / Card context
↓
LLM
```

LLM 当次生成的话默认只是对话输出，不自动修改 Character Content、Relationship 或其他 Realm State。是否形成长期关系变化，由游戏业务明确提交。

当前不建立独立 Conversation Memory；只有实际玩法证明 Relationship 动态文本不足时再讨论。

## 场景实例解析

人物在当前剧情下如何出现在 Map，继续采用 Content 驱动的解析思路：

1. **Realm State 中必要的临时剧情覆盖。** 只保存真正不能由 Event current state 重算的临时事实。
2. **Event 场景定义。** Realm State 记录 Event 当前 state id，对应 Content 可以声明 Character 的 NPC Instance / placement。
3. **Character 的 Content 默认场景实例。** 没有更高层覆盖时使用。
4. **没有实例。** 三层都没有提供实例时，这个人当前不投影到 Map。

重要的是：每层结果都是 0..N 个 NPC Instance，不强制一个 Character 只能有一个位置。

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

剧情定义仍可表达 `absent`：表示“这一层明确要求不出现”，而不是“本层没有定义”。精确 JSON shape 随 Event / placement schema 后续统一确定。

## Builder 与 Runtime 检查

Builder 应检查构建期即可确定的错误，例如：

- 同一个实例集合中的重复 `instanceId`；
- 引用了不存在的 Character / NPC / Map；
- 非法坐标、方向或不完整 placement；
- Character Battle Content 引用了不存在的技能或资源；
- Story Index 与源 Content 不一致。

Builder 不因为以下情况失败：

```text
同一个 characterId 出现多次
同一个 npcId 出现多次
同一个 Character 在同一 Map 上产生多个 NPC Instance
同一个 Character 被多个不同主公的 Relationship / contract 引用
```

如果不同剧情来源在 Runtime 当前状态下最终产生相同 `instanceId`，Story Resolver 必须确定性处理冲突，不能随机保留一个。

## 进图与读档

Map Enter 概念流程：

```text
Map Enter
→ 读取该 Map 对应的 Story Index
→ 读取相关 Event current state
→ Story Resolver 解析 Character / Event Content
→ 得到当前 Map 的 NPC Instance 集合
→ 映射为 NPCPlacement[]
→ context.setNPC(...)
```

读档恢复的是 Event current state、Relationship、当前随身 Card 以及其他已确认 mutable facts。Character 固定 AI 人物描述、Battle 静态资料、技能定义、默认实例、Event state 中声明的场景实例和 Story Index 都继续从安装 Content 读取。