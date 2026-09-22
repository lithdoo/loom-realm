# RPGMap v1：Essentials Local 测试包与 Agent 完整实施计划

> **状态：A–D 已在交付分支实施；离线总入口、既有 M14/M15 回归、真实重导入和恢复故障测试均已执行。** [主方案](./RPG_MAP_GENERIC_MODULE_DESIGN.md) 规定数据与行为；[唯一接口契约](./RPG_MAP_PUBLIC_API_V1_EXECUTION_CONTRACT.md) 规定 Builder、错误、NPC 内部 key、容量、Browser 与 fatal；[闭环状态](./RPG_MAP_V1_FINAL_SCOPE_AND_CLOSURE.md) 规定完成条件。本文只给 Agent 文件、执行顺序和验收证据，不另立 API。

## 1. 范围、角色与边界

- **真实消费者** `examples/essentials-v21.1-local`：由直接 re-export 改为游戏 `SubsystemDefinitionFactory`，在 `frame(frame)` 创建 Builder/Handler、装配 NPC、`return run(initial)`；保留 Hostra ABI、Map66 初始入参和 Presentation 同步，不复制 Runtime。
- **真实 importer** `tools/fixtures/essentials-v21.1`：保留来源取证/Canonical/Oracle；整库生成唯一新版 Map/Tileset/Transfer/NPC。只将固定 v21.1 Map21 八个 Bridge 事件/四组路线作真实整页投影与审计；旧 Event/MapAction 只可作中间证据，最终 FSDB 不输出 `[struct]MapAction`，Runtime 不读取它。其他 Map 必须全量生成、严格 Schema 与资源验证。
- **原创 CI** `examples/essentials-v21.1/scripts/generate-fixtures.mjs`：确定性原创 Map/NPC/4×4 PNG 与正反例，绝不从真实受限素材复制/变换/派生。合法本地真实源及生成 FSDB 保留在 gitignored 位置，不上传仓库、CI、附件或日志。
- **非目标**：全部 Event/Page/Ruby、NPC 自主移动/AI/对话、通用 Entity/Group、跨 Subsystem 操作、第二套 Renderer/Frame、RGSS 帧级等价。不改 Content/Subsystem/Hostra 公共 ABI；私有模块可重构，但不许修改已冻结的业务语义或静默降低校验。

## 2. 文件任务清单

| 路径 | 任务及约束 |
| --- | --- |
| `game-libs/map/src/index.ts`、`runtime.ts`、`semantics.ts`、必要内部模块和 `package.json` | 包根 Builder/Error/类型与默认兼容工厂共享唯一新版 Runtime；Map.behaviors、Bridge/Ledge、统一进入事务、Frame/取消/快照/错误、运动/resize fatal、NPC 静态占格。 |
| `game-libs/map/browser/map.browser.js`、`map.css` 及 Browser 测试 | 单 Player→0/1/N NPC，同级独立 Sprite/CSS、任意静止 pattern、相机/Bridge 层深、资源生命周期和异步可见性；不得破坏旧 Player。 |
| `tools/fixtures/essentials-v21.1/lib/essentials/v21.1/{m14-consumer,map-action-consumer,simple-game-data}.mjs` | 原始 Canonical/Oracle 不被投影污染；Map21 八桥逐事件整页审计，额外 Ruby、动态条件、front/opaque、重叠/越界、操作/坐标不符一律失败。 |
| `tools/fixtures/essentials-v21.1/lib/fsdb/{mapper,plan,writer}.mjs` | 唯一新版 FSDB、严格 Map/NPC `.info.meta`、全地图清单和引用/资源有效性；审查旧 profile 调用者并改测试，不删原始取证能力。 |
| `examples/essentials-v21.1-local/subsystems/map.mjs`、`game.json`、`launch.hostra.json` | 消费正式 Builder/Handler；现有 `characterName`→Builder player，mapId/x/y→MapEntry；不改 Hostra manifest 格式；业务自己持有实例数组，唯一 hook 使用 `context.setNPC`。 |
| `examples/essentials-v21.1-local/scripts/{init-fsdb,verify-reimport,sync-map-presentation}.mjs`、`reimport.bat`、`play.bat` | 在独立 staging 示例根生成唯一 FSDB，复用 `syncMapPresentation({repoRoot,exampleRoot:stageRoot,...})`，完整校验后以固定备份切换；禁止 `--force`，不提供锁或自动崩溃恢复，遗留备份时拒绝并提示人工处理。 |
| `examples/essentials-v21.1/scripts/generate-fixtures.mjs`、相关测试、根 `package.json` | 原创新协议/PNG/恶意反例；新增 `test:rpgmap:v1` 离线总入口；保留并迁移旧 M14/M15 回归断言。 |

NPC 定义严格只有 `name/sprite`，实例放置由业务自行决定，不把全部 Essentials Event 盲目转换为 NPC。现有 `ContentClient` 只有 `record/resource`，不得让 `scope.content.group()` 成为模块依赖。

## 3. 数据生产、staging、最小切换与人工恢复边界

**生成流程：**合法来源读取→保留原始 Oracle→仅 Map21 八桥整页审计/投影→完整新版 FSDB 与严格 `.info.meta`、资源→全地图清单/Schema/引用/Bridge 对照验证→在独立 staging 示例根安装 Presentation→重新验证→正式库切换。任何失败都不可把未验证候选安装为正式库；`contentVersion` 仅为哈希，不用来猜新旧格式。

**具体 staging 接线：**在仓库已 gitignore 的 `.local/` 中建立专用工作区（例如 `.local/essentials-v21.1-reimport/`），其 `staging-example/` 内仅有本次 importer 产出的**一个** `[FSDB]*`，不得放在正式 `examples/essentials-v21.1-local/` 内并列运行。Importer 的 `--output` 指向该 staging 示例根；在该根调用现有 `syncMapPresentation({ repoRoot, exampleRoot: stagingExampleRoot, runBuild: true })`，再 `checkOnly: true` 并运行指向候选根的新版数据核验。该 API 已由 `scripts/sync-map-presentation.mjs` 导出，且要求其 exampleRoot 恰有一个 `[FSDB]*`；**不可在正式示例根放两个库后调用它**，也不可复制 Browser 实现。`--source` 原有下载/本地路径支持仍保留，真实素材与 staging 全部不得纳入 Git。

**切换流程：**先校验 staging 与正式目录在同一文件系统/卷。入口要求用户先退出游戏及其他同步/重导入进程；并发执行不受支持，也不建立 PID/目录锁。候选完整验证后，若存在旧库则把它移到 `.local/essentials-v21.1-reimport/backup.fsdb`，再把候选移入正式根并复验结构、资源哈希及 Presentation；成功才删除备份。正常异常时撤下失败候选并尽力恢复旧库；初次安装失败不制造假备份或假合格库。

**人工恢复边界：**两次 `rename` 之间可能暂时没有正式库，因此不宣称零停机或崩溃原子性。任何入口发现 `backup.fsdb` 都停止，不自动删除、接管或判断新旧优先级；提示用户关闭相关进程，检查正式、候选和备份目录，再将确认过的旧备份移回原名。不存在 `recovery.json`、多阶段 journal、故障注入、锁遗留接管、`recover-reimport.mjs` 或 `--force` 捷径。

Map21 不合规页需诊断 mapId/eventId/pageIndex/原因；不能只提取桥关键词，也不能把其他地图未审计的事件自动写空行为并宣称已审计。固定源以外先重新审计白名单；静态来源推断不等于动态 RGSS 证据。合成 CI 不替代真实测试。

## 4. 已完成的四个实施检查点

A→B→C→D 已在同一开发分支实现。精确运行证据属于最终交付报告；表格保留为覆盖范围，不表示仅凭文档即可判定 PASS。

| 阶段 | 实施 | 独立退出门槛 |
| --- | --- | --- |
| **PR A：新版数据和原创夹具** | 全量唯一 Map/严格 NPC Schema、Map21 八桥整页审计、原创 4×4 PNG、无 MapAction 输出。 | 全库清单完整、确定性；坏页/额外 Ruby/动态/front/opaque/重叠/越界/缺资源拒绝；Oracle 不变。 |
| **PR B：Runtime 统一入口** | Builder/Error/类型及兼容工厂、首次/主动/自动统一准备、唯一 hook 骨架与空 NPC、Frame/取消/方向/错误/快照、投影预检及 fatal。 | `run` 不提前结束、预提交失败保旧、自动失败可观察、重复/忙碌拒绝、迟到结果不提交，首次/切图/运动/Bridge/resize Domain 故障 fail-stop；零 NPC 回归。 |
| **PR C：NPC 与本地消费者** | 两入口整批 NPC、pattern/阻挡、多 Sprite、唯一内部 key 分配器、候选容量预检、local 消费者，以及 staging/最小备份切换。 | 同一 ID 原地更新 key 保留、清空后重新加入/跨图不复用；0/1/N、容量合法边界与超限前拒绝、无 Domain 调用且旧 NPC 可用；walk/Ledge/Contact/Step/Edge、图片深度/相机/清理；正常异常恢复旧库，遗留备份拒绝并人工处理。 |
| **PR D：总回归与证据** | 离线命令、M14/M15 断言迁移、原创 CI、Browser 实际显示、合法真实本地 Hostra E2E。 | 自动化结果按实际退出码报告；Map66/7/21/47、NPC 可见/交互及备份切换有证据。缺环境真实项写 NOT RUN。 |

## 5. 测试入口、外部条件和报告

根 `package.json` 已提供 `npm run test:rpgmap:v1`，作为离线、非交互、失败退出非零的串行聚合：包括 Map build/协议与 Runtime 单测、importer 原创样本、合成生成/验证、Browser Playwright 0/1/N、Frame/Hostra 模拟纵向、M14/M15 回归以及 RenderManager 容量/节点生命周期测试。它不依赖受限真实素材或临时人工输入。

最终验证分别运行 `npm run build:m14`、`npm run test:m14:pr`、`npm run test:m15:pr`、`npm run test:rpgmap:v1` 与 `npm pack -w @loomrealm-game/map --dry-run`，检查 JS 和 `.d.ts` 导出。旧 MapAction 测试已迁移为嵌入 `Map.behaviors` 的业务断言。真实本地测试独立于离线聚合：仅在合法 v21.1 源、Hostra、Electron/浏览器可用时运行；缺少条件则准确记 `NOT RUN`。

**必测矩阵：**全图新版/严格 schema/Map21 八桥四路线、Map66 启动、Map7 Transfer、Map47 Ledge；默认/显式 NPC pattern、同定义多实例、NPC 阻 walk/跳跃落点、Contact 优先/Step 被挡/Edge 原样；首次/切图/清空/重入、`getSnapshot` 代次、异步钩子取消；Renderer key 永不复活与容量边界；Domain 抛错 fatal。Browser 图像失败可观察、资源清理且无残影；staging 恰一 FSDB、正常切换/回滚、遗留备份拒绝、无旧库初装失败。

**证据格式**：各阶段记录 commit SHA、环境/Node 版本、精确命令、退出码、测试数及故障注入；每项明确 `PASS`/`FAIL`/`NOT RUN` 与缺失原因，不得 SKIP 当 PASS。**完整产品闭环**仅在离线门槛 PASS、合法真实 Hostra E2E PASS、Browser 显示及 FSDB 恢复实证均齐备后宣布；缺素材可如实报告“代码完成／离线验收通过／真实本地 NOT RUN”。文档冻结不等于实现或测试已通过。
