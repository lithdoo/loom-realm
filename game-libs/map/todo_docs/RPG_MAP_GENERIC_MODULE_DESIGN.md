# RPGMap 通用化设计讨论与待办

> 状态：设计讨论记录 / TODO，**非冻结的完整协议、非已实现功能**  
> 记录日期：2026-09-21；角色素材、内置地图行为方向及 NPC 业务装配边界更新：2026-09-21  
> 初始基线：`main` @ `2d465b8c8501566b26375dae55e1a78007606c40`（创建原设计分支时）  
> 范围：`game-libs/map`；本文记录方向、现状、实现缺口和验证事项，不预先冻结 API 签名或完整 FSDB Schema。

## 1. 目标与核心思路

将目前与 Essentials v21.1 具体数据和行为耦合的 Map，逐步改造成可供不同游戏复用的 **RPG 地图业务模块**。业务方准备地图所需 FSDB 内容，在自己的 Subsystem 内通过 `RPGMapBuilder` 提供 Subsystem 环境、初始化条件及内容定位配置，构建 `RPGMapHandler`；之后通过 Handler 控制角色、切图、查询状态与监听地图事件，不触碰内部地图加载、运动或渲染实现。

三个概念分工：

| 组成 | 职责 |
| --- | --- |
| `RPGMapBuilder` | 在同一 Subsystem 内创建/装配地图业务实例，连接地图内容与初始化配置。 |
| `RPGMapHandler` | 对业务方提供地图控制、角色实例设置/操作、只读查询和事件/准备钩子。 |
| RPGMap Runtime | 地图与角色位置/运动的唯一权威，负责合法性、通行/传送、角色实例、资源解析与 RenderDomain 更新。 |
| RPGMap FSDB 规范 | **仅规定 Map 模块自己消费的地图内容**；游戏 NPC 定义、NPC 分组和玩法数据不是该规范的一部分。 |

期望使用体验：调用方按地图 ID 定位地图内容；进入地图时由业务方决定当次应有哪些 NPC，再经 Handler 提供 Map 所需的实例数据。Map 不要求游戏通过某个 NPC 定义 ID 或固定 FSDB 表来装配角色。Builder/Handler 不另造 Subsystem 生命周期管理器。

## 2. 已确认的责任边界

1. **Handler 位于 Map Subsystem 内部**，服务该 Subsystem 的业务方。Handler 与其他 Subsystem/主进程的编排和通信不属于本次重构。
2. **Map 不负责 FSDB 安装、数据生产或准备**。调用方提供符合 Map 自身内容规范的地图数据及可访问的来源；Runtime 按 ID 查找、校验并消费。
3. 保留 LoomRealm 权威边界：Subsystem 使用公开 `scope.content`、Input、RenderDomain；Renderer/Browser 消费投影，不反向决定通行、事件或世界状态；业务数据不得暴露 Content 凭据。
4. **物理目录与逻辑 Content 身份不是同一件事**。Map 按 `namespace + key` 访问自身需要的内容，不将其解释为任意文件系统路径；映射与安装属调用环境/现有 Content 机制。不得绕过 Content 边界。
5. Map 不理解 NPC 的对话、任务、AI、商店或游戏方的 FSDB Schema，也不因本次工作创建地图/菜单/战斗共用的万能 Entity 框架。

相关当前契约：[`SubsystemDefinitionFactory`](../../../packages/subsystem/src/model.ts)、[`ContentClient`](../../../packages/subsystem/src/content.ts)、[`Content API v1`](../../../doc/15-contracts/content-api-v1.md)、[Map 模块现况](../../../doc/20-modules/loom-map/README.md)。

## 3. FSDB 策略：地图沿用现有投影，NPC 内容归业务方

**不从零设计整套地图格式。** Map、Tileset、Transfer 优先沿用并整理现有 Essentials v21.1 解析产物；先审计 Map 真正消费的字段，精简和补齐后形成版本化内容协议。不把 RGSS 原始对象结构直接变成通用格式，也不为了抽象强制重写已有数字 ID。

**地图行为已确认方向：** 新版 RPGMap 正式内容协议**不要求也不设独立 `[struct]MapAction` 表**。桥梁、悬崖等由 Map 模块内置；业务方只声明受支持的 `kind` 及位置、触发条件等必要参数，不向 Runtime 注入 Ruby、脚本或执行代码。能从 Tile 与 Tileset 地形标签推导的行为不重复声明；需要入口/出口等局部信息的声明放在对应 Map 记录。旧实现仍依赖 MapAction，须安全迁移。

**NPC 边界更新：** RPGMap **不规定、不要求、不读取** `[struct]NPC`、`[group]MapNPC` 或其他 NPC 定义/分组表。业务方自行决定数据来源和 Schema，可以在角色进入地图的准备阶段读取自行设计的 FSDB Group，也可以从其他业务状态获取 NPC；然后将 Map 所需的规范化角色实例交给 Handler 的 `setNPC`（暂定名称）。此前选择 `[struct]NPC` + `[group]MapNPC` 作为 Map 必需表的方向**已撤回**；这两个表仅能作为具体游戏自愿采用的 FSDB 例子，不属于 Map 内容协议，也不构成 Map 加载的前置依赖。Essentials Event/Page 同样不成为 NPC Schema。

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
                            └→ 可选的内置地图行为声明
Map ID → struct.MapTransfer/{id} → 目标 Map ID / 目标坐标
图像资源 → resource.Graphics/...（Tilesets、Autotiles、角色图等）
业务方自行读取其 NPC 数据 → 转换为 Map 角色实例输入 → Handler.setNPC(...)
```

地图 FSDB 目录示意：

```text
[FSDB]游戏数据/
├── [struct]Map/
├── [struct]Tileset/
├── [struct]MapTransfer/
└── [resource]Graphics/
```

`resource.Graphics/Characters/...` 是统一角色贴图资源的可能位置，既服务 Player 也可服务业务设置的 NPC，不代表存在 NPC 数据表。具体游戏可自行增设 `[group]MapNPC` 等目录；若按 [FSDB 目录规范](../../../doc/fsdb/FSDB目录结构详解.md)采用 Group，就应使用按 Key 分组的 JSONL 和该表要求的 `.info.meta`、`.desc.meta`，但其字段与分组含义均由业务方决定。

当前 Map 保留三层 Tile Table；Tileset 包括贴图名、autotile、passages、priorities、terrain_tags。`terrain_tags` 与 Bridge/Ledge 相关，不可仅以“原引擎字段”理由删除。现有 `MapAction.opaqueRelated` 是无法识别脚本的失败保护；取消表不等于取消这一安全约束。

证据入口：[`semantics.ts`](../src/semantics.ts)、[`runtime.ts`](../src/runtime.ts)、[Essentials 实体数据调查](./ESSENTIALS_V21_1_ENTITY_DATA_INVESTIGATION.md)、[Player/NPC 素材与运动调查](./PLAYER_NPC_SPRITE_AND_MOTION_INVESTIGATION.md)。合成示例见 [`generate-fixtures.mjs`](../../../examples/essentials-v21.1/scripts/generate-fixtures.mjs)，不能将其当作原版素材证据。

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

### NPC：由业务方装配，Map 只接受角色实例（新确认方向；API 待细化）

**数据所有权与运行时所有权分离：** 业务方定义 NPC 身份、来源、复用、对话/任务/AI 和初始配置；Map 不知道业务方的 `npcId`、Group Key 或 Record 字段。业务方负责读取和转换数据；Map 只接收绘制、位置与运动/碰撞所需的角色实例输入，并独占这些实例进入地图后的地图状态。FSDB 不被 Runtime 的移动反向修改。建筑若只是背景仍用 Tile；不为它强制建立角色实体。

可选的游戏业务流程（**示意；不要求任何固定 NPC 表**）：

```text
角色请求进入目标地图
  → Map 确认目标并开启进入准备阶段（未发布已进入事件）
  → 业务方收到地图进入准备通知，按自身约定读取 NPC Group/其他数据
  → 业务方转换为 Map 所需实例输入，通过 Handler.setNPC(...) 提供
  → Map 校验实例与资源，准备/提交地图及角色投影
  → 地图进入成功后发布完成事实事件
```

- **准备通知与完成事件不同**：进入准备钩子（暂称 `mapEntering`）允许业务方异步装配；进入完成事件（暂称 `mapEntered`）只能表示地图、角色与投影已提交的事实。此前文档“事件表达完成事实”继续适用于普通完成事件；准备钩子必须另行定义为可参与装配的生命周期入口，不能将普通完成事件直接当作同步初始化屏障。
- **待解决的时序选择**：准备钩子返回角色输入，或通过绑定进入上下文的 `setNPC` 提交输入，二者哪种为正式 API 尚未决定。必须避免准备钩子 `await setNPC` 时 `setNPC` 又等待地图已进入而死锁；明确准备完成条件、超时/取消、错误传播和切图重入，旧准备结果不得污染新场景。
- **`setNPC` 是 Map 角色输入接口，不是 FSDB 读接口**：示意输入是 `{ instanceId, sprite: { namespace, key }, x, y, direction }`；文件 Key、业务 `npcId`、对话或其他自定义字段不传进 Map。`sprite` 按 Content 逻辑身份解析，不带磁盘路径；身份类型、输入模式、必填字段和校验规则均未冻结。
- **批量语义候选**：可考虑 `setNPC([...])` 整批替换某地图当前 NPC 集合、`setNPC([])` 清空，并在任一输入无效时整批拒绝，避免部分装配；尚须决定它是在准备阶段提交初始集合，还是也可在已进入后动态替换，以及旧实例运动和订阅如何处置。不要把这一建议描述成已实现的确定签名。
- **实例身份与生命周期**：Map 需要在当前地图中区分不同实例，但不必持有可复用业务定义 ID；实例标识作用域、占格、重进复位/保留、玩家与 NPC 碰撞、自主移动和是否触发 Transfer/Bridge/Ledge 均待进一步决定。
- **Group 读取能力归属**：[Content API v1](../../../doc/15-contracts/content-api-v1.md) 已定义 Group 路由，公开 [`ContentClient`](../../../packages/subsystem/src/content.ts) 目前只有 `record()` / `resource()`。如果游戏业务选择在准备钩子中读取 FSDB Group，需要通过公开 API 补齐/核实 Group 能力及 JSONL、错误和取消语义；这是业务读取能力的依赖，**不是 RPGMap 读取 NPC 或装载地图的前置条件**。Map 不绕过 Content 访问物理目录。

### 尚未形成完整契约的部分

当前 Runtime/Browser 主要面向单 Player Sprite；虽然 Map 本身有地图、Tileset、传送与桥/崖能力，尚未实现按业务输入装配多个 NPC 的独立定位、绘制、运动和碰撞。地图进入准备、场景提交、完成通知与重复切图的时序也未冻结。

NPC 的复用定义与 FSDB 记录属于游戏业务概念；Map 只需要区分当前地图的角色实例及其 Runtime 状态。业务方可以多次放置同一业务 NPC 模板，提供给 Map 时只需给每个实例独立身份及必要属性；不要求映射到 Essentials Event/Page 或 `struct.NPC`。

### 角色素材 v1：唯一 4×4 约定，不限定图片像素尺寸（已确认方向）

Player 和业务设置的 NPC **只支持同一种角色行走图集格式**。不为了兼容 Essentials 所有资源引入多套布局、泛用切帧器或逐素材配置；门、浆果、战斗立绘、特殊缺帧宝可梦图不属于本次角色图集范围。

- 角色 PNG 按 **4 列 × 4 行**排列：行方向为下（2）、左（4）、右（6）、上（8）；列为 `pattern 0..3`，必须真实符合四向四帧语义，不能仅因尺寸可整除就当作角色图。
- 解码后计算 `frameWidth = image.width / 4`、`frameHeight = image.height / 4`；图片宽高都须能被 4 整除，结果为正整数。**不规定**总图片尺寸必须是 128×128、128×192 等，也不要求单帧与地图格同尺寸。
- 静止 `pattern = 0`；行走沿用当前 Player 运动状态与 pattern 轮替规则，不能无依据改成简单 0、1、2、3 循环。
- 单帧相对逻辑地图格**水平居中、底部对齐格底**。当前 32px 格：水平偏移 `(32 - frameWidth) / 2`，纵向偏移 `32 - frameHeight`；宽/高超出格子不自动扩大逻辑占格，v1 默认 1×1。
- 128×128 → 32×32；128×192 → 32×48；192×192 → 48×48。几何满足不保证实际图像是有效行走图。
- `setNPC` 等角色输入只需逻辑图像引用；**不必记录图片总尺寸、帧尺寸、布局行列数或方向映射**，由统一约定和解码结果确定。业务自己的 FSDB 如何存引用，Map 不规定。

[素材与运动调查](./PLAYER_NPC_SPRITE_AND_MOTION_INVESTIGATION.md)说明当前 Browser 的 4×4 切帧与尺寸计算，并证明真实 Characters 文件混有非角色图片。目前产品仍主要是单 Player Sprite，采用同一素材计算规则不代表已支持多 NPC；还要实现多实例位置、绘制、运动和必要碰撞。Player 现有初始化入口继续兼容，不强制新增 Player Record。

### 数据清理原则

- **保留**：当前被绘制、通行、传送、地形或事件消费的地图字段与必要引用。
- **待确认**：未消费但实现既定目标/兼容性所需的字段，先审计原始来源与语义，不提前删减；游戏 NPC FSDB Schema 不由 Essentials Event/Page 或 Map 模块决定。
- **移除出正式 Map 协议**：目标能力不消费且不影响安全/引用校验的来源内部信息，必要时留在导入工具或诊断资料中；NPC 定义表与 NPC 分组表不列为 Map 必需内容。
- 明确 schemaVersion、合法字段、引用与失败语义；不静默将旧五字段 Tileset 补成新版本。不执行原始 Ruby/任意脚本。
- 原版素材遵守许可边界，不因协议整理将受限原始 FSDB/图像直接提交仓库。

## 4. Builder / Handler 的设计方向（尚不冻结签名）

- Builder 接收 Subsystem 环境、地图初始化条件与可访问的地图内容定位配置，在同一 Subsystem 内装配 Handler；不导入/安装内容，不决定其他 Subsystem topology，也不接收固定 NPC FSDB 表定位作为必填参数。
- Handler 提供角色实例批量设置（暂称 `setNPC`）、玩家跳转/切图、必要的 NPC 地图操作、只读快照与事件/准备钩子。调用方不直接修改 Runtime 内部状态或触发渲染。
- Map 为进入地图提供业务装配时机：准备阶段与已完成进入事实必须区分。普通事件只报告**完成提交的业务事实**，准备钩子另定参与和失败语义；不能先报告切图成功，再因必须的 NPC 装配失败而将其视为失败。
- `setNPC` 的实际输入、是批量替换还是其他语义、准备阶段如何安全调用、动态设置是否允许、回调顺序、取消/失效与资源错误处理需独立收敛。不得让旧地图的异步业务结果更新新地图。
- Handler 只在当前 Subsystem 内被业务调用；不引入跨 Runtime 对象引用、通用 RPC、全局 EventBus 或 Main 新公开接口。
- 初始化、命令、状态和渲染的原子性及异常安全须审计；`new RPGMapBuilder(...).build()` 等仅为思路，不冻结 API 签名，也不宣称已实现。

## 5. 可行性与缺口

**方向可行，尚未完成实现/产品验证。** 现有 `game-libs/map`、Subsystem factory、ContentClient、地图/图块解析、移动、传送、Bridge/Ledge 和 Browser 投影可作为基础。主要实现仍可放在 Map 库自身，不必预设 Main/Renderer 新公开契约。

实际缺口：Map 自身 FSDB 字段/版本与安全迁移；进入准备钩子、业务异步装配、`setNPC` 的提交/替换/取消语义；多 Sprite 独立定位与渲染、NPC 运动碰撞；资源定位和 ID 规则；Handler 失败、切图与异常的状态一致性。如果业务选择 FSDB Group，则公开 Content Group 读取能力还需在其所属 Content/Subsystem 边界补齐，**但不是 Map 的 NPC 读取职责**。不把全量 Essentials NPC 事件、所有特殊素材或独立 Building 作为首版前置条件；已实现能力不等于 RGSS 逐帧保真资格。

## 6. TODO 与验证顺序

- [x] **事实调查（设计输入，不代表实现完成）**：已完成 Essentials 实体数据与 Player/NPC 素材及运动调查，见 [`ESSENTIALS_V21_1_ENTITY_DATA_INVESTIGATION.md`](./ESSENTIALS_V21_1_ENTITY_DATA_INVESTIGATION.md)、[`PLAYER_NPC_SPRITE_AND_MOTION_INVESTIGATION.md`](./PLAYER_NPC_SPRITE_AND_MOTION_INVESTIGATION.md)。
- [x] **NPC 内容所有权方向**：取消 Map 必需的 `struct.NPC`/`group.MapNPC` 与固定业务 NPC Schema；由业务监听进入准备并自主读取/转换数据，通过 Handler 设置角色实例。已确定的是责任边界，非 API 实现。
- [ ] **数据消费与清理审计**：核对 Map/Tileset/Transfer 字段及旧 MapAction 迁移输入；保留 terrain、Bridge/Ledge 与 opaque 保护，不把旧 MapAction 当成新协议必需表。
- [ ] **内置地图行为协议**：明确 `kind`、隐式地形/显式 Map 行为、参数和触发规则；更新 Map schema/version 和校验，覆盖未知 kind、非法位置与参数失败。
- [ ] **地图进入装配协议**：定义进入准备钩子与进入完成事件的作用域/顺序、业务异步读取、取消与重入；决定准备回调返回 NPC 集合还是经进入上下文调用 `setNPC`，避免死锁和过期结果污染；明确空集合及准备失败行为。
- [ ] **角色实例输入及 `setNPC` 语义**：冻结输入字段、实例身份、逻辑资源引用、批量替换或增量策略、整批校验、加载中与已进入后调用、清空/删除及失败原子性；不接受业务自定义 NPC Record 作为 Map 协议。
- [ ] **运动、碰撞与生命周期**：Player/NPC 占格与重叠、移动指令、地图行为参与、切图重进时实例状态复位/保留、销毁与过期运动回调；不预先建立完整 AI/存档框架。
- [ ] **角色素材及多实例验证**：唯一 4×4、解码尺寸 /4、脚对齐和默认 1×1 占格；覆盖 128×128 合成 Demo、128×192 真实 Player 及标准 NPC 多节点运动/遮挡。
- [ ] **FSDB 地图最小协议**：以 Map（含可选内置行为）、Tileset、Transfer、Graphics 为基础确定身份、版本、引用与资源定位；独立 MapAction 和 NPC 数据表都非 Map 必需。
- [ ] **业务 Group 读取（条件依赖，非 Map TODO）**：若示例游戏用 FSDB Group，自 Content/Subsystem 公开入口补齐/核实 `group()`、JSONL、错误/取消语义；Map 不消费 Group、不直接读文件路径。
- [ ] **Builder/Handler 契约**：在上述语义明确后冻结 Subsystem 内装配、命令、快照、完成事件、准备钩子、生命周期与失败处理。
- [ ] **实现与兼容迁移**：安全转换已确认旧桥梁动作；无法确认的脚本/opaque 必须可诊断失败；更新 importer、Runtime、测试，保证 Bridge/Ledge 回归。
- [ ] **独立消费者验证**：原创游戏只提供 Map 自己的 FSDB；业务可从自选来源读取 NPC 并设置多个独立实例，接收准备/完成通知及操作切图；无需 Map 源码修改，也不强制 `[struct]NPC`/`[group]MapNPC` 或 Building Record。
- [ ] **回归及资格**：覆盖 walk、transfer、Bridge、Ledge、动态 viewport、浏览器投影、过期异步装配、NPC 实例错误和失败原子性；记录实际测试，不把设计讨论当验收通过。

## 7. 统一验收问题

> 一个新游戏是否能只准备 RPGMap 所需的 Map/Tileset/Transfer/Graphics 内容（无需独立 MapAction 或任何指定 NPC 表），通过同一 Subsystem 内 Builder 装配、在进入准备阶段从**自选业务数据来源**取得 NPC 并通过 Handler 设置独立角色实例，再由 Map 负责位置、运动/碰撞、渲染、切图和完成事件，且无需修改 `game-libs/map` 源码，同时保持安全迁移后已确认的 Essentials 地图行为？

角色图集的统一 4×4 格式及尺寸计算、取消新协议独立 MapAction，以及 **NPC 来源/Schema 完全归业务方、Map 接受规范化实例输入**，已确定为设计方向；地图行为 Schema、准备/完成时序、`setNPC` API、角色碰撞/生命周期等仍需收敛。文档更新不等于实现、迁移或资格通过。