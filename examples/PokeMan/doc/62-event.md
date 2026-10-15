# 事件

> 独立技术设计记录。不改写 `../DESIGN.md`。

## 定位

Event 是剧情 Content。它描述“某段剧情有哪些状态，以及每个状态下世界应该如何表现”，而不是把这些剧情规则硬编码进 World，也不是把所有展开后的世界结果重复保存进 Realm State。

Realm State 只保存这一局真正的动态进度，例如：

```text
eventId → currentStateId
```

以及其他不能只靠 Content 重建的玩家选择或业务事实。

## 结构

一条事件有事件 `id`，以及一个 `states` 对象。这个对象包含该事件的全部状态。

```text
Event
  id
  states:
    [stateId]: 该状态的剧情数据
```

`states` 的 key 是状态 id。value 可以包含这个状态下的静态剧情内容，例如：

- 静态 Dialogue / 文本；
- 某些 Character 在当前场景下应产生的 NPC Instance / placement；
- 后续确认的其他纯 Content 剧情定义。

当前处于哪个状态 id，记在 Realm State 里。World / Story Resolver 只读取当前 state 对应的 Content，不把 state value 本身复制进 Realm State。

## Character 场景实例

Event state 可以为某个 Character 提供当前场景实例定义。一个 Character 在同一个 Event state 下可以对应 **0..N 个 NPC Instance**，包括同一张地图上的多个实例。

```text
Character rival
→ Event state
   ├─ rival-lab-a
   └─ rival-lab-b
```

这只表示当前场景里有两个关联到同一 Character 的 Map 表现实例，不表示存在两个 Character 本体。

每个静态实例最终需要足够的信息生成 Map `NPCPlacement`，例如：

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

Event 也可以明确声明当前 Character 不使用更低层默认场景实例。现有 `absent` 语义继续保留；精确 JSON shape 与多实例表示形式后续统一确定。

某个 state 没有写某个 Character 的场景定义，和明确写 `absent` 不是一回事：

```text
没有定义
→ 本 Event 不为该 Character 提供这一层结果

absent
→ 本 Event 已明确决定该 Character 当前不从更低层默认实例出现
```

## 多个 Event 的解析

人物场景解析继续采用当前设计方向：按剧情顺序查看提到该 Character 的 Event，取最后一条当前 state 中提供人物场景定义的 Event。

这条规则目前保留，不在本文提前改成 Runtime mutation 模型。以下问题后续继续讨论：

- 剧情顺序的精确表示；
- 多个 Event 同时命中时的冲突规则；
- Runtime 当前状态下出现相同 `instanceId` 时如何报告确定性错误。

同一个 `characterId` 或 `npcId` 多次出现本身不是冲突；Map 实例冲突以 `instanceId` 为核心判断。

## Story Index

Runtime 不应为了回答“这张 Map 当前有哪些剧情 NPC”而扫描全部 Event。Builder 可以根据作者维护的 Character / Event 等源 Content，生成只读的派生 Story Index，例如：

```text
Story Index
├─ by Map
├─ by Character
└─ by Event
```

索引的职责只是让 Runtime 快速找到相关定义，例如：

```text
Map Enter
→ 读取 by-Map Story Index
→ 得到可能影响本 Map 的 Event / Character 定义
→ 读取这些 Event 的 currentStateId
→ Story Resolver 读取对应 state Content
→ 得到当前 Map 的 NPC Instance 集合
```

Story Index：

- 是 Builder 生成的派生 Content；
- 不是真相的第二份 authority；
- 不进入 Realm State；
- 不进入 Save；
- 可以随 Content 重新构建。

作者主要维护可读的 Event / Character 源数据，不要求手工同步多个索引文件。

## Builder 检查

Builder 应检查能够静态确定的问题，例如：

- Event / state identity 重复；
- 单个实例集合中重复 `instanceId`；
- 引用不存在的 Character / NPC / Map；
- 非法 placement；
- 派生 Story Index 与源定义不一致。

Builder 不因为以下情况失败：

```text
一个 Character 被多个 Event 引用
一个 Character 在多个 Map 出现
一个 Character 在同一 Map 有多个 NPC Instance
同一个 npcId 被多个 instance 使用
```

这些都是合法的剧情 / 地图表现能力。真正的 Character identity、Relationship、Contract 和 Card 仍然只关联到对应 Character，不因为 NPC Instance 数量增加而复制。
