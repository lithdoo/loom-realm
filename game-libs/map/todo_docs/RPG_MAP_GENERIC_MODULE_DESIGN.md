# RPGMap 通用化设计讨论与待办

> 状态：Map 内置地形行为与 NPC 最小定义 v1 的**目标设计已收敛**；本文整体仍是设计记录 / TODO，**不是已实现的新协议或资格通过证明**。  
> 记录日期：2026-09-21；Map `behaviors`、Bridge/Ledge 规则、NPC `name`/`sprite` 最小定义更新：2026-09-21。  
> 初始基线：`main` @ `2d465b8c8501566b26375dae55e1a78007606c40`（创建原设计分支时）。  
> 范围：`game-libs/map`；已经实现的源码以当前 `main` 为准；本文件区分目标契约、现有事实与仍待实现的部分。

## 1. 目标与核心思路

将目前与 Essentials v21.1 具体数据和行为耦合的 Map，逐步改造成可供不同游戏复用的 **RPG 地图业务模块**。业务方准备符合规范的地图与 NPC 定义 FSDB 内容，在自己的 Subsystem 内通过 `RPGMapBuilder` 提供 Subsystem 环境、初始化条件及内容定位配置，构建 `RPGMapHandler`；之后通过 Handler 控制角色、切图、查询状态与监听地图事件，不触碰内部地图加载、运动或渲染实现。

| 组成 | 职责 |
| --- | --- |
| `RPGMapBuilder` | 在同一 Subsystem 内创建/装配地图业务实例，连接地图和 NPC 定义内容与初始化配置。 |
| `RPGMapHandler` | 对业务方提供地图控制、按 NPC 定义 ID 设置/操作实例、只读查询和事件/准备钩子。 |
| RPGMap Runtime | 地图与角色位置/运动的唯一权威，负责合法性、通行/传送、NPC 定义/素材解析、角色实例与 RenderDomain 更新。 |
| RPGMap FSDB 规范 | 规定 Map 模块实际消费的 Map、Tileset、Transfer、NPC 定义和资源；**不规定 NPC 按地图的放置表或游戏玩法数据**。 |

调用方通过地图 ID 定位地图，通过 NPC 定义 ID 复用角色外观；业务方决定每次进入地图放置哪些 NPC，再向 Handler 提供实例信息。Map 不要求游戏采用固定的 `MapNPC` 表。Builder/Handler 不另造 Subsystem 生命周期管理器。

## 2. 已确认的责任边界

1. **Handler 位于 Map Subsystem 内部**，服务该 Subsystem 的业务方；跨 Subsystem/主进程编排不在本次重构范围内。
2. **Map 不负责 FSDB 安装、数据生产或准备**。调用方提供地图、NPC 定义及资源和可访问的内容来源；Runtime 按 ID 校验、读取、消费。
3. 保留 LoomRealm 权威边界：Subsystem 使用公开 `scope.content`、Input、RenderDomain；Renderer/Browser 消费投影，不反向决定通行、事件或世界状态；业务数据不暴露 Content 凭据。
4. **物理目录与逻辑 Content 身份不同**。Map 通过 `namespace + key` 读取，不访问任意磁盘路径；目录映射/安装属调用环境与已有 Content 机制。
5. Map 只定义 NPC 所需的最小地图表现数据，不理解 NPC 对话、任务、AI、商店、游戏方放置 Group/Schema；不建立通用 Entity 框架。

当前契约：[`SubsystemDefinitionFactory`](../../../packages/subsystem/src/model.ts)、[`ContentClient`](../../../packages/subsystem/src/content.ts)、[`Content API v1`](../../../doc/15-contracts/content-api-v1.md)、[Map 模块现况](../../../doc/20-modules/loom-map/README.md)。

## 3. FSDB 策略：保留已实现的 Map，只补内置行为；NPC 定义由 Map 规定、放置归业务方

**不重新设计整套地图格式。** `[struct]Map` 以已实现的四字段结构为基线；Tileset、MapTransfer 沿用既有消费模型。此轮 Map 内容协议只扩展必需的内置行为声明并显式迁移旧 `MapAction`，不重写 Tile Table、坐标、索引或全量 RGSS 对象。

**内置地形行为 v1 已收敛的边界：** RPGMap 支持 Bridge（桥梁）和 Ledge（悬崖）两种内置地形行为。Ledge 从 `Map.data`、`Tileset.terrain_tags` 和现有通行规则隐式推导，**不写入 `behaviors`**。Bridge 的桥面也由地形标签辨识，但其入口/出口需要局部声明，所以新版 `Map.behaviors` **只允许 `kind: "bridge"`**；新版协议不再要求独立 `[struct]MapAction`。本节的 v1 是目标设计，不等于当前 Runtime 已支持新字段。

**NPC 边界：** `[struct]NPC` **保留为 RPGMap 需要的可复用定义表，v1 最小定义仅有必填 `name` 与 `sprite`**。定义 ID 使用文件 Key，`setNPC` 通过 `npcId` 引用 `struct.NPC/{npcId}`，Map 解析素材。Map **不要求、不读取 `[group]MapNPC`**：每张地图放置哪些 NPC、位置和玩法信息属于业务方，它可以自行读取 FSDB Group 或其他来源，再传 `{npcId, instanceId, x, y, direction, ...}` 等必要实例信息。Essentials Event/Page 不是 NPC Schema。

当前实现与旧投影（**现状**）：

```text
Map ID → struct.Map/{id} → tileset_id → struct.Tileset/{id}
                               └→ 图块、自动图块资源
Map ID → struct.MapTransfer/{id} → 目标 Map ID / 坐标
Map ID → struct.MapAction/{id}   → 旧桥梁动作及 opaque 防护
图像资源 → resource.Graphics/...（Characters、Tilesets 等）
```

目标内容组织（**尚未实现**）：

```text
Map ID → struct.Map/{id} → tileset_id → struct.Tileset/{id}
                            └→ 可选 behaviors：Bridge 入口／出口
Map ID → struct.MapTransfer/{id} → 目标 Map ID / 坐标
NPC 定义 ID → struct.NPC/{npcId} (name + sprite) → resource.Graphics/Characters/...
图像资源 → resource.Graphics/...（Tilesets、Autotiles、Characters 等）
业务方决定 NPC 放置 → Handler.setNPC(npcId + 实例信息)
```

```text
[FSDB]游戏数据/
├── [struct]Map/
├── [struct]Tileset/
├── [struct]MapTransfer/
├── [struct]NPC/
└── [resource]Graphics/
```

`[struct]NPC` 必须有 `.info.meta`；定义 ID 是文件 Key（如 `NPC/guard.json`），定义只保存两个必填字段 `name` 与 `sprite`，具体结构见 §3.4。定义不复制 Key、图片尺寸或业务放置坐标。业务方如果自行采用 `[group]MapNPC`，应遵守 FSDB Group 的 JSONL 及 `.info.meta`、`.desc.meta` 规范，但其表名、Key 和行 Schema 不是 Map 协议。

现有 Map 保留三层 Tile Table；Tileset 保留 `tileset_name`、`autotile_names`、`passages`、`priorities`、`terrain_tags` 等现有消费字段。`terrain_tags` 不能因来自原引擎而删除；旧 `MapAction.opaqueRelated` 的失败保护不得随独立表移除而丢失。

证据入口：[`semantics.ts`](../src/semantics.ts)、[`runtime.ts`](../src/runtime.ts)、[Essentials 实体数据调查](./ESSENTIALS_V21_1_ENTITY_DATA_INVESTIGATION.md)、[Player/NPC 素材与运动调查](./PLAYER_NPC_SPRITE_AND_MOTION_INVESTIGATION.md)。合成示例见 [`generate-fixtures.mjs`](../../../examples/essentials-v21.1/scripts/generate-fixtures.mjs)，不能当作原版素材证据。

### 3.1 `[struct]Map`：四字段不变，仅新增可选 `behaviors`（v1 目标结构已确定）

当前 [`semantics.ts`](../src/semantics.ts) 的 `MapRecord` 与 `validateMapRecord` 只有四个顶层字段，校验器**不接受第五字段**：

```ts
interface MapRecord {
  readonly tileset_id: number;
  readonly width: number;
  readonly height: number;
  readonly data: ProjectedTable;
}
```

`tileset_id` 沿用已有 Tileset 引用；`width`、`height` 为正安全整数；`data` 保留 `ProjectedTable` 的 `dimensions=3`、`xSize=width`、`ySize=height`、`zSize=3`，`values` 数量等于三维尺寸乘积，索引依旧是 `x + y*xSize + z*xSize*ySize`。不重设坐标、通行、相机、MapTransfer、渲染或 Tile Table 结构。

**目标扩展只有以下可选第五字段**（TypeScript 是目标协议的等价描述，尚未进入源码）：

```ts
interface MapRecord {
  readonly tileset_id: number;
  readonly width: number;
  readonly height: number;
  readonly data: ProjectedTable;
  readonly behaviors?: readonly MapBehavior[];
}

type MapBehavior = Readonly<{
  kind: "bridge";
  operation: "on" | "off";
  occupied: readonly Readonly<{ x: number; y: number }>[];
}>;
```

完整 JSON 保留原四字段；示例只展示新增部分，不是独立合法 Map 记录：

```json
{
  "behaviors": [
    { "kind": "bridge", "operation": "on", "occupied": [{ "x": 22, "y": 57 }, { "x": 23, "y": 57 }] },
    { "kind": "bridge", "operation": "off", "occupied": [{ "x": 22, "y": 58 }, { "x": 23, "y": 58 }] }
  ]
}
```

**v1 闭合字段集与含义：** `kind` 唯一允许 `"bridge"`；`operation` 只能是 `"on"` / `"off"`，分别把内部 `bridgeLevel` 设为 `2` / `0`；`occupied` 是非空地图格数组，一个条目内各格共享同一个操作。Map ID 来自 `[struct]Map` 的文件 Key，不在行为里重复存储；位置是零基地图格坐标。`bridgeLevel`、图层深度、执行脚本、原版 `eventId`、`pageIndex`、`commandIndex`、`trigger`、`height`、`through` 和 `emptyGraphic` 都不是新版行为的内容字段。将桥梁设为已有值属于有效、幂等的触发，但仍按区域重入规则去重。无需强制 on/off 数量相同，也不要求 `occupied` 本身为 Bridge tag15 图块：入口/出口可能位于桥旁陆地。

**校验在场景提交前完成并 fail-closed：** 新协议只接受原四字段加可选 `behaviors`；缺失 `behaviors` 或 `[]` 均表示没有显式行为（**仅适用于经明确确认为新版的内容**）。`behaviors` 必须是数组，行为对象恰有 `kind,operation,occupied`；`occupied` 非空，每个点恰有 `x,y`，各坐标为安全整数，且 `0 <= x < width`、`0 <= y < height`。同一行为的重复格、不同 Bridge 行为的占用重叠一律拒绝，避免以数组顺序充当隐性优先级。未知 `kind`（包括显式 `"ledge"`）、未知操作、冗余字段、无效点或数组形态均拒绝，不跳过坏行或允许自定义 Ruby。行为唯一性/重叠以本地图所有显式行为为范围检查；数组顺序不是内容优先级，也无需持久化 `behaviorId`。

### 3.2 内置行为的完整范围：Bridge 显式、Ledge 隐式（v1 目标语义已确定）

| 行为 | 如何确定 | `Map.behaviors` | Runtime 责任 |
| --- | --- | --- | --- |
| Bridge（桥梁） | Bridge 地形标签 15 判别桥面；Map 显式列入口/出口格及 on/off | `kind: "bridge"`，唯一允许的显式 kind | 接收 Player 到达触发，切换内部桥层并同步通行/人物与地形深度投影。 |
| Ledge（悬崖） | `Map.data` 与 `Tileset.terrain_tags` 中标签 1，结合方向通行/落点规则 | **不写** `kind: "ledge"`，也不要求任意 Ledge 行为数组 | 在移动计划中作两格 jump/blocked 决策；只在落点执行到达检查。 |

**Bridge 触发固定规则（无需通用 `trigger` 字段）：**

1. v1 **仅 Player** 可触发显式 Bridge；NPC 是否参与地形行为是后续 NPC 运动契约议题，不因共用 Sprite 就自动赋权。
2. Player 的方向移动成功并**完成到达** `occupied` 某格时检查；出生在该格、原地转向、受阻及仅与前方格接触均不触发。普通 walk 在完成时检查，jump 仅检查最终落点，不检查跳过的中间格。
3. **优先级：**移动成功后，先按现有 `MapTransfer.steps` 检查落点；如果开始传送，不执行旧地图落点 Bridge。无传送才匹配当前 Map 的 Bridge。`MapTransfer.contacts/edges` 仍依照既有输入与边界逻辑执行，不被 Bridge 记录替代。
4. 同一行为的连续占用区域只能触发一次；离开该行为全部占用格后再次进入，才重新允许触发。同地图另一个不重叠的 Bridge 区域可以随后触发。Runtime 用内部行为索引/进入态去重，不将旧 `eventId` 写回 FSDB；地图切换、重新装载时重置去重状态和 `bridgeLevel=0`。
5. `on` 把桥层置 2、`off` 置 0；桥层已是目标值时不额外制造无意义深度更新，但该次到达仍计入本区域的触发去重。层改变时必须在**同一次 RenderDomain 提交**中同步角色、地形深度及必要相机投影，沿用现有 Runtime 语义；Browser 不能自行改桥层。一次方向输入不因层改变而重新评估另一行为。

**Ledge 固定规则：**在现有 `planMovement` 中，先检查当前方向相邻格的双向可通行性；若相邻有效地形是 Ledge（tag 1），再检查跨两格的最终落点边界与通行，合法则生成**一次 `jump`、一个 motionId**，非法则 `blocked`。中间格不算 walk 到达，既不触发中间格的 Bridge，也不触发中间格的到达 Transfer；最终落点按已有顺序先检查 Step Transfer 再检查 Bridge。jump 动画沿用当前 400ms / `distancePx * 3 / 8` 的暂定产品值，**不宣称原版 RGSS 帧级等价**；跨图 jump 不支持。不可由 `behaviors` 覆写 Ledge 方向、跳距或判定；特殊悬崖属于未来单独需求，不能偷渡进 v1。

本设计将“支持的内置地形行为”与“必须显式写入 `behaviors` 的种类”明确分开：**v1 支持 Bridge + Ledge，但 `MapBehavior` 只包含 Bridge**。`kind` 不充当万能事件解释器，NPC、对话、物品、建筑、传送都不作为新增 `kind`；传送保持 `MapTransfer` 负责。

### 3.3 旧 MapAction → 新 Map 的安全迁移与协议边界（规则已明确，实施/验证未完成）

现状：`runtime.ts#loadMap` 仍读取 `struct.MapAction/{mapId}`（缺失时空记录），`validateMapRecord` 仍拒绝第五字段。旧 `MapAction` 的确认动作还包含 `trigger:1`、`through`、`emptyGraphic`、`eventId` 等；当前 Runtime 通过 `overTrigger` 判断脚下到达或受阻前方触发，使用 `lastStarted` 防重复。新版舍弃这些字段**只在可证明等价时**才允许；不是任意旧 Bridge 都能无条件压缩成三字段。

- **迁移输入完整性：**枚举每张旧 Map 的所有 MapAction；任何 `opaqueRelated`、含未确认脚本/命令、无法确认的页或动作，都必须在导入/迁移时失败并输出可定位的 mapId/eventId/pageIndex/原因，不得将记录当作空行为或回退执行 Ruby。
- **单条行为可转换条件：**旧动作必须是确认的 `bridge-on` 或 `bridge-off` 且 `trigger=1`；`occupied` 合法。针对每个占用格，在桥层 0 与 2 下按当前 Runtime 的 `through || (emptyGraphic && evaluatePassability(..., 0, bridgeLevel))` 复核 `overTrigger`。只有始终落在到达/here 分支、无需前方受阻触发时，才可去掉 `trigger/through/emptyGraphic`，映射 `bridge-on → operation:on`、`bridge-off → operation:off`、原占格 → `occupied`。无法确认的触发、动态条件、优先级依赖或不满足条件的输入应拒绝迁移，不默默改变语义。
- **全图完整性：**迁移后检查无重复/重叠占用格；逐条比较旧新动作的数量、操作、位置与触发结果，并验证状态去重、传送优先级及图层投影。不能因为地图上有 Bridge tag15 就自动凭空生成入口/出口，也不能静默略去旧动作。
- **真实证据边界：**[Map21 八事件矩阵](../TERRAIN_BEHAVIOR_EVIDENCE.md)显示其八个确认动作在桥层 0/2 静态重算均为 `here` 分支，支持对该样本实施上述压缩；这只是 `FSDB-OBSERVED + STATIC-INFERRED`，尚不是原版逐帧动态保真证明。Map7 桥负例、Map21 八动作/四组路线、Map47 Ledge 及原创合成的受阻/front、不合法 landing、重叠、opaque 和取消用例都需在新协议实现后复核。
- **版本与新旧隔离：**新版 `[struct]Map` 的 `.info.meta` Schema 应只接受上述四字段及可选 `behaviors`，并由明确的内容版本/导入迁移标记证明来源已按新版规则审查。**不得**仅因一份旧 Map 也恰好只有四字段，就自动推断旧 `MapAction` 可忽略。版本标识与现有 Content/FSDB 接口的具体接线留给实现审计，但此处的准入规则不可放宽：未验证新版本或旧动作迁移未通过就拒绝启用“只读 Map”的新 Runtime。无需仅为此在 Map JSON 添加第六个 `schemaVersion` 字段。
- **加载切换：**完成导入/校验与测试后，新 Runtime 才可以停止读取 `struct.MapAction`；新 Map 中 `behaviors` 缺失才真正代表无显式行为。不得在 Runtime 混读旧动作与新 behaviors，更不得在实现前向现有四字段校验器直接投放新版数据。

以上完成的是**Bridge/Ledge 的 v1 目标数据结构、触发、校验和迁移准入规则设计**；未完成新 `.info.meta` 的落盘、版本接线、代码、动态测试或原版资格签署。后续新增显式 `kind` 必须有独立需求、校验、运行时实现、迁移与测试，不为对称性添加 `kind: "ledge"`。

### 3.4 NPC：模块管理定义，业务方装配实例（最小定义 v1 已确定；API 待细化）

**两种所有权不可混淆：**Map 规定并读取 `[struct]NPC` 的最小地图角色定义（以 `npcId` 定位名称与图集）；业务方决定当前地图出现哪些 NPC、初始位置和对话/任务/AI 等业务用途。Map 不读取游戏方自定义放置 Group。Runtime 独占实例进入地图后的坐标、朝向、运动/碰撞状态，不回写 FSDB。建筑若只是背景仍使用 Tile。

**`[struct]NPC` v1 最小字段已确定：**每个 `[struct]NPC/{npcId}.json` 必须且仅需两个字段：

```json
// 文件：[struct]NPC/guard.json（以下是该文件的 JSON 内容）
{
  "name": "城门守卫",
  "sprite": {
    "namespace": "resource.Graphics",
    "key": "Characters/NPC 06"
  }
}
```

> 以上代码块中的文件路径注释仅作说明；写入 FSDB 时应移除注释，保持 JSON 有效。

| 字段 | v1 要求 | 语义 |
| --- | --- | --- |
| `name` | 必填、非空字符串 | NPC 定义的名称，可供业务方通过查询使用；不是唯一身份，不自动生成角色头顶名字标签或任何 UI。 |
| `sprite` | 必填、对象，包含 `namespace` 与 `key` 两个字符串 | 符合统一 4×4 约定的角色行走图逻辑 Content 引用；`namespace` 为 `resource.Graphics`，`key` 定位 `Characters/...` 角色资源。不是物理文件路径，不附带图集尺寸与逐帧设置。 |

**身份和字段所有权：**`npcId` 完全来自 FSDB 文件 Key（如 `guard`），不在 JSON 中重复写 `id` 或 `npcId`；不同定义的 `name` 允许重复，不能用名称作为身份。同一 `npcId` 可在同一地图放置多个实例，各有自己的 `instanceId`。`instanceId`、`x`、`y`、`direction` 属于业务方通过 `setNPC` 提供的实例数据，不写入可复用定义；对话、任务、AI、商店等不进入 Map 最小 NPC Schema。碰撞、移动速度或移动策略是否需要配置、配置归属何处，留待运动/碰撞设计，**不预先扩张 v1 定义**。

**元数据与实现边界：**`[struct]NPC` 依 FSDB 规范提供必需 `.info.meta`，实施时以 JSON Schema 严格约束上述两个必填字段、逻辑资源引用的形态与非空字符串；不要把本节示例注释当作合法 JSON 或把示例等同于已落盘的 `.info.meta`。Map 以后使用公开 Content 的 `record("struct.NPC", npcId)` 读取和校验定义，再解析 `sprite` 资源；定义/资源缺失、引用非法须明确失败，不默认为空 Sprite。具体错误码、缓存、取消和 Content 版本接线仍需实施设计。目前源码**尚未提供 NPC 定义加载、多实例渲染或 `setNPC` 接口**；本节完成的仅是 v1 最小字段与职责设计。

业务流程示意（不要求固定放置表）：

```text
请求进入目标地图 → Map 开启准备阶段
  → 业务方收到准备通知，读取自有 NPC Group/业务状态
  → 业务方按 npcId + 实例信息调用 Handler.setNPC(...)
  → Map 读取/校验 struct.NPC 及素材，准备/提交地图与角色投影
  → 发布地图进入完成事实事件
```

- 进入准备钩子（暂称 `mapEntering`）允许异步业务装配；`mapEntered` 仅表示已提交事实。决定回调返回角色输入还是经绑定进入上下文的 `setNPC` 提交仍待定；必须避免互相等待死锁，明确取消、错误、重入和过期结果屏障。
- `setNPC` 通过 `npcId` 解析 `struct.NPC/{npcId}`；`instanceId` 表示地图中的独立放置。同一 `npcId` 可复用，放置输入不重复传 `sprite`。`{instanceId,npcId,x,y,direction}` 是示意，字段类型/作用域和操作签名未冻结。
- 批量替换、空数组清空、整批失败原子性、进入后动态替换、重进复位/保留、碰撞/移动/地图行为参与仍待定，不能把讨论示例当作当前 API。
- [Content API v1](../../../doc/15-contracts/content-api-v1.md) 有 Group 路由，但公开 [`ContentClient`](../../../packages/subsystem/src/content.ts) 目前只有 `record()`/`resource()`；如业务选择 Group，应由 Content/Subsystem 边界补齐公开接口，而**不是 Map 直接读取游戏放置 Group 或物理路径**。

### 3.5 角色素材 v1：唯一 4×4 约定，不限定像素尺寸（已确认方向）

Player 与 NPC 共用唯一 4 列×4 行 PNG 图集：方向行依次下 2、左 4、右 6、上 8；列 `pattern 0..3`。宽高分别可被 4 整除、单帧为正整数，帧尺寸为解码宽高各除以 4；不规定总图必须 128×128/128×192，也不因图片比格大自动改变默认 1×1 逻辑占格。静止 `pattern=0`，行走保持当前 Player 的模式，不改为无依据的 0→1→2→3 循环。以当前 32px 格水平居中、底部对齐，偏移 `(32-frameWidth)/2` 和 `32-frameHeight`。128×128→32×32、128×192→32×48、192×192→48×48；可整除不等于语义合格。门、浆果、立绘、特殊缺帧图不进入此协议。

`[struct]NPC` 的 `sprite` 保存合规图集逻辑资源引用；`setNPC` 不重复传贴图或帧大小。详见[素材与运动调查](./PLAYER_NPC_SPRITE_AND_MOTION_INVESTIGATION.md)。当前产品仍主要只有单 Player Sprite，多 NPC 独立节点、位置、运动和遮挡尚未实现；Player 既有初始化入口继续兼容。

### 3.6 数据清理原则

- 保留现有被绘制、通行、传送、地形与事件消费的 Map/Tileset/Transfer 字段、必要引用及最小 `[struct]NPC` 定义；此轮不为通用化重做现有数据布局。
- 来源字段若仍影响安全/行为，须先审计迁移再决定是否移除；旧 `opaqueRelated` 不可丢弃。独立 `MapAction` 与 NPC 放置 Group 不列为新版 Map 必需内容。
- 以新版内容版本和严格 Schema 审查 Map 行为；旧 Tileset 五字段记录不可静默补为新版本；不得执行原始 Ruby/任意脚本。
- Essentials 原始素材及 FSDB 遵守许可边界，不因整理协议提交受限内容。

## 4. Builder / Handler 的设计方向（尚不冻结签名）

Builder 接收 Subsystem 环境、初始化条件、Map/NPC 定义内容定位配置，在同一 Subsystem 装配 Handler，不导入/安装数据，不接收固定 NPC 放置 Group 作为必填参数。Handler 提供按 `npcId` 设置 NPC 实例、玩家移动/切图、快照及准备钩子/完成事件；只服务本 Subsystem，不引入跨进程 RPC、全局 EventBus 或 Main 新公开接口。

进入准备阶段与已完成进入事实必须区分；普通事件仅报告已提交事实，失败不得先报切图成功。`setNPC` 的签名、批量/动态语义、资源失败、取消/过期屏障、异常及 RenderDomain 提交原子性仍需单独设计。`new RPGMapBuilder(...).build()` 仅作意图示例，不声称当前已有此 API。

## 5. 可行性与实施缺口

**Bridge/Ledge 目标行为与 NPC 最小定义 v1 均已收敛，代码迁移及验证尚未完成。** 当前地图四字段、Tileset 地形、MapTransfer、Bridge/Ledge 运动及 Browser 投影可沿用；新增行为的实现重点是 Map 校验/元数据、旧动作导入检查、Runtime 改读 Map.behaviors 及保留一致的行为/渲染更新。

其它独立缺口：`[struct]NPC` 的 `.info.meta` 落盘、定义读取/校验及资源解析与失败处理；业务地图进入准备钩子与 `setNPC` 语义；多 NPC Sprite、运动碰撞与生命周期；Handler 初始化、失败/取消与场景一致性。游戏如果使用 FSDB Group，须在 Content/Subsystem 补齐公开读取入口，但 Map 本身不读取放置表。本设计不实现全量 Essentials 事件、全部特殊素材或独立 Building；产品完成与 RGSS 逐帧保真资格分开记录。

## 6. TODO 与验证顺序

- [x] **事实调查**：Essentials 实体数据与 Player/NPC 素材/运动调查已完成；证据与局限见对应调查文档。
- [x] **Map 基线与内置行为 v1 目标设计**：现有四字段不变，仅加可选 `behaviors`；Bridge 三字段结构、Player 到达触发、去重、冲突与失败规则已在 §3.1–3.3 确定；Ledge 明确为隐式行为，不添加 `kind: "ledge"`。这是设计完成，**不是功能实现或迁移验收通过**。
- [x] **NPC 内容所有权及最小字段设计**：保留 Map 必需 `[struct]NPC`，必填 `name`/`sprite`、文件 Key 为定义 ID；业务方决定放置，不要求 `[group]MapNPC`。设计已确定，尚未实现。
- [ ] **Bridge 迁移证据及新 Map Schema/版本接线**：逐条验证旧 `overTrigger` 与 Map21 八动作、旧脚本/opaque 失败；生成新版 `[struct]Map/.info.meta`、明确版本来源，更新校验/导入；不得用旧四字段记录缺少 behaviors 推断无动作。
- [ ] **Runtime 迁移与测试**：新 Runtime 只读新版 Map.behaviors、不混读 MapAction；验证桥层/投影同次提交、到达/受阻分支、区域重入、Transfer 优先级、Map7→Map21、Map47 Ledge、resize/cancel/异常。保留正确的 fail-closed 行为。
- [ ] **NPC 定义 Schema 与读取实现**：按 §3.4 将 `[struct]NPC/.info.meta` 落盘；校验必填名称和素材逻辑引用，补齐 `npcId` 定义读取、素材解析以及缺失/非法数据与取消/版本的失败测试。不纳入对话/任务/AI/位置。
- [ ] **地图进入装配协议**：准备/完成钩子时序、业务异步读取、取消重入与过期结果，决定返回输入还是进入上下文 `setNPC`，避免死锁。
- [ ] **角色实例 / `setNPC`**：冻结实例 ID、坐标/方向、定义解析、批量/清空/动态策略及错误原子性；不传业务 Group 整行或重复 sprite。
- [ ] **运动、碰撞与生命周期**：Player/NPC 占格/重叠、移动、行为参与、跨图复位/保留、销毁与回调；不建完整 AI/存档框架。
- [ ] **素材及多实例验证**：唯一 4×4、帧尺寸、脚对齐/1×1 逻辑占格；验证多 Sprite 位置、运动与遮挡。
- [ ] **Group 读取（业务条件依赖，非 Map TODO）**：如游戏选 FSDB Group，在 Content/Subsystem 公开接口补齐 `group()`、JSONL、错误/取消，不在 Map 直接访问文件路径。
- [ ] **Builder/Handler 契约**：收敛装配、命令、快照、事件、生命周期与错误。
- [ ] **独立消费者与资格**：原创游戏沿用 Map/Tileset/Transfer 形态+Bridge 声明及仅含 `name`/`sprite` 的 NPC 定义，不提供 MapAction 或固定放置 Group；验收 Bridge/Ledge/多 NPC、Browser 与安全迁移。测试结果和 RGSS 资格按执行 SHA 单独记录，不以设计完成替代通过。

## 7. 统一验收问题

> 新游戏能否沿用当前四字段 Map/三层 Tile、Tileset、Transfer、含必填 `name`/`sprite` 的 NPC 定义与 Graphics，仅对需要桥梁的地图加可选 `behaviors`（只含 `kind:"bridge"` 的入口/出口），让 Ledge 完全由地形推导；不提供独立 MapAction 或固定 NPC 放置表；通过同一 Subsystem 的 Builder/Handler 装配并由业务方安排 NPC 放置，完成地图状态、运动/碰撞、渲染、切图和事件，且无需修改 `game-libs/map` 源码，并对不能等价迁移的旧动作明确失败？

**已完成的是 Map 的最小扩展、Bridge/Ledge v1 目标行为设计及 NPC v1 最小字段设计。** 旧四字段实现仍拒绝 `behaviors`，旧 Runtime 仍读 `MapAction`，迁移、元数据、版本接线、测试、NPC 定义读取与 Handler API 均未因设计文档更新而自动完成；不宣称原版 RGSS 动态保真资格。
