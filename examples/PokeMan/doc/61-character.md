# 人物

> 独立技术设计记录。不改写 `../DESIGN.md`。本文决定持久人物的 Content、关系基础事实，以及人物如何投影成 Map NPC Instance。字段形状以外的对话、遭遇和角色卡实例留到各自模块。

归宿总表见 [数据落点](./60-data-placement.md)。

## Content 里的人物

一个持久的人一条 Character Content 记录。主角、家人、博士、宿敌、店主，以及以后可以收服的修行者，都是人物。进图时随机生成的混混、路霸不是持久人物，他们走遭遇模板。

人物记录放稳定、不随这一局游玩改变的定义，例如：

- **身份**：`id`、名称。`id` 是人物级事实的稳定 identity，也是关联人物资源和其他静态定义的稳定键。
- **描述**：职业、性格、经历。这是作者写好的静态内容；这一局里实际发生的事记在剧情 State。
- **功能标签**：研究者、店主、家人这类标签，说明这个人在世界上的职责。
- **默认场景实例**：在没有临时覆盖、也没有当前 Event State 覆盖时，这个人默认可以怎样出现在 Map 场景中。一个 Character 可以没有默认实例，也可以有多个默认 NPC Instance。

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

Character identity 是唯一的，但它在 Content / 当前剧情投影中可以对应 **0..N 个 NPC Instance**。同一个 Character 可以出现在不同地图，也可以在同一张地图上出现多个 NPC Instance；这不会自动产生多个 Character，也不会复制 Relationship、Contract、Card 等人物级事实。

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

## 关系基础事实

初始好感等 mutable relationship baseline 可以写在 Game Entry 的 `state.records` 里，并在 Session bootstrap 时成为 Realm State initial baseline；它不是玩家点击 New Game 时才安装。

好感是一个整数。**hostile 与好感是独立事实，不由 `affinity < 0` 推导。**

例如：

```text
affinity = -20
hostile = false
```

可以表示双方关系很差，但当前没有进入敌对冲突；反过来，也允许因为剧情或行为让当前关系进入 hostile，而不要求先把 affinity 改成负数。

好感和 hostile 最终属于 Relationship，而不是 Character 本体属性。Relationship 的 identity、方向性和完整 Record shape 留到后续关系 / 契约设计单独确定。

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

读档恢复的是 Event current state、Relationship、Card 等 mutable facts。Character 默认实例、Event state 中声明的场景实例和 Builder 生成的 Story Index 都继续从当前安装 Content 读取，不在存档里重复保存一份。
