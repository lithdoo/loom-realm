# 事件

> 独立技术设计记录。不改写 `../DESIGN.md`。

## 定位

Event 是剧情 Content。它描述“某段剧情有哪些状态，以及每个状态下世界应该如何表现和交互”，而不是通用 workflow engine。

Event Content 定义合法的非空 `stateId`、每个状态下的 Map / NPC 投影，以及当前 NPC 交互从哪段固定 Dialogue 开始。

当前 Event 运行进度统一保存在 Realm State 的一个 **EventStateList Record** 中：

```text
EventStateList
[
  { eventId, stateId },
  ...
]
```

列表只保存当前有非空状态的 Event。读取语义是：

```text
列表中存在 eventId
→ current state = 对应 stateId

列表中不存在 eventId
→ current state = null
→ Event 当前为空状态 / 未启动
```

Event state 的变化不硬编码成 `if (state === A) state = B`。变化规则单独写成 immutable `EventStateMutation` Content，由明确的 Dialogue completion 或其他业务结果引用；真正执行 Mutation 的是相应 PokeMan Subsystem。

当前坚持：

```text
Event
= 持久剧情阶段 + 当前阶段的场景 / 交互定义

EventStateList
= 当前所有非空 Event state 的唯一 Realm State 列表 Record

EventStateMutation
= 一组 Event state 前置条件 + 一组 Event state 赋值

Event / Mutation
!= 通用 Trigger / Action / Command / Flow engine
```

## Event 基本结构

当前概念结构：

```text
Event
├─ id
└─ states
   └─ [stateId]
      └─ maps
         └─ [mapId]
            └─ npcs
               └─ [npcId]
                  ├─ characterId?
                  ├─ placement
                  └─ interaction?
                     └─ dialogue
```

`Event State NPC interaction` 只负责入口 Dialogue，不维护 `terminalDialogueId → mutation` 映射。

`states` 的 key 是 Event 的合法非空 state id。当前处于哪个 state 来自 EventStateList；state value 自身是 immutable Content，不复制进 Realm State。

按 `mapId → npcId` 组织当前状态的 NPC，也直接体现当前已经确认的静态约束：同一个 Event state 内 `(mapId, npcId)` 唯一。

概念示例：

```yaml
id: professor-intro
states:
  waiting:
    maps:
      lab:
        npcs:
          professor:
            characterId: professor
            placement:
              x: 5
              y: 4
              direction: 2
            interaction:
              dialogue: professor-intro

          rival:
            characterId: rival
            placement:
              x: 8
              y: 4
              direction: 4

  contracted:
    maps:
      lab:
        npcs:
          professor:
            characterId: professor
            placement:
              x: 5
              y: 4
              direction: 2
          rival:
            characterId: rival
            placement:
              x: 8
              y: 4
              direction: 4
```

# EventStateList

## 一个 Realm State Record

Event current state 的物理模型已经确认：**所有 Event 当前状态放在一个列表 Record 中。**

逻辑 shape：

```text
EventStateList
└─ entries[]
   ├─ eventId
   └─ stateId
```

例如：

```json
[
  { "eventId": "professor-intro", "stateId": "waiting" },
  { "eventId": "home-intro", "stateId": "active" }
]
```

约束：

- 同一个 `eventId` 在列表中最多出现一次；
- `stateId` 必须是对应 Event Content 中存在的非空 state；
- 列表不保存 `stateId: null` 项；
- 列表缺少某个 `eventId`，业务读取时就等价于 `null`。

Realm State Record 的最终 namespace / key 名字仍可后续冻结，但不再讨论“一个 Event 一个 Record”方案。

## 初始化

开局 Event 状态来自 Game Entry 安装的初始化 Realm State baseline。安装时直接提供 EventStateList Record，只列出真正已经开始的 Event：

```text
EventStateList
[
  professor-intro → waiting,
  home-intro      → active
]
```

而：

```text
tutorial-battle
rival-story
town-route
```

因为没有 entry，读取时自然都是 `null`。

因此初始化不需要：

```text
inactive
not-started
空 Event Record
为全部 Content Event 预建状态项
```

## 启动、推进与清空

Event 不建立额外 lifecycle API：

```text
null → stateId
= 启动 Event
= 向 EventStateList 新增 entry

stateId A → stateId B
= 推进 Event
= 修改已有 entry

stateId → null
= 清空 / 结束当前 Event state
= 从 EventStateList 删除 entry
```

这里 `null` 是 Mutation / 读取语义，不是 EventStateList 中实际存储的值。

# EventStateMutation

Event state mutation 是独立 immutable Content。Mutation identity 由 Content key / reference 提供，概念数据本身只需要两个字段：

```text
EventStateMutation
├─ from
└─ to
```

其中 `from` / `to` 都是：

```text
eventId → stateId | null
```

例如：

```yaml
from:
  professor-intro: waiting
  rival-story: null

to:
  professor-intro: contracted
  rival-story: contracted
  tutorial-battle: ready
```

这里 `rival-story: null` 表示要求 EventStateList 中没有 `rival-story` entry；`tutorial-battle: ready` 表示 Mutation 成功后向列表新增这个 entry。

## `from` 是 AND 前置集合

同一个 Mutation 的多个 `from` 项全部是 **AND**：

```text
professor-intro == waiting
AND
rival-story == null
```

全部匹配，Mutation 才允许执行。

Mutation 内不增加：

```text
or
anyOf
allOf
not
嵌套 condition tree
通用表达式
```

如果业务需要 OR，则为每个分支分别定义独立 Mutation，并由对应业务分支引用对应 Mutation。

## `from` 与 `to` 不要求一一对应

`from` 和 `to` 的 Event 集合与数量完全不要求相同。

```text
只在 from 中出现
= 只作为前置条件

同时在 from / to 出现
= 检查旧 state 后写入新 state / 删除 entry

只在 to 中出现
= 不要求与某个 from 项配对，直接新增 / 修改 / 删除对应 entry
```

例如启动一个此前为空的 Event：

```yaml
from:
  professor-intro: waiting

to:
  professor-intro: contracted
  tutorial-battle: ready
```

也可以显式要求它此前必须为空：

```yaml
from:
  professor-intro: waiting
  tutorial-battle: null

to:
  professor-intro: contracted
  tutorial-battle: ready
```

清空一个 Event：

```yaml
from:
  tutorial-battle: completed

to:
  tutorial-battle: null
  town-route: open
```

## Mutation 执行

执行一条 Mutation 时：

```text
scope.state.read(EventStateList)
↓
得到 list value + Record version
↓
对 from 中每个 eventId：
  有 entry → current = entry.stateId
  无 entry → current = null
↓
全部 from AND 匹配
↓
复制当前列表并应用所有 to：
  to = stateId → upsert entry
  to = null    → 删除 entry
↓
scope.state.commit()
  condition = EventStateList 当前 version
  write     = 新 EventStateList
↓
一次 Record replacement 完成全部 Event 状态变化
```

所以“多个 Event 同时变化”的原子性直接对应 **一个 EventStateList Record 的一次 Realm State commit**。

如果 OCC version 已变化，Realm State commit 按正常 `CONFLICT` 语义失败；业务不能把旧列表覆盖新列表。

## Mutation 只拥有 Event state

EventStateMutation 只允许检查和改变 Event current state。

不在 Mutation 中增加：

```text
setAffinity
setHostile
createContract
createCard
startBattle
modifyIntegrity
movePlayer
任意 Realm State path/value mutation
```

Relationship / Contract / Card / Battle 等仍由各自业务 owner 处理。EventStateMutation 不演化成通用 Realm State mutation DSL。

# Event State NPC：当前阶段这个 NPC 在哪、怎么交互

NPC Definition / `npcId` 表示地图角色表现模板；Character 表示“这个人是谁”。Event State NPC 表示：

> **在这个 Event 当前非空 state 下，这个 NPC 出现在哪张 Map、什么位置，以及玩家与它交互时从哪段固定 Dialogue 开始。**

因此：

```text
NPC Definition
= 怎么表现

Character
= 是谁

Event State NPC
= 当前剧情阶段在哪里、当前入口交互是什么

Dialogue
= 实际说什么，以及无 Choice Dialogue 完成后是否引用 EventStateMutation
```

当 EventStateList 中没有这个 Event 时，它不提供任何 Event State NPC 投影。

placement 至少要有足够信息最终生成 `@loomrealm-game/map` 的 `NPCPlacement`。

由于 `mapId` / `npcId` 已经来自父级 key，最终 source JSON 是否重复保存这些字段、`instanceId` 如何生成或填写，后续 schema 设计再定。

# NPC 与 Dialogue 的关系

Dialogue 不绑定在 NPC Definition 上，因为同一个 NPC 在不同 Event state 下可以说不同的话。

当前绑定关系是：

```text
EventStateList
→ event current state != null
→ Event state Content
→ mapId
→ npcId
→ interaction.dialogue
```

例如：

```text
state = waiting
professor interaction → professor-intro

state = after-battle
professor interaction → professor-after-battle
```

没有 `interaction` 的 Event State NPC 可以只是场景表现。

# Dialogue 如何触发 Mutation

Mutation 不由 Event State NPC interaction 按 `terminalDialogueId` 映射。

由 **无 Choice Dialogue 自己可选引用一个 EventStateMutation**：

```text
Dialogue
├─ lines[]
├─ choices?[]
└─ mutation?
```

固定互斥约束：

```text
choices 存在
=> mutation 不允许存在

mutation 存在
=> choices 不允许存在
```

因此如果一个 Choice 分支需要改变 Event state，必须先跳到新的 Dialogue，再由那个新的无 Choice Dialogue 完成时触发 Mutation：

```text
professor-intro
→ Choice
   ├─ [接受] → professor-contract-accept
   │              ├─ lines
   │              └─ mutation: professor-contract-accepted
   │
   └─ [拒绝] → professor-contract-refuse
                  └─ lines
```

这里要区分**数据声明**和**执行责任**：

```text
Dialogue Content
= 只声明 mutation ref

EventStateMutation Content
= 只声明 from / to

PokeMan Dialogue Subsystem
= Runtime executor
= 读取 Content
= 读取 EventStateList
= 校验 from
= 计算新列表
= scope.state.commit() 新 EventStateList

@loomrealm-game/rpg-dialogue
= 当前 Conversation interaction / presentation
= 不理解 EventStateMutation
```

执行流程：

```text
玩家与 NPC 交互
↓
World 找到当前 Event state / mapId / npcId
↓
frame.call(PokeMan Dialogue Subsystem)
↓
Dialogue Subsystem 读取入口 Dialogue Content
↓
调用 @loomrealm-game/rpg-dialogue 展示 lines / choices
↓
按 Choice target 继续 Dialogue graph
↓
到达无 Choice Dialogue
↓
有 mutation？
├─ 否 → Dialogue 正常完成
└─ 是 → Dialogue Subsystem 读取 EventStateMutation
         ↓
       读取 EventStateList + version
         ↓
       校验全部 from（AND，包括 null）
         ↓
       生成新 EventStateList
         ↓
       scope.state.commit() 原子替换列表
         ↓
       Dialogue 正常完成
```

Dialogue Frame 仍然可以返回最终 `terminalDialogueId`。

# Runtime 不扫描 Mutation

EventStateMutation 是被引用的数据，不是自动监听规则。

Runtime **不会**：

```text
每次 State 变化后扫描全部 Mutation
→ 找到所有 from 恰好匹配的 Mutation
→ 自动执行
```

正确模型是：

```text
明确业务结果
→ 明确 Mutation ref
→ 对应 PokeMan Subsystem 执行 Mutation
```

当前最直接的 executor 是 PokeMan Dialogue Subsystem。未来 Battle 完成、到达地点等业务如果需要使用同一 Mutation 数据结构，也由对应 Subsystem 明确读取并执行它，而不是让 Content 自己拥有 trigger 或执行能力。

# NPC 出现规则

PokeMan 对剧情 NPC 的最终地图结果有明确约束：

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

这里的唯一性约束针对最终 Map 场景，不是针对跨 Event 的 source Content。

## 同一个 Event state

同一个 Event state 可以多次声明同一个 `npcId`，只要这些出现位于不同 Map。

如果同一个 state 自己声明两次相同 `(mapId, npcId)`，Builder 应直接报错。

## 不同 Event 之间

不同 Event 可以都声明同一个 NPC，不对 source Content 做跨 Event 唯一性限制。

只有 Runtime 根据 EventStateList 中当前所有 active Event 合并场景后，最终同一 Map 真的得到两个相同 `npcId` 时，Story Resolver 才把它作为确定性冲突处理。

```text
Source Content 可以跨 Event 重复
↓
EventStateList 决定当前 active Event
↓
Story Resolver 合并当前来源
↓
Final resolved Map 必须满足 (mapId, npcId) 唯一
```

# Character 与 NPC

Character 表示“这个人是谁”，NPC Definition / `npcId` 表示地图角色表现模板，两者不是同一个 identity。

因此：

- 同一个 Character 可以同时出现在多个不同 Map；
- 同一个 Character 如果使用不同 `npcId`，是否允许同图多表现不在这里额外禁止；
- 当前明确禁止的是同一最终 Map 出现两个相同 `npcId`。

`instanceId` 继续满足 `@loomrealm-game/map` 的实例 contract，但 PokeMan 业务层不再用它来允许“同一 Map 出现多个相同 `npcId`”。最终场景唯一性看 `(mapId, npcId)`。

Event 也可以明确声明某个 NPC / Character 当前不使用更低层默认场景定义。现有 `absent` 语义继续保留；精确 JSON shape 后续统一确定。

某个 state 没有写某个 NPC 的场景定义，和明确写 `absent` 不是一回事：

```text
没有定义
→ 本 Event 不为该 NPC 提供这一层结果

absent
→ 本 Event 已明确决定该 NPC 当前不从更低层默认定义出现
```

EventStateList 没有这个 Event 又是第三种情况：

```text
Event 没有 current state entry
→ 整个 Event 当前不提供任何 State 投影
```

# 多个 Event 的解析

当前不把“不同 Event 是否引用同一 NPC”本身视为冲突。

Story Resolver 根据 EventStateList 读取所有相关 active Event，再读取对应 state Content，收集这些 state 对当前 Map 提供的场景定义。

仍待继续设计的是：

- `absent` 与其他 Event 的出现定义同时命中时如何解析；
- 跨 Event 的同一 `(mapId, npcId)` 是否未来需要显式 override。

当前先保持最保守规则：如果最终合并后同一 Map 出现重复 `npcId`，Runtime 必须确定性报冲突，不做隐式 last-wins。

# Story Index

Runtime 不应为了回答“这张 Map 当前有哪些剧情 NPC”而扫描全部 Event。Builder 可以根据作者维护的 Character / Event 等源 Content，生成只读的派生 Story Index：

```text
Story Index
├─ by Map
├─ by Character
└─ by Event
```

Map Enter：

```text
Map Enter
→ 读取 by-Map Story Index
→ 得到可能影响本 Map 的 Event / Character 定义
→ 读取 EventStateList
→ 查这些 Event 当前是否有 entry
→ 无 entry 的 Event 跳过
→ active Event 读取对应 state Content
→ 合并当前 Map 的 NPC 定义
→ 校验最终 npcId 唯一
→ 得到 NPC Instance / NPCPlacement 集合
```

Story Index 是 Builder 生成的派生 Content，不进入 Realm State / Save，可以随源 Content 重建。

# Builder 与 Runtime 检查

Builder 应检查：

- Event / state identity 重复；
- 安装初始化 EventStateList 中重复 `eventId`；
- 安装初始化 EventStateList 的 `eventId / stateId` 引用了不存在的 Event / state；
- 同一个 Event state 内重复 `(mapId,npcId)`；
- 单个定义中的重复 `instanceId`；
- `interaction.dialogue` 引用了不存在的 Dialogue；
- Dialogue Choice `target` 引用了不存在的 Dialogue；
- 同一个 Dialogue 同时存在 `choices` 与 `mutation`；
- Dialogue `mutation` 引用了不存在的 EventStateMutation；
- Mutation `from` / `to` 中的非空 `stateId` 引用了不存在的 Event state；
- Mutation 同一个 `from` 或 `to` 中不能重复定义同一个 eventId；
- 引用不存在的 Character / NPC / Map；
- 非法 placement；
- 派生 Story Index 与源定义不一致。

Builder **不因为以下情况失败**：

```text
安装 EventStateList 没有列出全部 Event
Mutation.from 包含多个 Event
Mutation.to 包含多个 Event
Mutation.from / to 的 Event key 集合不同
Mutation 使用 null → stateId 启动 Event
Mutation 使用 stateId → null 删除 Event entry
多个独立 Mutation 表达 OR 分支
同一个 npcId 被多个不同 Event 引用
同一个 npcId 在同一个 Event state 中出现在多个不同 Map
同一个 Character 被多个 Event 引用
同一个 Character 出现在多个 Map
合法的 Dialogue cycle
```

Runtime 应保证：

- EventStateList 中 `eventId` 唯一；
- 缺 entry 等价于 current state `null`；
- 缺 entry 的 Event 不参与 Event State 场景投影；
- 只应用被明确引用的 Mutation；
- Mutation 的 executor 是对应 PokeMan Subsystem，不是 Content；
- 被引用 Mutation 的全部 `from` 当前值必须同时匹配，包括显式 `null`；
- Mutation 基于读取到的 EventStateList Record version 做 OCC commit；
- 成功 Mutation 用一次 Record replacement 原子替换整个 EventStateList；
- Runtime 不主动扫描未被引用的 Mutation；
- 合并当前场景来源后，每张最终 Map 内 `npcId` 唯一。

# 当前仍未冻结

- Event / EventStateMutation 的最终 Content namespace / key；
- EventStateList Realm State Record 的最终 namespace / key 名字；
- Event placement / `instanceId` 的最终 schema；
- Dialogue mutation `from` 校验 / OCC conflict 失败时的具体 UI / Message 表现；
- 非 Dialogue Subsystem 如何在各自业务 Content 中引用 Mutation；
- `absent` 与跨 Event 出现定义同时命中的解析；
- 是否未来需要显式 NPC override。