# 事件

> 独立技术设计记录。不改写 `../DESIGN.md`。

## 定位

Event 是剧情 Content。它描述“某段剧情有哪些状态，以及每个状态下世界应该如何表现和交互”，而不是通用 workflow engine。

Realm State 只保存这一局真正的动态进度。逻辑上每个 Event 的当前状态是：

```text
eventId → stateId | null
```

其中 `null` 表示这个 Event 当前处于空状态 / 未启动，不参与当前世界投影。

Event Content 定义合法的非空 `stateId`、每个状态下的 Map / NPC 投影，以及当前 NPC 交互从哪段固定 Dialogue 开始。

Event state 的变化不硬编码成 `if (state === A) state = B`。变化规则单独写成 immutable `EventStateMutation` Content，由明确的 Dialogue completion 或其他业务结果引用并应用。

当前坚持：

```text
Event
= 持久剧情阶段 + 当前阶段的场景 / 交互定义

Event current state
= stateId | null

EventStateMutation
= 一组 Event state 前置条件 + 一组 Event state 原子赋值

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

`states` 的 key 是 Event 的合法非空 state id。当前处于哪个 state 记在 Realm State；state value 自身是 immutable Content，不复制进 Realm State。

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

## Event 空状态、启动与初始化

当前 Event state 采用**稀疏逻辑模型**：

```text
CurrentEventStates
= Partial<eventId, stateId>
```

语义上：

```text
eventId 有非空 stateId
→ Event 当前已启动，并处于该状态

eventId 没有当前状态 / 当前值为 null
→ Event 当前为空状态 / 未启动
→ 不参与 Story Resolver 的 Event State 投影
```

因此 Content 中存在多少 Event，和 Realm State 当前需要保存多少 Event 状态是两回事。安装包可以定义大量未来剧情 Event，而开局只初始化真正已经开始的少量 Event。

开局 Event 状态来自 Game Entry 安装的初始化 Realm State baseline。例如逻辑上：

```text
professor-intro → waiting
home-intro      → active

tutorial-battle → null
rival-story      → null
town-route       → null
```

初始化 State 不需要为后面三个 Event 人工写 `inactive`、`not-started` 等假 state，也不需要显式保存所有 Event。

Event 的启动与结束都不建立额外 lifecycle API：

```text
null → stateId
= 启动 Event

stateId A → stateId B
= 推进 Event

stateId → null
= 清空 / 结束当前 Event state
```

这里的 `null` 是**业务状态语义**，不能依赖 Realm State Record 是否 materialized 来判断。Realm State v1 的 `put(null)` 不会 dematerialize Record，所以：

```text
从未启动过
和
曾启动过、后来写回 null
```

对 Event 业务层都表示“当前空状态”。Story Resolver 只看当前逻辑值是否为非空 `stateId`，不把 `list()` / Record membership 当成第二份 Event authority。

当前只冻结这个逻辑模型；Event current state 最终是“一个总表 Record”还是“每个 Event 一个 Record”等物理 Realm State key / namespace 布局仍未冻结。

## EventStateMutation

Event state mutation 是独立 Content。Mutation identity 由 Content key / reference 提供，概念数据本身只需要两个字段：

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

这里 `rival-story: null` 明确要求该 Event 当前尚未启动；`tutorial-battle: ready` 则可以直接把一个原本为空状态的 Event 启动到 `ready`。

### `from` 是 AND 前置集合

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

### `from` 与 `to` 不要求一一对应

`from` 和 `to` 的 Event 集合与数量完全不要求相同。

```text
只在 from 中出现
= 只作为前置条件

同时在 from / to 出现
= 检查旧 state 后写入新 state

只在 to 中出现
= 不要求与某个 from 项配对，直接写入目标 state / null
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

结束 / 清空一个 Event 也只是普通 Mutation：

```yaml
from:
  tutorial-battle: completed

to:
  tutorial-battle: null
  town-route: open
```

### `to` 原子写入

应用 Mutation 时：

1. 读取 `from` 中所有 Event current state；
2. `null` 与非空 `stateId` 都按普通业务值比较；
3. 全部匹配才继续；
4. `to` 中所有 Event current state 在一次 Realm State commit 中一起更新。

不允许产生业务可见的半完成结果。

如果 `to` 把某个 Event 写为 `null`，Event 逻辑上立即成为空状态；底层 Realm State Record 是否仍然 materialized 不改变这个业务语义。

### Mutation 只拥有 Event state

EventStateMutation 只允许检查和写入 Event current state。

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

## Event State NPC：当前阶段这个 NPC 在哪、怎么交互

NPC Definition / `npcId` 表示地图角色表现模板；Character 表示“这个人是谁”。Event State NPC 表示：

> **在这个 Event 的当前非空剧情状态下，这个 NPC 出现在哪张 Map、什么位置，以及玩家与它交互时从哪段固定 Dialogue 开始。**

因此：

```text
NPC Definition
= 怎么表现

Character
= 是谁

Event State NPC
= 当前剧情阶段在哪里、当前入口交互是什么

Dialogue
= 实际说什么，以及无 Choice Dialogue 完成后是否触发 EventStateMutation
```

当 Event current state 为 `null` 时，不存在对应 Event State NPC 投影。

placement 至少要有足够信息最终生成 `@loomrealm-game/map` 的 `NPCPlacement`。

由于 `mapId` / `npcId` 已经来自父级 key，最终 source JSON 是否重复保存这些字段、`instanceId` 如何生成或填写，后续 schema 设计再定。

## NPC 与 Dialogue 的关系

Dialogue 不绑定在 NPC Definition 上，因为同一个 NPC 在不同 Event state 下可以说不同的话。

当前绑定关系是：

```text
Event
→ current state != null
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

## Dialogue 如何触发 Mutation

Mutation 不由 Event State NPC interaction 按 `terminalDialogueId` 映射。

现在由 **无 Choice Dialogue 自己可选引用一个 EventStateMutation**：

```text
Dialogue
├─ lines[]
├─ choices?[]
└─ mutation?
```

并固定互斥约束：

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

执行流程：

```text
玩家与 NPC 交互
↓
World 找到当前 Event / state / mapId / npcId
↓
读取 interaction.dialogue
↓
frame.call(Dialogue)
↓
Dialogue 内完成 lines / choices / target 跳转
↓
到达无 Choice Dialogue
↓
有 mutation？
├─ 否 → Dialogue 正常完成
└─ 是 → 读取 EventStateMutation Content
         ↓
       校验全部 from（AND，包括 null 条件）
         ↓
       一次 Realm State commit 写入全部 to
         ↓
       Story Resolver 按新的稀疏 Event states 重新解析场景
         ↓
       Dialogue 正常完成
```

Dialogue Frame 仍然可以返回最终 `terminalDialogueId`，但 Event state mutation 不再依赖 caller 根据这个 id 再查映射。

## Runtime 不扫描 Mutation

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
→ 校验 from
→ 应用 to
```

当前最直接的引用来源是无 Choice Dialogue completion。未来 Battle 完成、到达地点等业务如果需要使用同一 Mutation 数据结构，也由对应业务明确引用 Mutation，而不是让 Mutation 自己拥有 trigger。

## NPC 出现规则

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

### 同一个 Event state

同一个 Event state 可以多次声明同一个 `npcId`，只要这些出现位于不同 Map。

如果同一个 state 自己声明两次相同 `(mapId, npcId)`，Builder 应直接报错。

### 不同 Event 之间

不同 Event 可以都声明同一个 NPC，不对 source Content 做跨 Event 唯一性限制。

只有 Runtime 根据当前所有**非空** Event state 合并场景后，最终同一 Map 真的得到两个相同 `npcId` 时，Story Resolver 才把它作为确定性冲突处理。

```text
Source Content 可以跨 Event 重复
↓
只读取 currentState != null 的 Event 投影
↓
Story Resolver 合并当前所有来源
↓
Final resolved Map 必须满足 (mapId, npcId) 唯一
```

## Character 与 NPC

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

Event current state 为 `null` 又是第三种情况：

```text
current state = null
→ 整个 Event 当前不提供任何 State 投影
```

## 多个 Event 的解析

当前不把“不同 Event 是否引用同一 NPC”本身视为冲突。

Story Resolver 根据当前 Realm State 的稀疏 Event state 读取所有相关 Event；只对 `currentState != null` 的 Event 读取对应 state Content，再收集这些 state 对当前 Map 提供的场景定义。

仍待继续设计的是：

- `absent` 与其他 Event 的出现定义同时命中时如何解析；
- 跨 Event 的同一 `(mapId, npcId)` 是否未来需要显式 override。

当前先保持最保守规则：如果最终合并后同一 Map 出现重复 `npcId`，Runtime 必须确定性报冲突，不做隐式 last-wins。

## Story Index

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
→ 读取这些 Event 的 current state
→ current state = null 的 Event 直接跳过
→ 其余 Event 读取对应 state Content
→ 合并当前 Map 的 NPC 定义
→ 校验最终 npcId 唯一
→ 得到 NPC Instance / NPCPlacement 集合
```

Story Index 是 Builder 生成的派生 Content，不进入 Realm State / Save，可以随源 Content 重建。

## Builder 与 Runtime 检查

Builder 应检查：

- Event / state identity 重复；
- 安装初始化 State 中非空 Event state 引用了不存在的 Event / state；
- 同一个 Event state 内重复 `(mapId, npcId)`；
- 单个定义中的重复 `instanceId`；
- `interaction.dialogue` 引用了不存在的 Dialogue；
- Dialogue Choice `target` 引用了不存在的 Dialogue；
- 同一个 Dialogue 同时存在 `choices` 与 `mutation`；
- Dialogue `mutation` 引用了不存在的 EventStateMutation；
- Mutation `from` / `to` 中的非空 `stateId` 引用了不存在的 Event state；
- Mutation `from` / `to` 使用 `null` 作为合法空状态值；
- Mutation 同一个 `from` 或 `to` 中不能重复定义同一个 eventId；
- 引用不存在的 Character / NPC / Map；
- 非法 placement；
- 派生 Story Index 与源定义不一致。

Builder **不因为以下情况失败**：

```text
安装初始化 State 没有列出全部 Event
Event 当前状态为 null
Mutation.from 包含多个 Event
Mutation.to 包含多个 Event
Mutation.from / to 的 Event key 集合不同
Mutation 使用 null → stateId 启动 Event
Mutation 使用 stateId → null 清空 Event
多个独立 Mutation 表达 OR 分支
同一个 npcId 被多个不同 Event 引用
同一个 npcId 在同一个 Event state 中出现在多个不同 Map
同一个 Character 被多个 Event 引用
同一个 Character 出现在多个 Map
合法的 Dialogue cycle
```

Runtime 应保证：

- Event current state 逻辑上是稀疏的 `stateId | null`；
- `null` Event 不参与 Event State 场景投影；
- 不以 Realm State Record materialization / membership 判断 Event 是否启动；
- 只应用被明确引用的 Mutation；
- 被引用 Mutation 的全部 `from` 当前值必须同时匹配，包括显式 `null`；
- 成功 Mutation 的全部 `to` 在一次 commit 中原子写入；
- Runtime 不主动扫描未被引用的 Mutation；
- 合并当前场景来源后，每张最终 Map 内 `npcId` 唯一。

## 当前仍未冻结

- Event / EventStateMutation 的最终 Content namespace / key；
- 稀疏 Event current state 的最终 Realm State namespace / key / Record shape；
- Event placement / `instanceId` 的最终 schema；
- Dialogue mutation `from` 校验失败时的具体 UI / Message 表现；
- 非 Dialogue 业务如何在各自 Content 中引用 Mutation；
- `absent` 与跨 Event 出现定义同时命中的解析；
- 是否未来需要显式 NPC override。