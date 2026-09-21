# RPGMap v1：统一设计闭环与交付状态

> **修订日期：2026-09-22。v1 业务范围、公开接口与工程接线决策已作为 Agent 实施基线冻结；代码实现、总验收及真实本地 E2E 仍未因文档更新而完成。** “设计闭环”不等于“一次提交必定通过”或“产品闭环”。

## 一、唯一权威与阅读顺序

1. [通用化主方案](./RPG_MAP_GENERIC_MODULE_DESIGN.md)：模块职责、唯一 Map 格式、Map21 Bridge、Ledge、NPC 最小定义及移动/传送规则。
2. [对外接口执行契约](./RPG_MAP_PUBLIC_API_V1_EXECUTION_CONTRACT.md)：**唯一公开签名及 Builder 导出、默认方向、错误码、诊断、生命周期、NPC、Browser 多 Sprite 内部接线与 RenderDomain 失败合同**。实际导出必须按它实现，不能在不同文档另开第二种 API。
3. [Essentials Local 与 Agent 实施计划](./RPG_MAP_ESSENTIALS_LOCAL_TEST_PACKAGE_MIGRATION_PLAN.md)：文件清单、A→B→C→D 检查点、计划新增总验收命令、现有回归命令、环境准入及 PASS/FAIL/NOT RUN 证据。
4. [阅读索引](./README.md)：入口与状态。早期不同版本的草案只保存在 Git 历史，不是并列规范。

## 二、已冻结的第一版产品范围

- **只有一套新版 Map**：脚本整库生成/验证，不共存旧数据、Runtime 不读取独立 MapAction，不加迁移判别开关；Bridge 显式写 `behaviors`，Ledge 由 terrain tag 隐式判定。
- 固定 Essentials v21.1 的**真实 Bridge 仅定向转换/验收 Map21 八事件、四组路线**。整页确认、异常失败；其余所有地图仍需完整生成并通过 Schema/资源检查；Map7/47 分别验证 Transfer/Ledge。
- **静态 NPC**：定义只有 name/sprite，实例独立、1×1 挡 Player、不能同格/撞出生点；`direction + pattern` 指定 4×4 显示帧，缺省/null pattern 为 0；运行期 `setNPC` 整批替换，运动中 busy。没有 NPC 自主行走、AI/对话。
- **切图与失败**：当前格 Contact 先于前方 NPC 检查，成功移动目标 NPC 阻挡时无 Step/Bridge；成功到达 Step 先于 Bridge；Edge 按越界原规则。准备失败旧场景有效；RenderDomain 提交异常无法证明无副作用则 fatal、关闭和失效所有命令。取消及时结束且旧结果不提交。
- **呈现含义**：同步 Domain 命令被接受后可发 `mapEntered`，不等于 Browser 实际绘制已完成；多 Sprite、静态非零 pattern、相机/层深及异步显示失败都必须有 Browser E2E 证据。

## 三、Agent 执行许可与验收边界

同一个 Agent **可以连续执行 A→B→C→D**，但必须用独立检查点证明代码、内容生成、浏览器与测试包分别成立；不得跳过失败、静默修改冻结业务语义或因为缺真实素材就伪称通过。需要变更公共 ABI/冻结行为时，先给出源码证据、修改唯一权威契约与相应测试，再实现；普通内部模块组织和私有算法不必重新讨论。

Agent 应先记录基线 SHA/现有测试，按阶段交付，最后实现并运行根 `npm run test:rpgmap:v1` **计划命令**，适配并核对已有 M14/M15 回归；该新命令目前尚未写入 `package.json`。测试记录必须包含 SHA、精确命令、退出码、PASS/FAIL/NOT RUN。真实 Essentials 资源、Hostra、Electron 及浏览器环境存在时才可报告本地 E2E PASS；缺一项则该项 NOT RUN，不能算作完整产品闭环。

**设计状态：已冻结为实施基线。产品状态：PR A–D 源码/脚本/测试尚需实施并提供独立证据。** 本轮文档优化不涉及运行时代码、FSDB 生成器或测试执行，不能提前写“全部通过”。后续范围不包括通用事件/Ruby、NPC 自主运动、全量原版 NPC、跨 Subsystem API 或 RGSS 帧级保真。
