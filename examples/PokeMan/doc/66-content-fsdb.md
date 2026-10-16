# Content FSDB 物理模型

> 独立技术设计记录。不改写 `../DESIGN.md`。本文冻结 PokeMan 当前 Content 的 FSDB 物理组织、record identity 与引用编码。业务语义仍分别由 [人物](./61-character.md)、[事件](./62-event.md)、[固定对话](./64-dialogue.md) 等文档定义。

## FSDB 前提

项目当前 FSDB 对 PokeMan Content 有几个直接约束：

- FSDB root 目录名形如 `[FSDB]PokeMan`。
- `struct` table 目录名形如 `[struct]Character`。
- `struct` record 是 table 同层的 `<key>.json`；record 顶层必须是 JSON object。
- `struct` table 必须提供 `.info.meta`。
- `struct` key 不通过子目录形成层级路径。
- `resource` table 才允许目录层级，因此 `Characters/Mage` 这类 key 属于 resource key。
- Runtime Content namespace 由 FSDB table 投影得到，例如 `struct.Character`、`struct.NPC`、`resource.Graphics`。

因此 PokeMan 不再先定义一套脱离 FSDB 的 `id + object` 模型，再在安装阶段做第二次 identity 映射。**struct record 的 FSDB key 就是该定义的物理 identity。**

## 当前目录组织

当前 PokeMan 自有 Content 采用以下 FSDB tables：

```text
[FSDB]PokeMan/
├─ [struct]Character/
│  ├─ .info.meta
│  ├─ player.json
│  ├─ rival.json
│  └─ professor.json
│
├─ [struct]NPC/                         # @loomrealm-game/map 已有 contract
│  ├─ .info.meta
│  ├─ rival-casual.json
│  ├─ rival-lab.json
│  └─ road-bandit.json
│
├─ [struct]Dialogue/
│  ├─ .info.meta
│  ├─ lab-rival-intro.json
│  └─ route-bandit-threat.json
│
├─ [struct]Event/
│  ├─ .info.meta
│  └─ prologue.json
│
├─ [struct]EventStateMutation/
│  ├─ .info.meta
│  └─ prologue-to-route.json
│
├─ [struct]Encounter/
│  ├─ .info.meta
│  └─ 2.json
│
├─ [struct]StoryIndex/                  # Builder generated
│  ├─ .info.meta
│  └─ current.json
│
└─ [resource]Graphics/
   ├─ .desc.meta
   └─ Characters/
      ├─ RivalCasual.png
      └─ RivalLab.png
```

对应 Content identity：

```text
[struct]Character/rival.json
→ namespace = struct.Character
→ key       = rival

[struct]Event/prologue.json
→ namespace = struct.Event
→ key       = prologue

[resource]Graphics/Characters/Rival.png
→ namespace = resource.Graphics
→ key       = Characters/Rival
```

## identity 与引用规则

PokeMan 自有 struct record **不重复保存 `id` 字段**。

```text
FSDB key
= record identity
```

例如 `struct.Character / rival` 的 physical source 是：

```text
[struct]Character/rival.json
```

而不是：

```json
{
  "id": "rival"
}
```

引用编码只使用两种形式。

### 固定目标 table：只保存 key

如果字段 schema 已经唯一确定目标 namespace，则只保存目标 key：

```json
{
  "speaker": "rival",
  "mutation": "prologue-to-route"
}
```

分别解释为：

```text
speaker
→ struct.Character / rival

mutation
→ struct.EventStateMutation / prologue-to-route
```

同理：

- `npc` → `struct.NPC` key；
- `dialogue` / Choice `target` → `struct.Dialogue` key；
- Event / Mutation object key 中的 `eventId` → `struct.Event` key。

### 目标 namespace 未冻结或跨 contract：保存 ContentRef

当字段目标 namespace 不是 PokeMan 自己可以冻结的固定 table，使用：

```ts
type ContentRef = {
  namespace: string
  key: string
}
```

当前最重要的是 `battleActor`。Battle package 已冻结 BattleActor 的逻辑数据，但其正式外部 serialization namespace / key 编码仍是 OPEN，因此 PokeMan 不擅自建立第二套 `struct.BattleActor` 规范。

```json
{
  "battleActor": {
    "namespace": "<battle package namespace>",
    "key": "rival"
  }
}
```

资源引用继续使用现有 package contract，例如 Map NPC sprite：

```json
{
  "namespace": "resource.Graphics",
  "key": "Characters/RivalCasual"
}
```

是否在 Runtime 读取后附带 `contentVersion` 属于 Content API / resolved reference，不要求作者在 FSDB source 中手写版本。

# Character

Character 使用：

```text
namespace = struct.Character
key       = <characterId>
file      = [struct]Character/<characterId>.json
```

示例：

```json
{
  "name": "宿敌",
  "description": "从小与主公一起长大的竞争对手。",
  "aiCharacterText": "好胜、自信，不愿轻易服输。",
  "battleActor": {
    "namespace": "<battle package namespace>",
    "key": "rival"
  },
  "defaultScenes": {
    "1": {
      "rival-casual": {
        "placement": {
          "x": 10,
          "y": 6,
          "direction": 2
        },
        "interaction": {
          "dialogue": "rival-default"
        }
      }
    }
  }
}
```

当前核心 shape：

```text
Character
├─ name: string
├─ description?: string
├─ aiCharacterText?: string
├─ battleActor: ContentRef
└─ defaultScenes?: object
   └─ <mapId decimal key>
      └─ <npcId>
         ├─ placement
         │  ├─ x
         │  ├─ y
         │  ├─ direction
         │  └─ pattern?
         └─ interaction?
            └─ dialogue: Dialogue key
```

其中：

- Character identity 来自 FSDB record key，不保存 `id`。
- `battleActor` 是该持久 Character 的稳定基础 BattleActor reference。
- `defaultScenes` 是 Event 未接管该 Character 时的 fallback scene source。
- `defaultScenes` 中的 `<mapId>` 使用十进制正整数的字符串表示，因为 JSON object key 必然是字符串；其业务值解释为 Map package 的正 safe integer `mapId`。
- `<npcId>` 是 `struct.NPC` key。
- `interaction.dialogue` 是 `struct.Dialogue` key。
- 默认场景 source 不保存 Runtime `instanceId`。

Character 不保存 Relationship、Contract、Card 或 Battle Runtime state。

# NPC

PokeMan **不扩展** `@loomrealm-game/map` 已有的 `struct.NPC` record。

```text
namespace = struct.NPC
key       = <npcId>
```

当前 Map contract 仍是窄定义：

```json
{
  "name": "宿敌",
  "sprite": {
    "namespace": "resource.Graphics",
    "key": "Characters/RivalCasual"
  }
}
```

因此禁止把以下 PokeMan 业务字段塞进 `struct.NPC`：

```text
character
characterId
battleActor
dialogue
relationship
contract
```

当前也不建立独立 `struct.Visual`。地图人物视觉直接由 `struct.NPC.sprite → resource.Graphics` 表达；以后只有出现超出 NPC contract 的可复用视觉业务对象时再设计新的 Visual Content。

# Dialogue

Dialogue 使用：

```text
namespace = struct.Dialogue
key       = <dialogueId>
file      = [struct]Dialogue/<dialogueId>.json
```

持久 Character speaker 示例：

```json
{
  "lines": [
    {
      "speaker": "rival",
      "text": "总算来了。"
    },
    {
      "speaker": "player",
      "text": "开始吧。"
    }
  ],
  "choices": [
    {
      "text": "接受挑战",
      "target": "lab-rival-accept"
    },
    {
      "text": "再等等",
      "target": "lab-rival-wait"
    }
  ]
}
```

transient speaker 示例：

```json
{
  "speakerName": "路霸",
  "lines": [
    {
      "text": "站住！"
    }
  ],
  "mutation": "route-bandit-cleared"
}
```

当前 shape：

```text
Dialogue
├─ speakerName?: string
├─ lines: Line[]
│  ├─ speaker?: Character key
│  └─ text: string
├─ choices?: Choice[]
│  ├─ text: string
│  └─ target: Dialogue key
└─ mutation?: EventStateMutation key
```

固定约束：

```text
lines.length >= 1

choices 存在
→ choices.length >= 1
→ mutation 不存在

mutation 存在
→ choices 不存在
```

Dialogue identity 来自 FSDB key，不保存 `id`。

# EventStateMutation

Mutation 使用：

```text
namespace = struct.EventStateMutation
key       = <mutationId>
file      = [struct]EventStateMutation/<mutationId>.json
```

示例：

```json
{
  "from": {
    "prologue": "lab-complete",
    "first-route": null
  },
  "to": {
    "prologue": null,
    "first-route": "active"
  }
}
```

shape：

```text
EventStateMutation
├─ from: object
│  └─ <eventId>: stateId | null
└─ to: object
   └─ <eventId>: stateId | null
```

这里 `null` 是**静态 Mutation 语义**，不是 Realm State 存储值：

```text
from[eventId] = null
→ 要求 EventStateList 当前没有该 eventId entry

to[eventId] = null
→ 应用后从 EventStateList 删除该 eventId entry
```

当前物理约束：

- `from` 必须存在，可以是 `{}`；
- `to` 必须存在并至少有一个成员；
- 同一个 JSON object 天然不能表达重复 event key；Builder 仍要验证所有非空 stateId 属于对应 Event；
- Mutation 不保存 `id`、trigger、action、command 或任意 Realm State path mutation。

允许：

```json
{
  "from": {},
  "to": {
    "prologue": "active"
  }
}
```

禁止完全 no-op Mutation。

# Event

Event 使用：

```text
namespace = struct.Event
key       = <eventId>
file      = [struct]Event/<eventId>.json
```

示例：

```json
{
  "states": {
    "lab": {
      "maps": {
        "1": {
          "npcs": {
            "rival-lab": {
              "character": "rival",
              "placement": {
                "x": 8,
                "y": 5,
                "direction": 2
              },
              "interaction": {
                "dialogue": "lab-rival-intro"
              }
            }
          }
        }
      }
    },
    "after-lab": {
      "maps": {
        "1": {
          "npcs": {
            "rival-lab": {
              "character": "rival",
              "absent": true
            }
          }
        }
      }
    }
  }
}
```

identity 层级全部来自 key：

```text
Event identity
= FSDB record key

stateId
= states object key

mapId
= maps object key，解释为十进制正整数

npcId
= npcs object key
```

所以 source 不重复保存：

```text
id
eventId
stateId
mapId
npcId
```

Event NPC directive：

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

`instanceId` 不属于静态 Event Content。它是 Story Resolver 生成当前 World-side NPC Instance / Map `NPCPlacement` 时的 Runtime identity。

## 持久 Character 与 transient Story NPC 的 BattleActor

持久 Character directive：

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

其 BattleActor 必须经：

```text
Character
→ Character.battleActor
→ base BattleActor
```

因此当 `character` 存在时，directive **禁止同时保存 `battleActor`**。

没有持久 Character 的 transient Story NPC 可以直接保存基础 BattleActor：

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

规则：

```text
character 存在
→ battleActor 禁止存在

character 不存在
→ battleActor 可选
```

`battleActor` 可选是因为并非所有 transient Story NPC 都需要进入 Battle。

# Encounter

Encounter 使用每张 Map 一条 record：

```text
namespace = struct.Encounter
key       = decimal mapId
file      = [struct]Encounter/<mapId>.json
```

例如 Map `2`：

```text
[struct]Encounter/2.json
```

record value 不重复保存 `mapId`。

当前已经能冻结的骨架：

```json
{
  "spawnPoints": [
    {
      "x": 7,
      "y": 12,
      "direction": 2
    },
    {
      "x": 13,
      "y": 8,
      "direction": 4
    }
  ],
  "templates": {
    "road-bandit": {
      "npc": "road-bandit",
      "engagement": "hostile",
      "dialogue": "route-bandit-threat",
      "battleActor": {
        "namespace": "<battle package namespace>",
        "key": "road-bandit"
      }
    }
  }
}
```

shape：

```text
Encounter
├─ spawnPoints[]
│  ├─ x
│  ├─ y
│  └─ direction
└─ templates
   └─ <templateId>
      ├─ npc: NPC key
      ├─ engagement
      ├─ dialogue?: Dialogue key
      └─ battleActor: ContentRef
```

`templateId` 只是该 Encounter record 内部 identity，不建立新的 FSDB record。

当前 MVP 已明确需要 `engagement = "hostile"`。以下 generation 参数尚未冻结，不在当前 schema 中提前发明：

```text
weight
probability
minCount
maxCount
seed
respawn
persistent
```

Encounter re-entry / defeated persistence 等仍是 Runtime / gameplay policy；不能因为以后可能持久化，就把对应 State 或 Content 字段先塞进当前 Encounter schema。

# StoryIndex

Story Index 是 Builder 从 Character / Event 等源 Content 生成的派生只读 Content，不是作者业务 authority，也不进入 Realm State。

当前物理位置：

```text
namespace = struct.StoryIndex
key       = current
file      = [struct]StoryIndex/current.json
```

概念结构：

```text
StoryIndex
├─ byMap
├─ byCharacter
└─ byEvent
```

示例：

```json
{
  "byMap": {
    "1": {
      "characters": ["professor", "rival"],
      "events": ["prologue"]
    }
  },
  "byCharacter": {
    "rival": {
      "defaultMaps": [1],
      "events": ["prologue"]
    }
  },
  "byEvent": {
    "prologue": {
      "maps": [1],
      "characters": ["rival"]
    }
  }
}
```

派生数组必须 unique，并由 Builder 使用稳定顺序输出，避免同一语义产生多个不必要的序列化结果。

**StoryIndex 的精确字段集合仍允许随真实 Resolver 查询需求调整。** 当前冻结的是：它是 generated Content、一个 `struct.StoryIndex/current` record，并且不形成第二业务 authority。

# Map id

PokeMan 在所有 Content 中统一使用 Map package 的业务 `mapId`：

```text
positive safe integer
```

因为 JSON object key / FSDB struct key 是字符串：

```text
"1"
"2"
```

在 Character `defaultScenes`、Event `maps`、Encounter record key 等位置都必须可无歧义解析成对应正整数 Map id。

因此以后 Realm State 若保存**持久 resume/checkpoint location**，其 `mapId` 也应使用整数业务值，而不是任意 string。

注意：当前正在运行的 player position / direction / motion authority 仍属于 Map Runtime；只有产品明确要求跨运行恢复的位置 checkpoint 才进入 Realm State，不能建立两个并行 live authority。

# Builder 校验

除各业务文档已有语义检查外，FSDB Builder 至少应检查：

- 所有 PokeMan 自有 struct identity 使用 FSDB key，不要求也不接受重复 `id` 字段；
- 所有固定-target key 引用存在于目标 table；
- Character `battleActor` ContentRef 可解析；
- Character `defaultScenes` 的 map key 是合法正 safe integer；
- Character `defaultScenes` 的 `npcId` 指向 `struct.NPC`；
- Event `states` / `maps` / `npcs` object key 不为空且符合各自业务 identity 规则；
- Event map key 是合法正 safe integer；
- 一个 Event state 内 `(mapId,npcId)` 唯一；该唯一性由 object nesting 直接表达；
- Event directive `placement XOR absent:true`；
- Event directive 有 `character` 时禁止再提供 `battleActor`；
- Dialogue `speaker`、Choice `target`、`mutation` 引用存在；
- Dialogue `choices` 与 `mutation` 互斥；
- EventStateMutation `to` 非空；
- EventStateMutation 所有非空 stateId 存在；
- Encounter record key 是合法正 safe integer mapId；
- Encounter template 的 `npc / dialogue / battleActor` 引用存在；
- StoryIndex 由源 Content 生成并与源定义一致。

# 当前仍未冻结

FSDB 物理组织冻结以后，当前 Content 层真正仍开放的主要是：

1. Battle package 的 BattleActor / BattleSkill 正式 serialization namespace / key/reference encoding；PokeMan 只使用 ContentRef，不替它做决定。
2. Encounter 随机生成的具体数量、概率、权重、spawn 选择与 seed 规则。
3. StoryIndex 为实际 Resolver 性能最终保留哪些派生字段。
4. 本地化、头像 / 表情 / 音效等更丰富的 presentation metadata。

以下不再属于 Content physical-schema 未决项：

- Character / Dialogue / Event / EventStateMutation / Encounter / StoryIndex 的 FSDB table 名；
- PokeMan 自有 struct record 的 identity 是否重复保存 `id`；
- Event 的 `stateId / mapId / npcId` 是否重复写进 value；
- Event placement / `absent` 的基本 JSON shape；
- Event / Character scene source 是否保存 Runtime `instanceId`；
- 持久 Character 与 transient Story NPC 的基础 BattleActor 引用位置；
- Encounter 是否重复保存 `mapId`。