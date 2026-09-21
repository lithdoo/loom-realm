# RPGMap v1：单一数据格式、静态 NPC 与实施闭环决策

> **状态：2026-09-21 已确认的范围修订和实施验收补充；只更新设计，不代表已经实现或运行测试。**
> 本文补充并修正 [通用化主方案](./RPG_MAP_GENERIC_MODULE_DESIGN.md)、[对外接口执行契约](./RPG_MAP_PUBLIC_API_V1_EXECUTION_CONTRACT.md) 与 [Essentials Local 测试包迁移计划](./RPG_MAP_ESSENTIALS_LOCAL_TEST_PACKAGE_MIGRATION_PLAN.md)。若旧文档涉及新旧 Map 双格式/版本准入、全地图 Bridge 迁移审计、静态 NPC 不阻挡或碰撞整体暂缓、`NPCPlacement` 缺少 `pattern`、PR B/C 阶段顺序、`getSnapshot()` 返回类型的描述与本文冲突，**按本文的明确修订执行**；其他已确定的 Map/Bridge/Ledge/Frame/Content 规则继续有效。公开 API 生命周期以接口执行契约为唯一权威，本文件补充其 NPC 字段、碰撞与提交失败规则；实施时应将此补充合入真正发布的 TypeScript 声明和测试，不可继续照抄旧草案。

## 1. 只有一种正式 Map 数据协议：生成整套新版地图

- **没有新旧地图共存需求。**游戏数据由脚本每次完整生成，生成器把所有交付 Map 产出为同一种 v1 `[struct]Map`：原有 `tileset_id/width/height/data` 四字段加可选 `behaviors`，其中显式行为只允许 Bridge；Ledge 仍由地形隐式判断。新版 Runtime **仅消费这套格式**，不读取 `struct.MapAction`，不设旧数据回退、双格式解析器、运行时迁移开关或安装级“旧/新 Map”判定。`behaviors` 缺省或 `[]` 直接表示本次生成结果没有显式行为。
- 原始 Essentials 的 Event/MapAction 解析结果可以作为**脚本内的输入/审计中间数据**，但不能成为新版 FSDB 输出表或 Runtime 依赖。要点是先生成全套、校验全套，然后交付/替换；绝不是在旧 FSDB 上就地把少数地图补丁成新版。
- 每次生成均需检查：预期地图清单完整且 ID 不重复；每个 Map/Tileset/Transfer 的必要结构满足新 Schema；`Map.behaviors` 按严谨字段集校验；NPC 定义及资源检查通过；新版目录不存在旧消费者依赖的 `[struct]MapAction`。严格的 `.info.meta` 是**数据形状校验**，Content 的 `contentVersion` 是**内容哈希/缓存身份**，二者均不承担本方案不需要的双版本鉴别任务。不要新增 Map JSON 第六个 `schemaVersion` 字段，也不要额外发明安装级迁移证明。
- 原数据覆盖/Oracle 仍用于识别来源事实；新格式的 consumer projection 与写出应在原始事实之后进行，不能把转换后的 Map 当成原版源数据。一次生成中遇到必需内容失败，整个交付失败；不得将未完成的新库投入使用。

## 2. Bridge 真实数据只处理和验收 Map21

- 在当前固定的 Essentials v21.1 测试语料与现有取证结论下，**Map21 是本轮唯一的真实 Bridge 转换目标**。生成脚本只需针对 Map21 的八个确认桥事件（四组 on/off 路径）执行原始 Event/MapAction → `Map.behaviors` 映射和逐条等价验证；不要求对 Map7 或其他地图重复进行全图 Bridge 事件迁移审计。Map7 保留普通行走/Transfer 验收，Map47 保留 Ledge 验收。
- Map21 的转换不能直接按照关键字剥离脚本：对八个目标事件**整页**检查页条件、有效页/触发方式、全部可执行命令与 Ruby 脚本组、占格、`through/emptyGraphic` 对到达分支的影响及与其他行为重叠；仅在可证明只包含预期的 Bridge on/off 且只会在成功到达触发时，才能压缩成 `kind/operation/occupied`。例如“Bridge 脚本 + 额外 Ruby 命令”、front/blocked 分支、opaque、动态页条件或无法证明的副作用，一律让该次生成失败并给出 mapId/eventId/pageIndex/原因。必须检查确实有八个预期事件、四组路线及正确操作/格坐标，不以 tag15 凭空推导入口/出口。
- **验收范围限制须写实。**只验证 Map21 的真实桥梁等价，不等于已经证明所有来源版本或任意用户地图的脚本可以安全自动迁移。合成夹具仍需覆盖新 Map Schema 的非法行为、重叠、越界和 Map21 风格的失败转换；这不是要求每张真实地图都做 Bridge 正例复核。若未来改变来源语料或增加真实 Bridge 地图，另行扩展生成器白名单及验收，不在 v1 偷加通用 Ruby 解释器。

## 3. 静态 NPC v1：阻挡 Player，允许指定 4×4 图集的一帧

NPC **可复用定义不变**：`[struct]NPC/{npcId}.json` 仍严格只有必填 `name` 与 `sprite`。NPC 当前显示帧属于**放置实例状态**，不得加入定义或另建复杂状态机。`NPCPlacement` 的执行目标调整为：

```ts
interface NPCPlacement {
  readonly instanceId: string;
  readonly npcId: string;
  readonly x: number;
  readonly y: number;
  readonly direction: 2 | 4 | 6 | 8;
  readonly pattern?: 0 | 1 | 2 | 3 | null;
}
```

- **一帧由 `direction + pattern` 唯一确定。**方向决定图集的下/左/右/上四行，`pattern` 决定第 0～3 列，不另增加 0～15 的 `frameIndex` 或独立 `spriteState`。`pattern` 缺失、`undefined` 或 `null` 均默认 **0**；显式值仅接受整数 0、1、2、3，其他值 fail-closed。`direction` 继续必填。静止显示该帧，不因 `pattern` 非 0 而自动行走或启动 AI。准备期 `context.setNPC` 和运行期 `handler.setNPC` 统一使用同一输入及默认规则；每次整批替换重新按输入计算，未提供 `pattern` 不暗中继承旧实例状态。
- `MapSnapshot.npcs[]` 应增加 `readonly pattern: 0 | 1 | 2 | 3`，返回**规范化后的有效列**（绝不返回 `null` 或 `undefined`）。快照其他字段及 `getSnapshot(): MapSnapshot | null` 遵循对外接口执行契约，主方案中更旧的非 nullable 示意签名不再作为实现依据。
- **默认逻辑占格为 1×1，不跟随图片像素尺寸扩大。NPC 是静态阻挡物。**Player 普通移动不能进入 NPC 所占格；两格 Ledge 跳跃的最终落点也不能被 NPC 占用，中间跨越格不是实际落点，不新增中途接触事件。撞 NPC 只返回/表现为 blocked，不因 NPC 阻挡而执行 Bridge、Transfer 或 NPC 交互脚本；既有 MapTransfer 的非碰撞触发优先级保持不变。
- **每批完整校验。**`instanceId` 在当前地图内唯一；所有 NPC 坐标是地图内安全整数；任意两个 NPC 不得同格；NPC 不得与 Player 当前格或新地图出生格重叠。目标地图出生点冲突使该次进入准备失败；运行期 `setNPC` 存在冲突则拒绝整批、原 NPC 集合和快照不变。仅对坐标与占格作此 v1 校验，不额外断言 NPC 放置格必须符合 Player 的可通行地形规则，也不新增 NPC 自主路径规划。
- Player 正在走路/跳跃、切图准备中或另一次 `setNPC` 尚未完成时，运行期 `handler.setNPC` 以 busy 拒绝，避免 NPC 安装到运动路径或代次不明的场景；不隐式排队。进入操作和运行期操作继续使用 Frame 取消与场景代次屏障；取消/异常不能留下半批 NPC。NPC 移动、NPC/NPC 行走碰撞、对话、交互与 AI 仍在本轮范围外。

实例示例（第二个 NPC 缺少 `pattern`，规范化后为 0）：

```ts
context.setNPC([
  { instanceId: "guard_a", npcId: "guard", x: 10, y: 6, direction: 2, pattern: 1 },
  { instanceId: "guard_b", npcId: "guard", x: 12, y: 6, direction: 4 }
]);
```

## 4. 场景提交的真实失败语义

- 目标准备阶段（Content/钩子/参数/素材/投影）失败时，**已提交的旧场景和快照保持有效**；首次进入无旧场景则 Frame 失败，不发布 `mapEntered`。准备钩子若不响应取消，Frame 仍要可及时结束，迟到回调/资源结果必须通过失效标记和场景代次阻止提交。
- 只做一次完整场景投影的 `RenderDomain.replace()`；**现有 RenderDomain 类型并未保证调用抛错后的跨层回滚**。因此不能一概承诺“提交阶段抛错仍可继续使用旧场景”：若无法证明旧投影/运行时状态一致，必须使 Frame 明确 `failed`、关闭/清理该场景并禁止后续命令，绝不能继续运行混合状态。后续若证实底层有可测试的无副作用失败/回滚保证，才允许扩大恢复承诺。`handler.setNPC` 提交阶段同理；业务 Promise 拒绝并按 Frame 终止策略处理，不谎报集合完整保留。
- `mapEntered` 只在成功提交后发送一次；完成通知抛错不撤销成功场景，但必须有可观察的诊断通路。新的事件/快照与 RenderDomain 状态同时按一致性测试验收，不能只测内存字段。

## 5. 实施顺序与单一接口权威

| 阶段 | 本轮独立交付及退出条件 |
| --- | --- |
| **PR A：完整新版数据生产** | 新 Map/NPC 严格 `.info.meta`、全地图一次生成和验证、仅 Map21 八个 Bridge 转换和完整页负例、原创合成 4×4 图；不输出 MapAction，不改 Runtime 做双格式兼容。 |
| **PR B：统一生命周期骨架** | Builder/Handler 真正导出并接入既有 `frame(frame)`；首次/主动/自动进入复用同一准备、取消、提交主链；**唯一 `onMapEntering` 骨架在此阶段实现**，暂以空 NPC 集合也能独立验收。切图失败、提交异常、通知与快照有测试；原 `mapDefinition` 若仍保留，只能复用同一新 Runtime 且读新版数据，不代表保留旧 Map 协议。 |
| **PR C：静态 NPC + 本地生成消费** | `name`/`sprite` 读取、4×4 多实例渲染、`direction/pattern`、1×1 挡路与冲突、准备期及运行期整批 `setNPC`、快照有效 pattern；`essentials-v21.1-local` 改为真实 Builder/Handler 消费者；真实导入脚本 staging→校验→替换、失败保留旧库；验收两个实例复用定义、挡路、跳跃落点、清空、重叠拒绝与旧代次隔离。 |
| **PR D：产品回归与证据** | Map66 启动、Map7 行走/Transfer、Map21 八 Bridge/四路径、Map47 Ledge、NPC 图像帧与挡路、resize/取消/RenderDomain/真实本地 Hostra E2E。真实素材不可用应标 `NOT RUN`，不得当成通过。NPC 自主运动和完整碰撞是独立后续阶段。 |

**接口文档权威规则：**公开 API 的生命周期、`run`/`enterMap` Promise 和错误/事件语义只维护于 [接口执行契约](./RPG_MAP_PUBLIC_API_V1_EXECUTION_CONTRACT.md)；本文件只覆盖其新增 NPC `pattern`、占格、特殊提交失败与实施范围；[主方案](./RPG_MAP_GENERIC_MODULE_DESIGN.md) 的第 4 节旧签名仅供历史讨论，不作为实现声明。提交代码时应同步更新接口契约的声明，避免同一接口分裂成多个定义。

## 6. 本轮闭环验收与未实施事实

闭环路径为：**脚本完整生成新版 FSDB（仅 Map21 Bridge 转换）→ 全量 Schema/资源验证 → Builder/Handler + 唯一准备钩子 → 静态 NPC 挡路和自选显示帧 → 完整场景提交/失败处理 → `mapEntered` 与快照 → 原创 CI 与合法本地 Essentials 测试证据。**

必须包含负例：Map21 页附加 Ruby/动态条件、Bridge 重叠/越界；NPC 缺定义/坏 PNG/非法 pattern/重复 instanceId/同格/Player 重叠；NPC 阻挡 walk 和 Ledge 最终落点；运动时 setNPC busy；取消迟到钩子；切图准备失败保留旧场景；RenderDomain 提交异常进入明确终止而非半场景；导入 staging 失败恢复旧库。运行前先审计现有 Content 实际 `record/resource` 数据形态，不因为历史草案使用 `sprite.namespace/key` 示例就跳过真实资源引用校验。

**完成范围只包括地图行为及静态 NPC 的游戏侧测试包。** 不包含通用地图事件、原版全部 NPC、NPC 自主运动/AI/交互或逐帧 RGSS 保真。本文件是设计变更记录，相关源码、脚本、Schema、测试在实际完成并记录 commit 后才能标记为通过。