# Viewport + Map 性能集成：Agent 执行计划

> 状态：**执行计划 / NOT IMPLEMENTED / NOT QUALIFIED**。本文件只授权在 `cursor-merge/main` 上按顺序准备可审查的补丁；不等于批准将该分支合入 `main`。
> 建档日期：2026-09-17。仓库：`lithdoo/loom-realm`。
> 集成起点：`cursor-merge/main` = `cursor/main` @ `89fd6f0a1365a20fb6d17b4fc394df3bd426314f`（建档前核实）。Cursor 最终 executable subject：`66d4ea35f76a25e4eb556bf41572c91362ff2e0a`；GLM executable subject：`c8c34cf24c3b148f5ded8c788a73c739ed7dbcbe`；共同祖先：`4cbf620ebe8aec0e7fb33743813c5d1f2885e6a9`。开工时重新读取实际 HEAD；SHA 变化必须记录差异，不能盲目套用。
> 设计权威：[`renderer-data-profile-v1.md`](../15-contracts/renderer-data-profile-v1.md)、[`viewport-state-v1.md`](../15-contracts/viewport-state-v1.md)、[`render-update-v1.md`](../15-contracts/render-update-v1.md)、[`web-presentation-api-v1.md`](../15-contracts/web-presentation-api-v1.md)、[`MAP_DYNAMIC_VIEWPORT_PERFORMANCE_REFACTOR_DRAFT.md`](../../examples/essentials-v21.1-local/MAP_DYNAMIC_VIEWPORT_PERFORMANCE_REFACTOR_DRAFT.md)、[`MAP_VIEW_SPRITE_MOTION_STAGE_CLOSURE.md`](../../examples/essentials-v21.1-local/MAP_VIEW_SPRITE_MOTION_STAGE_CLOSURE.md)。名称含 DRAFT 的文件以仓库中实际冻结记录为准；若文档相互矛盾，STOP，不能按本计划自行改写冻结契约。

## 0. Agent 首要指令、目标与边界

**目标：** 用最少的职责层和唯一的 Map 实现，闭环解决桌面窗口动态缩放、地图叠层消失及走路/刷新性能。最终产物是 `cursor-merge/main` 上可复现、经用户真实 Essentials 体验确认的单一实现，不是把两套独立方案并排保留。

**选型：** `Cursor Core + Cursor Map` 为代码底稿；只以独立、可验证的方式移植 GLM 的通用 `RenderManager` 校验优化。修复 Cursor Map 的 resize pending/失败事务、overlap-copy/Autotile 合成问题，按测量结果再优化动画调度与刷新热点。GLM Map **不整包引入**；不合并 `glm/main` 整条提交链。

**约束：**

1. 只能在 `cursor-merge/main` 或其从该分支派生的短期工作分支提交；不得提交到 `main`、`cursor/main` 或 `glm/main`。开工检查 `git status --short`、`git rev-parse HEAD`、`git merge-base glm/main cursor/main`；不覆盖未提交改动、不 force push、不自动合并最终 PR。
2. 保持已冻结 `/1` 四 child、Main/Control/Input/Render 的现有业务权限、`SubsystemScope` / `RenderDomain` 公开接口与 M13 Projector。**不得**新建 Map 专用 Core 快路径、第二套 Viewport 协议、Main 尺寸镜像、ACK/事件队列、通用场景框架或无限缓存。
3. Map 的 `src/runtime.ts`、`src/semantics.ts`、`browser/map.browser.js`、`browser/map.css` 必须作为一套私有生产者/消费者实现演进；不可单独从 GLM 复制其中某个文件。`presentation.css` 属页面布局，由产品层独立审查，不得拿 CSS 掩盖未传达的尺寸。
4. 分离**源码事实**、**推导缺陷**、**测试复现**、**真实 Hostra/FSDB 实测**。历史 PASS 只说明其原 executable + 环境；本集成产生任何生产改动后必须在新 SHA 重新资格验证。失败应留原始日志和复现，不准修改测试预期、指标、计时起点或偷偷降配。
5. 每阶段做一个聚焦提交，记录修改文件、为什么要修改、失败回滚方案、命令/exit code、相关原始日志和当前 SHA。发现冻结契约与方案冲突、正确性无法复现/验证、内存/性能破门槛或缺少必需资源：**STOP 并输出 exact fixture、文件/行号、期望/实际、候选方案；不得自主拓展架构或虚报完成。**

## 1. 代码对照及保留／吸收／修复清单

| 层／文件 | Cursor 基线 | GLM 可参考实现 | 执行动作 |
|---|---|---|---|
| `apps/desktop/src/renderer-viewport-source.ts` | `resize` 事件经 rAF 合并，读取 `Window.innerWidth/innerHeight`，重复尺寸抑制，visible 时重采样 | resize 事件直接采样 | **KEEP Cursor**；验证最终尺寸和可见性恢复，除非有复现证明采样丢失，否则不重写。|
| `packages/renderer/src/control.ts` + `internal/viewport-publisher.ts` | Publisher 单独负责最新合法值、Peer attach/detach/clear | latest 值管理直接置于 ControlHolder | **KEEP Cursor**：新 Renderer 不继承旧尺寸，同 Renderer fresh Data carrier 重发合法 baseline。|
| `packages/data/src/viewport-sender.ts` | 注入发送函数，单 in-flight + 单 latest pending，终止结算 | 直接耦合 DataRuntime 的 ViewportSender | **KEEP Cursor**，不得两套发送状态并存。|
| `packages/subsystem/src/internal/viewport-manager.ts` | 自身实现只读 `Viewport`，同步首发 `current`，局部隔离监听器失败 | manager 对外生成只读 view | **KEEP Cursor**，保留 `scope.viewport.current/subscribe` 行为及 terminal fencing。|
| `packages/data/src/profile-codec.ts` | `protocolFamilyOfType` 把任意 `viewport.*` 归入 viewport，包括未知 `viewport.foo` | GLM 的精确类型分类值得参考 | **FIX**：未知 top-level type = `profile`，已识别 `viewport.state` 形状错误 = `viewport`；只做契约兼容纠错，复核 Input/Render 现有诊断规则，避免顺手改变其他 family。|
| `packages/subsystem/src/internal/render-manager.ts` | `probeLimit` 用 `jsonDepth` 与 `stringifyJson`，产生重复遍历 | GLM STOP-A 优化：先 `assertJsonValue`，再针对已验证 JSON 求深度及以 `JSON.stringify` 测字节；附等价性测试 | **PORT ONLY THIS GENERIC OPTIMIZATION**，逐 hunk 适配 Cursor 源码；不能跳过任何验证、改错误类型/限制或修改 M13。参考 GLM STOP-A `91060a9` 及 `packages/subsystem/test/render-probe-equivalence.test.mjs`，先核实实际提交与文件。|
| `game-libs/map/src/semantics.ts` | exact required + 1 chunk overscan；`projectChunkWindow` 复用 retained chunk 对象 | GLM `[2,1,0]` 额外余量窗口 | **KEEP Cursor exact +1**；GLM 更大窗口与规范的“不多不少”冲突，不能直接移植。|
| `game-libs/map/src/runtime.ts` | resize 候选 `domain.update` 成功后才更新 `acceptedViewport`；但 A→B→A pending 未取消，失败回退/重试有缺口；transfer 加载完整目标后 replace | GLM 的 resize 在 replace 前改变本地 `viewport`，transfer 在目标加载前提前 replace standing | **KEEP Cursor 事务顺序 + FIX state machine**；不要照搬 GLM 的先变本地状态路径。|
| `game-libs/map/browser/map.browser.js` | exact schema，资源 owner/迟到 decode 清理、detached canvas、View/Sprite 成对提交；逐 tile overlap copy 用 `depth:x:y` 键，Autotile 单格 clear 可能破坏同深度叠层；animated autotile 保持 rAF | chunk 级 overlap skip、单独 Autotile timer；但 GLM browser 校验较宽、Bitmap pending 清理及 host style 边界不宜照搬 | **KEEP Cursor 生命周期／配对结构；FIX 整格叠层合成；按证据优化调度**。|
| Map host 的尺寸与示例 `presentation.css` | 修改 Map shadow `:host` CSSStyleRule；页面居中 | GLM 对 host 写 `this.style.width/height`，页面额外 `max-width/max-height` | **KEEP Cursor private CSS**，Map 不写 projector 管理的 host style。页面自行负责尺寸分配／小于最小值的裁剪或 letterbox，测试真实 content box；GLM CSS 不盲拷。|

源码参考：[`Cursor Product Closed`](../../examples/essentials-v21.1-local/MAP_VIEWPORT_PRODUCT_CLOSED.md)、[`Cursor remediation`](../../examples/essentials-v21.1-local/MAP_VIEWPORT_REMEDIATION_EVIDENCE.md)、[GLM executable SHA](https://github.com/lithdoo/loom-realm/tree/c8c34cf24c3b148f5ded8c788a73c739ed7dbcbe)。当前 Cursor Product Closed **不等于用户真实 Essentials PASS**；其正式循环地图采用 512×8 的纯地面合成场景，不能覆盖建筑/多 z/动画图块/原生窗口拖动。

## 2. 执行顺序：Preflight → C1 → C2 → M1 → M2 → Q

### Preflight：冻结基线与复现（不改生产代码）

**输入：** `cursor-merge/main` 当前 HEAD、Cursor/GLM 上述 executable、相同 Essentials FSDB、同一个固定 Hostra commit `d863beab` (`1.0.1-beta.1`)、Node/Windows/CPU/GPU 记录。`play.bat` 会优先选 `HOSTRA_SOURCE_DIR`，其次 `.qualification/hostra`、再 sibling；一定记录实际命中路径、版本及 HEAD，不能让两分支使用不同 Hostra。

**动作：**

- 运行初始构建、现有 Core/Map/Browser/Hostra 测试，先保存完整 log、机器/依赖信息及原始指标；无可运行 Windows 环境则标记 BLOCKED，不能声明产品验证。
- 实测 `play.bat`：记录窗口外框/`innerWidth,innerHeight`、Core 最新 `viewport.state`、`scope.viewport.current`、Map `acceptedViewport`、`MapViewRenderData.viewportWidth/Height`、最终 `lr-map-view.getBoundingClientRect()`、最终像素尺寸。以唯一时间线定位“尺寸没发／没接／没提交／仅被 CSS 裁剪”，禁止凭症状认定 Core 或 Map 根因。
- 复现真实 FSDB：建筑消失前后同一世界坐标的 z0/z1/z2 tileId/priority/depth、refresh 的旧/新 chunk 与 depth canvas、图像截图/像素；连续移动采集 performance trace 和 rAF 帧间隔。没有实际 repro 时将源码缺陷标注为“逻辑推导待测试”，但仍可先写确定性单测。
- 记录四段耗时：author 投影／RenderDomain 校验／wire + Renderer Store + M13／Browser decode + raster + commit；注意 `browser-first-motion-paint` 是 JS 标记，不等同 GPU compositor 实际呈现。指标必须含实际 frame interval/P99 或长帧计数。

**Gate P0：** 基线可复现，证据来源完整，Hostra pin 相同，至少一个 resize 与多 z refresh 的失败/通过 oracle 就位；不能用性能数字替代正确性测试。若真实 FSDB、Hostra 或平台不可获得，记明未运行项，不创建“Product Closed”结论。

### C1：Core Viewport 小修正（独立提交）

**允许文件：** `packages/data/src/profile-codec.ts`、相关 `packages/data/test/*` 与 `test/renderer-data-profile-v1/*`；只有有确切复现才扩展 Desktop/Renderer 修复范围。

**实现：** 未知 top-level 类型 `viewport.foo` 走 `protocol:"profile"`；已识别 `viewport.state` 的缺字段、非法整数或额外字段走 `protocol:"viewport"`。保持 Input/Render 旧规则、角色方向、四 child `/1`、bounded sender 不变。增加精确的正/负例 fixture。对于 Desktop source，先补充 resize burst、最终尺寸、visibility recovery、unmount/retired late-rAF 用例；若全部通过不改生产代码。

**Gate C1：** Data、Viewport、Renderer、Desktop qualification 全 PASS；新 Renderer 不复发前一个 Renderer 的尺寸，同一 Renderer fresh carrier 收到当前合法 baseline；无新增对外导出或 wire 变更。提交前后记录差异。

### C2：仅移植 GLM 通用 RenderManager 优化（独立提交）

**允许文件：** `packages/subsystem/src/internal/render-manager.ts`、新／对应的 `packages/subsystem/test/render-probe-equivalence.test.mjs`、必要的测试注册文件；不改 `packages/renderer` Projector、Data/Render 限额与 Map 文件。

**实现规则：** 对照 GLM STOP-A 实际 diff，最小移植已验证 JSON 的 depth walker 和 byte probe；遵循原校验顺序、所有上限、UTF-8 字节与异常分类。保留节点/成员/string 校验，不以对象引用相同为由跳过完整 state 检查。若 GLM 补丁依赖其他源码，列清依赖并 STOP 审核，不直接 cherry-pick 大提交。

**Gate C2：** 随机值、深度 63/64/65、最大字节前后、Unicode、对象键序、非法 JSON、非有限数、循环、accessor、稀疏数组等，优化前后接受集合／编码长度／错误分类严格一致；M11/M13/Subsystem 测试全 PASS。统一机器同 fixture 测 `RenderDomain.update` P50/P95 与整条刷新管线；未提升不扩大修改面，记录结果并决定是否保留。不得改计时口径。

### M1：Map 正确性闭环（两个可独立审查的小提交）

**M1a — Runtime resize 事务。允许：** `game-libs/map/src/runtime.ts`、`game-libs/map/test/runtime.test.mjs`。

- 正确表达 `acceptedViewport`、`pendingViewport` 和一个 timer 的状态关系。若最新合法尺寸等于 `acceptedViewport`，**无条件取消非等值旧 pending、清 timer**；A→B→A 100ms 内绝不能稍后提交 B。相同尺寸、null、非法 sample 不启动额外投影。
- 候选 `camera/required/window/RenderData` 构造、预算验证、`domain.update` 同步提交置于受控路径。只有 update 成功后才能推进 `acceptedViewport/window/visualEpoch`；失败旧世界和 Render state 不变。不能在 timer 抛异常被 `ViewportManager` 吞掉后永远卡住，也不能在 step completion 误认为失败 resize 已成功。
- 失败处理须使用现有 Frame 的语义与有限清理；不能无限重试、静默清空失败 pending 或允许失效回调改写新场景。若合同没有规定怎样从持久失败恢复，写失败 fixture 并 STOP 请求设计裁定，不能发明自动断线重连或新 ACK。
- 先加载、校验 Map transfer 新世界，再一次 `replace` 成功后提交世界；维持旧路径，不引入 GLM 提前 standing replace。

**M1a tests：** 初始读→同步 subscribe 竞态、A→B→A、A→B→C（100ms trailing latest）、activeMove/held tail/step completion、发生 transfer 时 resize、`domain.update` 抛错、projection/byte budget 抛错、abort/disconnect 迟到 timer、DPR-only、视口上下限。测试须核对 world/sceneEpoch/visualEpoch/两节点 token 的强一致性。

**M1b — Browser overlap 与 autotile 像素正确性。允许：** `game-libs/map/browser/map.browser.js`、`test/map-layering-browser.test.mjs`、必要的 Map browser 测试 fixture。

- 保留 `sceneEpoch/visualEpoch/motionId` 匹配、detached complete candidate、owner/`ImageBitmap.close`、单 JS task 原子 pair commit。禁止准备过程中改 live canvas；不能放宽 exact Browser schema。
- `_rasterDetached` 目前以 ```${depth}:${x}:${y}``` 为旧 tile key，漏掉 z；在同一 `(depth,x,y)` 多个 z 层时，下层重绘而上层跳过可污染复制的 composite。**仅在 key 增加 z 不够**。建立按 `(depth,worldX,worldY)` 分组的有序完整 tile stack；对 retained 且 stack、资源版本、frame 都相同的格子复用旧合成像素；任一层变化或 entering 时，对目标 canvas 的该 32×32 格执行一次 clear，再严格按 `z → worldY → worldX` 语义重绘整组，不留旧透明像素。
- Autotile 帧变化复用相同的“脏格整组重合成”路径：先确定所有实际变帧 slot 及覆盖位置，对每个 `(depth,x,y)` 最多 clear/recompose 一次，重新画同 depth 上层的 regular/autotile；不同 depth canvas 不应误清。不得全屏、全 chunk 无条件重栅格化。
- 新场景绝不能复用旧场景 canvas；旧候选、迟到 ImageBitmap/rAF/retry 不得覆盖新 accepted。对错层复合像素先建立 red test，再修实现；禁止用忽略测试或更换纯地面 fixture 来达标。

**M1b tests：** 初始全量 oracle 与同场景 overlap refresh 的逐像素对比；z0 regular + z1 regular 同位置同 depth 但不同 tileId、z0 autotile + z1 regular 同 depth、透明覆盖、变帧、多 depth、跨 chunk 边界、来回进入视口、场景 A→B→A、资源加载失败/stale decode、View-only/Sprite-only/旧 sequence。验证 stage 内 Canvas 对比真实像素，不能只断言 drawCount。

**Gate M1：** 上述确定性红测修复后全部绿，真实 FSDB 建筑/图层移动中不再消失，缩放最终 content box 正确；Map 包及 M13/M14 相关回归 PASS。未取得用户的真实交互复核，不能将对应现实问题标记已解决。

### M2：性能收敛，先测量后动刀（可独立提交）

**允许初始范围：** `game-libs/map/browser/map.browser.js` 和相应 test；若 profiling 明确指向 Map Runtime 的局部热点，可另开一个聚焦提交修改 `game-libs/map/src/runtime.ts`/`semantics.ts`，同时保持 exact +1 overscan。

- 保持 ordinary movement `domain.update` 只修改 View camera/motion/motionId 和 Sprite pose/motion/motionId；只有 chunk set 真变化才 refresh chunk/TileVisual 与 `visualEpoch`，严格保留 source+target motion union，绝不在 camera-only 路径重新 raster、decode、设置 Canvas width/height、clear 或 draw tile。
- Cursor 当前有 animated autotile 时持续维持 rAF，并在每帧遍历 bucket 检查 frame dirty。移除**无运动时的永久 rAF**，将相机/角色 250ms rAF 与 autotile 实际帧变化计时分开；按 slot 自身时长触发/去重并仅重合成 dirty cell。可以借鉴 GLM 的分离思路，**不能直接复制它用 `Math.max(...frameDurations)` 作为统一时钟的实现**，否则不同速度图块可能节奏错误。进入/退出视口、场景切换、断开后取消对应 timer。
- Refresh 的成本按 author projection、Core probe、wire/M13、资源解码、bucket alloc/copy、dirty redraw 分段量测；只针对实际热点做一个改动并单独对比。保持 per-current-window 的 chunk 复用及真实资源所有权；不能通过保留 map-wide 历史、扩大 overscan、跳校验、降低像素正确性、预先常驻 1080 canvas 或改变性能 fixture 作弊。
- 现有 cursor 产品数据来自 Ryzen AI 9 + 合成纯地面地图；GLM 的 640 refresh P95 58.7–66.8ms 来自 i5-11500 + 另一 harness，**禁止直接跨硬件得出优劣**。同设备、同文件、同 Hostra、同 clock、同输入序列至少对比 baseline/M1/M2 各三次，含实际 FSDB 建筑和 autotile。

**Gate M2：** 无永久 idle rAF；camera-only tile draw/clear/resize 都为 0（真正变帧 autotile 工作另行统计）；全量与刷新像素一致；所有要求尺寸普通/刷新门槛、帧间隔和内存合格。若 C2 后 1080 Core probe 仍单项超过规定 gate，则 STOP 为独立 Core 设计/性能问题，不在 Map 内绕过验证。

## 3. 同一新 SHA 的最终资格矩阵（Q）

| 维度 | 必要证据 / Gate | 严禁替代 |
|---|---|---|
| Core / protocol | `npm run test:viewport:qualification`；`npm run test:data`；`npm test -w @loomrealm/subsystem`、`npm test -w @loomrealm/renderer`；M10/M11/M13 对应 regression 全 exit 0 | 只跑少量新单测，不跑旧 Frozen 回归 |
| Map / Desktop | `npm run build:m15`；`npm test -w @loomrealm-game/map`；`node --test test/map-layering-browser.test.mjs`；`npm run test:m14`；`npm run test:m15:desktop`；相关动态 Chromium 与官方 Hostra gate | 只证明 TypeScript 通过或两个 DOM 节点存在 |
| 真实 resize | 原生 Hostra 用鼠标连续拖动窗口、恢复、最小于 320×240、奇数尺寸、640×480/1280×720/1920×1080、移动中缩放；日志逐段记录 Window→Data→scope→Map accepted→WC content box→截图 | 仅 CDP `Emulation.setDeviceMetricsOverride`，或只查 `window.innerWidth` |
| Pixel parity | 官方 Essentials FSDB 的建筑、多 z、priority、真实 autotile：初始 vs refresh、跨 chunk、往返、场景转移及透明像素一致；截图或 RGBA oracle | 512×8、单层 tile384 的纯地面循环地图 |
| 运动/卡顿 | ordinary input captured→first correct motion pixel；refresh trigger→first correct pixel；resize-end→paired first correct paint 单独统计；rAF frame interval/P99/long-frame 数与 trace 一起存档 | 把 JS `qualify` hook 当实际 GPU 呈现或用单一 P95 宣称无卡顿 |
| 延迟 gate | 640 ordinary P95 ≤50ms、refresh P95 ≤50ms；1280×720 ordinary ≤50ms、refresh ≤75ms；1920×1080 ordinary ≤50ms、refresh ≤100ms；resize bucket 独立报告。沿既有官方 harness 的样本、clock 和 trigger，不改测量语义 | 偷换 resize 为 refresh、丢弃不利合法样本、用另一台机器的历史数字冒充本次实测 |
| 内存 / 字节 | 完整 MapView JSON UTF-8 <196608 bytes；accepted canvas ≤128MiB；accepted+detached+decoded image 同时峰值 ≤256MiB；失效 ImageBitmap.close、无界历史资源为 0 | 只算可见 canvas，忽略 candidate 或 bitmap |
| Provenance | 固定且记录 FSDB 身份、Hostra `d863beab`、Windows/Node/硬件、执行命令、每个测试 exit code、日志路径、集成 executable SHA；托管 CI、次要硬件、官方 ZIP、PWA/M16/M17 缺任何一个就标记 NOT RUN / OUT OF SCOPE | 把原分支 Product Closed/旧 SHA 测试挪到集成 SHA |

命令示例（Windows PowerShell，按本地环境调整实际路径）：

```powershell
$env:HOSTRA_SOURCE_DIR = (Resolve-Path '.qualification/hostra').Path
npm run build:m15
npm run test:viewport:qualification
npm run test:data
npm test -w @loomrealm/subsystem
npm test -w @loomrealm/renderer
npm run test:m11
npm run test:m13
npm test -w @loomrealm-game/map
node --test test/map-layering-browser.test.mjs
npm run test:m14
npm run test:m15:desktop
# Official Hostra product: capture command, exit code, raw JSON and actual frozen Hostra SHA.
node --test --test-concurrency=1 --test-timeout=3600000 --test-name-pattern='640/720/1080' test/m15-hostra-product.test.mjs
# Official exact Essentials zip and user play.bat manual gate must run when resources exist.
```

注意：`npm run test:m14` 链式执行较多套件；不能因耗时删去资格要求。Hostra 使用被 `play.bat` 和测试脚本实际选中的目录而不是仅打印环境变量。对 Windows 批处理可用 `set "HOSTRA_SOURCE_DIR=<frozen-path>"` 显式固定。

## 4. 交付与 STOP / GO 规则

**每个阶段交付：** 一个最小提交；代码差异与改动理由；新增先失败再通过的测试；运行命令、环境、exit code 与原始 trace；本阶段接受的 SHA；未解决缺陷；与合同逐条核对。最终收口文档放入本目录或 examples qualification 目录，不能把本执行计划改写成 PASS 证据。

**硬性 STOP：** 任一真实地图像素错误、真实窗口尺寸链路失败、Core/Map 行为契约冲突、RenderDomain 事务不一致、未处理 Promise/timer 导致永久 pending、资源泄露或任一规定性能/内存 gate 失败；若官方 ZIP/第二硬件/CI 未能运行，只能标 `NOT RUN`，不得无依据认为通过。对设计上的 exact +1 overscan 与 GLM extra-margin 不一致，保持本计划确定的 Cursor 语义；如必须改大窗口，先单独提设计变更并等待批准后同步修协议、生产者和消费者，禁止在本集成偷偷实行。

**允许 GO 的条件：** Q 的适用门槛全部在**同一新 executable SHA + 同一构建批次**通过，官方 Hostra 和用户真实 Essentials 样例解决三个原始现象（窗口缩放、建筑消失、走路卡顿），证据、剩余 scope 和跨环境未运行项透明可审查；随后由仓库维护者审核并决定是否创建/合并到 `main` 的 PR。Agent 不得因本计划存在而自动宣布合并完成。

**最终完成报告格式：** `baseline SHA → each patch SHA → final executable SHA`；逐阶段文件 diff；协议／尺寸／像素／性能／内存 gate 及日志链接；原问题三个复现前/后的对照；仍未运行的场景；STOP/GO 与可回滚提交。不添加实现无关的 `.chat`、日志原文或整个 GLM 分支到代码合并。