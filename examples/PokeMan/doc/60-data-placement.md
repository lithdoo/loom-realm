# 数据落点

> 独立技术设计记录。不改写 `../DESIGN.md`。本文只划分大模块的数据归宿，不冻结最终 Record key / JSON schema。

## 三处归宿

| 归宿 | 是什么 | 这一局会不会变 |
| --- | --- | --- |
| Content | 安装包里的只读定义、剧情内容、派生索引与资源 | 不会 |
| Realm State | 这一局里跨 Subsystem 共享、不能只靠 Content 重建的业务事实 | 会 |
| 临时内存 | 当前 Frame、当前模拟或当前画面才需要的工作数据 | 会，但不作为长期 authority |

基本判断：

- 每个新游戏都一样、游玩过程中不改的定义与剧情规则，放 Content。
- 这一局真正发生了什么、关系如何变化、当前携带什么等 mutable facts，放 Realm State。
- 能由 **Content + Realm State 最小事实**重算出的表现，不为了存档方便再复制一份进 State。
- 只服务当前调用 / 当前 Battle / 当前画面的，留在 Runtime 内存。

Game Entry 的 `state.records` 是 Session bootstrap 时安装的 Realm State baseline。初始 Relationship、初始 contract、初始 Event state、初始随身 Card 等 mutable baseline 可以从这里进入 State；Character、Dialogue、Battle profile、Skill 等 immutable definition 仍属于 Content。

## Content：定义与剧情

当前主要 Content：

```text
Content
├─ Character definitions
│  ├─ identity / description / fixed AI text
│  ├─ default NPC instances
│  └─ Battle static profile
│     ├─ base stats
│     └─ skills
├─ NPC definitions
├─ Visual definitions/resources
├─ Event / Event State
├─ Dialogue definitions
├─ Encounter definitions
├─ Story Index (generated)
├─ Battle rules / scenarios
└─ Map content
```

所有持久 Character 都准备好 Card / Battle 所需静态素材与数据。这只是 Content 完备性，不代表当前可以建立契约。

固定 Dialogue 也是 Content：

```text
Dialogue
├─ id
├─ lines[]
└─ choices?[]
   └─ target Dialogue
```

一个 Dialogue 线性播放；Choice 只能在末尾，并只跳到另一个 Dialogue。

## Realm State：长期业务事实

当前确认的 Realm State 主要包括：

```text
Realm State
├─ player current map / position / direction
├─ Event current state
├─ directed Relationship
│  ├─ affinity
│  ├─ hostile
│  ├─ dynamic relationship text
│  └─ contract?
├─ current carried Card[]
│  ├─ holderCharacterId
│  ├─ servantCharacterId
│  ├─ carried slot
│  └─ battle-facing state
│     └─ integrity
├─ Encounter generated results that must persist
├─ Pocket / story facts that must persist
└─ player choices / random results that cannot be recomputed
```

### Relationship

Relationship 是有方向的：

```text
A → B
= A 与 B 当前持续存在的关系状态
```

`affinity`、`hostile`、动态关系描述和 `contract` 都在 Relationship。`contract` 表示 A 已经作为主公与 B 这个从者建立正式契约。

Contract **不建立独立 Realm State authority**。

### Card

Card 与 Relationship 分离。

当前技术定义：

> **Card 只表示当前随身、主要用于 Pocket / Battle 的角色卡。**

所以：

```text
Relationship(A → B).contract = true
```

可以长期存在，而当前没有：

```text
Card(holder=A, servant=B)
```

只有 B 被加入 A 的当前随身编队时，才存在对应 Card State。

Card 当前承载：

- holder / servant 关联；
- 当前随身 slot；
- 当前随身 Card 的 Battle-facing state，例如 Card Integrity。

Card 不复制 Character 的基础能力、Skill、人格或静态资源。

**Card 的独立 `cardId`、非随身时 Integrity / 训练 / 成长等长期状态最终住在哪里，目前尚未冻结。** 不在这里提前增加新的 State authority。

## Battle：三层分离

```text
Character Content
= Battle 静态定义
├─ base stats
├─ skills
└─ presentation/resources

Card Realm State
= 当前随身 Card 的 Battle-facing state
└─ integrity

Battle Runtime
= 本场权威模拟
├─ currentHp / maxHp
├─ current stats
├─ resolved skills
├─ cooldown / status / buff / debuff
├─ Decision
└─ simulation state
```

Card Integrity 不是 Character 本体生命值。

当前随身 Card 参战：

```text
Character Battle Content
+
Card State
↓
Battle Actor
```

剧情 / Encounter 临时对手不需要制造 contract 或 Card：

```text
Story / Encounter Battle definition
+
Character / Battle profile
↓
Battle Actor
↓
Battle 结束后 Runtime 丢弃
```

Battle 结束后，World 决定哪些结果需要提交回 Realm State。

## Character 与 NPC Instance

Character 表示“这个人是谁”，NPC Instance 表示“当前场景具体出现的实例”。

```text
Character rival
├─ NPC Instance rival-lab-a
├─ NPC Instance rival-lab-b
└─ NPC Instance rival-town
```

同一个 Character 可以在不同地图或同一地图出现多个实例。真正区分场景实例的是 `instanceId`。

Map Enter：

```text
读取 Story Index
→ 找到相关 Event / Character Content
→ 读取 Event currentStateId
→ Story Resolver
→ NPC Instance[]
→ NPCPlacement[]
→ @loomrealm-game/map
```

Builder 应检查缺失引用、重复 `instanceId`、非法 placement 和派生索引一致性；不因为同一个 Character / npcId 多次出现而失败。

## AI 自由对话的数据边界

AI 自由对话不新增独立人格 authority：

```text
Character Content
= “我是谁”
= 固定人物资料 + fixed AI character text

Relationship B → A
= “B 当前怎么看 A”
= affinity + hostile + dynamic relationship text

Card(holder=A, servant=B)
= 当前 B 是否作为 A 的随身 Pocket / Battle Card
```

Card 自由对话可以组合以上信息和必要的当前剧情 context。LLM 输出默认只是一轮对话，不自动改写 Character Content 或 Relationship。

当前不建立独立 Conversation Memory。

## 模块归宿

| 模块 | Content | Realm State | 临时内存 |
| --- | --- | --- | --- |
| 会话 / Frame | — | — | Frame 栈、Activation、InputTarget |
| 系统菜单 | 菜单定义可本地持有 | 世界事实不放这里 | root / 游戏中菜单实例、光标 |
| 消息 | — | — | 当前模态消息 |
| 地图与玩家 | 地图、碰撞、传送、Story Index | 当前地图、玩家格与朝向、必要剧情事实 | Resolver、镜头、走步、输入、寻路 |
| 人物 | 身份、描述、fixed AI text、Battle static profile | — | 当前解析出的 NPC Instance |
| 关系 / 契约 | — | Relationship：affinity、hostile、动态文本、contract | 尚未提交的关系变化 |
| Card | Card / Battle 表现所需静态资源来自 Character / Visual Content | **当前随身 Card State**：holder、servant、slot、battle-facing state | Battle 中的 Card Manifestation |
| 对话 | 固定 Dialogue | AI 长期关系语境来自 Relationship | dialogue id / line index / pending choice；LLM working context |
| 剧情 | Event、states、NPC placement、Dialogue ref、Story Index | Event currentState、不可重算剧情事实 | 当前解析 / 执行步骤 |
| 遭遇 | table、spawn point、template、Battle profile ref | 需要持续存在的生成结果 | 当前接触、视野、临时对手 |
| 战斗 | rules、skills、Character Battle profile | 当前随身 Card 的已提交 Battle-facing state | Battle Actor、HP、cooldown、Buff/Debuff、Decision、Simulation |
| 表现 | tiles、sprites、portrait、UI skin | — | Renderer replica、动画 |
| 存档 | — | 选中的 Realm State snapshot | Load 临时缓冲 |

## 谁提交世界事实

```text
Main
  只持有控制面 / Frame 栈

Dialogue / Battle
  Frame 内拥有当前工作集
  完成后把结果交回调用方

World
  解释 Content + Realm State
  提交地图、Relationship、当前随身 Card、剧情、Encounter 等 mutable facts
```

System Menu 可以发起 New Game / Load 意图，但不是第二个 State authority。

## 存档边界

存档带走已确认的 Realm State，例如：

- Event current state；
- Relationship 当前状态，包括 contract；
- 当前随身 Card State；
- 当前地图 / 玩家位置；
- 需要持续存在的 Encounter 生成结果；
- 其他已经提交的剧情 / Pocket 事实。

存档不重复保存：

- Character fixed AI text；
- Character Battle static profile / Skill definitions；
- Dialogue definitions；
- Event state 中的 immutable placement；
- Story Index；
- Battle Runtime 的 currentHp、cooldown、Buff/Debuff；
- Frame 栈、Renderer replica。

需要注意：**从者不随身时仍需跨存档保留的 Integrity / Progression 状态最终 owner 尚未确定。** 在这个问题冻结以前，本文不把它强行塞回 Relationship，也不新增一个未经确认的 Managed Card / Contracted Servant State。

## 序章当前 State 面

序章至少会用到：

- 当前地图和玩家位置；
- Event current state / 少量剧情事实；
- `player → rival` 与 `rival → player` 的 Relationship / contract；
- 玩家当前随身的宿敌 Card；
- Card 当前 Integrity；
- 第一道路需要持久的 Encounter 结果；
- 已触发的 Pocket / 剧情事实。

Character、Battle profile、Skill、Dialogue、默认 NPC Instance 与 Story Index 都留在 Content。