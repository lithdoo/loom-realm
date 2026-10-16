# Content FSDB 物理模型

> 独立技术设计记录。不改写 `../DESIGN.md`。本文冻结 PokeMan 当前 Content 的 FSDB 物理组织、record identity 与引用编码。Realm State 物理结构以 [Realm State Record 设计](./67-realm-state-records.md) 为准；业务语义分别见 [人物](./61-character.md)、[事件](./62-event.md)、[固定对话](./64-dialogue.md)。

# FSDB 前提

项目当前 FSDB 对 PokeMan Content 有几个直接约束：

- FSDB root 目录名形如 `[FSDB]PokeMan`；
- `struct` table 目录名形如 `[struct]Character`；
- `struct` record 是 table 同层的 `<key>.json`；
- `struct` record 顶层必须是 JSON object；
- `struct` table 必须提供 `.info.meta`；
- `struct` key 不通过子目录形成层级路径；
- `resource` table 才允许目录层级，因此 `Characters/Mage` 这种 key 属于 resource key；
- Runtime Content namespace 由 FSDB table 投影得到，例如 `struct.Character`、`struct.NPC`、`resource.Graphics`。

因此 PokeMan 不再先定义一套脱离 FSDB 的 `id + object` 模型，再在安装阶段做第二次 identity 映射。

```text
struct record 的 FSDB key
= 该定义的 physical identity
```

# 当前目录组织

```text
[FSDB]PokeMan/
├─ [struct]Character/
│  ├─ .info.meta
│  ├─ player.json
│  ├─ rival.json
│  └─ professor.json
│
├─ [struct]NPC/                         # @loomrealm-game/map contract
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

对应 identity：

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

# identity 与引用编码

## PokeMan 自有 struct 不重复保存 id

例如：

```text
[struct]Character/rival.json
```

已经完整表达：

```text
namespace = struct.Character
key       = rival
```

所以 source value 不再写：

```json
{
  "id": "rival"
}
```

同理适用于：

```text
Character
Dialogue
Event
EventStateMutation
Encounter
StoryIndex
```

## Character key 的额外业务约束

`struct.Character` key 还会进入 `pokeman.Relationship` 与 `pokeman.CarriedCards` 的 Realm State Record key，因此额外固定为：

```text
[a-z0-9][a-z0-9._-]{0,119}
```

即 1–120 个 ASCII 字符。`:` 不允许出现在 Character key 中，因此 Relationship 可以稳定编码为：

```text
<fromCharacterId>:<toCharacterId>
```

最大长度为 241 bytes，满足 Realm State v1 的 256-byte key 上限。

## 固定目标 table：只保存 key

如果字段 schema 已唯一确定目标 namespace，则只保存 key：

```json
{
  "speaker": "rival",
  "mutation": "prologue-to-route"
}
```

解释为：

```text
speaker
→ struct.Character / rival

mutation
→ struct.EventStateMutation / prologue-to-route
```

其他固定引用：

```text
npc
→ struct.NPC key

dialogue / Choice.target
→ struct.Dialogue key

eventId
→ struct.Event key
```

## 跨 table / package definition：保存 ContentRef

当字段需要定位一条不属于固定 PokeMan table 的 Content definition 时，使用：

```ts
type ContentRef = {
  namespace: string
  key: string
}
```

当前主要用于 `battleActor`：

```json
{
  "battleActor": {
    "namespace": "<battle content namespace>",
    "key": "rival"
  }
}
```

这只表示“定位一条基础 BattleActor definition”，不意味着 PokeMan 重新定义 BattleActor schema。

`@loomrealm-game/battle` 已经拥有 BattleActor / BattleSkill gameplay contract，并且 BattleSkill identity 在现有 Battle contract 中就是 string `id / skillId`。因此：

```text
BattleActor.skills[]
= BattleSkill id string[]

Relationship.contract.skills[]
= ordered unique BattleSkill id string[]
```

PokeMan 不建立 `BattleSkillRef`、`ContentRef[]` 或第二套 Skill identity。

作者 source 不手写 `contentVersion`；版本由 Content API / resolved reference 处理。

# Character

物理 identity：

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
    "namespace": "<battle content namespace>",
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

规则：

- Character identity 来自 FSDB key；
- Character key 必须满足 `[a-z0-9][a-z0-9._-]{0,119}`；
- `battleActor` 是持久 Character 的稳定基础 BattleActor reference；
- `defaultScenes` 是 Event 未接管该 Character 时的 fallback source；
- `<mapId>` 是 Map package 正 safe integer `mapId` 的十进制字符串形式；
- `<npcId>` 是 `struct.NPC` key；
- `interaction.dialogue` 是 `struct.Dialogue` key；
- placement `x / y` 使用非负 safe integer；
- default scene source 不保存 Runtime `instanceId`。

Character 不保存 Relationship、Contract、Card 或 Battle Runtime state。

# NPC

PokeMan 不扩展 `@loomrealm-game/map` 已有的 `struct.NPC` record。

```text
namespace = struct.NPC
key       = <npcId>
```

当前 Map contract：

```json
{
  "name": "宿敌",
  "sprite": {
    "namespace": "resource.Graphics",
    "key": "Characters/RivalCasual"
  }
}
```

禁止塞入：

```text
character
characterId
battleActor
dialogue
relationship
contract
```

当前也不建立独立 `struct.Visual`。地图人物视觉由 `struct.NPC.sprite → resource.Graphics` 表达。

# Dialogue

物理 identity：

```text
namespace = struct.Dialogue
key       = <dialogueId>
file      = [struct]Dialogue/<dialogueId>.json
```

持久 Character speaker：

```json
{
  "lines": [
    {
      "speaker": "rival",
      "text": "总算来了。"
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

transient speaker：

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

shape：

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

约束：

```text
lines.length >= 1

choices 存在
→ choices.length >= 1
→ mutation 不存在

mutation 存在
→ choices 不存在

choices 与 mutation
→ 最多存在一个
→ 允许两者都不存在
```

# EventStateMutation

物理 identity：

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

`null` 是 Mutation 语义，不是 Realm State 内部 entry 编码：

```text
from[eventId] = null
→ 要求 EventStateList 当前没有该 eventId entry

to[eventId] = null
→ 应用后删除该 eventId entry
```

物理约束：

```text
from
→ 必须存在
→ 可以是 {}

to
→ 必须存在
→ 至少一个 member
```

允许：

```json
{
  "from": {},
  "to": {
    "prologue": "active"
  }
}
```

这里只禁止 `to: {}` 这种空赋值。schema 不额外比较 `from / to` 来证明一次执行一定改变当前值；这种“语义 no-op”不是值得增加数据结构复杂度的问题。

Mutation 不保存：

```text
id
trigger
action
command
generic Realm State path mutation
```

# Event

物理 identity：

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

identity 层级：

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

source 不重复保存：

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
├─ x: non-negative safe integer
├─ y: non-negative safe integer
├─ direction: 2 | 4 | 6 | 8
└─ pattern?: 0 | 1 | 2 | 3
```

固定：

```text
placement XOR absent:true

absent:true
→ character 必须存在
→ placement 不存在
→ battleActor 不存在
→ interaction 不存在
```

不额外引入 `absentCharacters[]` 或第二套 Character takeover schema。

`instanceId` 不属于 Event Content。

## 持久 Character 与 transient Story NPC

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

因此：

```text
character 存在
→ battleActor 禁止存在
```

transient Story NPC 可以直接保存基础 BattleActor：

```json
{
  "placement": {
    "x": 8,
    "y": 5,
    "direction": 2
  },
  "battleActor": {
    "namespace": "<battle content namespace>",
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

# Encounter

每张 Map 一条 record：

```text
namespace = struct.Encounter
key       = decimal mapId
file      = [struct]Encounter/<mapId>.json
```

例如：

```text
[struct]Encounter/2.json
```

record value 不重复保存 `mapId`。

当前骨架：

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
        "namespace": "<battle content namespace>",
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

`templateId` 是该 Encounter record 内部 identity，不建立新的 FSDB record。

当前 MVP 已明确需要：

```text
engagement = "hostile"
```

当前真正仍缺的 authored generation 数据只有：

```text
每次生成数量的表达
多个 template 的相对选择分布（例如 weight）
```

以下不作为当前 Content schema gap：

```text
seed
spawn selection algorithm
re-entry reroll
respawn
defeated persistence
```

它们默认属于 Runtime / gameplay policy。只有未来产品明确需要作者配置时，才重新进入 Content 数据设计。

# StoryIndex

StoryIndex 是 Builder 从 Character / Event 等源 Content 生成的派生只读 Content，不是作者业务 authority，也不进入 Realm State。

物理位置：

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

派生数组必须 unique，并由 Builder 使用稳定顺序输出。

StoryIndex 的精确字段集合可以随真实 Resolver 查询需要调整。因为它是可重建的 generated read model，这不是 MVP 核心业务数据 schema 缺口，也不形成新的 authority。

# Map id

PokeMan 所有 Content 统一使用 Map package 的业务 `mapId`：

```text
positive safe integer
```

由于 JSON object key / FSDB key 是字符串：

```text
"1"
"2"
```

在 Character `defaultScenes`、Event `maps`、Encounter record key 中都必须可无歧义解析成对应正整数 Map id。

Realm State 的 `pokeman.PlayerWorld/current` 只作为 durable resume/checkpoint location，不是 live Map authority；其 `mapId` 同样使用整数业务值。当前 live map / x / y / direction 仍由 Map Runtime 拥有。

# Builder 校验

除业务文档已有语义检查外，Builder 至少应检查：

- PokeMan 自有 struct identity 使用 FSDB key，source 不接受重复 `id` 字段；
- `struct.Character` key 满足 `[a-z0-9][a-z0-9._-]{0,119}`；
- 固定-target key 引用存在于目标 table；
- Character `battleActor` ContentRef 可解析；
- Character `defaultScenes` map key 是合法正 safe integer；
- Character `defaultScenes` placement 的 `x / y` 是非负 safe integer；
- Character `defaultScenes` 的 `npcId` 指向 `struct.NPC`；
- Event state / map / npc object key 合法；
- Event map key 是合法正 safe integer；
- Event directive 满足 `placement XOR absent:true`；
- `absent:true` 时必须有 `character`，且不得同时出现 `placement / battleActor / interaction`；
- Event placement 的 `x / y` 是非负 safe integer；
- Event directive 有 `character` 时禁止 `battleActor`；
- Dialogue `speaker`、Choice `target`、`mutation` 引用存在；
- Dialogue `choices` 与 `mutation` 互斥；
- EventStateMutation `to` 非空；
- EventStateMutation 所有非空 stateId 存在；
- Encounter record key 是合法正 safe integer mapId；
- Encounter spawn point `x / y` 是非负 safe integer；
- Encounter template 的 `npc / dialogue / battleActor` 引用存在；
- StoryIndex 与源 Content 一致。

# 与 Realm State 的衔接

Content physical schema 只定义静态数据。长期业务事实已经由 [67-realm-state-records.md](./67-realm-state-records.md) 冻结：

```text
pokeman.PlayerWorld / current
→ durable resume/checkpoint location

pokeman.EventStateList / current
→ Event current state list

pokeman.Relationship / <from>:<to>
→ affinity / hostile / relationshipText / contract?

pokeman.CarriedCards / <holder>
→ current carried slots
```

其中：

```text
Relationship.contract.integrity
max / initial source
→ Character.battleActor → BattleActor.max_hp

Relationship.contract.skills[]
initial source
→ copy(BattleActor.skills[])
→ BattleSkill id string[]
```

Content 不复制这些 mutable values。

# 当前仍未冻结

经过一致性复核，当前 Content 侧真正需要继续设计的核心项只剩：

1. **Encounter authored generation 数据**：生成数量的最小表示，以及 template 相对选择分布采用哪种简单编码（例如 `weight`）。

以下不再列为 MVP 核心 Content physical-schema gap：

```text
BattleSkill identity / Contract.skills[] encoding
BattleActor gameplay schema
Dialogue choices / mutation exclusivity
Event absent 的第二套 takeover 结构
EventStateMutation semantic no-op proof
StoryIndex 最终派生字段
Encounter seed / spawn selection algorithm / re-entry / respawn / persistence
本地化、头像 / 表情 / 音效等 future presentation metadata
```

每个 struct table 仍需要实际 `.info.meta` / exact schema 文件，但这是把本文已经冻结的 shape 落成 FSDB 可执行校验的实现工作，不代表还需要重新设计业务数据模型。

以下已经冻结，不再是 Content physical-schema gap：

```text
Character / Dialogue / Event / EventStateMutation / Encounter / StoryIndex table identity
PokeMan struct record 是否重复保存 id
Character key 与 Relationship key 的编码约束
Event stateId / mapId / npcId 是否重复写进 value
Dialogue choices 与 mutation 的互斥语义
Event placement / absent basic JSON shape 与 absent 最小约束
Event / Character scene source 是否保存 Runtime instanceId
持久 Character / transient Story NPC 的 base BattleActor 引用位置
BattleSkill id = string；Contract.skills[] 直接复用
Encounter 是否重复保存 mapId
Relationship / Contract / Card / EventStateList Realm State encoding
```