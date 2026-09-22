# RPGMap v1：统一设计闭环与交付状态

> **2026-09-22：第一版业务行为、公开接口及已知框架约束已整合为 Agent 实施冻结基线；源码、总验收和合法真实本地 E2E 尚待交付。** 设计冻结≠代码已存在≠产品闭环，更不意味着一次提交无需检查即可通过。

## 一、唯一权威与阅读顺序

1. [主方案](./RPG_MAP_GENERIC_MODULE_DESIGN.md)：唯一新版 Map、固定 Map21 Bridge、Ledge、NPC 定义与运动/传送业务顺序。
2. [对外接口执行契约](./RPG_MAP_PUBLIC_API_V1_EXECUTION_CONTRACT.md)：**唯一** Builder/Handler/Error/type、默认方向、事务/取消/fatal、NPC 内部 RenderNode key、容量预检查及 Browser 多 Sprite 合同。
3. [Agent 实施及测试包计划](./RPG_MAP_ESSENTIALS_LOCAL_TEST_PACKAGE_MIGRATION_PLAN.md)：A→B→C→D 文件/命令/证据；独立 staging、现有 Presentation 同步、备份与中断恢复。
4. [README](./README.md)：导航。旧 MapAction 运行兼容、非挡路 NPC、旧版重复 API 仅在 Git 历史，不是当前并列规范。

## 二、已冻结范围与整体框架边界

- 整库生成并严格验证**唯一新版 Map**；Runtime 不读取独立 MapAction，不引入新旧格式开关。真实 Bridge 仅审计/转换固定 Essentials v21.1 Map21 八事件和四组路线；全部其他图仍须生成并验证。Map7/47 分别验证 Transfer/Ledge。
- 静态 NPC 定义仅 name/sprite；业务决定 `instanceId/npcId/坐标/direction/pattern`，pattern 缺省/null 为 0。NPC 单格阻挡 Player，不互相重叠或撞 Player；`setNPC` 整批替换，运动期 busy。NPC 自行移动、AI/对话不在 v1。
- Contact 在当前格命中时先于前方 NPC；合法运动终点 NPC 可阻止 Step/Bridge，成功到达 Step 先于 Bridge；Edge 仍按原越界规则。
- Builder 仅使用现有 `SubsystemScope`/`Frame`，Content 仅用 `record/resource`，Renderer 仅用现有 `RenderDomainState`/`replace/update`，Hostra manifest/Frame ABI 不变；不增加 Group、Entity、第二套 Runtime/Frame 或渲染公共 API。
- Runtime 完成准备后先同步提交 Domain，再发布 `mapEntered`；准备失败保旧，无法证明回滚的 Domain 命令异常则 fatal。Browser 解码及真实可见性是独立异步 E2E，不被 `mapEntered` 证明。

**本次框架一致性审查已收口的三项阻塞：**① RenderManager 同域**不允许复用已删除节点 key**，因此 NPC 原始 instanceId 与内部节点 key 解耦，仍存活者保键、删除后再加入及跨图分配未用短 serial，序号不因清空/切图重置；② 提交前检查节点 key（128 UTF-8 字节）、整棵树节点数（16,384，包含 View/Player）、单 data（262,144 字节）、整体消息（1,048,576 字节）等现有 RenderManager/协议限制，超限在 Domain 前拒绝并保持旧事实，禁止用真实 replace 试错；③ 本地重导入在 gitignored `.local` 的**独立候选示例根**生成并使用现有 `syncMapPresentation`，验证后带备份与恢复记录切换，禁止在正式目录并排两份 FSDB 或 `--force` 预删旧库。完整规则与测试分别只在上述接口契约和实施计划维护，不在本文复制算法。

## 三、Agent 授权范围与产品完成判据

一个 Agent 可以在**同一工作分支**按 A→B→C→D 连续实施，但每阶段须有独立构建/测试/故障注入结果；不能删除断言或跳过失败，更不能静默修改框架 ABI。私有模块组织可自由选择；如果实际源码揭示新的硬冲突，先提交可复核证据、修订唯一权威和相应测试，再继续，不把猜测称为冻结事实。

实施时需新建根 `npm run test:rpgmap:v1` 离线总入口（**目前不存在**），并迁移/核对已有 M14/M15 回归及 JS/类型导出。记录 SHA、命令、退出码、环境、PASS/FAIL/NOT RUN；Renderer key 清空后恢复、边界容量失败前不调用 Domain、正式 FSDB 失败/崩溃恢复与 Browser 实际显示都是强制证据。真实 v21.1 合法源、Hostra、Electron/浏览器不齐则真实 E2E 为 NOT RUN，**不能宣布完整产品闭环**。

**当前状态：PR A–D 已在同一交付分支完成，源码、脚本、公开包、合成/真实数据及故障恢复均已验证。** `npm run test:rpgmap:v1` 为离线总入口，并迁移核对既有 M14/M15 回归；后续仍不包含全部 Event/Page、NPC AI/移动、跨 Subsystem API、原版逐帧保真。
