# RPGMap 通用化设计：v1 主方案

> 状态：**v1 已在交付分支实现并通过总验收**。2026-09-22 交付修订。本文是数据与行为的权威说明；公开类型、调用阶段与错误语义只以 [接口执行契约](./RPG_MAP_PUBLIC_API_V1_EXECUTION_CONTRACT.md) 为准；实施任务和验收以 [测试包迁移计划](./RPG_MAP_ESSENTIALS_LOCAL_TEST_PACKAGE_MIGRATION_PLAN.md) 为准。[闭环与状态索引](./RPG_MAP_V1_FINAL_SCOPE_AND_CLOSURE.md)。旧讨论保留在 Git 历史，不再并列作为目标协议。

## 1. 目标、所有权与现状

RPGMap 是同一个 Subsystem 内的可复用地图模块：业务用 `RPGMapBuilder` 装配 Player 和 Subsystem 环境，持有 `RPGMapHandler` 切图、装配 NPC、获取快照；Runtime 独占地图位置、运动、通行、行为与 RenderDomain 投影。Browser 仅显示投影。地图内容经公开 `scope.content` 读取逻辑 `namespace + key`，不读取物理路径、安装 FSDB、不暴露凭据，也不读取业务自有 NPC 放置 Group。不存在通用 Entity、Event/Page、Ruby 解释器、跨 Subsystem RPC 或另起的 Frame 生命周期。

**基线与交付严格分离：**2026-09-21 基线仅导出 `mapDefinition`、读取独立 `struct.MapAction` 且仅渲染 Player；本次交付已实现下列协议。保留的旧 `mapDefinition` 导出适配同一个新版 Runtime、读取新版 Map 数据，不维护第二套旧 Map 协议。

## 2. 唯一 Map 数据格式与生成边界

完整生成脚本每次产出**整套**新版 FSDB；无新旧 Map 共存、运行时迁移、安装级版本开关或旧 MapAction 回退。所有交付 Map 均采用既有 `tileset_id`、`width`、`height`、`data` 四字段和可选 `behaviors`。三层 Tile Table 的维度、索引、坐标、Tileset 的 `passages/priorities/terrain_tags`、MapTransfer 的结构沿用现有消费契约；只修改指定的内置行为字段。地图 ID 取 `struct.Map` 的文件 Key。

```ts
type MapBehavior = Readonly<{
  kind: "bridge";
  operation: "on" | "off";
  occupied: readonly Readonly<{ x: number; y: number }>[];
}>;
interface MapRecord {
  readonly tileset_id: number;
  readonly width: number;
  readonly height: number;
  readonly data: ProjectedTable;
  readonly behaviors?: readonly MapBehavior[];
}
```

`behaviors` 缺失或 `[]` 意味着该次正式生成中没有显式行为；只允许 Bridge，不写 `kind: "ledge"`。行为恰好包含 `kind/operation/occupied`；非空占格数组、地图内安全整数坐标、同一行为内不重复且不同 Bridge 区域不重叠。未知 kind、额外字段、非法方向/点、重复和越界均拒绝。Bridge 区域可在桥旁陆地，不要求 occupied 上铺 tag15；不强制 on/off 数量相等，也不添加 `eventId`、Ruby、`schemaVersion` 或第六个 Map 字段。

生成器必须检查预期地图清单完整且 ID 唯一、Map/Tileset/Transfer 必要记录存在、严格 `.info.meta` 和资源有效、全部新版数据可读；**整批成功才交付**。原始 Essentials 的 Event/MapAction 可作为生成器内部解析与审计材料，但不得输出 `[struct]MapAction` 或让 Runtime 读取。原始 Canonical/Oracle 保留来源事实，新的 consumer projection 在原始对照之后进行。Content 的 `contentVersion` 只是字节哈希，不承担本项目不需要的旧／新版鉴别。

## 3. 内置地形行为

**Bridge：**Tileset terrain tag 15 标识桥面，`behaviors` 在 Map 中显式规定入口／出口。只有 Player 完成成功移动并到达 occupied 时触发；原地转向、出生、被阻挡和跳跃跨越中间格都不触发。同一区域连续占用只触发一次，全部离开后允许再进入；另一不重叠区域可独立触发。`on/off` 分别把 Runtime 内部 `bridgeLevel` 置为 `2/0`，进入新图重置为 0。已是目标值时不产生多余投影修改，但仍记录本次区域到达。先处理成功移动落点的 Step Transfer；若启动转图，不在旧图触发 Bridge。层级改变必须在同一次 RenderDomain 更新中同步人物和地形深度；Browser 不拥有桥层权威。

**Ledge：**Tileset terrain tag 1 隐式决定。`planMovement` 先校验相邻格的既有双向通行，再检查两格跳的落点是否合法；成功只发起一次 jump 和一个 motionId，跨越格没有到达行为，落点按 Step Transfer→Bridge 顺序处理；非法落点 blocked。跨图 jump、NPC 自动触发地形和扩展行为种类不在 v1。当前 400ms 跳跃动画是产品值，不宣称原版 RGSS 逐帧等价。

**NPC 与传送顺序补全：**保留当前 `MapTransfer.contacts` 在当前格+尝试方向上的输入优先级——它无需走进前方格，故在普通移动及 NPC 目标格碰撞检查之前触发。否则先规划地形移动；只有规划成功，才检查 NPC 是否占据真正的 walk 目标或 Ledge 最终落点；被占即 blocked，不移动、不触发该目标格的 Step Transfer／Bridge／NPC 脚本。两格 jump 的中间格不检查 NPC 占格。越界方向仍按既有 `MapTransfer.edges` 判定，不凭 NPC 阻挡触发 Edge。若 NPC 站在 Step Transfer 的格上，Player 不能进入该格，也不会触发其 Step Transfer；若命中当前格的 Contact Transfer，仍按 Contact 的既有优先级传送。自动传送的目标出生格必须在新场景准备时通过 NPC 冲突验证，失败按 Frame 级传送失败处理。这些是产品顺序，不声明修改 Contact/Step/Edge 的原有位置定义。详见 [接口契约](./RPG_MAP_PUBLIC_API_V1_EXECUTION_CONTRACT.md) 的移动与提交规则。

## 4. 真实 Essentials Bridge 生成范围

固定的 Essentials v21.1 语料中，**仅 Map21** 是本轮需要真实事件转换和逐条桥行为验收的目标：确认八个 Bridge 事件和四组 on/off 路线。对这八个目标事件检查整页条件、有效页、所有可执行命令及 Ruby 脚本、触发分支、占格、through/emptyGraphic、重叠与边界；只在能证明行为仅为预期 Bridge 且成功到达触发时，生成 `{kind:"bridge",operation,occupied}`。多余 Ruby、动态条件、front/blocked、opaque 或其他无法证明的副作用导致**整次生成失败**，诊断包含 mapId/eventId/pageIndex/原因；不能只剥离关键词或按 tag15 猜入口。逐条核对数量、操作、位置、重入与四组路径。

不要求对其他真实地图重复 Map21 等价迁移审计；整套输出仍必须符合统一 Schema 和完整性要求。Map7 是桥负例及行走/传送样本，Map47 是 Ledge 样本。更换原始语料时需重新审计 Bridge 白名单，不能将仅对固定 v21.1 的结论扩展到任意地图。原创合成测试另外覆盖非法 Bridge、opaque、整页额外 Ruby、front、重叠与越界。静态源分析不是原版动态等价证明。

## 5. NPC 定义、静态实例与碰撞

`[struct]NPC/{npcId}.json` **仅有**必填 `name`（非空字符串）和 `sprite`（仅含 `namespace:"resource.Graphics"` 与 `key:"Characters/..."` 的逻辑资源引用）；ID 来自文件 Key，不在 JSON 重复。不在定义存坐标、方向、图像帧、对话或 AI；必须有严格 `.info.meta`。素材采用统一 4×4 行走图，行由 `direction=2|4|6|8` 决定，列由实例 `pattern=0|1|2|3` 决定。名称不作为身份。示例业务自行决定每张地图的放置，不规定 `[group]MapNPC`。

两个 `setNPC` 入口使用同一种 `NPCPlacement`：`instanceId`、`npcId`、`x`、`y`、必填 `direction` 和可选 `pattern`。`pattern` 省略／`undefined`／`null` 时默认为 **0**，非法值拒绝；快照永远返回规范化的 0–3。一个实例占地图 1×1 格、静态挡住 Player；同一地图 instanceId 唯一、NPC 不能互相同格或与 Player 出生／当前格重叠。普通移动目标与 Ledge 最终落点被占即 blocked；不要求 NPC 所在地形满足 Player 通行条件。不支持逐步 NPC 移动、对话、NPC 触发 Bridge/Ledge/Transfer 或通用 AI。

进入期 `context.setNPC` 同步登记整批初始集合；运行期 `handler.setNPC` 只在稳定已提交场景且 Player 非运动状态整批替换，`[]` 清空；非法数据／冲突／资源失败在提交前拒绝并保持旧集合。运动中、切图中、另一次 NPC 设置中报告 busy，不暗中排队。具体签名、快照、取消和提交失败见 [接口契约](./RPG_MAP_PUBLIC_API_V1_EXECUTION_CONTRACT.md)。

## 6. 权威状态及实施边界

由 Runtime 管理 Map/Player/NPC/Bridge/场景代次的唯一权威；业务只传实例、接收事件和快照。目标地图与资源全部验证及投影构造在前，渲染与权威状态的**明确提交**在后；准备失败保留旧场景，提交阶段若 `RenderDomain.replace/update` 抛错而无法证明回滚，必须终止 Frame、清理并禁止后续操作，不得继续展示半状态或声称旧场景可恢复。提交后才发一次 `mapEntered`；通知异常仅进入诊断，不推翻已提交结果。Frame 取消须及时结束，即使业务钩子不响应 signal；旧异步结果受代次和失效标记约束。

设计覆盖的数据→Runtime→业务→呈现→失败路径已闭合；**源码、FSDB Schema、生成器、浏览器、多 NPC、Hostra E2E 目前未因本文件而完成**。实施请按 [PR A–D 与测试矩阵](./RPG_MAP_ESSENTIALS_LOCAL_TEST_PACKAGE_MIGRATION_PLAN.md)，提交及测试结果逐项记录，不能用设计打勾代替 PASS。
