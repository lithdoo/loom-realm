# Small Map Centering & Matrix Fill — 实施冻结规格（cursor-merge/main）

> 状态：**Design Frozen / Agent Implementation Ready；NOT Implemented / NOT Qualified**。本文件将 `main@0a684d51390ee39cbd7409959dfd5e746de1b6f1` 的小地图设计同步并针对真实响应式分支收敛。经审查的生产基线：`cursor-merge/main@44d993e1b6a52e967d200280b81c4dc049b712bc`。文档提交后 Agent 以开工时实际 HEAD 记录 `BASE_SHA`，若目标文件已变化先核对差异，不以这里的行号覆盖新提交。
>
> **本期只交付**：矩形地图按轴居中、地图外纯白、原玩法/响应式/底栏/同版绘制不回归。业务配置纹理及不规则地图均为后续独立需求，不实现占位接口。本次文档迁移不等于代码修改、测试通过或产品问题已修复。
>
> 依赖：该分支已经实现 `src/layout.ts`、响应式 `src/runtime.ts`、`browser/map.browser.js` 的 `.map-content > .map-world`、DOM footer 和 `sceneEpoch + visualEpoch`。本文件**仅替换历史响应式规格的正常小地图“左上对齐、外围黑底”行为**；原窗口格数、角色移动/传送、错误占位等契约不变。历史响应式规格见 [`main` 上的原文](https://github.com/lithdoo/loom-realm/blob/0a684d51390ee39cbd7409959dfd5e746de1b6f1/game-libs/map/RESPONSIVE_VIEWPORT_DRAFT.md)；该文件不在本分支，不使用失效的相对链接，也不将其中 `NOT Implemented` 历史状态误当本分支状态。

## 1. 唯一架构与不变量

现有**一张铺满内容区的逻辑渲染矩阵**仍为唯一空间组织：窗口 → 原 `calculateLayout` 扣 footer 一次 → `logicalWidth/Height` 矩阵 → 现有 `.map-world` 一次 `scaleX/Y` → 独立 DOM footer。填充是该矩阵的**基础绘制规则**，绝非独立 Padding DOM、Canvas、Render 节点、额外布局/缩放、独立 RAF 或新增世界瓦片。既有按 depth 分配的透明瓦片 Canvas、sprite light-DOM 所有权和版本协调保留；不为此需求合并 depth 或复制/重排 sprite。

每个真实世界格仍为 `32×32`，地图世界坐标、`MapRecord.data`、`tiles` 五元组、优先级、自动瓦片、碰撞、step/contact/edge transfer、250ms 步长和 Render/Core 公共协议**完全不变**。`16×16` 只描述奇数格差形成的**视觉半格精度**；当前纯白无需创建半格对象/纹理或循环绘制白砖。`tileId=0`、透明图片、缺少图层均不能推断“地图外”；本期地图有效形状为整个矩形存储范围。

正常填充色为 `#fff`，仅地图外显示；地图内背景/透明像素的**原显示结果保留**（本分支 `.map-content` 原有黑底）。失败或首次等待时沿用原黑色占位与诊断；不强制将加载/错误状态改白。内容区外与 footer 始终不受 Origin 影响。

## 2. 唯一几何：Map View 从同版数据派生

Runtime 已在 viewport payload 提供 `logicalWidth/logicalHeight`、`mapWidth/mapHeight`、`cameraX/cameraY`、`scaleX/Y` 与 `sceneEpoch/visualEpoch`；player 的 `screenX/screenY/fromScreenX/fromScreenY` 均为 `world-camera`。**Map View 消费同一次已接受的 viewport+sprite，独自派生 Presentation Geometry；不新增 payload 字段，不在 Runtime 提前叠加偏移。**

```ts
// 概念性纯函数；输入由现有 assertMapViewData 校验后取得。
const R = { x0: 0, y0: 0, x1: logicalWidth, y1: logicalHeight };
const Mw = mapWidth * 32, Mh = mapHeight * 32;
const originX = Math.max(0, (logicalWidth - Mw) / 2);
const originY = Math.max(0, (logicalHeight - Mh) / 2);
const mapRect = {
  x0: originX - cameraX, y0: originY - cameraY,
  x1: originX - cameraX + Mw, y1: originY - cameraY + Mh,
};
const visibleMap = intersectHalfOpen(R, mapRect);
const fillRects = subtractRect(R, visibleMap); // 无交集返回整个 R；至多四个非零矩形
// Tile / sprite 视觉逻辑坐标 = 原 camera-local 坐标 + origin（仅一次）。
```

`intersectHalfOpen` 使用 `[x0,x1)×[y0,y1)`，无交集返回空；`subtractRect` 先上/下全宽，再中间带左/右，去掉零面积矩形，保证填充与 `visibleMap` **无重叠、无遗漏、面积合计等于 R**。填充边界和真实地图内底色都必须消费同一个 `visibleMap`，不得各自从 DOM bounding rect 或缩放后的 CSS px 反算。正安全整数地图宽高、乘积与坐标有限安全、camera 在现有合法范围内；异常拒绝并沿用 last-good，不以负 camera、CSS margin 或 `NaN` 兜底。

每轴独立：`M<V` ⇒ `camera=0`、`2*origin+M=V`；`M≥V` ⇒ `origin=0`、原相机跟随；相等零偏移。格差为 `N-K` 时每侧 `(N-K)*16` 逻辑像素。**地图边缘可以穿过一个现有 32×32 矩阵单元中线**：在逻辑像素上裁剪矩形，不得按整个矩阵格二选一或拆真实瓦片。坐标先计算一次，再经已有 `scaleX/Y` 整体映射，不对各 tile / fillRects / sprite 独立取整。

| 逻辑视野（格） | 地图（格） | `originX,Y`（逻辑 px） | 必测 |
| --- | --- | --- | --- |
| 21×18 | 20×15 | 16,48 | 双轴奇数格差 |
| 20×14 | 10×8 | 160,96 | 双轴小图 |
| 20×14 | 20×14 | 0,0 | 相等、无留白 |
| 20×14 | 25×12 | 0,32 | 仅竖轴小，水平跟随 |
| 20×14 | 19×20 | 16,0 | 仅横轴小，竖直跟随 |
| 60×33 | 1×1 | 944,512 | 极小图 |

## 3. 对 `cursor-merge/main` 的精确落点

已核实：`src/layout.ts` 已实现行列和比例；`src/semantics.ts` 的 `computeCamera()` 对小轴限制到 0，`viewportTileBounds()` 按真实地图边界投影；`src/runtime.ts` 的 `viewportPayload()` 已携带上述全套同版几何；Browser 的 `assertMapViewData()` 有 responsive 校验，`_prepare()` 使用同 token 的 view/sprite，`_commitAtomic()` 安装离屏瓦片与 sprite，`_tickAccepted()` 进行 RAF 相机、Canvas 位置及角色位置更新；`_applyLayout()` 设置 `.map-content/.map-world` 与一次 scale。**无需新增 layout 文件、改 camera 算法、改五元组、扩充 Core 或重新实现版本协议。**

改动优先集中 `game-libs/map/browser/map.browser.js` 中两个职责入口：

1. 在 Map View 私有纯 helper 中验证并推导 `geometry`，将已接受版本的 `origin/visibleMap/fillRects` 关联到 prepared/accepted（或其同版确定性缓存）。常规候选、同 epoch 快路径、snapshot/reconnect 均从同一逻辑生成。`_tickAccepted(prepared,...)` 中现有 tile 左/上是 `bounds.minX/Y-camera`，`_paintSprite()` 中现有 sprite 左/上是 `screenX/Y` 再加帧锚点；在 **Map View 同一坐标入口**对两者应用相同 `originX/Y` 恰好一次。不能一边修改 `_world` transform 加 origin，一边又修改 tile/sprite 位置加 origin。优先不改现有 `scaleX/Y` transform 和 sprite light-DOM 节点层级；**真实 Chromium 验证 slotted sprite 的 containing block 与最终 scale**，若坐标单位不同，应在同一个 Map View helper 中沿用既有映射修正，禁止在 Runtime payload 再加一次。所有深度/自动瓦片按既有 layer 位置自然同行；`_lastPaintedCamera`、`_lastPaintedScreen` 等运动连续性记录保持 **camera-local**，不能存成含 origin 的坐标，否则重入/resize 续播会双偏移。
2. 本分支 `.map-content` 和 `:host` 的正常底色均为 `#000`，tile Canvas `alpha:true` 且按 depth 稀疏覆盖；**只把 `.map-content` CSS 改白会错误地把地图内透明区域也改白**。正常可视版在已有 `.map-world` **背景绘制入口**设置白底，并以同一个 `visibleMap` 在其内部画原黑色底色矩形，位于 tile Canvas 与 sprite 下方；可以用已有元素的 `background-image:linear-gradient(#000,#000)` 配合 `background-size/position:no-repeat` 表达裁剪后的黑色矩形，或在已有基础绘制入口完成等价操作，**不创建新的图层/Canvas/DOM**。CSS 背景的矩形位置、尺寸以逻辑 px 指定，在现有 `.map-world` scale 下同步缩放；背景无填充时显示原整视野黑底。原本内部若并非黑色，以原实测像素为权威，不凭空更改。正常版与首次加载/错误占位需分开：仅在成功提交场景时切换正常白底；已有 last-good 在下一版失败时保持完整，不提前改 CSS 背景。

**动态相机注意**：本期矩形小轴 `camera=0` 且 origin 固定；大轴 origin=0、相机始终合法，地图覆盖该轴整个视野。故在合法连续运动中外围填充区域不因相机逐帧变化而改变；无需为纯白额外加入逐帧重算/填充重画。已存在的 autotile 局部刷新、瓦片缓存及 `_cameraOnlyCommits` 快路径要保持原行为，仅在 layout/map 尺寸变化时更新 geometry。首次场景、`_commitAtomic()` 正式提交和 `_prepare()` 直接 camera-only 快路径都必须一致，不能只修改一条分支。

## 4. 状态、资源和失败闭环

- 版本：沿用真实字段 `sceneEpoch + visualEpoch + motionId`（**不是旧草案的 `visualRevision` 字段名**）。view、sprite、geometry、underlay、footer 在相同版本的既有协调入口一并可见；新资源未准备时保留 last-good 完整版；过时 sequence/RAF/资源不得更新 CSS 或 Origin。
- resize：沿用 Runtime 最新合法 viewport/步结束处理；每次由新同版 layout 重新求 origin，不累加旧值。跨 `M<V ↔ M=V ↔ M>V` 两轴分别生效；保留旧版本直到新版本提交，不把新白边贴在旧地图上。
- 运动：250ms、原 from/to camera/screen 及相同 RAF 不变；`_commitMotion()` 的可见位置续播不得错用加过 Origin 的坐标。在 resize 造成同 motion 重基准时要检查帧连续性和新 Origin 更新是否同版。
- transfer：目标 mapId、mapWidth/Height、layout、tiles、sprite、名称、底色和 origin 同版提交；原 step/contact/edge 与失败/取消语义不变。
- 首屏、失败、断连：正常白边不能覆盖原 loading/failure UI；资源重试失败继续显示上一完整场景并标记 `data-map-visual-state=failed`；合法后续版本可恢复；断连清理沿用现有。
- 资源/预算：空白不进入 `tiles[]`、地图数据、深度、投影预算、图片请求或 Local FSDB 的游戏地图记录；纯白无新资源加载。若需要改 Runtime 私有字段，必须先用具体缺失字段和测试证明，此分支已有字段时禁止无意义改动。

## 5. Agent 实施顺序和精确验证

**阶段 0：事实准入。** `git rev-parse HEAD` 记录真实 `BASE_SHA`，确认包含 `src/layout.ts`、`RESPONSIVE_VIEW_KEYS`、`.map-world`、`_commitAtomic/_tickAccepted` 和 Local `scripts/sync-map-presentation.mjs`，无未纳入的同路径改动。若与本审查基线发生语义差异，先更新最小对位记录，不按旧 `main` 代码重建系统。禁止 `init-fsdb --force`，不删除已有 FSDB。

**阶段 1：纯几何测试。** 将 helper 放在现有 `browser/map.browser.js` 附近的 Map 私有可测入口，或按既有测试组织抽出私有纯函数；覆盖上表六例及输入异常、地图超视野、单轴、交集空/满、四矩形半开差集、面积守恒、奇数格穿格。不要引入新的生产世界格/数据格式。

**阶段 2：唯一绘制接线。** 在现有 Map View 同版路径同时应用 geometry、地图内部底色、tile/sprite 偏移及 footer；保留 `.map-world` 的唯一 scale、瓦片/资源缓存、sprite 所有权。针对本分支黑底做显式地图内底色保护，禁止仅改外层 CSS 造成内部透明区域回归。用浏览器 DOM 与像素测试证明 slot 在真实渲染树中的位置和缩放，不根据结构示意猜测。

**阶段 3：实际产物。** `npm test -w @loomrealm-game/map`；按影响运行 `npm run test:viewport`、相关 `npm run test:m14` / `npm run test:m15` 或适用子集，准确记录命令/退出码，不能把旧 SHA 的 PASS 继承为当前 PASS。标准 `essentials-v21.1` 按其实际 fixture 生成/加载路径验证新 Map JS/CSS；Local 运行既有 `examples/essentials-v21.1-local/scripts/sync-map-presentation.mjs`（有 `--check` 验证入口），验证源码、dist 与 FSDB 的 JS/CSS/page CSS SHA-256 一致，不重建业务数据。实际 Playwright/Chromium、Hostra 可用时在两个 `play.bat` 路径对应的产物上验收；不可用明确记 NOT RUN，不能以 mock 冒充。

| 验收维度 | 必须提供的 PASS 证据 |
| --- | --- |
| 数学 | 六例、1/2 格差、任意单轴、等于/大于、非法输入；`2*origin+M=V` 在小轴成立；`visibleMap ∪ fillRects = R`、无相交和面积守恒。 |
| 可视 | Chromium 真实 `640×480`、`800×600`、`1280×720`、`1920×1080`、`1920×480`、`640×1080` 及奇数 CSS 尺寸；内容区矩阵仍铺满、footer 可见，小轴两侧白边宽差 ≤1 CSS px，无拼缝、黑线、溢出；地图内透明格保留原黑底/原像素。 |
| 对齐 | 所有 depth/autotile 的地图边缘与角色脚底同位；slotted sprite 真实 rect/scale；大地图的 camera 和 tile 投影不变；视觉偏移只加一次。 |
| 竞态 | 站立、250ms 移动、相机跟随、移动中 resize/临界跨越、step/contact/edge transfer、资源延迟/失败/恢复、camera-only 快路径、snapshot/reconnect/断连：不得出现新白边旧图/新图旧 sprite。 |
| 交付 | 最终代码 `IMPLEMENTATION_SHA` 下 Map 与受影响集成回归、真实产物/FSDB 哈希、浏览器截图/rect/像素断言均有记录；缺失为 NOT RUN，失败为 FAIL。 |

## 6. 后续扩展与冻结状态

业务填充纹理以后只能扩展现有矩阵的基础绘制规则，统一纹理采样锚点、逻辑 16×16 周期和填充裁剪；另行冻结资源来源、错误回退和缓存失效，不提前新增独立 Padding Canvas。若业务地图不规则，未来明确 `MapRecord` 存储矩形与显式 `Footprint` 有效形状，填充改为 `R \ visibleFootprint`，不得以透明像素/`tileId=0` 猜测；不规则居中需评审 footprint 稳定外接框、非零 minX/Y 与相机/碰撞边界，不能宣称本期矩形公式已支持。

**准入结论**：上述分支确有响应式实现，产品与架构决策可直接交 Agent 作**本分支上的增量实施**；实施前仅需按阶段 0 校验未变化的 HEAD。此状态不代表本次文档提交执行了生产改造、npm、Chromium、Hostra 或两个示例测试。若真实 DOM 验证证明同矩阵布局无法做到 tile 与 sprite 同位，或原硬限额与要求冲突，提交最小可复现证据后只重开相应技术点；不得擅自加独立填充图层、改玩法、缩小矩阵或将 NOT RUN 写成 PASS。
