# RPGMap v1：Essentials Local 测试包与生成脚本实施计划

> 状态：**范围与验收契约确定，代码未实施／未运行测试**。2026-09-21 整合修订。数据与行为以 [主方案](./RPG_MAP_GENERIC_MODULE_DESIGN.md) 为准；公开签名、移动和提交失败以 [接口契约](./RPG_MAP_PUBLIC_API_V1_EXECUTION_CONTRACT.md) 为准；[闭环状态](./RPG_MAP_V1_FINAL_SCOPE_AND_CLOSURE.md)。本文件只描述任务、文件和证据，避免重复定义接口。

## 1. 三个不同的角色

- **真实本地消费者** `examples/essentials-v21.1-local`：通过 Builder/Handler 装配地图与静态 NPC，使用用户合法持有的 Essentials v21.1 地图和素材；`[FSDB]*` gitignored，不上传真实资源或原始地图。
- **真实数据 importer** `tools/fixtures/essentials-v21.1`：完整提取来源事实，生成统一新版 FSDB；旧 Event/MapAction 只是内部证据，实际输出没有 `[struct]MapAction`。真正 Bridge 转换只针对固定来源的 Map21 八事件，其他地图仍全部按新版 Map Schema 产出、检查清单完整；不得在旧 FSDB 逐张原地修补。
- **原创可提交 CI fixture** `examples/essentials-v21.1/scripts/generate-fixtures.mjs`：产出可再生的严格 Map/NPC、4×4 原创角色图片和各类正负例；与真实素材和原版动态证据分开，不依赖真实受限内容。

## 2. 现有文件与改造任务

| 文件 | 目标 |
| --- | --- |
| `examples/essentials-v21.1-local/subsystems/map.mjs` | 从直接 re-export `@loomrealm-game/map` 改为业务 `SubsystemDefinitionFactory`，在 frame 中装配 `RPGMapBuilder`、注册钩子并 `run`；不复制 Runtime 实现。 |
| `examples/essentials-v21.1-local/game.json` / `launch.hostra.json` | 保持 Hostra ABI 和 Map66 初始入口，业务边界拆开 player 素材与 MapEntry；以实际已核验宿主入参适配，不硬改 Hostra 格式。 |
| `tools/fixtures/essentials-v21.1/lib/essentials/v21.1/m14-consumer.mjs`、`map-action-consumer.mjs`、`simple-game-data.mjs` | 原始 Map/MapAction 来源分类仍作取证；consumer projection 针对 Map21 八个 Bridge 整页验证并合并入新版 Map；不可污染 Canonical/Oracle 来源记录，也不可默认全图库通用转换已获证明。 |
| `tools/fixtures/essentials-v21.1/lib/fsdb/mapper.mjs`、`plan.mjs`、`writer.mjs` | 只输出统一新版 Map、Tileset、Transfer、NPC 与严格 `.info.meta`；检查清单、记录及资源完整，输出不再包含 MapAction。审核 importer 的旧调用者，不在原始来源统计中谎称新版格式是源事实。 |
| `examples/essentials-v21.1-local/scripts/init-fsdb.mjs` | 先 staging 生成、加 Presentation、验证，再恢复安全地替换原 `[FSDB]*`；失败保留旧库。禁止当前先删除旧库再尝试生成的窗口。 |
| `examples/essentials-v21.1-local/scripts/verify-reimport.mjs`、`reimport.bat`、`play.bat` | 检查新版 Map/NPC Schema、Map21 行为、Tile terrain_tags、完整资源和 Presentation 一致性，更新旧 MapAction 检查与提示；继续使用已有 sync-map-presentation，不复制 Browser 逻辑。 |
| `examples/essentials-v21.1/scripts/generate-fixtures.mjs` | 输出原创严格新格式、无 MapAction、4×4 NPC 合成资源、两实例同定义、NPC 静态挡路/图片帧与非法输入 fixtures；保留生成确定性。 |

`[struct]NPC` 只有 `name` 和 `sprite`，实例放置由示例自己的数组/仓储提供，唯一 `onMapEntering` 使用 `context.setNPC`；无 `[group]MapNPC` 强制约束。不自动把 Essentials 全部 Event/Page 转成 NPC，不从不可靠的名称或素材推测出原版 NPC。`handler.setNPC` 负责运行时整批替换／清空、`getSnapshot` 验证结果。

## 3. 数据生产安全准则

生成全部地图 → 校验预期清单与唯一 ID → 检查 Map/Tileset/Transfer/NPC `.info.meta` 和内容资源 → Map21 八 Bridge 事件整页与四组路线的定向对照 → 验证整个生成 FSDB → staging 安装 Presentation → 再验证 → 可恢复地切换目标目录。任何一步失败均拒绝交付、原有 FSDB 保持可用；不能把未生成地图默认为空行为，也不能以 tag15 猜 Map21 桥入口。`contentVersion` 为内容哈希，不引入新旧地图双格式/version gate；新 Runtime 只读新 Map，`behaviors` 缺省即无显式行为。必须为缺资源、坏 schema、Map21 多余 Ruby/opaque/front、数量或坐标不符、重复区域、生成中断及替换失败建立诊断和故障注入测试。

真实图片的使用和安装限合法本地来源；仓库仅存原创合成数据、结构化证据、摘要和复现命令。生成可恢复替换如无单一原子 rename，需 staging+备份+故障恢复，并提供失败后旧库可读/可启动证据；不承诺不可验证的跨平台原子性。

## 4. PR 划分与独立退出门槛

| 阶段 | 交付 | 退出条件 |
| --- | --- | --- |
| **PR A：新版内容与合成样本** | 全库一次生成的唯一 Map Schema、NPC 严格定义、Map21 八 Bridge 整页转换、原创 4×4 图片；不输出 MapAction。 | 全库结构与来源清单完整；正例/非法脚本/opaque/front/重叠/越界/坏资源失败准确；合成结果确定性，原来源 Oracle 不被 consumer projection 污染。 |
| **PR B：统一运行与进入骨架** | Builder/Handler 导出、旧 `mapDefinition` 适配单一新 Runtime；首次/主动/自动进入统一准备、**本阶段实现唯一 `onMapEntering` 骨架**、空 NPC 场景、取消/提交/事件/快照/错误。 | 首次进入后 run 持续；主动预提交失败保留旧场景；重复进入 busy；取消迟到回调不提交；RenderDomain 异常 fatal；自动 Transfer 错误可观测。没有 NPC 定义或非空实例也能独立验收空场景主链。 |
| **PR C：静态 NPC 与本地示例** | struct.NPC 解析、4×4 多角色、可选 pattern 默认 0、1×1 占格挡 Player、初始/运行期整批 setNPC、快照、游戏消费者接线、本地 importer staging/复核脚本。 | 两实例共用定义、不同帧、walk 与 Ledge 落点被阻、当前格 Contact/前方 NPC 与 Step NPC/Edge 的顺序、出生/同格/重复身份拒绝、运动期 busy、空集清除/坏输入原集不变、切图代次隔离、故障注入保旧 FSDB。 |
| **PR D：回归与证据** | 合成 CI、合法本地 Hostra E2E、浏览器 4×4 显示、层深、resize、各种失败注入及实际结果。 | Map66 启动、Map7 走路/Transfer、Map21 八桥四路线、Map47 Ledge、NPC 阻挡及图像帧、完整生命周期结果；记录准确 commit SHA/命令/断言/失败；无本地源标记 NOT RUN，禁止将 SKIP 当 PASS。 |

## 5. 必测矩阵（当前是测试设计，不是 PASS）

| 主题 | 断言 |
| --- | --- |
| 输出数据 | 全地图只有新版协议，严格 schema/资源；无 MapAction 表；Map21 恰八确认动作且四组路线；非法事件整次失败；失败旧库不丢。 |
| 普通地形 | Map66 初始；Map7 行走及 Transfer；Map47 两格 Ledge，非法落点 blocked；Map21 on/off 及去重、传送优先。 |
| NPC 显示 | 4×4 图按 direction 行、pattern 列；缺省/null 为 0；非法 pattern、图像错误拒绝；Browser 可实际显示且遮挡正确。 |
| NPC 占格 | 两 NPC 同格、重 ID、与 Player/出生重叠全批拒绝；walk 和跳崖落点阻挡；跳跃中格不拦；Step 触发格站 NPC 不传送，Contact 由当前格命中先传送，Edge 不因 NPC 受阻误触发。 |
| 接口链 | 唯一 entering hook 恰一次 setNPC、进入成功后 mapEntered 恰一次、run 不提前结束、getSnapshot 在首次前/准备中/成功后/预提交失败后/终止后正确。 |
| 错误与回滚边界 | 预提交失败保旧场景；不可证明回滚的 RenderDomain 提交异常令 Frame failed、关闭所有入口，不声称旧地图可玩；单个 mapEntered 监听器抛错不反转成功；取消迟到回调/资源无残留。 |
| 真实素材 | 只有取得合法本地源时执行，记录来源与结果；没有源就是 NOT RUN，不把合成代替原版动态证据。 |

**不在 v1：**NPC 自主移动/完整 NPC 碰撞、对话、AI、全部 Event/Page、跨 Subsystem NPC 控制或原版 RGSS 帧级保真。文档审查通过不等于上述任务完成；逐 PR 交付证据齐备后才能报告**产品闭环**。
