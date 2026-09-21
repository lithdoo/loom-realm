# RPGMap 通用化设计讨论与待办

> 状态：设计讨论记录 / TODO，**非冻结的完整协议、非已实现功能**  
> 记录日期：2026-09-21；角色素材、内置地图行为及 NPC 表类型方向更新：2026-09-21  
> 基线：`main` @ `2d465b8c8501566b26375dae55e1a78007606c40`（创建本分支时）  
> 范围：`game-libs/map`；本文记录方向、已确认边界、可行性依据及后续验证事项，不预先冻结 API 签名和完整 FSDB Schema。

## 1. 目标与核心思路

将目前与 Essentials v21.1 具体数据和行为耦合的 Map，逐步改造成可供不同游戏复用的 **RPG 地图业务模块**。业务方按约定准备 FSDB 内容，在自己的 Subsystem 内通过 `RPGMapBuilder` 提供 Subsystem 环境、初始化数据及内容定位配置，构建 `RPGMapHandler`；随后只通过 Handler 进行角色跳转、地图切换、NPC 操作、状态查询及地图事件监听，不必触碰内部加载、运动和渲染实现。

三个概念分工：

| 组成 | 职责 |
| --- | --- |
| `RPGMapBuilder` | 创建/装配本 Subsystem 内的地图业务实例，连接初始化配置和内容来源。 |
| `RPGMapHandler` | 同一 Subsystem 内供业务代码调用的控制、查询及事件订阅接口。 |
| RPGMap Runtime | 地图与角色状态唯一权威，负责合法性检查、移动/传送、资源解析及 RenderDomain 更新。 |
| RPGMap FSDB 规范 | 规定内容组织、实体身份、引用和素材关系；使用方依据规范自行准备数据。 |

期望的使用体验是：配置一次内容来源，之后凭地图/NPC 等 ID 即可定位并使用内容。Builder/Handler 作为作者接口，不另造一套 Subsystem 生命周期管理器。

## 2. 已确认的责任边界

1. **Handler 位于 Map Subsystem 内部**，服务该 Subsystem 的业务方。Map 模块不负责 Handler 与其他 Subsystem 或主进程之间的交互；相应编排和通信不纳入本次重构。
2. **模块不负责安装、数据生产或准备**。游戏使用方遵照 FSDB 规范提供目录/数据；运行时由 Builder 指定可访问的数据来源，Map 按 ID 查找、校验并使用。
3. 保留 LoomRealm 现有能力与权威边界：Subsystem 使用公开 `scope.content`、Input、RenderDomain；Renderer/Browser 消费投影，不反向决定通行、事件或世界状态；不得在业务数据中暴露 Content 凭据。
4. **物理目录与逻辑 Content 身份不是同一件事**。现有 `ContentClient` 按 `namespace + key` 读取，不能直接假设 Runtime 能读任意磁盘路径。目录如何被映射为可访问 Content 属于调用环境/现有 Content 机制；本模块只定义运行时需要的内容定位输入，不承担安装流程。若未来确需直接目录访问，须先核实公开 author API 是否支持，而不能越过 Content 边界。
5. 地图、菜单、战斗不需要因为此次工作被统一进一个万能业务实体框架；先在 `game-libs/map` 内实现实际需求。

相关当前契约：[`SubsystemDefinitionFactory`](../../../packages/subsystem/src/model.ts)、[`ContentClient`](../../../packages/subsystem/src/content.ts)、[`Content API v1`](../../../doc/15-contracts/content-api-v1.md)、[Map 模块现况](../../../doc/20-modules/loom-map/README.md)。

## 3. FSDB 策略：地图沿用现有投影，NPC 数据自主定义

**不从零设计整套地图格式。** 地图、Tileset、Transfer 优先沿用并整理现有 Essentials v21.1 解析产物；先审计已被 Map 消费的字段，精简和补齐后形成版本化的 RPGMap 内容协议。不要把 RGSS 原始对象结构原封不动地变成通用协议，也不要为了抽象而强制重写所有数字 ID。

**地图行为是单独的设计决定：** 新版 RPGMap 正式内容协议**不要求也不设独立 `[struct]MapAction` 表**。桥梁、悬崖等属于 Map 模块内置行为；业务侧仅提供受支持的 `kind` 声明以及位置、触发条件等必需参数，不能向 Runtime 注入 Ruby、脚本或自定义执行代码。能从地图图块与 Tileset 地形标签推导的行为不必重复声明；不能仅靠地形推导的局部行为声明放在对应 `Map` 记录中。当前 `MapAction` 仍是旧实现和旧 FSDB 的事实，移除它需要显式迁移，见下文。

**NPC 是另一项独立设计决定：** NPC 的 FSDB 身份、定义与实例结构由本项目按业务需求自主设计，**不以 Essentials 的 Event/Page 结构为 NPC Schema**。Essentials 在 NPC 方向仅作为可合法使用的素材来源和格式验证样本；不要求兼容它的全部素材或事件行为。地图物品和建筑也不因原版事件结构而被强制纳入 NPC 定义。NPC 定义使用 `[struct]NPC`，按地图归组的 NPC 放置使用 `[group]MapNPC`；这是 FSDB 表类型与组织方向，不代表行数据 Schema 已冻结或 Runtime 已实现。

当前实现与旧投影的关系（**现状，不是新协议目标**）：

```text
Map ID → struct.Map/{id} → tileset_id → struct.Tileset/{id}
                               └→ 图块、自动图块的逻辑资源引用
Map ID → struct.MapTransfer/{id} → 目标 Map ID / 目标坐标
Map ID → struct.MapAction/{id}   → 旧实现的桥梁动作及 opaque 防护
图像资源 → resource.Graphics/...（Characters、Tilesets 等）
```

目标内容组织（**尚未实现；NPC 字段待讨论**）：

```text
Map ID → struct.Map/{id} → tileset_id → struct.Tileset/{id}
                            └→ 可选的内置行为声明（例如桥梁入口／出口）
Map ID → struct.MapTransfer/{id} → 目标 Map ID / 目标坐标
NPC 定义 ID → struct.NPC/{npcId} → resource.Graphics/Characters/...
Map ID → group.MapNPC/{mapId}（JSONL）→ 多个实例各自引用 NPC 定义 ID
图像资源 → resource.Graphics/...（Characters、Tilesets 等）
```

当前 `Map` 保留三层 Tile Table；`Tileset` 包括贴图名、autotile、passages、priorities、terrain_tags。`terrain_tags` 与 Bridge/Ledge 等能力相关，不可仅以“原引擎字段”理由删除。现有 `MapAction.opaqueRelated` 是防止误执行无法识别脚本的失败保护；**取消表不意味着可以取消这项安全约束**，新数据及迁移过程都必须有相应的拒绝策略。

证据入口：[`semantics.ts`](../src/semantics.ts)、[`runtime.ts`](../src/runtime.ts)、[Essentials 实体数据调查](./ESSENTIALS_V21_1_ENTITY_DATA_INVESTIGATION.md)、[Player/NPC 素材与运动调查](./PLAYER_NPC_SPRITE_AND_MOTION_INVESTIGATION.md)。合成示例见 [`generate-fixtures.mjs`](../../../examples/essentials-v21.1/scripts/generate-fixtures.mjs)，不能将其当成原版素材证据。

### 地图内置行为：声明与执行分离（已确认方向）

- **内置行为集合**：由 `game-libs/map` 实现、测试并版本化；业务方只能选择支持的 `kind` 并填写与该行为相关的必要参数。未知 `kind`、缺失参数、非法位置或不支持的触发语义必须报错，不得忽略或执行脚本。
- **Ledge／悬崖**：当前通行、跳跃与视觉规则可由 `Map.data` 中图块和 `Tileset.terrain_tags` 推导。第一版不为同一地形额外复制一组悬崖动作记录；Map 模块负责方向检查、落点、跳跃状态与动画。
- **Bridge／桥梁**：桥梁图块仍依赖 `terrain_tags`，但仅凭图块标签不能还原当前入口 `bridge-on`、出口 `bridge-off` 的位置与触发条件。新版在对应 `Map` 内声明桥梁入口／出口的 `kind`、位置／占格及必要触发参数；Runtime 内部维护 `bridgeLevel` 等状态，执行业务逻辑、通行和层级投影。业务数据不必写内部状态数值或 Ruby 调用。
- **示意而非 Schema**：`Map.behaviors: [{ kind: "bridge", operation: "on", occupied: [{ x: 10, y: 5 }] }, ...]` 仅展示行为位于 Map 内；字段名、触发时机、重复触发规则、位置表达及版本号都尚未冻结。尤其不能假定所有桥梁都只需踩格触发：当前还区分角色脚下触发、向前碰撞、`through`、`emptyGraphic` 与通行状态，应先审计并用清晰的内置触发规则替代原版事件字段。
- **职责边界**：传送仍由 `MapTransfer` 表负责；NPC／对话／物品／建筑不因本决定变为内置地形行为。只有确认目标游戏需要且 Map 模块实际支持的新行为才进入内置集合，不为任意玩法建立脚本引擎。

**当前实现与迁移要求：** `runtime.ts#loadMap` 仍读取 `struct.MapAction/{mapId}`，缺失时才使用空记录；`validateMapRecord` 仍严格要求 `tileset_id,width,height,data` 四个顶层字段。所以上述 `Map.behaviors` 当前不能直接写进现有 FSDB 并指望运行。后续实施必须同步更新 Map schema/version、数据校验、导入／迁移、运行时加载与测试；明确旧、新协议的读取边界，不能静默接受新旧字段混用。

- 将旧 `MapAction.actions` 中**已确认**的桥梁入口／出口转换为 Map 内置行为声明，并验证数量、触发位置、操作和关键运行结果；具体迁移以真实 Essentials 数据及 Map 21 桥梁样本复核，不预先假设无损转换。
- 对旧 `opaqueRelated`、无法确认的脚本或缺少语义映射的动作，**在导入／迁移阶段失败并输出可定位的诊断**；不得删除记录后默认为空行为，也不得回退执行原始 Ruby。
- 迁移后回归 Bridge／Ledge 的通行、状态恢复、图层遮挡、跨图重置、触发时机与失败路径；在这些验证通过前，不能声称已经移除旧 `MapAction` 实现或已完全保留 Essentials 行为。

### NPC FSDB 表类型与分组：`[struct]NPC` + `[group]MapNPC`（已确认方向，字段未冻结）

按照 [FSDB 目录结构规范](../../../doc/fsdb/FSDB目录结构详解.md)，`[struct]` 的每个 Key 是一个 JSON object 基础实体；`[group]` 的每个 Key 是一个 JSONL 文件，每个非空行是一条结构一致的 JSON object。**先按数据语义选表类型，不为迁就目前缺失的读取方法而把 NPC 实例列表包进 `[struct]MapNPC` 的 JSON 数组。**

```text
[FSDB]游戏数据/
├── [struct]NPC/
│   ├── .info.meta            # 必填：每个 NPC 定义 JSON object 的 JSON Schema
│   └── guard.json            # 定义 ID = 文件 Key "guard"
└── [group]MapNPC/
    ├── .info.meta            # 必填：每一行实例 JSON object 的 JSON Schema
    ├── .desc.meta            # 必填：说明以地图 ID 分组
    ├── .extend.meta          # 可选：声明实例字段对 [struct]NPC 的引用
    ├── 1.jsonl               # 分组 Key = 地图 ID "1"
    └── 2.jsonl
```

- **NPC 定义**：`[struct]NPC/{npcId}.json` 按定义 ID 读取可复用内容，至少关联符合唯一 4×4 约定的角色素材逻辑引用；文件 Key 已提供定义 ID，不必强制在 JSON 内重复存 ID。名称、对话、AI 等字段是否属于 Map 需另行确认，不因 Essentials Event/Page 原样引入。
- **地图 NPC 实例**：`[group]MapNPC/{mapId}.jsonl` 按地图 ID 分组，每个非空行是一个实例对象；文件 Key 已给出地图 ID，行记录无需重复 `mapId`，也没有 `{ id, instances: [...] }` 这样的外层 JSON 对象。一个定义可以被同一张地图或不同地图的多个实例引用，实例身份与定义身份独立。
- **示意而非最终 Schema**：例如 `1.jsonl` 可包含 `{"instanceId":"gate_guard","npcId":"guard","x":10,"y":6,"direction":2}` 与 `{"instanceId":"east_guard","npcId":"guard","x":15,"y":6,"direction":4}` 两行；仅用来说明分组与复用。字段命名、方向及碰撞规则、实例生命周期等仍待讨论。
- **元数据**：`[struct]NPC` 必须有 `.info.meta`；`[group]MapNPC` 必须同时有 `.info.meta` 与 `.desc.meta`，前者校验**单行对象**而非整组数组。可选 `.extend.meta` 以 JSONL 声明诸如 `npcId` 字段对 `[struct]NPC` 的引用；如果启用，引用字段在对应 `.info.meta` 中类型必须是 `string`。实例 ID 在同一组内唯一、定义引用有效、坐标处于地图边界内等跨记录／跨表约束须由相应完整性校验落实。
- **静态内容与状态边界**：FSDB 只提供定义和实例初始放置；Runtime 保有各实例当前坐标、朝向、移动及生命周期状态，不反向修改 FSDB。`instanceId` 需在同一地图内稳定且唯一，Handler 应区分 `(mapId, instanceId)` 与 `npcId`；跨图重进时状态复位或保留的策略尚未冻结。无 NPC 地图缺失组或提供空组的处理约定也须确定。
- **读取能力缺口**：[Content API v1](../../../doc/15-contracts/content-api-v1.md) 已定义 `group` 路由，但当前公开 [`ContentClient`](../../../packages/subsystem/src/content.ts) 只暴露 `record()` 与 `resource()`，没有 `group()`。实施前须通过公开 Subsystem/Content 契约补齐或核实可用的 Group 读取入口，并为 JSONL 解析、错误与取消语义补测试；不可在 Map 内绕过 Content 访问物理目录。上述结构目前无法直接由现有 Map Runtime 加载。

### 尚未形成完整契约的部分

当前投影主要覆盖地图、Tileset、传送、受支持事件和 Graphics；**尚无完整的、可通过独立 ID 装配的自定义 NPC 定义与实例协议**，现有画面投影也主要面向玩家。NPC 的身份、放置与运行时状态需要按项目需求设计；不需要先把所有 Essentials Event 投影为 NPC。建筑如果只是静态背景，继续作为地图 Tile；只有真实需求要求整栋建筑独立引用/复用/交互时再讨论 Building 定义。

已收敛的表关系（**表类型与组织方向已确认，非现有 Runtime Schema**）：

```text
NPC 定义 ID → struct.NPC/{npcId} → 符合本模块角色图集约定的逻辑资源引用
地图 ID → group.MapNPC/{mapId} → 各实例引用 NPC 定义 ID + 初始放置
逻辑资源引用 → 使用方提供的 FSDB 资源（通过 Content 解析）
```

必须区分“定义 ID”和“地图中的实例身份”：同一 NPC 定义可被同一或不同地图多次使用；运行时实例位置与状态不等于只读 FSDB 定义。表类型已选为 `struct.NPC` 和 `group.MapNPC`；具体字段、生命周期、资源引用表达和公开 API 仍待设计，不把上述关系视为已经实现。

### 角色素材 v1：唯一 4×4 约定，不限定图片像素尺寸（已确认方向）

Player 和自定义 NPC **只支持同一种角色行走图集格式**。不为了兼容 Essentials 所有资源引入多套布局、泛用切帧器或逐素材配置；诸如门、浆果、战斗立绘及特殊缺帧宝可梦图不属于本次 NPC 角色素材范围。

- 一张角色 PNG 固定按 **4 列 × 4 行**排列：行方向依次为下（2）、左（4）、右（6）、上（8）；列为 `pattern 0..3`，必须真实符合四向四帧语义，不能只因图片尺寸可整除就当成角色图。
- 解码后计算 `frameWidth = image.width / 4`、`frameHeight = image.height / 4`；要求图片宽、高均可被 4 整除，结果是正整数。**不规定**必须是 128×128、128×192 或其他固定像素尺寸，也不要求单帧宽高等于地图格宽高。
- 沿用当前 Player 的基础帧规则：静止 `pattern = 0`；行走采用现有运动状态与 pattern 轮替规则。固定朝向/帧排列是图集语义约定，并非从 PNG 元数据推导。
- 显示相对于逻辑地图格：单帧**水平居中、底部对齐格底**。在现有 32px 格下，水平偏移为 `(32 - frameWidth) / 2`，垂直放置为格子顶端加 `32 - frameHeight`；图片高于或宽于格子不自动扩大逻辑碰撞占格。第一版角色占格默认 1×1，独立于视觉帧尺寸。
- 示例：128×128 → 单帧 32×32；128×192 → 32×48；192×192 → 48×48。三者共享上述计算规则，**只是几何上满足规则不等于内容一定是合格角色图**。
- 未来 NPC FSDB 只需引用符合约定的角色素材；**不必存储图片总尺寸、单帧尺寸、图集行列数或方向帧映射**。这些由统一协议及解码后计算确定；资源引用仍遵守 Content 的逻辑 namespace + key。具体 NPC Record 字段未冻结。

来源与限制：[Player/NPC 素材与运动调查](./PLAYER_NPC_SPRITE_AND_MOTION_INVESTIGATION.md)证明当前 Browser 对图片按 4×4 切帧且由尺寸计算单帧，也证明真实 Characters 文件混有非角色图。当前产品**仍只有一个 Player Sprite**，因此共用素材计算规则不等于已经支持 NPC：还需完成多实例独立定位、绘制、运动及必要碰撞。Player 现有初始化入口继续兼容，不因为本约定强制新增 Player Record。以上是后续实施目标，不宣称完成验收。

### 数据清理原则

- **保留**：当前被绘制、通行、传送、地形或事件消费的数据及必要引用。
- **待确认**：当前未消费、但实现既定目标或兼容性验证必需的数据；先追踪原始来源和预期语义，不提前删减；NPC 的 FSDB 数据结构不由 Essentials Event/Page 决定。
- **移除出正式协议**：既不被目标能力消费、也不影响引用/安全校验的来源内部信息；必要时仍可保存在导入工具或诊断资料中。
- 明确 schemaVersion、合法字段和引用失败语义；不静默把旧版五字段 Tileset 补成新版本。原始 Ruby/任意脚本不得作为通用模块默认可执行内容。
- 原版素材遵守现有许可边界，不能因协议整理将受限制的原始 FSDB/图像直接提交仓库。

## 4. Builder / Handler 的设计方向（尚不冻结签名）

- Builder 接收 Subsystem 环境、初始化条件与可访问的 FSDB 内容定位配置，负责组装并创建 Handler；不负责内容导入/安装，也不决定其他 Subsystem 的 topology。
- Handler 提供业务意图级操作：例如将玩家跳转到指定地图/位置、地图切换、NPC 管理、查询只读快照及订阅切图等事件。调用者不直接修改 Runtime 内部状态或手动触发渲染。
- Handler 只负责本 Subsystem 内部调用；不在本次设计中引入跨 Runtime 对象引用、通用 RPC、全局 EventBus 或 Main 新公共接口。
- 事件表达**完成提交的业务事实**；失败有可区分结果，不能先报告成功切图、再发生加载/渲染失败。命令、状态更新和渲染的原子性与异常安全需要验证。
- 调用 API 的形式（`new RPGMapBuilder(...).build()` 等）、初始化方式、Handler 与现有 Definition 的生命周期接合方式属于下一阶段设计，不把讨论示例当成当前实现。

## 5. 可行性与缺口

**架构方向可行，尚未完成实现/产品验证。** 已有 `game-libs/map` 业务库、Subsystem factory、ContentClient、地图/图块解析、移动、传送、Bridge/Ledge 与 Browser 投影，提供可演进的基础。新的 Builder/Handler 与内容规范可优先在 Map 库自身实现，不必先修改 Main 或 Renderer 公开契约。

仍需解决的实际缺口：自定义 NPC 定义和实例数据、`group.MapNPC` 的公开 Content 读取入口、多 Sprite 独立定位与渲染、NPC 运动和碰撞；FSDB 来源定位与 ID 引用的一致性；旧 Essentials 地图投影迁移和兼容性；Handler 命令/事件在失败、取消、切图和异常时的状态一致性。**不把全量 Essentials NPC 事件、所有特殊素材或独立 Building 当作首版交付前置条件。** 当前实施与源引擎 RGSS 逐帧等价是不同的资格议题，不因通用化自动获得证明。

## 6. TODO 与验证顺序

- [x] **事实调查（设计输入，不代表实现完成）**：已完成 Essentials 实体数据及 Player/NPC 素材与运动调查，证据与局限分别见 [`ESSENTIALS_V21_1_ENTITY_DATA_INVESTIGATION.md`](./ESSENTIALS_V21_1_ENTITY_DATA_INVESTIGATION.md)、[`PLAYER_NPC_SPRITE_AND_MOTION_INVESTIGATION.md`](./PLAYER_NPC_SPRITE_AND_MOTION_INVESTIGATION.md)。
- [ ] **数据消费与清理审计**：逐字段核对 Map/Tileset/Transfer 的正式保留字段，以及旧 MapAction 的行为迁移输入；保留 terrain、Bridge/Ledge 语义及 opaque 失败保护，不把旧 MapAction 变成新协议必需目录。
- [ ] **内置地图行为协议**：明确可用 `kind`、来自地形的隐式行为与 Map 内显式行为、参数和触发规则；修改 Map schema/version 与校验；验证未知 kind、非法位置、缺失参数的失败行为。
- [ ] **角色素材约定与多实例验证**：按上述唯一 4×4 语义、解码尺寸除以 4、脚对齐和 1×1 默认占格验证；保留 128×128 合成 Demo 与 128×192 真实 Player 的兼容；选标准 NPC 素材验证独立节点位置、运动、遮挡。不为了少量特殊 PNG 扩展格式。
- [ ] **NPC FSDB 最小协议**：按 `[struct]NPC` 定义与 `[group]MapNPC` 按地图分组的方向，确定定义/实例身份、单行 schema、素材引用及实例唯一性；不继承 Essentials Event/Page Schema，不要求自动导入全量事件。
- [ ] **Group 读取能力**：核实／补齐 Subsystem 公开 `ContentClient` 的 Group 读取接口，遵守既有 Content API v1、namespace/key、JSONL 校验及错误/取消语义；不得为 Map 直接访问 FSDB 文件路径或偷偷把 Group 变为 Record。
- [ ] **FSDB 地图最小协议**：以 Map（含可选内置行为）、Tileset、Transfer、Graphics 为基础确定身份、版本、引用及资源定位；新游戏无需准备独立 MapAction 表。
- [ ] **Builder/Handler 契约**：只覆盖 Subsystem 内部的实例装配、命令、快照、事件、生命周期与失败语义；检查与现有 Definition API 的接合。
- [ ] **实现与兼容迁移**：迁移已确认的旧桥梁动作到 Map 声明；无法确认的旧脚本／opaque 记录必须失败并可诊断；同步修改 importer、Runtime、测试，保住 Essentials 桥梁触发与层级行为，不无声更改旧数据协议。
- [ ] **独立消费者验证**：另一套原创 FSDB 不提供 MapAction，也无需改 Map 库源码，即可装配地图、按内置 kind 声明必要行为、通过 `group.MapNPC` 按地图加载实例及其 NPC 定义与素材，控制玩家切图并收到正确事件；首版不要求 Building Record。
- [ ] **回归及资格**：现有 walk、transfer、Bridge、Ledge、动态 viewport 与浏览器投影不能回归；覆盖桥梁入口／出口、opaque 迁移失败、未知 kind、Group 读取与非法/缺失引用、数据错误/缺失、跨图取消、重复调用与异常提交。记录实际测试结果，不将设计讨论视为已通过验收。

## 7. 统一验收问题

> 一个新游戏是否能仅凭符合规范的 FSDB（无需独立 MapAction 表，NPC 定义使用 `struct.NPC`，地图 NPC 实例使用 `group.MapNPC`）、Subsystem 内 Builder 配置和 Handler 调用，在不修改 `game-libs/map` 源码的条件下完成地图初始化、使用内置地图行为、通过 ID 使用自主定义 NPC 与合规 4×4 角色素材、角色跳转与切图事件监听，同时保持迁移后已确认的 Essentials 地图行为？

这是通用化的核心验收标准。角色图集的唯一格式与尺寸计算方式、取消独立 MapAction 并将行为声明收纳进 Map，以及 NPC 定义与实例表类型，均已确定为**设计方向**；具体行为/NPC Schema 与 TypeScript API 仍需结合迁移审计、Group 读取能力及独立消费者验证后收敛。
