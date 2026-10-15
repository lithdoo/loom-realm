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

- 固定 Dialogue 引用；
- 某些 NPC / Character 在当前状态下应出现在哪些 Map、什么位置；
- 后续确认的其他纯 Content 剧情定义。

当前处于哪个状态 id，记在 Realm State 里。World / Story Resolver 只读取当前 state 对应的 Content，不把 state value 本身复制进 Realm State。

## NPC 出现规则

PokeMan 对剧情 NPC 的最终地图结果增加一个明确约束：

> **同一个 `npcId` 可以同时出现在多张不同 Map；但同一张 Map 的最终解析结果中，一个 `npcId` 最多出现一次。**

也就是最终场景要求：

```text
(mapId, npcId) 唯一
```

允许：

```text
map 1 → npcId: rival
map 2 → npcId: rival
map 3 → npcId: rival
```

不允许最终解析成：

```text
map 1 → npcId: rival
map 1 → npcId: rival
```

这里的唯一性约束针对 **最终 Map 场景**，不是针对 Event source Content。

### 同一个 Event state

同一个 Event state 可以多次声明同一个 `npcId`，只要这些出现位于不同 Map：

```text
Event A
state: active
├─ map 1 → rival
├─ map 2 → rival
└─ map 3 → rival
```

这是合法的。

如果同一个 state 自己就声明：

```text
map 1 → rival
map 1 → rival
```

那么 `(mapId, npcId)` 冲突可以在构建期确定，Builder 应直接报错。

### 不同 Event 之间

不同 Event 可以都声明同一个 NPC，当前不对 source Content 做跨 Event 唯一性限制：

```text
Event A current state → map 1 / rival
Event B current state → map 1 / rival
```

这两条定义本身都合法。它们可能处于互斥剧情阶段，也可能因为当前 Realm State 恰好同时生效。

只有当 Runtime 根据当前所有 Event state 合并场景后，最终同一 Map 真的得到两个相同 `npcId` 时，Story Resolver 才把它作为确定性冲突处理。

因此规则是：

```text
Source Content 可以跨 Event 重复
↓
Story Resolver 合并当前所有来源
↓
Final resolved Map 必须满足 (mapId, npcId) 唯一
```

## Character 与 NPC

Character 表示“这个人是谁”，NPC Definition / `npcId` 表示地图角色表现模板，两者不是同一个 identity。

因此“同一个 Character 能否在同一 Map 出现两次”不能只看 `characterId`；真正限制的是最终 `npcId`：

- 同一个 Character 可以同时出现在多个不同 Map；
- 同一个 Character 如果使用不同 `npcId`，是否允许同图多表现不在这里额外禁止；
- 当前明确禁止的是同一最终 Map 出现两个相同 `npcId`。

Event state 中的静态出现定义最终至少需要足够的信息生成 Map `NPCPlacement`，例如：

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

`instanceId` 继续满足 `@loomrealm-game/map` 的实例 contract，但 PokeMan 业务层不再用它来允许“同一 Map 出现多个相同 `npcId`”。最终场景唯一性看 `(mapId, npcId)`。

Event 也可以明确声明某个 NPC / Character 当前不使用更低层默认场景定义。现有 `absent` 语义继续保留；精确 JSON shape 后续统一确定。

某个 state 没有写某个 NPC 的场景定义，和明确写 `absent` 不是一回事：

```text
没有定义
→ 本 Event 不为该 NPC 提供这一层结果

absent
→ 本 Event 已明确决定该 NPC 当前不从更低层默认定义出现
```

## 多个 Event 的解析

当前不再把“不同 Event 是否引用同一 NPC”本身视为冲突。

Story Resolver 根据当前 Realm State 读取所有相关 Event 的 current state，收集这些 state 对当前 Map 提供的场景定义，再对最终结果做约束检查。

仍待继续设计的是：

- 剧情顺序是否还需要成为显式数据；
- 如果多个 Event 同时为同一 `(mapId, npcId)` 提供定义，是直接冲突还是未来允许显式 override；
- `absent` 与其他 Event 的出现定义同时命中时如何解析。

当前先保持最保守规则：**如果最终合并后同一 Map 出现重复 `npcId`，Runtime 必须确定性报冲突，不能随机保留一个。**

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
→ 合并当前 Map 的 NPC 定义
→ 校验最终 npcId 唯一
→ 得到 NPC Instance / NPCPlacement 集合
```

Story Index：

- 是 Builder 生成的派生 Content；
- 不是真相的第二份 authority；
- 不进入 Realm State；
- 不进入 Save；
- 可以随 Content 重新构建。

作者主要维护可读的 Event / Character 源数据，不要求手工同步多个索引文件。

## Builder 与 Runtime 检查

Builder 应检查能够静态确定的问题，例如：

- Event / state identity 重复；
- 同一个 Event state 内重复 `(mapId, npcId)`；
- 单个定义中的重复 `instanceId`；
- 引用不存在的 Character / NPC / Map；
- 非法 placement；
- 派生 Story Index 与源定义不一致。

Builder **不因为以下情况失败**：

```text
同一个 npcId 被多个不同 Event 引用
同一个 npcId 在同一个 Event state 中出现在多个不同 Map
同一个 Character 被多个 Event 引用
同一个 Character 出现在多个 Map
```

Runtime 在合并当前所有来源后必须检查：

```text
对每个 mapId：npcId 唯一
```

不同 Event 最终同时产生同一 `(mapId, npcId)` 时，Story Resolver 必须确定性处理为冲突；当前不定义隐式 last-wins。
