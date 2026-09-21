# RPGMap v1：Essentials v21.1 Local 测试包及数据生成迁移计划

> 状态：**已选定的实施与验收路线，尚未实施、测试或签署资格**。记录日期：2026-09-21。本文是 [RPGMap 通用化主方案](./RPG_MAP_GENERIC_MODULE_DESIGN.md) 与 [对外接口 v1 执行契约](./RPG_MAP_PUBLIC_API_V1_EXECUTION_CONTRACT.md) 的消费者/数据生产配套计划；数据、接口与行为的权威规则仍以前两份方案为准。此文不修改现有源码或宣称目标协议已可运行。
>
> 测试消费者：[examples/essentials-v21.1-local](../../../examples/essentials-v21.1-local/)；真实源导入器：[tools/fixtures/essentials-v21.1](../../../tools/fixtures/essentials-v21.1/)；独立可提交合成包：[examples/essentials-v21.1](../../../examples/essentials-v21.1/)。三者不可混作一套素材来源。

## 1. 目标与非目标

将现有 `examples/essentials-v21.1-local` 改为**通过新公开 RPGMap Builder/Handler 消费模块的游戏侧测试包**，而非继续直接导出旧 `mapDefinition`。使用合法取得的本机 Essentials v21.1 数据检验真实地图、素材、桥梁、悬崖和切图，同时检验游戏业务自有 NPC 放置与 `context.setNPC` / `handler.setNPC` / 快照协议。在同一 Subsystem 内装配，不增设跨 Subsystem 通信或通用 NPC 玩法引擎。

目标验收并不等于 Essentials 全量事件支持、逐帧 RGSS 保真、所有原版 NPC 自动导入或完成 NPC AI/行走/碰撞。首批只需要真实地图兼容与**静态 NPC** 的完整公开接口消费；NPC 动态运动/碰撞另设设计与测试阶段。真实资源不得提交仓库，合成资源可以作为 CI 的确定性样本；不得把合成验证当成原版动态证据。

## 2. 已核实的旧链路与待替换点

| 当前文件 | 已有事实 | v1 目标改造 |
| --- | --- | --- |
| `examples/essentials-v21.1-local/subsystems/map.mjs` | 当前 `export { default } from "@loomrealm-game/map"`，直接转发旧 Map 工厂 | 改为消费者拥有的 `SubsystemDefinitionFactory`：在 `frame(frame)` 中装配 `RPGMapBuilder`、注册进入/完成钩子、调用 `handler.run(initial)`，不复制 Map 内部运行逻辑；`mapDefinition` 保留为包内兼容适配而非示例主入口。具体导出依新包实现核对。 |
| `examples/essentials-v21.1-local/game.json` / `launch.hostra.json` | 初始 mapId=66、x=8、y=7、`characterName`，Hostra 模块指向 `subsystems/map.mjs` | 在消费者边界拆分初始地图位置与 Builder 玩家素材配置；遵守现有游戏/Hostra manifest，不擅改宿主 ABI；保留 Map66 原启动冒烟。 |
| `scripts/init-fsdb.mjs` | 调用 `tools/fixtures/essentials-v21.1/import.mjs`，随后写入 Presentation；存在先删除现有 `[FSDB]*` 再导入的窗口 | 接入新消费者数据版本；先 staging 生成/验证 FSDB 和 Presentation，再替换现有目录；失败须保住此前可运行的数据并清理 staging。 |
| `scripts/sync-map-presentation.mjs` / `play.bat` | 编译、检查并原子同步 Map JS/CSS 等 Presentation 资源；启动本地 Hostra | 继续使用已有 Presentation 同步/校验，不复制 Browser 逻辑；改造后验证包产物、资源与启动脚本接线。 |
| `reimport.bat` / `scripts/verify-reimport.mjs` | 重导入后仍检查独立 `[struct]MapAction` 与 `Tileset.terrain_tags` | 提示与验证改为新版 Map/NPC Schema、内容来源版本、`behaviors`、必要资源、Tileset tags 和 MapAction 迁移完整性；**新版输出不再以存在 `[struct]MapAction` 为成功条件**。 |
| `tools/fixtures/essentials-v21.1/lib/essentials/v21.1/m14-consumer.mjs` | Map 投影为旧四字段 | 在明确的新消费者导入路径上将合规 Bridge 行为并入对应 Map；不重做既有三层 Table/Tileset/Transfer。 |
| `lib/essentials/v21.1/simple-game-data.mjs`、`lib/fsdb/mapper.mjs`、`lib/fsdb/writer.mjs` | 当前生成 MapAction 域、Mapper 导出独立 MapAction 表，Writer 输出结构表及 `.info.meta` | 协调新消费者投影、真实 `.info.meta`、版本准入与最终写出；旧动作只供导入审计，不作为新版运行时独立表。先确认 importer 是否仍有旧格式消费者，必要时隔离明确的目标版本/输出 profile，不无条件破坏其既有调用者。 |
| `examples/essentials-v21.1/scripts/generate-fixtures.mjs` | 生成原创 PNG/模拟 FSDB，但仍写旧 `struct.MapAction` | 改合成 Map.behaviors、NPC 最小定义与合成 4×4 NPC 图集；保留原创图样和确定性测试，不引用真实受限素材。 |

来源：上述相应源码、[当前 Map 运行语义](../src/runtime.ts) 与主方案。实施前锁定基线提交与既有测试结果；文中路径和功能是审查定位，不是表示改造已完成。

## 3. 数据导入的安全迁移规则

1. **保留原始事实与安全审计。** 先基于已有 `MapAction` 提取/分类过程审计事件，再对通过主方案 §3.3 等价性条件的确认 Bridge 动作生成 `Map.behaviors`（`kind: "bridge"`、`operation: "on" | "off"`、`occupied`）。保留原始证据与可定位诊断；生成结果不能靠 Bridge tag15 自动猜入口/出口。
2. **fail-closed。** 对迁移目标地图的 `opaqueRelated`、不确定页/脚本、front/blocked 分支、重复/重叠占格、越界和来源不明，导入/迁移失败并报告 mapId、eventId、pageIndex、原因；不能简单删表、视为无行为或运行 Ruby。明确导入范围/分区：不能通过悄悄忽略未支持地图来伪装整库迁移成功。
3. **版本隔离。** 新 Map 的 `.info.meta` 限定四字段+可选 `behaviors`，NPC `.info.meta` 限定必填 `name`、`sprite`；输出携带可验证的内容版本/迁移来源标记。旧四字段 Map 缺少 `behaviors` 并不自动表示旧 MapAction 可忽略。确定版本标记应如何接入既有 Content/FSDB 后再打开新 Runtime 的“只读 Map”路径。
4. **对照检查。** 逐 Map 对比旧新 Bridge 动作数量、操作、占用格与触发分支，重点检验 Map21 八动作/四组路径及 Map7 桥负例；保留 Map47 的 Ledge 隐式推导。原版动态等价仍需合法本地实测，静态审计不代表资格签署。
5. **不要污染原始 Canonical/Oracle 事实。** 当前 `simple-game-data.mjs` 还承担原数据对照及覆盖统计；先审计其调用顺序与既有消费者，在明确的后置 consumer projection 或版本化输出环节转换，避免把“消费者需要的新格式”伪装为“原始 Essentials 来源”。写入 FSDB 的 schema 由 Writer/Plan 传递真实 Schema，不能继续把通用 `{"type":"object"}` 当作新协议严格验收。

## 4. NPC：只生成可证实的最小定义，放置由示例拥有

- `[struct]NPC/{npcId}.json` 仅含 `name`（非空）及 `sprite: {namespace:"resource.Graphics", key:"Characters/..."}`；文件 Key 是 `npcId`，不可在 JSON 复制 ID，不包含坐标、朝向、任务、对话或 AI。名称与素材必须有明确可信来源/测试包作者声明，不根据所有 Essentials Event 自动造 NPC。
- 首版可选少量已验证为合法统一 4×4 的角色资源；不符合图集、缺失素材、无法可靠确定名称者禁止猜测导入。真实数据覆盖不足可由消费者自有显式测试定义补充，但须明确其作者来源，不混称原版 NPC。
- 示例业务自行持有测试地图的 NPC 放置数组（可先是显式模块/测试数据），在唯一 `onMapEntering` 中异步获取并以 `context.setNPC([...])` 恰好登记一次；不要求 `[group]MapNPC`，也不让 RPGMap 读取游戏业务 Group。至少用两个不同 `instanceId` 复用同一个 `npcId`，核验定义/实例分离。
- 游戏运行时使用 `handler.setNPC([...])` 整批替换，`[]` 清空，`getSnapshot()` 查询；失败不能部分提交，切图后旧异步操作不能污染新场景。静态测试阶段不偷加 `moveNPC`、碰撞规则或默认 NPC 参与 Bridge/Ledge/Transfer。
- 逻辑资源使用公开 Content 的 namespace/key，校验名称、引用、存在性及 PNG 4×4 帧边界；资源失败必须可诊断，不用空贴图静默顶替。

## 5. 素材与生成脚本：两条独立生产线

**真实本地线**：`examples/essentials-v21.1-local/scripts/init-fsdb.mjs` 调用正式 importer、复制用户合法持有的本机 Essentials 资源，并保持 Presentation 复制/同步。目标是现实地图与受许可素材的本地集成；`[FSDB]*` 已被本目录 `.gitignore` 排除。更新 `reimport.bat`/`verify-reimport.mjs`，确保错误时旧库完好且新库的 Map、NPC、资源与版本一致。`play.bat` 仍应经现有 `sync-map-presentation.mjs` 完成编译与散列检查；不为新接口复制一份浏览器渲染实现。

**合成 CI 线**：`examples/essentials-v21.1/scripts/generate-fixtures.mjs` 改为新格式、严格 Schema、原创 4×4 Player/NPC PNG、可复用 NPC 定义/实例、Bridge 和 Ledge 正负例及异常输入；输出应确定性、可清理/再生。若仍需针对旧导入器的回归夹具，可显式保留**版本化旧格式夹具**，但新版消费者夹具不得混入独立 `struct.MapAction`。不得提交真实 Pokémon Essentials 素材、原始压缩包或由受限图像转换得到的衍生资源。

**生产事务**：现有初始化脚本 `--force` 会先删除 `[FSDB]*`；实施时改为 staging → 完成 importer/Schema/资源验证 → 可恢复的替换/切换 → 清理。若本地运行环境无法原子重命名整库，则必须使用备份与失败恢复，至少证明失败后旧库内容及可启动性不变；不能在迁移失败后只留下半份新 FSDB。

## 6. 分阶段实施任务与进入/退出门槛

### PR A：版本化数据协议与原创夹具

- 新 Map/NPC `.info.meta`、校验与内容版本门槛；安全 MapAction→behaviors 映射，旧数据不误判为新版。
- 适配合成 fixture 生成脚本，新增独立负例（opaque、front、重叠、越界、坏 NPC/素材、旧版本）。
- **退出门槛**：确定性生成、严格校验、迁移比对通过；旧 Map/Tileset/Transfer 相关回归没有无意退化。不得以删掉 MapAction 表作为迁移通过的证据。

### PR B：新 Runtime 与单一 Builder/Handler 接线

- `@loomrealm-game/map` 发布目标公开入口；旧 `mapDefinition` 作同一运行核心的兼容适配；让示例 `subsystems/map.mjs` 从重新导出改为真实业务消费者。
- 对齐 `run` 的 Frame 生命周期、`enterMap` 的单次提交、自动 Transfer 的共同装配链、取消/并发/旧场景失败恢复；确保 Input 驱动 Player，Renderer 只是消费投影。
- **退出门槛**：首次/主动/自动进入地图流程一致，失败不破坏已提交场景，事件/快照与 Frame 结果符合执行契约，旧示例基线测试可回归。

### PR C：静态 NPC 与本地真实生成链

- 定义读取/合规 4×4 素材、独立多 NPC 渲染、唯一准备钩子与初始 `context.setNPC`、运行期整批 `handler.setNPC`、只读快照。
- 本地真实 importer 输出新版 Map/NPC（仅可证实数据）；更新 `init-fsdb.mjs` staging、`verify-reimport.mjs`、`reimport.bat`/`play.bat` 提示及资源同步验证。
- **退出门槛**：两个实例复用一份定义，重进重装配、清空/替换、非法资源整批失败、过期请求隔离；真实 FSDB 导入失败不破坏旧库。真实素材测试仅在合法本地源具备时执行，无源则标明 NOT RUN，不能写成 PASS。

### PR D：完整场景回归与后续范围判定

- 使用实际用户持有素材验证 Map66 启动、Map7 运动/Transfer/桥负例、Map21 八 Bridge/四组路径、Map47 Ledge、resize/取消/旧回调防护；检验 Browser 图层与 NPC 静态遮挡。
- 在显式完成 NPC 移动/碰撞设计后，再独立实现对应命令和用例；该工作不是 PR A–C 的必要前置项。
- **退出门槛**：按执行提交 SHA 记录单测、Importer/Schema 测试、真实消费者 Hostra E2E、证据与失败；将产品行为与原版 RGSS 资格分别记录。不得因某项测试 SKIP/NOT RUN 宣称全套验收完成。

## 7. 必测矩阵（测试设计，不是执行结果）

| 场景 | 要观察的断言 | 适用来源 |
| --- | --- | --- |
| 旧 MapAction 迁移 | Map21 动作逐条等价；opaque/front/重叠拒绝；新版 Map 无独立 MapAction 依赖 | 原始证据+合成负例 |
| 基础地图 | Map66 启动、Map7 行走及 Transfer；地图数据/版本合法 | 真实本地+合成 |
| 地形 | Map21 四组 Bridge on/off、Map7 桥负例；Map47 两格 Ledge 与非法落点 | 真实本地+合成定向 |
| 进入主链 | Builder→单次 `onMapEntering`→恰好一次 `context.setNPC`→统一提交→一次 `mapEntered` | 合成自动化+本地 |
| NPC 资源/实例 | 定义 `name`/`sprite` 严格验证；两个实例复用定义；静态 4×4/遮挡 | 原创合成+合法本地 |
| NPC 更新 | 整批替换、空数组清空、某一无效 NPC 时整批失败 | 合成自动化 |
| 生命周期 | 初始/主动/自动切图；Frame 取消；重复 `run`、忙时 `enterMap`、过期 setNPC/钩子、通知抛错、快照一致性 | 合成自动化+本地冒烟 |
| 生成安全 | 非法迁移/资源/版本导致拒绝；重导入失败保留原库；Presentation 同步校验 | 本地脚本自动化 |

## 8. 明确的暂缓项和交付证据

暂缓：NPC `moveNPC`、Player/NPC 碰撞或重叠政策、NPC 参与 Bridge/Ledge/Transfer、全量 Event/Page 自动转换、游戏自有 Group 的公开 `group()` 入口、通用 AI、原版逐帧保真。若产品后续要求这些能力，应分别细化语义和测试，不默默添加到静态测试包或改动已确定的 NPC `name`/`sprite` 两字段。

交付时逐 PR 记录：改动文件与执行 SHA、Schema/版本/迁移样例、生成命令与失败恢复证据、单元测试结果、真实素材是否可用及本地 E2E 结果。`NOT RUN`/`SKIP` 不等于通过；文档设计完成也不等于代码已实现。本计划获选后仍须先完成源码接线审计及测试，再依据真实结果更新完成标记。
