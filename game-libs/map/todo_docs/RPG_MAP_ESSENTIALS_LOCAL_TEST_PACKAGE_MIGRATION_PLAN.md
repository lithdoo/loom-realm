# RPGMap v1：Essentials Local 测试包与 Agent 完整实施计划

> **状态：实施任务与验收规则冻结；代码及测试尚未依据本方案完成。** 内容/行为以 [主方案](./RPG_MAP_GENERIC_MODULE_DESIGN.md) 为准；唯一公开接口、方向默认、错误码、Browser 多 Sprite 合同和提交 fatal 以 [接口执行契约](./RPG_MAP_PUBLIC_API_V1_EXECUTION_CONTRACT.md) 为准；[闭环状态](./RPG_MAP_V1_FINAL_SCOPE_AND_CLOSURE.md)。本文提供 Agent 可执行顺序、文件范围、命令与证据，不另定义相反的 API。

## 1. 范围、角色与不可跨越的约束

- **真实消费者：**`examples/essentials-v21.1-local` 从旧包直接重新导出改为游戏自有 `SubsystemDefinitionFactory`，在 `frame(frame)` 中装配 Builder/Handler、准备 NPC、`return run(initial)`。继续使用现有 Hostra ABI、Map66 起始配置和 Presentation 同步；不得复制一套 Map Runtime。
- **真实数据生产：**`tools/fixtures/essentials-v21.1` 保留原始取证/Canonical/Oracle，完整生成单一新版 Map/Tileset/Transfer/NPC。只对固定 Essentials v21.1 的 Map21 八个 Bridge 事件/四组路径做真实脚本整页转换与等价比对；其他地图照常全量生成并严格验证。旧 MapAction 可作生成中间证据，最终 FSDB 不输出它，Runtime 不读取它。
- **原创自动化：**`examples/essentials-v21.1/scripts/generate-fixtures.mjs` 生成确定性的原创 Map/NPC、4×4 PNG 和正反案例；不从真实受限图像复制、变换或派生资源。真实源、FSDB 和任何受限事件/素材保留在 gitignored 的本地，不提交仓库或 CI。
- **范围边界：**交付静态阻挡 NPC、任意方向及 0–3 静止 pattern、地图切换/Bridge/Ledge。不要扩展通用 Event/Page/Ruby、NPC 移动/AI/对话、Game Group API、跨 Subsystem 控制、第二个 Renderer/Frame。Agent 可自由重构私有模块，但不能更改已冻结的业务语义、Content/Subsystem/Hostra ABI 或隐藏未通过的测试。

## 2. 文件工作清单

| 路径 | 实施要点 |
| --- | --- |
| `game-libs/map/src/index.ts`、`runtime.ts`、`semantics.ts`、新增必要的内部模块及 `package.json` 导出/测试 | 包根具名 Builder/Error/类型、默认兼容工厂同一 Runtime；新版 Map.behaviors、Map21 Bridge/Ledge、唯一进入事务、错误/取消、快照、运动/resize fatal、静态 NPC 装配与挡路。 |
| `game-libs/map/browser/map.browser.js`、`map.css`、现有 Browser 测试 | 现有只允许一位 Player 且静止 pattern=0 的实现改为 Player+多个同级 NPC；独立 CSS 位置/深度、足部锚点、相机运动、资源清理和可见性故障注入；原 Player 回归不得退化。 |
| `tools/fixtures/essentials-v21.1/lib/essentials/v21.1/m14-consumer.mjs`、`map-action-consumer.mjs`、`simple-game-data.mjs` | 原始输入/Oracle 与 consumer projection 分离；Map21 八事件**整页**安全映射，拒绝附加 Ruby、动态条件、front/opaque、重叠、越界和操作/数量/位置不符；不将原始动态证明伪装成静态证明。 |
| `tools/fixtures/essentials-v21.1/lib/fsdb/mapper.mjs`、`plan.mjs`、`writer.mjs` | 严格 Map/NPC `.info.meta`，完整清单与资源完整性；只写单一新版 FSDB；审查并调整旧输出 profile 的其他既有调用者，保持原始来源对照功能。 |
| `examples/essentials-v21.1-local/subsystems/map.mjs`、`game.json`、`launch.hostra.json` | 使用正式 Builder/Handler 消费，旧 Hostra 输入的 `characterName` 转为 Builder player，mapId/x/y 转为 MapEntry；保留 manifest ABI、Map66 冒烟。游戏持有显式 NPC 放置数组，`context.setNPC` 注册一次，不强制 Group。 |
| `examples/essentials-v21.1-local/scripts/init-fsdb.mjs`、`verify-reimport.mjs`、`sync-map-presentation.mjs`、`reimport.bat`、`play.bat` | staging 完整生成→Schema/资源/Presentation 验证→可恢复替换；取消先删旧库窗口，注入中断证明旧库完整；验证不再要求独立 MapAction。继续复用 Presentation 同步，不新建 Browser 实现。 |
| `examples/essentials-v21.1/scripts/generate-fixtures.mjs` 及其测试、根 `package.json`、Map/fixture/vertical/Browser 测试 | 合成严谨新协议、静态 NPC 同定义多实例与原创新图、校验负例；添加一条 v1 总验收命令、保留旧 M14/M15 回归而不是删除断言来获得绿灯。 |

NPC 定义严格只有 `name/sprite`；实例放置由消费者自有数据传入两种 `setNPC`，不自动把全部 Essentials Event 转成 NPC。`ContentClient` 当前只有 `record/resource`，不能依赖尚未提供的 `scope.content.group()`；若业务需要读 Group，自行解决且不使其成为本模块前置依赖。

## 3. 数据生成和失败恢复顺序

从合法原始来源提取→保留 Oracle 原始事实→针对 Map21 八事件整页审计/投影→生成全部新版 Map、NPC、Transfer、Tileset、资源及真实 `.info.meta`→验证全部地图清单、Schema、资源、Bridge 数量/操作/坐标和清单一致→在 staging 内写 Presentation 并验证→再切换安装目录。**任何验证错误都不能替换原有 FSDB。** 若跨目录重命名无法证明为原子操作，使用备份/恢复；故障注入覆盖验证、拷贝及切换中断，确认旧库可读且可启动。不得以 Content `contentVersion`（内容哈希）造新旧格式标记；本轮只产新版，不输出 MapAction 表。

Map21 的不合规页需给出 mapId/eventId/pageIndex/原因；不可仅凭桥关键字抽取，不能在附加 Ruby、动态条件、front、opaque 或未确认事件上静默降级。新增来源语料不在此次白名单的真实性结论内，先重新审计再支持；其他地图仍需确保全量生成、有效 Schema，而非宣称它们都经过桥脚本动态等价验证。真实素材只在本地合法使用；合成 CI 不能冒充原版 RGSS 运行证据。

## 4. 一个 Agent 可以连续实施，但必须有四个独立验收检查点

**执行方式：**从本次文档提交所指定的 main 基线建立同一工作分支，先记录 `git rev-parse HEAD`、原有构建和回归结果；依 A→B→C→D 进行，可由同一 Agent 连续完成，也可按阶段提交多个可审查 commit。每一阶段失败时停在该阶段修复，不可跳过阻塞、用假数据当真实素材、不经测试一次性宣布 PASS。不要为赶进度修改冻结契约；如确实遇到与现有 ABI 不能共存的事实，先在代码审查证据中说明并修订唯一权威，再实施。

| 阶段 | 实施 | 独立退出门槛 |
| --- | --- | --- |
| **PR A：新版数据+原创夹具** | 全量新版 Map/严格 `.info.meta`、Map21 八 Bridge 的整页审计、原创 4×4 NPC PNG/合成数据、无 MapAction 输出。 | 清单完整、输出确定性，坏页/动态条件/额外 Ruby/front/opaque/重叠/越界/缺资源全部拒绝；Oracle 不被修改。 |
| **PR B：Runtime 统一入口** | 包根导出 Builder/Error/类型与同一 Runtime 兼容入口；首次、主动、自动进入共用链；本阶段实现唯一 hook 骨架，无 NPC 时 `[]` 可独立使用；方向默认、Frame、取消、错误码、诊断和快照。 | 首次进入后 `run` 仍存续；主动预提交失败保旧，自动失败可见，重复/并发拒绝；取消迟到回调不提交，首次/切图/运动/Bridge/resize 的 Domain 异常全部 fail-stop；无 NPC 场景回归。 |
| **PR C：NPC+本地消费者** | 严格 struct.NPC、两入口整批替换、pattern、1×1 阻挡和冲突、Browser 多 Sprite；改 local `map.mjs`；真实生成 staging/重导入安全。 | 两实例共用定义及不同 pattern 可见；静态 NPC 跟随相机/Bridge 正确遮挡，移除无残影；walk/Ledge 被挡，Contact/Step/Edge 顺序，重叠/出生/非法图集拒绝，运动 busy/失效隔离；失败旧 FSDB 完整。 |
| **PR D：总回归与证据** | 新总验收命令，旧 M14/M15 受影响测试同步迁移；原创自动化、Browser 实际渲染、合法本地 Hostra E2E 与失败注入。 | 所有强制自动化 PASS；Map66、Map7、Map21、Map47 与 NPC 真实本地测试有证据；缺环境则明示 NOT RUN 且不能宣布完整产品闭环。 |

## 5. 必须建立的总验收入口与现有命令

根 `package.json` **计划新增** `npm run test:rpgmap:v1`（截至本文件修订，该命令**尚不存在，严禁声称已经可执行**）。实施后，它必须作为离线可复现、非交互式、失败退出码非零的聚合入口，至少串行覆盖 Map build、Map 新协议/运行时单测、真实 importer 对原创样本的测试、合成 fixture 生成/验证、Browser Playwright 多 Sprite、Frame/Hostra 模拟纵向测试及此前受影响的 M14/M15 回归。禁止只 echo PASS 或让内层失败被 shell 吞掉；准确列出其 `package.json` 子命令。可按现有仓库结构编排小脚本，但不要让这条离线命令依赖第三方受限素材或要求用户临时输入路径。

现有可检查入口（**名称已在根 `package.json` 存在，并非此次已执行**）：`npm run build:m14`、`npm run test:m14:pr`、`npm run test:m15:pr`、`npm run test:m14:essentials-local`。Agent 实施时应保留并适配旧测试中的 MapAction 预期，按真实业务行为迁移断言，不删掉整个旧测试来规避失败；最后核对 `npm pack -w @loomrealm-game/map --dry-run` 的包根 JS/类型导出。对 `test:m15:pr` 或其他环境依赖命令，若缺前置条件明确记录 NOT RUN 和原因；没有跑完不可记 PASS。

真实本地验收与离线命令**独立**：取得合法 Essentials v21.1 本地源、可用 Hostra + Electron/浏览器及相应工具后，运行 `examples/essentials-v21.1-local/reimport.bat`（或已适配的同等 Node 入口）、`verify-reimport.mjs`、`play.bat`；另可使用适配后的 `npm run test:m14:essentials-local -- --source <本地源> --map-id 66 --x 8 --y 7 --character-name trainer_POKEMONTRAINER_Red`。这些仅是计划使用的入口，实际参数须与提交后的 CLI `--help`/测试代码核对；**不得伪称当前脚本已经支持新版接口**。源文件不得进入 CI artifact、测试日志、提交或对话附件。

## 6. 必测矩阵与通过的定义

| 主题 | 必须观察的结果 |
| --- | --- |
| 生成 | 全地图单协议、完整清单、严格 Schema/资源，无输出 MapAction；Map21 恰八事件、四路线；非法页及中断拒绝、旧库可恢复。 |
| 地形/传送 | Map66 启动、Map7 行走与 Transfer、Map21 Bridge on/off/去重、Map47 两格 Ledge 与逆向 blocked；Contact→NPC→Step→Bridge/Edge 顺序依契约。 |
| API | 包根 JS/类型确实导出；初始方向 2、主动保留方向、自动传送方向；`run` 不提前结束、hook 恰一次、进入成功事件一次、状态/忙碌/取消错误 code、快照代次。 |
| 错误 | 资源/非法 NPC 整批预提交拒绝且旧状态有效；Domain 在 create/replace/update 的切图、NPC、运动、Bridge、resize 注入异常时 fatal 且停止新命令；listener `console.error` 诊断不改变提交；取消不响应钩子也能终止且无未处理拒绝。 |
| NPC/Browser | 0/1/N 实例、复用定义、四行四列与缺省/null pattern、足部深度、镜头运动、资源失败显式状态、移除无残影和资源泄漏；NPC 挡 walk/Ledge 落点，出生/同格冲突，Step 格不触发而 Contact 先执行。 |
| 真实消费者 | 本地合法源下 Map66/7/21/47、Hostra 实际交互/显示、失败重导入恢复；不能拿合成 fixture 代替原版实测。 |

**证据格式：**每个检查点记录 commit SHA、环境/Node 版本、精确命令、退出码、测试数与关键失败注入；每项标 `PASS`/`FAIL`/`NOT RUN`（注明缺源、Hostra、Electron 或平台原因），不得用 `SKIP` 当 PASS。PR A/B/C 可分别完成；**完整产品闭环仅在总离线门槛 PASS 且真实本地 Hostra E2E PASS、数据恢复及浏览器验收均有证据时宣告。** 缺真实环境可报告“代码完成／离线验收通过／真实本地未验证”，绝不可写“完整闭环”。

**明确不在 v1：**NPC 自主运动/AI/对话、全部 Event/Page、通用迁移器、独立 Group 公共接口、跨 Subsystem 控制、RGSS 帧级保真。文档冻结不是代码或测试已经通过。
