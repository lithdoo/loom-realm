# 人物

> 独立技术设计记录。不改写 `../DESIGN.md`。本文决定持久人物的 Content、长期 Relationship 状态，以及人物如何投影成 Map NPC Instance。字段形状以外的对话、遭遇和具体技能规则留到各自模块。

归宿总表见 [数据落点](./60-data-placement.md)。

## Content 里的人物

一个持久的人一条 Character Content 记录。主角、家人、博士、宿敌、店主，以及以后可以收服的修行者，都是人物。进图时随机生成的混混、路霸不是持久人物，他们走遭遇模板。

人物记录放稳定、不随这一局游玩改变的定义，例如：

- **身份**：`id`、名称。`id` 是人物级事实的稳定 identity，也是关联人物资源和其他静态定义的稳定键。
- **描述**：职业、性格、经历。这是作者写好的静态内容；这一局里实际发生的事记在剧情 State。
- **功能标签**：研究者、店主、家人这类标签，说明这个人在世界上的职责。
- **固定 AI 人物描述**：一段供自由对话 AI 使用的自然语言人物说明，可以表达性格、说话习惯、背景、价值观等不值得拆成游戏规则字段的信息。
- **默认场景实例**：在没有临时覆盖、也没有当前 Event State 覆盖时，这个人默认可以怎样出现在 Map 场景中。一个 Character 可以没有默认实例，也可以有多个默认 NPC Instance。
- **Battle 静态资料**：形成 Battle Actor 所需的基础能力、可用技能与相关静态资源。具体技能结构后续单独设计。

固定 AI 人物描述属于 immutable Content。它回答的是“这个人本来是什么样的人”，不会因为这一局与玩家关系变化而改写。游戏规则也不依赖解析这段自然语言；需要被规则读取的事实仍然使用结构化数据。

人物相关的图像、角色卡表现、Battle 表现等资源不要求全部塞进这一条 Character 记录。所有持久角色都应当提供形成角色卡和进入 Battle 所需要的静态素材与数据，并通过人物 `id` 或由它稳定关联的 Content key 取得。

这是一条 **Content 完备性规则**，不是“谁可以收服”的游戏规则：

> **所有持久角色都准备好角色卡 / Battle 所需素材与数据；某个角色当前是否允许建立契约、什么时候能够获得角色卡，仍由剧情、关系和系统规则决定。**

因此不因为素材已经存在，就在 Character Content 上推导 `canContract = true` 之类的业务结论。

## Character 与 Map NPC Instance

Character 与 Map NPC Instance 是两个层次：

```text
Character
= “这个人是谁”

Map NPC Instance
= “当前场景里出现的一个人物表现实例”
```

Character identity 是唯一的，但它在 Content / 当前剧情投影中可以对应 **0..N 个 NPC Instance**。同一个 Character 可以出现在不同地图，也可以在同一张地图上出现多个 NPC Instance；这不会自动产生多个 Character，也不会复制 Relationship 中的契约、角色卡等人物级长期事实。

例如：

```text
Character rival
├─ instanceId: rival-lab-a
├─ instanceId: rival-lab-b
└─ instanceId: rival-town
```

这里真正区分 Map 实例的是 `instanceId`。`characterId` 或 `npcId` 重复出现本身不是错误。

PokeMan 的剧情 / Character Content 可以把某个 NPC Instance 关联到一个 Character；真正传给 `@loomrealm-game/map` 时，World 只生成 Map API 已有的：

```text
NPCPlacement
├─ instanceId
├─ npcId
├─ x
├─ y
├─ direction
└─ pattern?
```

`@loomrealm-game/map` 根据 `npcId` 读取 `[struct]NPC/<npcId>` 的窄 `name + sprite` 定义。Character Content 负责“这个人是谁以及他有哪些人物 / 角色卡 / Battle 静态数据”，Map NPC definition 负责地图表现需要的资源，World / Story Resolver 负责“当前 Map 应该出现哪些实例”。

## Relationship：A → B 的长期关系状态

Relationship 是 Realm State 中两个人之间、带方向的长期业务状态。

```text
A → B
= A 与 B 当前持续存在的关系状态
```

其中一部分描述“A 怎么看 B”，另一部分可以表示 A 是否已经以主公身份与 B 建立正式契约，以及这份契约对应的长期 Card 状态。

所以：

```text
player → rival
```

和：

```text
rival → player
```

是两份不同的 Relationship，不要求对称。双向契约也就是两个方向分别成立契约，不需要额外创建独立 Contract Record。

当前概念结构：

```text
Relationship
├─ affinity
├─ hostile
├─ dynamic relationship text
└─ contract?              // A 是主公，B 是从者
   └─ card                // 该契约唯一的长期 Card 状态
      ├─ integrity
      └─ carried / managed state
```

这里先表达概念职责，最终 Realm State key / JSON shape 后续再冻结。

### affinity / hostile / 关系文本

`affinity` 是整数。**hostile 与 affinity 是独立事实，不由 `affinity < 0` 推导。**

例如：

```text
affinity = -20
hostile = false
```

可以表示 A 很不喜欢 B，但当前没有进入敌对冲突；反过来，也允许因为剧情或行为让当前关系进入 hostile，而不要求先把 affinity 改成负数。

动态关系描述文本用自然语言表达这一局里 A 对 B 当前形成的关系语境，例如共同经历、认可、不满、习惯性的态度等。它会随着游戏过程变化，因此属于 Realm State，并随存档恢复。

结构化状态和关系文本职责不同：

- `affinity`、`hostile` 等结构化状态给游戏规则使用；
- 动态关系描述文本主要给 AI 自由对话理解关系，不替代规则字段。

### 契约与长期 Card 直接挂在 Relationship

当前不再单独建立 Contract Realm State 对象。

`A → B` Relationship 上的 `contract` 表示：

> **A 已经以主公身份与 B 这个从者建立正式契约。**

Relationship 很好不代表一定有契约；契约成立以后 affinity / hostile 仍然可以继续变化。

同一个 Character 可以与不同主公分别存在契约：

```text
player → rival     contract
lord-b → rival     contract
```

它们共享同一个 `rival` Character Content，但拥有各自独立的 Relationship / Card 长期状态。

当前产品规则是一份契约对应一张长期 Card，因此不额外引入 `contractId` / `cardId`。Relationship 的有向 identity 已经能唯一确定这份契约和对应 Card。

Card 不是 Character 副本。当前只把真正需要长期保存的 Card 运行状态放在这里，例如：

- **Card Integrity**：Battle Manifestation 的持久完整度 / 稳定度；
- **carried / managed**：当前随身还是由中心管理。

技能、人物基础能力、角色图等不会复制到 Relationship/Card State；这些静态定义从 Character Content 取得。

初始 affinity、hostile、初始关系文本，以及需要在新 Session 一开始就存在的初始契约 / Card 状态，都可以写在 Game Entry 的 `state.records` baseline 中，并在 Session bootstrap 时成为 Realm State initial value。

## Battle 数据的三层边界

Battle 相关数据继续分三层，不因为 Contract/Card 并入 Relationship 而混在一起。

```text
Character Content
= 固定 Battle 定义
├─ base battle stats
├─ skills
└─ Battle presentation/resources

Relationship State
= 这份长期契约留下的持久 Card 状态
└─ Card Integrity / carried-managed

Battle Runtime
= 这一场战斗的临时模拟状态
├─ currentHp / maxHp
├─ current stats
├─ skills resolved for this battle
├─ cooldown / status / buff / debuff
└─ simulation state
```

Card Integrity 不是 Character 本体生命值。Card Manifestation 进入 Battle 时，可以用 Character Battle Content + Card Integrity 构造本场 Battle Actor；战斗结束后，再把需要长期保存的卡片损耗解释并写回 Card Integrity。

普通剧情战斗或临时敌方卡不需要为了 Battle 临时制造 Relationship / Contract / 持久 Card。它可以直接由剧情 / Encounter Content + Character 或 Battle profile 构造一个本场 Battle Actor，战斗结束以后临时状态直接丢弃。

因此：

```text
长期 Card
Relationship contract/card
→ Battle Actor
→ Battle
→ 必要结果写回 Card Integrity

剧情临时对手
Story / Encounter Battle definition
→ Battle Actor
→ Battle
→ Runtime 丢弃
```

技能的具体 Content 结构、技能参数和执行模型下一步单独设计；这里先只冻结它属于静态 Battle Content，而不是 Relationship/Card State。

## Card 自由对话如何使用 Character 与 Relationship

Card 自由对话不需要在 Card 上复制一套人格或关系资料。

概念上：

```text
Relationship A → B
└─ contract/card
   → represented Character = B
   → 读取 B 的 Character 固定 AI 人物描述

再读取 B → A 的 Relationship
= B 当前怎么看 A

再加必要的当前剧情 / Card context
→ 交给 LLM
```

例如 `player → rival` 的契约 Card 与玩家自由对话时，固定人物性格来自宿敌 Character Content，而宿敌当前对玩家的态度主要来自 `rival → player` Relationship State。

LLM 当次生成的话默认只是对话输出。它不会因为说出某句话就自动修改 Character 固定设定、Relationship 动态文本或其他 Realm State。是否把一次对话形成的长期变化写回 Relationship，由游戏业务明确决定并提交。

当前不单独建立 Conversation Memory 数据对象；如果以后实际玩法证明 Relationship 的动态文本不足以承载所需的长期对话语境，再单独设计。

## 场景实例解析

人物在当前剧情下如何出现在 Map，继续采用 Content 驱动的三层解析思路：

1. **Realm State 中必要的临时剧情覆盖。** 用于真正需要跨当前运行状态保存、且不能只靠 Event current state 重算的临时事实。
2. **事件场景定义。** 见 [事件](./62-event.md)。Realm State 只记录 Event 当前的 state id；对应 state 的 Content 可以声明当前 Character 的 NPC Instance / placement。按剧情顺序查看提到该人物的事件，继续采用最后一条当前状态中提供人物场景定义的事件。
3. **Character 的 Content 默认场景实例。** 没有前两层覆盖时使用。
4. **没有实例。** 三层都没有提供实例时，这个人当前不投影到 Map。

第二层的“多个 Event 如何排序、冲突时如何解析”暂时保持当前设计方向，后续继续讨论。Builder 生成 Story Index 只是为了让 Runtime 能够直接找到相关 Event / Map / Character 定义，不改变这套剧情语义。

重要的是：**每一层解析出的结果是 0..N 个 NPC Instance，而不是强制一个 Character 只能得到一个位置。**

一个静态 NPC Instance 最终至少需要足够的信息生成 Map placement，例如：

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

`mapId` 使用地图引擎的地图编号。`x`、`y` 是格子坐标。`direction` 使用地图引擎的朝向：`2` 下、`4` 左、`6` 右、`8` 上。

剧情定义仍可表达该人物当前不应使用更低层默认实例。现有 `absent` 语义保留：它表示“这一层已经明确给出不出现的结果”，而不是“本层没有定义”；精确 JSON shape 随 Event / placement schema 后续统一确定。

## Builder 与 Runtime 检查

Builder 应检查构建期即可确定的错误：

- 同一个实例集合中的重复 `instanceId`；
- 引用了不存在的 Character / NPC / Map；
- 非法坐标、方向或不完整 placement；
- 生成的 Story Index 与源 Content 不一致。

Builder 不因为以下情况失败：

```text
同一个 characterId 出现多次
同一个 npcId 出现多次
同一个 Character 在同一 Map 上产生多个 NPC Instance
```

如果不同剧情来源在 Runtime 当前状态下最终产生了相同 `instanceId`，Story Resolver 必须把它作为确定性的剧情实例冲突处理，不能随机保留一个。具体冲突 / 顺序规则留到 Event 设计继续讨论。

## 进图时怎么画

概念流程：

```text
Map Enter
→ 读取该 Map 对应的 Story Index
→ 读取相关 Event current state
→ Story Resolver 解析 Character / Event Content
→ 得到当前 Map 的 NPC Instance 集合
→ 映射为 NPCPlacement[]
→ context.setNPC(...)
```

读档恢复的是 Event current state、Relationship（包括契约 / 长期 Card 状态）等 mutable facts。Character 固定 AI 人物描述、Battle 静态资料、默认实例、Event state 中声明的场景实例和 Builder 生成的 Story Index 都继续从当前安装 Content 读取，不在存档里重复保存一份。