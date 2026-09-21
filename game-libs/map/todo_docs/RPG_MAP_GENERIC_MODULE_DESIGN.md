# RPGMap 通用化设计讨论与待办

> 状态：设计讨论记录 / TODO，**非冻结协议、非已实现功能**  
> 记录日期：2026-09-21  
> 基线：`main` @ `2d465b8c8501566b26375dae55e1a78007606c40`（创建本分支时）  
> 范围：`game-libs/map`；本文记录方向、已确认边界、可行性依据及后续验证事项，不预先冻结 API 签名和 FSDB Schema。

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

## 3. FSDB 策略：以现有 Essentials v21.1 已解析结果为基线

**不从零设计整套地图格式。** 先审计已解析并实际被 Map 消费的 FSDB 数据，精简和补齐后形成版本化的 RPGMap 内容协议；不要把 RGSS 原始对象结构原封不动地变成通用协议，也不要为了抽象而强制重写所有数字 ID。

目前已存在的关系：

```text
Map ID → struct.Map/{id} → tileset_id → struct.Tileset/{id}
                               └→ 图块、自动图块的逻辑资源引用
Map ID → struct.MapTransfer/{id} → 目标 Map ID / 目标坐标
Map ID → struct.MapAction/{id}   → 当前受支持的狭义事件（Bridge 等）
图像资源 → resource.Graphics/...（Characters、Tilesets 等）
```

当前 `Map` 保留三层 Tile Table；`Tileset` 包括贴图名、autotile、passages、priorities、terrain_tags。`terrain_tags` 与 Bridge/Ledge 等能力相关，不可仅以“原引擎字段”理由删除。`MapAction` 中的 opaque-related 标记有防止误执行未知脚本的校验作用，删除前必须明确替代失败策略。

证据入口：[`semantics.ts`](../src/semantics.ts)、[`runtime.ts`](../src/runtime.ts)、[Essentials FSDB 示例](../../../examples/essentials-v21.1/%5BFSDB%5Dessentials-v21.1)、[`generate-fixtures.mjs`](../../../examples/essentials-v21.1/scripts/generate-fixtures.mjs)。

### 尚未形成完整契约的部分

当前投影主要覆盖地图、Tileset、传送、受支持事件和 Graphics；**尚无完整的、可通过独立 ID 装配的 NPC 和 Building 定义协议**，现有画面投影也主要面向玩家。NPC/建筑的可复用定义、实例位置、图像、动画、碰撞和遮挡须通过实际消费者需求补足，不能因已有图片目录就认定 NPC/建筑已实现。

拟采用的基本关系是：

```text
实体类型 + 定义 ID → 独立实体定义 → 逻辑资源引用
地图定义 → 对实体定义 ID 的引用 + 地图内实例身份/放置信息
逻辑资源引用 → 已提供 FSDB 中对应资源（由 Content 解析）
```

必须区分“定义 ID”和“地图中的实例身份”：同一 NPC 定义可被同一或不同地图多次使用；运行时实例位置与状态不等于只读 FSDB 定义。建筑是否值得独立成实体，取决于是否需要被独立引用、复用或交互；纯背景建筑可继续使用地图图块表示。精确命名、文件布局、ID 类型和实体字段仍待审计后确定。

### 数据清理原则

- **保留**：当前被绘制、通行、传送、地形或事件消费的数据及必要引用。
- **待确认**：当前未消费、但实现 NPC/建筑或兼容性验证必需的数据；先追踪原始来源和预期语义，不提前删减。
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

仍需解决的实际缺口：完整 NPC/独立建筑的数据与多实体渲染；FSDB 来源定位与 ID 引用的一致性；旧 Essentials 投影迁移和兼容性；Handler 命令/事件在失败、取消、切图和异常时的状态一致性。当前实施与源引擎 RGSS 逐帧等价是不同的资格议题，不因通用化自动获得证明。

## 6. TODO 与验证顺序

- [ ] **数据消费审计**：逐字段检查 importer/prepared FSDB、Map Runtime、Browser、测试对数据的实际依赖；形成保留、待确认、可删除清单，特别核对 Tileset terrain、Transfer、MapAction。
- [ ] **FSDB 最小协议**：在现有 Map/Tileset/Transfer/Action 基线上确定身份、版本、引用与资源定位规则；明确哪些是必须数据，哪些属于特定玩法扩展。
- [ ] **NPC/建筑缺口审计**：从已有 Essentials 来源表达及真实目标场景确认最小独立定义、地图实例和贴图要求，不先构造万能实体模型。
- [ ] **Builder/Handler 契约**：只覆盖 Subsystem 内部的实例装配、命令、快照、事件、生命周期与失败语义；检查与现有 Definition API 的接合。
- [ ] **实现与兼容迁移**：优先用适配层保住既有 Essentials 行为，逐步抽离数据来源硬编码；不无声更改旧数据协议。
- [ ] **独立消费者验证**：另一套原创 FSDB 无需改 Map 库源码即可装配地图、加载资源、通过 ID 使用 NPC/必要建筑，控制玩家切图并收到正确事件。
- [ ] **回归及资格**：现有 walk、transfer、Bridge、Ledge、动态 viewport 与浏览器投影不能回归；数据错误/缺失、跨图取消、重复调用与异常提交要有针对性测试。记录实际测试结果，不将设计讨论视为已通过验收。

## 7. 统一验收问题

> 一个新游戏是否能仅凭符合规范的 FSDB、Subsystem 内 Builder 配置和 Handler 调用，在不修改 `game-libs/map` 源码的条件下完成地图初始化、按 ID 查找素材和实体、角色跳转与切图事件监听，同时保持现有 Essentials 功能？

这是通用化的核心验收标准。具体数据结构与 TypeScript API 以消费审计结果和第二个真实使用场景收敛后再冻结。
