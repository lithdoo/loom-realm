# 事件

> 独立技术设计记录。不改写 `../DESIGN.md`。本文定义 Event / EventStateMutation / EventStateList 的业务语义；FSDB 物理编码见 [Content FSDB 物理模型](./66-content-fsdb.md)。

# 定位

Event 是剧情 Content：

```text
Event
= 持久剧情阶段 + 当前阶段的场景 / 交互定义

EventStateList
= 当前所有非空 Event state 的唯一 Realm State 列表 Record

EventStateMutation
= 一组 Event state 前置条件 + 一组 Event state 赋值
```

Event / Mutation **不是**通用 Trigger / Action / Command / Workflow engine。

Content 永远只声明数据；真正读取当前 State、解释 Mutation 并执行 `scope.state.commit()` 的是 PokeMan Runtime。

# Event FSDB record

Event 使用：

```text
[struct]Event/<eventId>.json
→ namespace = struct.Event
→ key = eventId
```

Event identity 由 FSDB key 提供；source value 不重复保存 `id` / `eventId`。

当前 shape：

```text
Event
└─ states
   └─ <stateId>
      └─ maps
         └─ <mapId decimal key>
            └─ npcs
               └─ <npcId>
                  ├─ character?
                  ├─ placement? / absent?
                  ├─ battleActor?
                  └─ interaction?
                     └─ dialogue
```

identity 层级：

```text
Event identity = FSDB record key
stateId        = states object key
mapId          = maps object key，解释为正 safe integer
npcId          = npcs object key = struct.NPC key
```

source 不重复保存这些 identity 字段。

示例：

```json
{
  "states": {
    "waiting": {
      "maps": {
        "1": {
          "npcs": {
            "professor": {
              "character": "professor",
              "placement": {
                "x": 5,
                "y": 4,
                "direction": 2
              },
              "interaction": {
                "dialogue": "professor-intro"
              }
            },
            "rival-lab": {
              "character": "rival",
              "placement": {
                "x": 8,
                "y": 4,
                "direction": 4
              }
            }
          }
        }
      }
    }
  }
}
```

# Event State NPC directive

Event State NPC 表示：

> 当前 Event state 对这个 NPC / Character 的 scene directive，以及玩家与它交互时从哪段固定 Dialogue 开始。

当前 directive：

```text
EventNPCDirective
├─ character?: Character key
├─ placement?: Placement
├─ absent?: true
├─ battleActor?: ContentRef
└─ interaction?
   └─ dialogue: Dialogue key
```

Placement：

```text
Placement
├─ x: non-negative integer
├─ y: non-negative integer
├─ direction: 2 | 4 | 6 | 8
└─ pattern?: 0 | 1 | 2 | 3
```

固定约束：

```text
placement XOR absent:true
```

`instanceId` 不属于 Event Content。它由 Story Resolver / World Runtime 在构造当前 NPC Instance 时生成。

## 持久 Character

```json
{
  "character": "rival",
  "placement": {
    "x": 8,
    "y": 5,
    "direction": 2
  }
}
```

BattleActor 经 Character 稳定解析：

```text
Event directive
→ Character
→ Character.battleActor
→ base BattleActor
```

因此：

```text
character 存在
→ battleActor 禁止同时存在
```

## transient Story NPC

没有持久 Character 的 Story NPC 可以直接保存基础 BattleActor：

```json
{
  "placement": {
    "x": 8,
    "y": 5,
    "direction": 2
  },
  "battleActor": {
    "namespace": "<battle package namespace>",
    "key": "road-bandit"
  },
  "interaction": {
    "dialogue": "route-bandit-threat"
  }
}
```

```text
character 不存在
→ battleActor 可选
```

它可选是因为 scene-only NPC 不一定能进入 Battle。

# EventStateList

Event current state 统一保存在 Realm State 的一个列表 Record：

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

读取语义：

```text
列表中存在 eventId
→ current state = entry.stateId

列表中不存在 eventId
→ current state = null
```

约束：

- `eventId` 在列表中唯一；
- `stateId` 必须是对应 Event Content 存在的非空 state；
- 列表不保存 `stateId:null` 项；
- baseline 只列开局真正 active 的 Event，不为所有 Event 预建 inactive entry。

EventStateList 最终 Realm State namespace / key 仍待后续 State schema 冻结；“所有 Event state 放在一个列表 Record”已经确定。

# EventStateMutation FSDB record

Mutation 使用：

```text
[struct]EventStateMutation/<mutationId>.json
→ namespace = struct.EventStateMutation
→ key = mutationId
```

Mutation identity 由 FSDB key 提供，不保存 `id`。

shape：

```text
EventStateMutation
├─ from
│  └─ <eventId>: stateId | null
└─ to
   └─ <eventId>: stateId | null
```

例如：

```json
{
  "from": {
    "professor-intro": "waiting",
    "tutorial-battle": null
  },
  "to": {
    "professor-intro": "contracted",
    "tutorial-battle": "ready"
  }
}
```

当前物理约束：

```text
from
→ 必须存在
→ 可以是 {}

to
→ 必须存在
→ 至少一个 member
```

所以无前置启动 Event 合法：

```json
{
  "from": {},
  "to": {
    "prologue": "active"
  }
}
```

但完全 no-op Mutation 不合法。

## null 语义

```text
from[eventId] = null
→ 要求 EventStateList 中没有该 eventId entry

to[eventId] = null
→ 成功后删除该 eventId entry
```

`null` 是 Mutation / read 语义，不是 EventStateList 实际存储值。

## from 是 AND

同一 Mutation 多个 `from` 项全部是 AND：

```text
A == waiting
AND
B == null
AND
C == ready
```

需要 OR 时定义多条独立 Mutation，由业务分支选择；不加入 `or / anyOf / condition tree / expression`。

## from / to 不要求同 key set

```text
只在 from 中出现
= prerequisite only

同时在 from / to 出现
= validate then assign/delete

只在 to 中出现
= direct assign/delete
```

例如：

```json
{
  "from": {
    "tutorial-battle": "completed"
  },
  "to": {
    "tutorial-battle": null,
    "town-route": "open"
  }
}
```

# Mutation 执行

执行一条 Mutation：

```text
scope.state.read(EventStateList)
↓
得到 list + version
↓
解释全部 from
  entry exists → current = stateId
  no entry      → current = null
↓
全部 AND 匹配
↓
复制列表并应用全部 to
  stateId → upsert
  null    → delete
↓
scope.state.commit()
  condition = EventStateList version
  write     = new EventStateList
```

所以多个 Event 同时变化天然对应一个 Record replacement / 一个 Realm State commit。

Mutation mismatch、OCC conflict、OUTCOME_UNKNOWN 的具体恢复 / UI 是 Runtime 设计，不是当前数据 physical-schema gap。

# Mutation ownership

EventStateMutation **只允许检查和改变 Event current state**。

禁止扩成：

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

Relationship / Contract / Card / Battle 等由各自业务 owner 处理。

Mutation 不声明自己的 trigger，也不监听 State。

# Dialogue 路径

固定 Dialogue 可以直接保存：

```text
Dialogue.mutation
→ EventStateMutation key
```

执行路径：

```text
Dialogue terminal completion
→ PokeMan Dialogue Subsystem
→ read Mutation Content
→ read EventStateList
→ validate from
→ commit EventStateList
```

如果同一业务交互同时建立 Contract：

```text
terminal Dialogue
├─ Dialogue.mutation
│  → EventStateList only
└─ business Runtime
   → create Relationship.contract
```

EventStateMutation 不因为台词写了“契约成立”就拥有 `createContract`。

# 非 Dialogue 路径

Battle / World / Encounter Content 不为了剧情推进增加 `mutationRef`。

这些 Runtime 先表达业务事实：

```text
BattleCompleted
MapEntered / DestinationReached
EncounterCompleted
```

然后：

```text
business Runtime
→ session-event business fact
→ PokeMan session-level business runtime
→ 根据 fact + context + Event state 判断剧情意义
→ 如果需要，选择 EventStateMutation
→ 执行 Mutation
```

`session-event` 不需要携带 Mutation identity；它表达“发生了什么”，Mutation 表达“Event state 怎么改”。

# Character scene takeover

Character `defaultScenes` 是纯 fallback。

对 Character `X`：

```text
没有 active Event State directive 的 character = X
→ 使用 Character X.defaultScenes

至少一个 active Event State directive 的 character = X
→ X 的全部 defaultScenes 退出解析
→ X 当前 scene 完全由 Event sources 决定
```

只有 `npcId`、没有 `character` 的 transient source 不接管 Character default scene。

## absent

```json
{
  "character": "rival",
  "absent": true
}
```

只表示：

> 本 Event state 明确提到 Character `rival`，但本 Event 不贡献 placement。

它不压制其他 Event placement，也不建立 Event priority。

```text
Event A → X absent
Event B → X placement at town

→ default 不参与
→ A 不贡献 placement
→ B 贡献 town placement
```

如果 Event 已接管 X，而所有相关 source 都不贡献 placement，则 X 当前不出现。

# NPC uniqueness

Source Content 可以在多个 Event 中重复引用同一 `npcId`。

同一 Event state 内由于物理结构是：

```text
maps.<mapId>.npcs.<npcId>
```

同一 `(mapId,npcId)` 天然只有一个 object member。

最终 Story Resolver 合并全部 active source 后必须保证：

```text
每张 Map 内 npcId 唯一
```

同一个 `npcId` 在不同 Map 出现合法；不同 Event 最终在同一 Map 产生相同 `npcId` 是 deterministic conflict，不做 last-wins。

# StoryIndex

Runtime 不扫描全部 Event 来回答“这张 Map 有哪些相关剧情 source”。Builder 生成：

```text
struct.StoryIndex/current
├─ byMap
├─ byCharacter
└─ byEvent
```

Map Enter：

```text
StoryIndex
+ EventStateList
↓
相关 active Event states
↓
mentioned Characters
↓
mentioned → Event sources only
unmentioned → Character defaults
↓
merge transient Story / Encounter
↓
validate final npcId uniqueness
↓
Runtime NPC Instances
```

StoryIndex 是 derived Content，不进入 Realm State / Save。

# Builder 检查

Builder 应检查：

- Event / Mutation FSDB record key 合法；
- source record 不重复保存 `id`；
- state key 非空；
- Event map key 可解析为正 safe integer；
- `npcId` 指向存在的 `struct.NPC`；
- `character` 指向存在的 `struct.Character`；
- `interaction.dialogue` 指向存在的 `struct.Dialogue`；
- directive 满足 `placement XOR absent:true`；
- placement 坐标 / direction / pattern 合法；
- directive 有 `character` 时禁止 `battleActor`；
- transient directive 的 `battleActor` ContentRef 可解析；
- Dialogue Choice target / mutation 引用存在；
- EventStateMutation `to` 非空；
- Mutation 非空 stateId 属于对应 Event；
- baseline EventStateList 中 eventId 唯一且 state 有效；
- StoryIndex 与源 Content 一致。

Builder 不因为以下情况失败：

```text
baseline 没有列出全部 Event
Mutation.from = {}
Mutation.from / to key set 不同
Mutation 使用 null
多个 Mutation 表达 OR
同一个 npcId 被多个 Event source 引用
同一个 npcId 在不同 Map 出现
同一个 Character 被多个 Event 引用
Event A 对 X absent + Event B 对 X placement
合法 Dialogue cycle
```

# 当前未决

Event / EventStateMutation 的 FSDB table / key / basic JSON shape 已冻结在 [66-content-fsdb.md](./66-content-fsdb.md)。当前相关未决只剩：

- EventStateList Realm State 最终 namespace / key；
- Runtime `instanceId` 生成算法；
- 非 Dialogue business fact → Mutation 的 Runtime handler 具体实现；
- Mutation failure / OCC / UI 行为。

后两项属于 Runtime，不是数据物理结构问题。