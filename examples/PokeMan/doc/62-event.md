# 事件

> 独立技术设计记录。不改写 `../DESIGN.md`。

## 定位

Event 是剧情 Content。它描述“某段剧情有哪些状态，以及每个状态下世界应该如何表现和交互”，而不是把剧情执行改造成通用 workflow engine。

Realm State 只保存这一局真正的动态进度，例如：

```text
eventId → currentStateId
```

Event Content 定义合法的 `stateId`、当前状态下的 Map / NPC 投影，以及当前 NPC 交互从哪段固定 Dialogue 开始。World 负责真正执行 Dialogue / Battle / Relationship / Card 等业务，并在需要时提交 Event state 变化。

当前坚持：

```text
Event
= 持久剧情阶段 + 当前阶段的场景 / 交互定义

Event != 通用 Trigger / Action / Command / Flow engine
```

## 基本结构

当前概念结构收成：

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
                     └─ transitions?
                        └─ terminalDialogueId → nextStateId
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
              transitions:
                professor-contract-accept: contracted
                professor-contract-refuse: waiting

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

示例中的字段名仍是概念写法；重点是数据关系。

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

也就是“本次固定 Dialogue 最终结束在哪个 Dialogue”。

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

当前不再为这个目的增加一层通用 `outcome` / `result` Content。已有 Dialogue identity 就足以作为固定对话分支的窄结果。

## Dialogue 驱动的 Event State 切换

Event State NPC 的 `interaction.transitions` 只负责一件事：

```text
terminalDialogueId → nextStateId
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
Dialogue 内完成 lines / choices / target Dialogue 跳转
↓
Dialogue 返回 terminalDialogueId
↓
World 查 interaction.transitions[terminalDialogueId]
↓
有 nextStateId？
├─ 否 → Event state 不变
└─ 是 → World 提交 eventId → nextStateId
         ↓
       Story Resolver 按新 state 重新解析场景
```

如果 `interaction` 没有 `transitions`，或者返回的 `terminalDialogueId` 没有对应 mapping，这次对话不会自动推进 Event。

这使普通 NPC 日常对话可以反复执行而不改变剧情状态。

## Transition 只切 Event State，不执行任意业务动作

`interaction.transitions` 不扩成 action list。

不在 Event Content 中增加：

```text
setAffinity
setHostile
createContract
createCard
startBattle
movePlayer
arbitrary Realm State mutation
```

例如博士对话最终走到：

```text
professor-contract-accept
```

产品业务可能需要同时完成：

```text
player → rival contract
rival → player contract
创建当前随身 rival Card
Event state → contracted
```

这些 Relationship / Card 后果由 World 明确解释和提交；Event Content 只提供本次固定 Dialogue 对应的 `nextStateId`。

如果实现需要保证这些业务事实与 Event state 一起成立，应由 World 的业务提交过程负责一致性，而不是把它们编码成 Event action DSL。

## 非 Dialogue 原因的 Event State 切换

不是所有 Event state 变化都来自 NPC Dialogue。

例如未来可能有：

```text
Battle 完成
到达某处
完成中心操作
其他明确的 World 业务结果
```

第一版不为这些来源设计统一 `trigger` schema。对应业务发生后，由 World 明确提交：

```text
eventId → nextStateId
```

因此当前有两条推进路径：

```text
NPC 固定 Dialogue
→ terminalDialogueId
→ interaction.transitions
→ nextStateId

其他 World 业务
→ World 明确决定 nextStateId
```

等实际剧情出现大量重复模式以后，再判断是否值得抽取新的窄 Content 能力。

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

Story Index：

- 是 Builder 生成的派生 Content；
- 不是真相的第二份 authority；
- 不进入 Realm State；
- 不进入 Save；
- 可以随 Content 重新构建。

## Builder 与 Runtime 检查

Builder 应检查能够静态确定的问题，例如：

- Event / state identity 重复；
- 同一个 Event state 内重复 `(mapId, npcId)`；
- 单个定义中的重复 `instanceId`；
- `interaction.dialogue` 引用了不存在的 Dialogue；
- `interaction.transitions` 的 `terminalDialogueId` 引用了不存在的 Dialogue；
- `interaction.transitions` 的 `nextStateId` 不属于当前 Event；
- 引用不存在的 Character / NPC / Map；
- 非法 placement；
- 派生 Story Index 与源定义不一致。

Builder **不因为以下情况失败**：

```text
同一个 npcId 被多个不同 Event 引用
同一个 npcId 在同一个 Event state 中出现在多个不同 Map
同一个 Character 被多个 Event 引用
同一个 Character 出现在多个 Map
Dialogue 图存在合法 cycle
```

Runtime 在合并当前所有来源后必须检查：

```text
对每个 mapId：npcId 唯一
```

不同 Event 最终同时产生同一 `(mapId, npcId)` 时，Story Resolver 必须确定性处理为冲突；当前不定义隐式 last-wins。
