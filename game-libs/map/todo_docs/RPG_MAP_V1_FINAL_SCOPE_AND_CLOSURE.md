# RPGMap v1：统一设计闭环与交付状态

> **2026-09-22：v1 业务、公开接口与结构收敛已经实现。** 本文记录范围与完成判据，不替代最终提交上的测试报告；合法真实本地 E2E 是否完成必须按实际环境单独陈述。

## 一、唯一权威与阅读顺序

1. [主方案](./RPG_MAP_GENERIC_MODULE_DESIGN.md)：唯一新版 Map、固定 Map21 Bridge、Ledge、NPC 定义与运动/传送业务顺序。
2. [对外接口执行契约](./RPG_MAP_PUBLIC_API_V1_EXECUTION_CONTRACT.md)：**唯一** Builder/Handler/Error/type、默认方向、事务/取消/fatal、NPC 内部 RenderNode key、容量预检查及 Browser 多 Sprite 合同。
3. [Essentials Local 实施及测试包说明](./RPG_MAP_ESSENTIALS_LOCAL_TEST_PACKAGE_MIGRATION_PLAN.md)：A→B→C→D 文件/命令/证据；独立 staging、Presentation 同步、最小备份切换和人工恢复边界。
4. [README](./README.md)：导航。旧 MapAction 运行兼容、非挡路 NPC、旧版重复 API 仅在 Git 历史，不是当前并列规范。

## 二、已冻结范围与整体框架边界

- 整库生成并严格验证**唯一新版 Map**；Runtime 不读取独立 MapAction，不引入新旧格式开关。真实 Bridge 仅审计/转换固定 Essentials v21.1 Map21 八事件和四组路线；全部其他图仍须生成并验证。Map7/47 分别验证 Transfer/Ledge。
- 静态 NPC 定义仅 name/sprite；业务决定 `instanceId/npcId/坐标/direction/pattern`，pattern 缺省/null 为 0。NPC 单格阻挡 Player，不互相重叠或撞 Player；`setNPC` 整批替换，运动期 busy。NPC 自行移动、AI/对话不在 v1。
- Contact 在当前格命中时先于前方 NPC；合法运动终点 NPC 可阻止 Step/Bridge，成功到达 Step 先于 Bridge；Edge 仍按原越界规则。
- Builder 仅使用现有 `SubsystemScope`/`Frame`，Content 仅用 `record/resource`，Renderer 仅用现有 `RenderDomainState`/`replace/update`，Hostra manifest/Frame ABI 不变；不增加 Group、Entity、第二套 Runtime/Frame 或渲染公共 API。
- Runtime 完成准备后先同步提交 Domain，再发布 `mapEntered`；准备失败保旧，无法证明回滚的 Domain 命令异常则 fatal。Browser 解码及真实可见性是独立异步 E2E，不被 `mapEntered` 证明。

**本次框架一致性审查已收口的三项阻塞：**① RenderManager 同域**不允许复用已删除节点 key**，因此 NPC 原始 instanceId 与内部节点 key 解耦，仍存活者保键、删除后再加入及跨图分配未用短 serial，序号不因清空/切图重置；② 提交前检查节点 key（128 UTF-8 字节）、整棵树节点数（16,384，包含 View/Player）、单 data（262,144 字节）、整体消息（1,048,576 字节）等现有 RenderManager/协议限制，超限在 Domain 前拒绝并保持旧事实，禁止用真实 replace 试错；③ 本地重导入在 gitignored `.local` 的**独立候选示例根**生成并使用 `syncMapPresentation`，验证后通过固定 `backup.fsdb` 最小切换；预存备份时拒绝并提示人工恢复，不维护恢复记录、锁或自动接管。完整规则与测试分别只在上述接口契约和实施说明维护。

## 三、Agent 授权范围与产品完成判据

一个 Agent 可以在**同一工作分支**按 A→B→C→D 连续实施，但每阶段须有独立构建/测试/故障注入结果；不能删除断言或跳过失败，更不能静默修改框架 ABI。私有模块组织可自由选择；如果实际源码揭示新的硬冲突，先提交可复核证据、修订唯一权威和相应测试，再继续，不把猜测称为冻结事实。

根 `npm run test:rpgmap:v1` 离线总入口已经存在，M14/M15 回归及 JS/类型导出已纳入最终核对。交付仍须记录 SHA、命令、退出码、环境、PASS/FAIL/NOT RUN；Renderer key 清空后恢复、边界容量失败前不调用 Domain、正式 FSDB 正常失败回滚、遗留备份拒绝与 Browser 实际显示均需证据。真实 v21.1 合法源、Hostra、Electron/浏览器不齐则真实 E2E 为 NOT RUN。

**当前状态：A–D 与减法收敛已在同一交付分支完成。** `npm run test:rpgmap:v1` 为离线总入口，并迁移核对既有 M14/M15 回归；后续仍不包含全部 Event/Page、NPC AI/移动、跨 Subsystem API、原版逐帧保真。具体测试是否通过以最终交付报告为准。
