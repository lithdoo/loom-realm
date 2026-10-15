# 事件

> 独立技术设计记录。不改写 `../DESIGN.md`。

## 定位

Event 是剧情 Content。它描述“某段剧情有哪些状态，以及每个状态下世界应该如何表现和交互”，而不是把剧情执行改造成通用 workflow engine。

Realm State 只保存这一局真正的动态进度，例如：

```text
eventId → currentStateId
```

Event Content 定义合法的 `stateId`、当前状态下的 Map / NPC 投影，以及当前 NPC 交互从哪段固定 Dialogue 开始。

Event state 的变化不硬编码成 `if (state === A) state = B`。变化规则单独写成 immutable `EventStateMutation` Content，由明确的 Dialogue completion 或其他 World 业务结果引用并应用。

当前坚持：

```text
Event
= 持久剧情阶段 + 当前阶段的场景 / 交互定义

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
                     ├─ dialogue
                     └─ mutations?
                        └─ terminalDialogueId → EventStateMutation ref
```

这首先表达职责，不冻结最终 JSON namespace / Record key。

`states` 的 key 是 Event state id。当前处于哪个 state，记在 Realm State；state value 自身是 immutable Content，不复制进 Realm State。

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
              mutations:
                professor-contract-accept: professor-contract-accepted

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

其中 `professor-contract-accepted` 是独立的 EventStateMutation Content reference，不是 `nextStateId`。

## EventStateMutation

Event state mutation 是独立 Content。Mutation identity 由 Content key / reference 提供，概念数据本身只需要两个字段：

```text
EventStateMutation
├─ from
└─ to
```

其中 `from` / `to` 都是：

```text
eventId → stateId
```

例如：

```yaml
from:
  professor-intro: waiting
  rival-story: before-contract

to:
  professor-intro: contracted
  rival-story: contracted
  tutorial-battle: ready
```

### `from` 是 AND 前置集合

同一个 Mutation 的多个 `from` 项全部是 **并且 / AND**：

```text
professor-intro == waiting
AND
rival-story == before-contract
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

如果业务需要 OR：

```text
条件分支 A
OR
条件分支 B
```

则为每个分支分别定义独立 Mutation：

```text
Mutation A
from: 分支 A 的 AND 条件

Mutation B
from: 分支 B 的 AND 条件
```

调用方 / interaction 在对应分支引用对应 Mutation。OR 不进入单条 Mutation 的 schema。

### `from` 与 `to` 不要求一一对应

`from` 和 `to` 的 Event 集合与数量完全不要求相同。

例如：

```yaml
from:
  professor-intro: waiting
  rival-story: ready

to:
  tutorial-battle: active
```

表示前两个 Event 只是执行前提，Mutation 成功后只更新 `tutorial-battle`。

反过来也合法：

```yaml
from:
  tutorial-battle: completed

to:
  professor-intro: after-battle
  rival-story: after-battle
  town-route: open
```

语义上：

```text
只在 from 中出现
= 只作为前置条件

同时在 from / to 出现
= 检查旧 state 后写入新 state

只在 to 中出现
= 不要求与某个 from 项配对，直接写入目标 state
```

### `to` 原子写入

应用 Mutation 时：

1. 读取 `from` 中所有 Event current state；
2. 全部匹配才继续；
3. `to` 中所有 Event state 在一次 Realm State commit 中一起更新。

不允许产生业务可见的半完成结果：

```text
event A 已更新
+
event B 未更新
```

Mutation 是一组 Event state 的原子状态变化。

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

NPC Definition / `npcId` 仍然只表示地图角色表现模板；Character 表示“这个人是谁”。Event State NPC 表示：

> **在这个 Event 的当前剧情阶段，这个 NPC 出现在哪张 Map、什么位置，以及玩家与它交互时从哪段固定 Dialogue 开始。**

因此：

```text
NPC Definition
= 怎么表现

Character
= 是谁

Event State NPC
= 当前剧情阶段在哪里、当前入口交互是什么

Dialogue
= 实际说什么
```

placement 至少要有足够信息最终生成 `@loomrealm-game/map` 的 `NPCPlacement`，例如：

```text
instanceId
npcId
mapId
x
y
direction
pattern?
```

由于 `mapId` / `npcId` 已经来自父级 key，最终 source JSON 是否重复保存这些字段、`instanceId` 如何生成或填写，后续 schema 设计再定。

## NPC 与 Dialogue 的关系

Dialogue 不绑定在 NPC Definition 上，因为同一个 NPC 在不同 Event state 下可以说完全不同的话。

当前绑定关系是：

```text
Event
→ current state
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

这样切换 Event state 后，NPC 可以保持在原位置，也可以移动 / 消失，同时其入口 Dialogue 也自然随当前 state 改变。

没有 `interaction` 的 Event State NPC 仍然可以只是场景表现；当前不要求每个 NPC 都能启动 Dialogue。

## Dialogue 完成结果

固定 Dialogue 继续保持自己的小模型：

```text
Dialogue
= 线性 lines
+ 可选末尾 choices

Choice
= 跳到另一个 Dialogue
```

Dialogue 自己不直接修改 Event State。

当一条 Dialogue 链最终播放到一个没有 `choices` 的 Dialogue 并正常结束时，Dialogue Frame 返回：

```text
terminalDialogueId
```

例如：

```text
professor-intro
→ Choice
   ├─ professor-contract-accept
   └─ professor-contract-refuse
```

最终可能返回：

```text
terminalDialogueId = professor-contract-accept
```

或者：

```text
terminalDialogueId = professor-contract-refuse
```

当前不再为这个目的增加一层通用 Dialogue `outcome` / `result` Content。已有 Dialogue identity 就足以作为固定对话分支的窄结果。

## Dialogue completion → Mutation

Event State NPC 的 `interaction.mutations` 把 terminal Dialogue 分支关联到独立 EventStateMutation：

```text
terminalDialogueId → EventStateMutation ref
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
Dialogue 返回 terminalDialogueId
↓
查 interaction.mutations[terminalDialogueId]
↓
有 Mutation ref？
├─ 否 → 不自动改变 Event state
└─ 是 → 读取 EventStateMutation Content
         ↓
       校验全部 from（AND）
         ↓
       一次 Realm State commit 写入全部 to
         ↓
       Story Resolver 按新 Event states 重新解析场景
```

这样 Runtime 不需要知道：

```text
waiting 应该变 contracted
哪几个 Event 应该一起推进
某个具体剧情 state 的名字是什么意思
```

这些状态关系都来自 Content。

拒绝分支如果不需要状态变化，可以不配置 Mutation：

```text
professor-contract-refuse
→ no mutation
→ Event states 保持不变
```

如果两个 Dialogue / Event 分支在剧情上是 OR，不把 OR 写进 Mutation；每个分支各自引用独立 Mutation。

## Runtime 不扫描 Mutation

EventStateMutation 是被引用的数据，不是自动监听规则。

Runtime **不会**：

```text
每次 State 变化后扫描全部 Mutation
→ 找到所有 from 恰好匹配的 Mutation
→ 自动执行
```

否则会产生隐式触发链、执行顺序和循环问题。

正确模型是：

```text
明确业务结果
→ 明确 Mutation ref
→ 校验 from
→ 应用 to
```

当前最直接的引用来源是固定 Dialogue completion。未来 Battle 完成、到达地点等业务如果需要使用同一 Mutation 数据结构，也由对应 World 业务明确选择 Mutation ref，而不是让 Mutation 自己拥有 trigger。

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

这里的唯一性约束针对 **最终 Map 场景**，不是针对跨 Event 的 source Content。

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

两条定义本身都合法。只有 Runtime 根据当前所有 Event state 合并场景后，最终同一 Map 真的得到两个相同 `npcId` 时，Story Resolver 才把它作为确定性冲突处理。

当前规则：

```text
Source Content 可以跨 Event 重复
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

## 多个 Event 的解析

当前不把“不同 Event 是否引用同一 NPC”本身视为冲突。

Story Resolver 根据当前 Realm State 读取所有相关 Event 的 current state，收集这些 state 对当前 Map 提供的场景定义，再对最终结果做约束检查。

仍待继续设计的是：

- `absent` 与其他 Event 的出现定义同时命中时如何解析；
- 跨 Event 的同一 `(mapId, npcId)` 是否未来需要显式 override。

当前先保持最保守规则：**如果最终合并后同一 Map 出现重复 `npcId`，Runtime 必须确定性报冲突，不能随机保留一个，也不做隐式 last-wins。**

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
→ 读取这些 Event 的 currentStateId
→ Story Resolver 读取对应 state Content
→ 合并当前 Map 的 NPC 定义
→ 校验最终 npcId 唯一
→ 得到 NPC Instance / NPCPlacement 集合
```

Story Index 是 Builder 生成的派生 Content，不进入 Realm State / Save，可以随源 Content 重建。

## Builder 与 Runtime 检查

Builder 应检查能够静态确定的问题，例如：

- Event / state identity 重复；
- 同一个 Event state 内重复 `(mapId, npcId)`；
- 单个定义中的重复 `instanceId`；
- `interaction.dialogue` 引用了不存在的 Dialogue；
- `interaction.mutations` 的 `terminalDialogueId` 引用了不存在的 Dialogue；
- `interaction.mutations` 引用了不存在的 EventStateMutation；
- Mutation `from` / `to` 引用了不存在的 Event 或 state；
- Mutation 同一个 `from` 或 `to` 中不能重复定义同一个 eventId；
- 引用不存在的 Character / NPC / Map；
- 非法 placement；
- 派生 Story Index 与源定义不一致。

Builder **不因为以下情况失败**：

```text
Mutation.from 包含多个 Event
Mutation.to 包含多个 Event
Mutation.from / to 的 Event key 集合不同
多个独立 Mutation 表达 OR 分支
同一个 npcId 被多个不同 Event 引用
同一个 npcId 在同一个 Event state 中出现在多个不同 Map
同一个 Character 被多个 Event 引用
同一个 Character 出现在多个 Map
```

Runtime 应保证：

- 被引用 Mutation 的全部 `from` 当前值必须同时匹配；
- 成功 Mutation 的全部 `to` 在一次 commit 中原子写入；
- Runtime 不主动扫描未被引用的 Mutation；
- 合并当前场景来源后，每张最终 Map 内 `npcId` 唯一。

## 当前仍未冻结

- Event / EventStateMutation 的最终 Content namespace / key；
- Event placement / `instanceId` 的最终 schema；
- Mutation `from` 校验失败时，对具体 UI / Message 的错误呈现；
- 非 Dialogue 业务如何在各自 Content 中引用 Mutation；
- `absent` 与跨 Event 出现定义同时命中的解析；
- 是否未来需要显式 NPC override。
