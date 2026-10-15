# 人物

> 独立技术设计记录。不改写 `../DESIGN.md`。本文决定持久人物的 Content、关系基础事实，以及站位的三层取法。字段形状以外的对话、遭遇和角色卡实例留到各自模块。

归宿总表见 [数据落点](./60-data-placement.md)。

## Content 里的人物

一个持久的人一条 Content 记录。主角、家人、博士、宿敌、店主，以及以后可以收服的修行者，都是人物。进图时随机生成的混混、路霸不是人物，他们走遭遇模板。

人物记录放稳定、不随这一局游玩改变的定义，例如：

- **身份**：`id`、名称。`id` 也是关联人物资源和其他静态定义的稳定键。
- **描述**：职业、性格、经历。这是作者写好的静态内容；这一局里实际发生的事记在剧情 State。
- **功能标签**：研究者、店主、家人这类标签，说明这个人在世界上的职责。
- **默认站位**：这个人在没有临时位置、也没有当前事件位置覆盖时，默认出现在哪张地图、哪一格、朝向哪边。

人物相关的图像、角色卡表现、Battle 表现等资源不要求全部塞进这一条 Character 记录。所有持久角色都应当提供形成角色卡和进入 Battle 所需要的静态素材与数据，并通过人物 `id` 或由它稳定关联的 Content key 取得。

这是一条 **Content 完备性规则**，不是“谁可以收服”的游戏规则：

> **所有持久角色都准备好角色卡 / Battle 所需素材与数据；某个角色当前是否允许建立契约、什么时候能够获得角色卡，仍由剧情、关系和系统规则决定。**

因此不因为素材已经存在，就在 Character Content 上推导 `canContract = true` 之类的业务结论。

## 关系基础事实

初始好感等 mutable relationship baseline 可以写在 Game Entry 的 `state.records` 里，并在 Session bootstrap 时成为 Realm State initial baseline；它不是玩家点击 New Game 时才安装。

好感是一个整数。**hostile 与好感是独立事实，不由 `affinity < 0` 推导。**

例如：

```text
affinity = -20
hostile = false
```

可以表示双方关系很差，但当前没有进入敌对冲突；反过来，也允许因为剧情或行为让当前关系进入 hostile，而不要求先把 affinity 改成负数。

好感和 hostile 最终属于 Relationship，而不是 Character 本体属性。Relationship 的 identity、方向性和完整 Record shape 留到后续关系 / 契约设计单独确定。

## 站位

持久人物进图时按这个顺序取位置，取到就停：

1. **State 里的临时位置。** 有这个人的临时位置记录，直接用。
2. **事件位置。** 见 [事件](./62-event.md)。Realm State 记录事件当前的状态 id，只读该状态 value 里写的角色位置。按剧情顺序查看提到这个人的事件，取最后一条当前状态里写了位置的事件。
3. **Content 默认位置。** 使用 Character 的 immutable default placement。
4. **不画。** 临时位置、事件位置、默认位置都没有，这个人当前不放上地图。

临时位置是 Realm State 中的当前覆盖事实；默认位置是 Content definition。临时情况结束就去掉临时位置记录，下次再从事件位置和 Content 默认位置计算。临时位置不会改写默认位置。

多条事件都写了同一个人时，只认剧情顺序上的最后一条匹配。当前状态的 value 里没有这个人的位置，这条事件不提供位置。**这一套事件位置解析规则暂时保持现状，后续继续讨论。**

主角是玩家，不走这套 NPC 取位。混混、路霸由遭遇生成，不靠人物默认位置出现。

临时位置、事件位置、默认位置使用同一种静态位置数据：

```text
type: "static"
mapId
x
y
direction
```

`type` 先只有 `"static"`，留给以后的巡逻等逻辑换别的类型。`mapId` 使用地图引擎的地图编号。`x`、`y` 是格子坐标。`direction` 使用地图引擎的朝向：`2` 下、`4` 左、`6` 右、`8` 上。

只有 `mapId` 和朝向还不能放上地图，缺了格子就不知道站在哪一格。

事件或临时位置也可以写成不在场，用来盖住后面的默认位置：

```text
type: "absent"
```

没有这条记录，和写成 `absent`，不是一回事。没有记录会继续往下找；`absent` 是已经取到的结果，人物当前不画。

## 进图时怎么画

World 进图时先按上面的顺序得到这一张 Map 上应该出现的持久人物和位置，再为每个人生成现有 Map API 所需的 `NPCPlacement`：

```text
instanceId
npcId
x
y
direction
pattern?
```

其中 `npcId` 指向该人物已经准备好的 `[struct]NPC/<npcId>` Content definition。`@loomrealm-game/map` 自己根据 `npcId` 读取 NPC 的 `name` 和 `sprite`；World 不直接把名字和图集传给 Map。

因此 PokeMan Character 与 Map NPC 的职责是分开的：Character Content 描述“这个人是谁以及他具备哪些静态人物 / 角色卡 / Battle 数据”，`struct.NPC` 提供 Map 当前需要的窄 `name + sprite` 定义，World 只负责决定“这个人这次是否出现、出现在哪里”。

读档恢复 Realm State 中的临时位置、事件当前状态等 mutable facts；人物默认站位继续从当前安装的 Content 读取，不在存档里重复保存一份。
