# RPGMap 通用化设计讨论与待办

> 状态：设计讨论记录 / TODO，**非冻结的完整协议、非已实现功能**  
> 记录日期：2026-09-21；角色素材、内置地图行为、NPC 定义／业务装配及 Map 最小扩展方向更新：2026-09-21  
> 初始基线：`main` @ `2d465b8c8501566b26375dae55e1a78007606c40`（创建原设计分支时）  
> 范围：`game-libs/map`；本文记录方向、现状、实现缺口和验证事项，不预先冻结 API 签名或未实现的行为 Schema。

## 1. 目标与核心思路

将目前与 Essentials v21.1 具体数据和行为耦合的 Map，逐步改造成可供不同游戏复用的 **RPG 地图业务模块**。业务方准备符合规范的地图与 NPC 定义 FSDB 内容，在自己的 Subsystem 内通过 `RPGMapBuilder` 提供 Subsystem 环境、初始化条件及内容定位配置，构建 `RPGMapHandler`；之后通过 Handler 控制角色、切图、查询状态与监听地图事件，不触碰内部地图加载、运动或渲染实现。

三个概念分工：

| 组成 | 职责 |
| --- | --- |
| `RPGMapBuilder` | 在同一 Subsystem 内创建/装配地图业务实例，连接地图和 NPC 定义内容与初始化配置。 |
| `RPGMapHandler` | 对业务方提供地图控制、按 NPC 定义 ID 设置/操作实例、只读查询和事件/准备钩子。 |
| RPGMap Runtime | 地图与角色位置/运动的唯一权威，负责合法性、通行/传送、NPC 定义/素材解析、角色实例与 RenderDomain 更新。 |
| RPGMap FSDB 规范 | 规定 Map 模块实际消费的 Map、Tileset、Transfer、NPC 定义和资源；**不规定 NPC 按地图的放置表或游戏玩法数据**。 |

期望使用体验：调用方通过地图 ID 定位地图，通过 NPC 定义 ID 复用角色外观；进入地图时由业务方决定当次放置哪些 NPC，再经 Handler 传入 NPC 定义 ID 与各实例的初始信息。Map 不要求游戏采用固定的 `MapNPC` 表。Builder/Handler 不另造 Subsystem 生命周期管理器。

## 2. 已确认的责任边界

1. **Handler 位于 Map Subsystem 内部**，服务该 Subsystem 的业务方。Handler 与其他 Subsystem/主进程的编排和通信不属于本次重构。
2. **Map 不负责 FSDB 安装、数据生产或准备**。调用方提供符合 Map 内容规范的地图、NPC 定义和资源，以及可访问的来源；Runtime 按 ID 查找、校验并消费。
3. 保留 LoomRealm 权威边界：Subsystem 使用公开 `scope.content`、Input、RenderDomain；Renderer/Browser 消费投影，不反向决定通行、事件或世界状态；业务数据不得暴露 Content 凭据。
4. **物理目录与逻辑 Content 身份不是同一件事**。Map 按 `namespace + key` 访问自身需要的内容，不将其解释为任意文件系统路径；映射与安装属调用环境/现有 Content 机制。不得绕过 Content 边界。
5. Map 规定 NPC 定义中自己需要的最小地图表现字段，**但不理解 NPC 的对话、任务、AI、商店、游戏方的放置数据 Schema 或 Group Key**；不创建地图/菜单/战斗共用的万能 Entity 框架。

相关当前契约：[`SubsystemDefinitionFactory`](../../../packages/subsystem/src/model.ts)、[`ContentClient`](../../../packages/subsystem/src/content.ts)、[`Content API v1`](../../../doc/15-contracts/content-api-v1.md)、[Map 模块现况](../../../doc/20-modules/loom-map/README.md)。

## 3. FSDB 策略：保留已实现的 Map，只补内置行为；NPC 定义由 Map 规定、放置归业务方

**不重新设计整套地图格式。** `[struct]Map` 以现有可用的四字段实现为基线；Tileset、MapTransfer 沿用既有消费模型，保持实际使用的图块、通行、传送及地形语义。通用化的 Map 内容改动只聚焦在新增必需的内置行为声明及旧 `MapAction` 的显式迁移，而不是重做 Tile、坐标、索引或全量 RGSS 类型。其他字段清理须有独立证据，不是此轮设计的前置工作。

**地图行为已确认方向：** 新版 RPGMap 正式内容协议**不要求也不设独立 `[struct]MapAction` 表**。桥梁、悬崖等由 Map 模块内置；业务方只声明受支持的 `kind` 及位置、触发条件等必要参数，不向 Runtime 注入 Ruby、脚本或执行代码。能从 Tile 与 Tileset 地形标签推导的行为不重复声明；需要入口/出口等局部信息的声明放在对应 Map 记录。旧实现仍依赖 MapAction，须安全迁移。

**NPC 边界（修正前次误删）：** `[struct]NPC` **保留为 RPGMap 需要的可复用角色定义表**：业务方按 Map 规定的最小定义 Schema 准备 NPC，`setNPC` 通过 `npcId` 引用定义；Map 使用公开 Content 读取 `struct.NPC/{npcId}` 并解析素材。**不要求、不读取 `[group]MapNPC`**：当前地图要放置哪些 NPC、放在哪里，由游戏业务决定；它可自行读取 FSDB Group，也可从其他状态计算，再将 `{npcId, instanceId, x, y, direction, ...}` 等 Map 需要的放置信息交给 Handler。`[struct]NPC` 定义不等于地图 NPC 实例；Essentials Event/Page 不成为 NPC Schema，业务玩法信息不塞进最小定义。

当前实现与旧投影关系（**现状，不是新协议目标**）：

```text
Map ID → struct.Map/{id} → tileset_id → struct.Tileset/{id}
                               └→ 图块、自动图块的逻辑资源引用
Map ID → struct.MapTransfer/{id} → 目标 Map ID / 目标坐标
Map ID → struct.MapAction/{id}   → 旧实现的桥梁动作及 opaque 防护
图像资源 → resource.Graphics/...（Characters、Tilesets 等）
```

目标中 **Map 自己需要的 FSDB 组织**（尚未实现）：

```text
Map ID → struct.Map/{id} → tileset_id → struct.Tileset/{id}
                            └→ 可选 behaviors：内置地图行为声明
Map ID → struct.MapTransfer/{id} → 目标 Map ID / 目标坐标
NPC 定义 ID → struct.NPC/{npcId} → resource.Graphics/Characters/...
图像资源 → resource.Graphics/...（Tilesets、Autotiles、Characters 等）
业务方自行读取/决定地图 NPC 放置 → Handler.setNPC(npcId + 实例信息)
```

Map 内容目录示意：

```text
[FSDB]游戏数据/
├── [struct]Map/
├── [struct]Tileset/
├── [struct]MapTransfer/
├── [struct]NPC/
└── [resource]Graphics/
```

`[struct]NPC` 采用 FSDB 的基础实体记录规则，须有 `.info.meta`；每个定义以文件 Key 作为 NPC 定义 ID，例如 `NPC/guard.json`。定义至少需要符合唯一 4×4 图集约定的角色素材**逻辑资源引用**；`sprite: { namespace: "resource.Graphics", key: "Characters/NPC 06" }` 仅是字段示例，最终 Schema、ID 类型、版本和资源错误语义待冻结。不必在记录里重复文件 Key，也不保存图片宽高、帧尺寸或业务放置坐标。业务方可自建 `[group]MapNPC`：如使用 FSDB Group，按其规范采用 JSONL 和必需 `.info.meta`、`.desc.meta`；该表的名称、字段、Key、分组语义完全由业务决定，**不能成为 Map 加载或 setNPC 的隐含依赖**。

当前 Map 保留三层 Tile Table；Tileset 包括贴图名、autotile、passages、priorities、terrain_tags。`terrain_tags` 与 Bridge/Ledge 相关，不可仅以“原引擎字段”理由删除。现有 `MapAction.opaqueRelated` 是无法识别脚本的失败保护；取消表不等于取消这一安全约束。

证据入口：[`semantics.ts`](../src/semantics.ts)、[`runtime.ts`](../src/runtime.ts)、[Essentials 实体数据调查](./ESSENTIALS_V21_1_ENTITY_DATA_INVESTIGATION.md)、[Player/NPC 素材与运动调查](./PLAYER_NPC_SPRITE_AND_MOTION_INVESTIGATION.md)。合成示例见 [`generate-fixtures.mjs`](../../../examples/essentials-v21.1/scripts/generate-fixtures.mjs)，不能将其当作原版素材证据。

### `[struct]Map`：以现有四字段为基线，仅新增可选行为（已确认设计范围）

现有 [`semantics.ts`](../src/semantics.ts) 的 `MapRecord` 与 `validateMapRecord` 已明确下列四个顶层字段，且校验器目前**不接受第五个字段**。本轮保留字段名、类型及含义，不另建 Map 模型：

```ts
interface MapRecord {
  readonly tileset_id: number;
  readonly width: number;
  readonly height: number;
  readonly data: ProjectedTable;
}
```

`tileset_id` 沿用既有 Tileset 引用；`width`、`height` 为正整数；`data` 继续是 `ProjectedTable`：`dimensions=3`、`xSize=width`、`ySize=height`、`zSize=3`，`values` 长度与尺寸乘积一致，沿用 `x + y*xSize + z*xSize*ySize` 索引。现有 Tileset 通行/priority/terrain tags、MapTransfer、相机和渲染投影行为都不是此次重新设计对象。

目标是仅在原结构上增加可选的 `behaviors` 字段，承载无法仅从图块推导的**已实现内置行为**所需声明：

```ts
// 目标形态示意，非当前源码、非已冻结行为 Schema
interface MapRecord {
  readonly tileset_id: number;
  readonly width: number;
  readonly height: number;
  readonly data: ProjectedTable;
  readonly behaviors?: readonly MapBehavior[];
}

type MapBehavior = BridgeBehavior; // 第一版仅列已确认有显式声明需要的 Bridge
type BridgeBehavior = Readonly<{
  kind: "bridge";
  operation: "on" | "off";
  occupied: readonly Readonly<{ x: number; y: number }>[];
  // 必需的触发条件等参数须对照当前 Bridge 行为后确定
}>;
```

- **最小改动**：原四字段不变，不改 Tile Table 的布局/索引、现有 Map/Tileset 引用与已实现的通行/渲染语义。`behaviors` 可选；无显式行为需求的地图不必配置 Bridge 等记录。
- **`kind` 只描述显式内置行为**：Ledge 继续依据 `Map.data` + `Tileset.terrain_tags` 运行，不在 `behaviors` 中复制 Ledge 条目；Bridge 继续使用现有地形标签判别桥面，仅在 `behaviors` 中声明入口/出口的必要位置和触发信息。后续 `kind` 必须先有模块真实实现和测试，不支持任意脚本。
- **字段尚未冻结**：上面的 `operation`/`occupied` 只是讨论中的写法，不是可直接导入的 FSDB Schema；触发模式、方向/碰撞语义、重复触发、重叠冲突、非法位置与错误诊断须以现有 MapAction/Runtime 和真实 Map21 场景复核后定稿，不为了对称性新增各种地形行为。
- **新旧协议显式隔离**：本次不声称旧四字段 Map 在当前 Runtime 上已支持 `behaviors`。新增字段涉及 Map `.info.meta`/schemaVersion（具体版本标识待定）、`validateMapRecord`、导入/迁移与 Runtime 加载切换；旧 `MapAction` 及 `opaqueRelated` 安全失败路径不能静默丢弃。可选字段的默认/缺失语义须跟版本一起定义，避免把旧协议无声视为新协议。

### 地图内置行为：声明与执行分离（已确认方向）

- **内置行为集合**：由 `game-libs/map` 实现、测试和版本化；业务方只能选支持的 `kind` 并提供相关必要参数。未知 `kind`、缺失参数、非法位置或不支持的触发语义必须报错，不能忽略或执行脚本。
- **Ledge／悬崖**：通行、跳跃与视觉规则可由 `Map.data` 和 `Tileset.terrain_tags` 推导；第一版不为同一地形重复配置悬崖动作，Map 负责方向检查、落点、跳跃状态与动画。
- **Bridge／桥梁**：桥梁图块仍依赖 `terrain_tags`；但入口 `bridge-on`、出口 `bridge-off` 的位置和触发条件无法仅由图块还原。新版在 Map 内声明桥梁 `kind`、位置/占格与必要触发参数；Runtime 内部维护 `bridgeLevel`、通行与层级投影。业务数据不必写内部状态数值或 Ruby 调用。
- **示意而非 Schema**：`Map.behaviors: [{ kind: "bridge", operation: "on", occupied: [{ x: 10, y: 5 }] }, ...]` 只说明声明位于 Map；字段名、触发时机、重复触发、位置和版本仍待冻结。不能假定所有桥梁只靠踩格触发：当前还区分脚下触发、向前碰撞、`through`、`emptyGraphic` 和通行状态，须审计后以明确的内置规则替代原版事件字段。
- **职责边界**：传送仍由 MapTransfer 负责；NPC、对话、物品、建筑不因此变为内置地形行为。只为实际需要且模块确实实现的行为扩展 `kind`，不建立通用脚本引擎。

**现有实现与迁移：** `runtime.ts#loadMap` 仍读取 `struct.MapAction/{mapId}`，缺失时才用空记录；`validateMapRecord` 仍严格要求 `tileset_id,width,height,data` 四个顶层字段。因此目前不能直接在 FSDB 写入 `Map.behaviors` 并期望运行。实施须同步修改 Map schema/version、校验、导入/迁移、Runtime 和测试，明确新旧读取边界，不静默混用。

- 仅将旧 `MapAction.actions` 中**确认语义**的桥梁入口/出口转换为 Map 内置声明，按真实 Map21 样本复核数量、位置、操作和运行结果；不预设无损转换。
- 旧 `opaqueRelated`、无法确认的脚本或缺失映射的动作必须在导入/迁移时失败并给出可定位诊断；不得默认空行为或执行 Ruby。
- 回归 Bridge/Ledge 通行、状态恢复、图层遮挡、跨图重置、触发时机和失败路径。验证完成前不得宣称旧实现已被移除或 Essentials 行为已完全保留。

### NPC：模块管理定义，业务方装配实例（修正确认方向；API 待细化）

**两种所有权不可混淆：** Map 规定并读取 `[struct]NPC` 的最小地图角色定义（以 `npcId` 定位其图集等必要表现信息）；游戏业务决定当前地图应出现哪些 NPC、各自的初始位置和用途，及对话/任务/AI 等额外业务数据。Map 不读取游戏方自定义的放置 Group 或依赖其字段。Runtime 独占实例进入地图后的坐标、朝向、运动/碰撞状态，不反向修改 FSDB。建筑若只是背景仍用 Tile，不为它强制建立角色实体。

业务流程（**示意；不要求固定的放置表**）：

```text
角色请求进入目标地图
  → Map 确认目标并开启进入准备阶段（尚未发出已进入事件）
  → 业务方收到地图进入准备通知，自行读取 NPC 放置 Group/其他数据
  → 业务方转换为 npcId + 实例信息，通过 Handler.setNPC(...) 提供
  → Map 根据 npcId 读取/校验 struct.NPC 定义及角色素材，准备/提交地图与角色投影
  → 地图进入成功后发布完成事实事件
```

- **准备通知与完成事件不同**：进入准备钩子（暂称 `mapEntering`）允许业务方异步装配；进入完成事件（暂称 `mapEntered`）只能表示地图、角色与投影已提交的事实。此前文档“事件表达完成事实”继续适用于普通完成事件；准备钩子须另行定义为可参与装配的生命周期入口，不能把普通完成事件当作初始化屏障。
- **待解决的时序选择**：准备钩子返回角色放置输入，或通过绑定进入上下文的 `setNPC` 提交输入，二者何者为正式 API 尚未决定。必须避免准备钩子 `await setNPC` 时 `setNPC` 又等待地图已进入而死锁；明确准备完成条件、超时/取消、错误传播和切图重入，旧准备结果不得污染新场景。
- **`setNPC` 按定义 ID 引用，不重复传贴图**：示意输入是 `{ instanceId, npcId, x, y, direction }`。`npcId` 解析 `struct.NPC/{npcId}`；`instanceId` 区分同一 NPC 定义在同一地图上的多次放置。业务方的 Group 行、对话、任务等额外字段不直接作为 Map 输入；素材引用在 NPC 定义内，业务放置时不重复提供 `sprite`。字段类型、身份作用域、批量模式、校验和失败语义尚未冻结。
- **批量语义候选**：可考虑 `setNPC([...])` 整批替换某地图的 NPC 集合、`setNPC([])` 清空，任一实例或 NPC 定义/资源无效则整批拒绝；尚须决定准备阶段初始集合与已进入后的动态替换如何区分，以及旧实例运动和订阅如何处置。不要把候选写成已实现签名。
- **实例身份与生命周期**：`npcId` 是可复用定义 ID，`instanceId` 是放置实例身份；后者至少在当前地图内唯一。占格、重进复位/保留、玩家与 NPC 碰撞、自主移动和是否触发 Transfer/Bridge/Ledge 均待进一步决定。
- **Group 读取能力归属**：[Content API v1](../../../doc/15-contracts/content-api-v1.md) 已定义 Group 路由，公开 [`ContentClient`](../../../packages/subsystem/src/content.ts) 目前只有 `record()` / `resource()`。如果游戏业务在准备钩子中读取 FSDB Group，需要通过公开 API 补齐/核实 Group 能力及 JSONL、错误和取消语义；这是**业务放置数据读取**依赖，不是 Map 读取 `struct.NPC` 的前置条件。Map 不绕过 Content 访问物理目录。

### 尚未形成完整契约的部分

当前 Runtime/Browser 主要面向单 Player Sprite；虽然 Map 本身有地图、Tileset、传送与桥/崖能力，尚未实现通过 `npcId` 装配多个 NPC 的定义读取、独立定位、绘制、运动和碰撞。地图进入准备、场景提交、完成通知与重复切图的时序也未冻结。

一个 NPC 定义可被同一地图/不同地图复用；业务方提供每个实例的独立身份及放置，Map 将实例绑定到对应 NPC 定义并管理当前状态。业务表/游戏逻辑不受 Essentials Event/Page 约束；`struct.NPC` 最小定义 Schema 属于 Map，其他玩法数据及地图放置数据属于业务。

### 角色素材 v1：唯一 4×4 约定，不限定图片像素尺寸（已确认方向）

Player 和业务设置的 NPC **只支持同一种角色行走图集格式**。不为了兼容 Essentials 所有资源引入多套布局、泛用切帧器或逐素材配置；门、浆果、战斗立绘、特殊缺帧宝可梦图不属于本次角色图集范围。

- 角色 PNG 按 **4 列 × 4 行**排列：行方向为下（2）、左（4）、右（6）、上（8）；列为 `pattern 0..3`，必须真实符合四向四帧语义，不能仅因尺寸可整除就当作角色图。
- 解码后计算 `frameWidth = image.width / 4`、`frameHeight = image.height / 4`；图片宽高都须能被 4 整除，结果为正整数。**不规定**总图片尺寸必须是 128×128、128×192 等，也不要求单帧与地图格同尺寸。
- 静止 `pattern = 0`；行走沿用当前 Player 运动状态与 pattern 轮替规则，不能无依据改成简单 0、1、2、3 循环。
- 单帧相对逻辑地图格**水平居中、底部对齐格底**。当前 32px 格：水平偏移 `(32 - frameWidth) / 2`，纵向偏移 `32 - frameHeight`；宽/高超出格子不自动扩大逻辑占格，v1 默认 1×1。
- 128×128 → 32×32；128×192 → 32×48；192×192 → 48×48。几何满足不保证实际图像是有效行走图。
- `[struct]NPC` 定义保存角色素材的逻辑引用；`setNPC` 的实例输入只引用 `npcId`，**不重复记录图片总尺寸、帧尺寸、布局行列数、方向映射或素材路径**；由统一约定、定义和解码结果确定。

[素材与运动调查](./PLAYER_NPC_SPRITE_AND_MOTION_INVESTIGATION.md)说明当前 Browser 的 4×4 切帧与尺寸计算，并证明真实 Characters 文件混有非角色图片。目前产品仍主要是单 Player Sprite，采用同一素材计算规则不代表已支持多 NPC；还要实现多实例位置、绘制、运动和必要碰撞。Player 现有初始化入口继续兼容，不强制新增 Player Record。

### 数据清理原则

- **保留**：当前被绘制、通行、传送、地形或事件消费的地图字段与必要引用，以及新协议中的最小 `struct.NPC` 定义。
- **待确认**：未消费但实现既定目标/兼容性所需的字段，先审计原始来源与语义，不提前删减；NPC 最小定义自主设计，不继承 Essentials Event/Page。
- **移除出正式 Map 协议**：目标能力不消费且不影响安全/引用校验的来源内部信息，必要时留在导入工具或诊断资料中；**NPC 放置 Group 不列为 Map 必需内容**，NPC 定义表仍保留。
- 明确 schemaVersion、合法字段、引用与失败语义；不静默将旧五字段 Tileset 补成新版本。不执行原始 Ruby/任意脚本。
- 原版素材遵守许可边界，不因协议整理将受限原始 FSDB/图像直接提交仓库。

## 4. Builder / Handler 的设计方向（尚不冻结签名）

- Builder 接收 Subsystem 环境、地图初始化条件与 Map/NPC 定义可访问内容定位配置，在同一 Subsystem 内装配 Handler；不导入/安装内容，不决定其他 Subsystem topology，也不接收固定 NPC **放置 Group** 定位作为必填参数。
- Handler 提供按 `npcId` 进行角色实例批量设置（暂称 `setNPC`）、玩家跳转/切图、必要的 NPC 地图操作、只读快照与事件/准备钩子。调用方不直接修改 Runtime 内部状态或触发渲染。
- Map 为进入地图提供业务装配时机：准备阶段与已完成进入事实必须区分。普通事件只报告**完成提交的业务事实**，准备钩子另定参与和失败语义；不能先报告切图成功，再因必需的 NPC 定义/装配失败而将其视为失败。
- `setNPC` 的实际输入、是批量替换还是其他语义、准备阶段如何安全调用、动态设置是否允许、回调顺序、取消/失效与定义/资源错误处理需独立收敛。不得让旧地图的异步业务结果更新新地图。
- Handler 只在当前 Subsystem 内被业务调用；不引入跨 Runtime 对象引用、通用 RPC、全局 EventBus 或 Main 新公开接口。
- 初始化、命令、状态和渲染的原子性及异常安全须审计；`new RPGMapBuilder(...).build()` 等仅为思路，不冻结 API 签名，也不宣称已实现。

## 5. 可行性与缺口

**方向可行，尚未完成实现/产品验证。** 现有 `game-libs/map`、Subsystem factory、ContentClient、地图/图块解析、移动、传送、Bridge/Ledge 和 Browser 投影可作为基础。主要实现仍可放在 Map 库自身，不必预设 Main/Renderer 新公开契约。

实际缺口：**Map 四字段已可直接作为基线，不重新设计；新增的只是可选 `behaviors` 的真实 Bridge 参数/触发语义、schema/version 和旧 MapAction 安全迁移。** 其余缺口为 `struct.NPC` 定义最小 Schema、按 ID 读取/校验及资源解析；进入准备钩子、业务异步放置、`setNPC` 的提交/替换/取消语义；多 Sprite 独立定位与渲染、NPC 运动碰撞；资源定位和 ID 规则；Handler 失败、切图与异常的状态一致性。如果业务选择 FSDB Group，则公开 Content Group 读取能力还需在所属 Content/Subsystem 边界补齐，**但不是 Map 的放置数据读取职责**。不把全量 Essentials NPC 事件、所有特殊素材或独立 Building 作为首版前置条件；已实现能力不等于 RGSS 逐帧保真资格。

## 6. TODO 与验证顺序

- [x] **事实调查（设计输入，不代表实现完成）**：已完成 Essentials 实体数据与 Player/NPC 素材及运动调查，见 [`ESSENTIALS_V21_1_ENTITY_DATA_INVESTIGATION.md`](./ESSENTIALS_V21_1_ENTITY_DATA_INVESTIGATION.md)、[`PLAYER_NPC_SPRITE_AND_MOTION_INVESTIGATION.md`](./PLAYER_NPC_SPRITE_AND_MOTION_INVESTIGATION.md)。
- [x] **Map 基线设计方向**：现有 `MapRecord` 的 `tileset_id,width,height,data` 与三层 `ProjectedTable` 原样保留；目标只扩展可选 `behaviors`，不重做地图格式。此项是设计决定，不是新字段已实现。
- [x] **NPC 内容所有权方向**：保留 RPGMap 的 `[struct]NPC` 定义协议；取消 RPGMap 必需的 `group.MapNPC` 或任何固定放置 Schema。业务监听进入准备、自主读取/决定放置，通过 `npcId` 和独立实例信息调用 Handler；责任边界已确定，非实现。
- [ ] **现有内容审计（仅针对迁移）**：聚焦旧 `MapAction` 桥梁动作、触发和 opaque 输入，明确其如何映射到 Map 的可选行为；保留现有 Map/Tileset/Transfer 和 Bridge/Ledge/渲染结果，不因通用化启动无关字段清理。
- [ ] **NPC 定义最小协议**：冻结 `[struct]NPC` 的文件 Key/ID、`.info.meta`、唯一 4×4 素材逻辑引用、非法/缺失定义和资源失败语义；不纳入对话/任务/AI 或放置坐标。
- [ ] **Map 内置行为最小扩展**：只为无法从 Tile/terrain tags 推导的已实现行为定义 `behaviors` 的 `kind`、必要参数与触发规则；第一版聚焦 Bridge，Ledge 保持隐式。更新 Map schema/version、严格校验和旧 MapAction 迁移，覆盖未知 kind、非法位置、重复/冲突及参数失败。
- [ ] **地图进入装配协议**：定义进入准备钩子与进入完成事件的作用域/顺序、业务异步读取、取消与重入；决定准备回调返回 NPC 集合还是经进入上下文调用 `setNPC`，避免死锁和过期结果污染；明确空集合及准备失败行为。
- [ ] **角色实例输入及 `setNPC` 语义**：冻结 `npcId`、实例身份、坐标/方向、批量替换或增量策略、定义/素材的整批校验、加载中与已进入后调用、清空/删除及失败原子性；不把业务 Group 行直接作为 Map 输入，不重复传 `sprite`。
- [ ] **运动、碰撞与生命周期**：Player/NPC 占格与重叠、移动指令、地图行为参与、切图重进时实例状态复位/保留、销毁与过期运动回调；不预先建立完整 AI/存档框架。
- [ ] **角色素材及多实例验证**：唯一 4×4、解码尺寸 /4、脚对齐和默认 1×1 占格；覆盖 128×128 合成 Demo、128×192 真实 Player 及标准 NPC 多节点运动/遮挡。
- [ ] **FSDB 地图最小协议**：在既有 Map 四字段上加可选行为并确定版本/错误语义，沿用 Tileset、Transfer、NPC 定义和 Graphics 的实际引用；独立 MapAction、地图 NPC 放置 Group 非必需，不重建地图格式。
- [ ] **业务 Group 读取（条件依赖，非 Map TODO）**：若示例游戏用 FSDB Group，自 Content/Subsystem 公开入口补齐/核实 `group()`、JSONL、错误/取消语义；Map 不消费 Group、不直接读文件路径。
- [ ] **Builder/Handler 契约**：在上述语义明确后冻结 Subsystem 内装配、命令、快照、完成事件、准备钩子、生命周期与失败处理。
- [ ] **实现与兼容迁移**：安全转换已确认旧桥梁动作；无法确认的脚本/opaque 必须可诊断失败；更新 importer、Runtime、测试，保证 Bridge/Ledge 回归。
- [ ] **独立消费者验证**：原创游戏使用既有 Map/Tileset/Transfer 的数据形态加必要内置 kind、NPC 定义和 Graphics；业务从自选来源决定 NPC 放置并按 `npcId` 设置多个实例，无须重写地图格式或 Map 源码，也不强制 `[group]MapNPC` 或 Building Record。
- [ ] **回归及资格**：覆盖 walk、transfer、Bridge、Ledge、动态 viewport、浏览器投影、过期异步装配、NPC 定义/实例错误和失败原子性；记录实际测试，不把设计讨论当验收通过。

## 7. 统一验收问题

> 一个新游戏是否能沿用现有四字段 Map/三层 Tile 格式、Tileset、Transfer、NPC 定义与 Graphics，只对确有需要的地图添加受支持的内置 `kind` 声明（无需独立 MapAction 或指定 NPC **放置表**），在同一 Subsystem 内通过 Builder 装配、业务在进入准备阶段自行决定 NPC 放置并通过 `npcId` 与实例信息调用 Handler，完成定义读取、移动/碰撞、绘制、切图及完成事件，而无需修改 `game-libs/map` 源码，同时安全保留迁移后已确认的 Essentials 地图行为？

**Map 的设计范围已收敛为「现有四字段不变 + 可选 `behaviors`」；不重构 Tile Table 或另造 Map Schema。** 角色图集唯一 4×4 约定、取消新协议独立 MapAction、保留 `struct.NPC` 定义而将 NPC 放置/业务 Group 交给调用方，也已确定为设计方向。`behaviors` 的精确 Bridge 字段、触发/冲突语义和版本、NPC 定义 Schema、准备/完成时序、`setNPC` API、角色碰撞/生命周期仍需收敛。文档更新不等于代码实现、迁移或资格通过。