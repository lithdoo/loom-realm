# Map Viewport PR0 — 冻结前可行性证据账本

> 状态：**PR0 RUN COMPLETE（2026-09-17，glm/main）/ 发现两项负面可行性结论 → Map Docs Freeze 继续 HOLD，需设计负责人修订**。本文只记录实测结果；唯一规范为[Map机械实施主合同](./MAP_DYNAMIC_VIEWPORT_PERFORMANCE_REFACTOR_DRAFT.md) §0–§14，motion细节见同目录子规范。旧历史M15 latency/旧三child `/1`的PASS不能作为本subject证据。

## 1. 证据身份（真实运行填写）

```text
Owner / reviewer / timestamp: 执行 agent（工程实施方）；Map Docs Freeze reviewer 未签署（见 §6）
Git base / exact executable subject SHA: 4cbf620（main）/ glm/main @ PR0 提交（test-only diff，production 零改动）
Build mode: npm run build:m14（本地 worktree 全量构建）
Node/npm: v22.12.0 / 10.9.2；OS/CPU: win32 10.0.19044 / Intel i5-11500；Chromium: 本机 Edge/Chromium（playwright 库模式 headless）
Hostra: sibling workspace ../hostra（hostra@1.0.1-beta.1, Electron 44.1.1 冻结基线）
Hosted material: 仓库内合成 fixture（主合同 §10 公式）；工具链 checksum 见 git subject
Local exact Essentials v21.1 FSDB: examples/essentials-v21.1-local/[FSDB]Essentials v21.1（真实 Map002/Map066 + Tilesets/Outside.png 256x16064）
Commands:
  node --test test/map-viewport-pr0.test.mjs                -> exit 0（5/5 pass）
  node --test --test-concurrency=1 test/map-viewport-pr0-hostra.test.mjs -> exit 0（1/1 pass）
  npm run build:m14                                          -> exit 0
Raw stdout: 各 MAP_VIEWPORT_PR0_* JSON 行（本文件 §2–§5 摘录；完整原始行在测试输出中）
```

## 2. 不改生产代码的固定 hosted dense fixture（全部实测，36 样本）

合成 map 128×96×3 全非零，tileId 按主合同 §10 公式；regular 384..391 priorities 依次 0,1,2,3,4,5,0,1；autotile 48..95 slot0；位置 center/四角/center→right union。

```text
guard=196608B；最大 bytes=61201B（1920x1080 center，80 chunks）—— 全部 36 样本严格 < 196608B ✓
每 chunk cells.length=192、索引 ((z*8+ly)*8)+lx、Y/X 严格有序、无重复 ✓
tileVisuals 56 项、按 tileId 严格升序、恰好每个非零 id 一次 ✓
样本区间：320x240=6557..13943B(6..16 chunks)；640x480=10985..19851B(12..24)；
800x600=16889..28709B(20..36)；960x540=16889..27975B(20..35)；
1280x720=19842..37572B(24..48)；1920x1080=41983..61201B(54..80)
```

**结论：§4 精确 shape 与 VIEW_DATA_GUARD 可行 ✓（合成 dense 最坏 61201B，余量 3.2×）。**

## 3. Real Essentials exact-local evidence（真实本地 FSDB）

```text
Map002（32x21x3，tileset Outside 256x16064px，123 tileVisuals）：
  640/720/1080 × 5 位置全部 guardPass；max bytes=13107B（20 chunks）
Map066（22x21x3，同 tileset，53 tileVisuals）：
  640/720/1080 × 5 位置全部 guardPass；max bytes=9619B（16 chunks）
decoded（Tileset/Outside.png 256x16064 + Autotile + Character，旧+新场景）≈ 33.4MiB
```

**结论：真实素材全部在 guard 内 ✓；小图（32×22 tiles）在高 viewport 下 chunk 数被地图边界 clamp。**

## 4. 独立中层成本拆测（主合同 §5 要求单列）

```text
RenderDomain.update() 全量 author+snapshot 残余（movement-style 两节点 delta，n=200）：
  640x480 dense（24 chunks）:  p50=14.93ms  p95=19.17ms  max=25.79ms
  1920x1080 dense（80 chunks）: p50=45.61ms  p95=67.84ms  max=86.29ms
  （来源：RenderManager.update 对合并后全量 state 的 applyCow + probeLimit 全量验证/快照路径）
M13 structurallyEqualJson camera-only（同 chunks 仅 camera/motion 变，n=200）：
  新 §4 shape 1080: p50=0.0019ms p95=0.0031ms（无瓶颈 ✓）
  新 §4 shape equal: p50=0.0002ms
  旧 flat-tile 640（1122 tiles）: p50=0.0014ms
当前 Browser 640 dense 基线（真实 Chromium，receiveRenderData 同步段）：
  ordinary（新 tiles identity + motion）: p50=0.30ms p95=0.70ms
  refresh（tiles-identity 变化）:        p50=0.30ms p95=0.40ms
  （异步 raster/paint 成本由 §5 Hostra 端到端口径覆盖）
Map-private ShadowDOM `::slotted` + z-index stacking（真实 Chromium 截图像素 oracle）：
  parent-owned adoptedStyleSheet 规则控制 slotted sprite 定位/zIndex：
  ground(z0)<sprite(z65)<overhead(z130) 像素序正确 ✓；规则改 z=-1 后 sprite 沉入 ground 之下 ✓
  → §6 private-only CSS stack 平台可行性成立 ✓
```

**发现 A（负面，需独立 Core 设计复核）**：`RenderDomain.update` 全量残余在 1080-dense 达 **p50=45.6ms**，单独占满 ≤50ms ordinary gate 的 ~91%；640-dense 14.9ms 占 ~30%。该成本位于 Core（@loomrealm/subsystem RenderManager），Map 刀内不得修改。**归 Core owner 设计复核（camera-only delta 能否跳过全量 re-validate/probe 或缓存快照），否则 1080 ordinary ≤50ms 无法达成。**

## 5. Canvas/decoded 内存峰值估算（精确 bucket 模型：depth 值碰撞合并、每 bucket 世界宽条带、visible+detached 双 stage）

```text
320x240: 29 buckets  backing= 29.25MiB ✓   decoded+backing= 60.94MiB ✓
640x480: 36 buckets  backing= 52.32MiB ✓   decoded+backing= 84.00MiB ✓
800x600: 40 buckets  backing= 67.27MiB ✓   decoded+backing= 98.96MiB ✓
960x540: 38 buckets  backing= 71.16MiB ✓   decoded+backing=102.85MiB ✓
1280x720:44 buckets  backing=102.38MiB ✓   decoded+backing=134.07MiB ✓
1920x1080:55 buckets backing=178.13MiB ✗>128MiB   decoded+backing=209.82MiB ✓(≤256)
```

**发现 B（负面，需设计修订）**：在主合同 §10 指定的 adversarial dense fixture（每行 6 个 priority 条带，深度值跨行重叠）下，§6 "每 depth 一块 world-bound canvas × visible+detached" 的分配在 **1920×1080 估算 backing 178.13MiB，超出 128MiB 限额**（根因：相邻行 priority 条带使每 depth bucket 覆盖 ≤5 行、每行有效计入 ~6 个 bucket）。640–1280 全部在预算内。按 §5"超过任一限额 STOP，提交资源尺寸/深度与峰值数据"执行。

## 6. 当前 Hostra 640 ordinary/refresh 基线（真实产品，单 Browser Window performance.now()，3 轮）

```text
ordinary（input-captured→browser-first-motion-paint）: n=300  p50=27.4ms  p95=41.1ms  max=43.6ms
refresh（同一 250ms step 内 tiles 覆盖变化）:           n=90   p50=76.6ms  p95=93.6ms  max=127.8ms
invalid ≤1/轮（≤0.8%）✓；本机基线与历史受治理记录（42.9/96.3ms）同特征：refresh 既有失败，归 PR1 优化目标
```

## 7. 必填结果汇总

| Evidence | Result | Raw data |
|---|---|---|
| Fixed synthetic schema + all sizes + max bytes | **PASS**（36/36 <196608B；max 61201B） | §2 |
| Exact-local Map002/Map066 true sources + dense1080 | **PASS**（30/30 guardPass；真实资源尺寸记录） | §3 |
| Full `RenderDomain.update` validation/snapshot cost | **已测——发现 A：1080-dense p50=45.6ms，Core 侧瓶颈候选** | §4 |
| M13 structural equality（camera-only） | **PASS**（0.002ms 级，无瓶颈） | §4 |
| Current Browser raster/receive baseline + memory | **已测**（receive 0.3ms；内存见 §5） | §4/§5 |
| Shadow-only slotted Sprite pixel oracle | **PASS**（private-only stacking 可行） | §4 |
| Canvas backing 128MiB / decoded+backing 256MiB | **发现 B：1080 dense 估算 178.13MiB > 128MiB → STOP 级** | §5 |
| Current Hostra 640 ordinary/refresh baseline | **已测**（41.1/93.6ms p95；refresh 既有失败特征） | §6 |
| No unresolved Core/M13 independent bottleneck | **未成立**（发现 A 待 Core 设计复核） | §4 |
| Reviewer/date/docs subject SHA / Map Docs Freeze | **HOLD——因发现 A/B 未签** | §8 |

## 8. STOP 报告（主合同 §13 格式）

```text
阶段            : C（PR0 可行性）完成；D（Map Docs Freeze）触发 STOP
subject SHA     : glm/main PR0 提交（test-only：test/map-viewport-pr0.test.mjs、test/map-viewport-pr0-hostra.test.mjs、本文件）
exact modified files: 仅上述 PR0 允许清单（production 零改动）
fixture source  : §10 合成 dense 公式 + examples/essentials-v21.1-local/[FSDB]Essentials v21.1（Map002/066）
failing expected vs actual:
  发现B  expected: 1920x1080 dense Canvas backing 峰值 ≤128MiB（§5）
          actual  : 178.13MiB（精确 bucket 模型：55 buckets、world 2432x1592、双 stage）
  发现A  expected: 独立 Core 成本"无无法克服的瓶颈"（§10）
          actual  : RenderDomain.update 1080-dense p50=45.61ms / p95=67.84ms（≤50ms gate 的 91%）
raw trace        : §2–§6 实测 JSON（命令与 exit code 见 §1）
责任归属         : 发现B→Map 设计负责人（§6 深度 canvas 分配策略修订：如行条带复用/单 canvas 多深度
                  重绘/bucket 高度收敛，均需主合同修订后重审）；发现A→Core owner（RenderManager update
                  路径全量 re-validate/probe 的独立性能复核）
解除条件         : 设计负责人修订主合同 §5/§6（内存分配或限额论证）并通过独立反证；Core 侧对发现A
                  给出复核结论或修订；随后以新 docs subject 重跑本 PR0 两个测试确认数值
new docs subject : PENDING（修订后由 owner 记录）
```

PR0 要求**设计可行性、数值风险归因、真实输入合法和无未解阻塞**。本 PR0 已完成全部真实测量；因发现 A/B，**Map Docs Freeze 依 §10/§5 保持 HOLD，PR1 生产实施在冻结批准前不得开始**。不得以降低 density、放宽限额或跳过校验换取签署。

---

# PR0-revised（2026-09-17 第二轮，独立评审整改后）

> 链条：`original PR0 evidence (ce2bd36)` → `Core fresh-Renderer fix (737a4bd)` → `本节 revised evidence`。**原始证据全部保留原样（§1–§8 未改动）**；本节只新增复测与分析。原 FAIL/STOP 结论不被改写为"之前测错了"。

## R1. 证据身份

```text
executable subject: glm/main @ 737a4bd（Core fresh-Renderer participant fencing 修复）
                    + 本证据提交（recording commit）
Core 复跑: renderer 55/55、subsystem 68/68、test:data 链（rev3 7/7）、m10 16/16、m11 10/10、desktop 29/29 — exit 0
PR0 复跑: node --test test/map-viewport-pr0.test.mjs -> 5/5 exit 0
          node --test --test-concurrency=1 test/map-viewport-pr0-hostra.test.mjs -> 1/1 exit 0
```

## R2. STOP A 复审（RenderDomain.update 1080 residual）——精确反证

按任务要求分离计时（同机同 fixture，n=100，dense 1080 §4 shape，JSON 142,142 chars）：

```text
wire stringifyJson(全量 state)      p50=23.39ms  （原生 JSON.stringify 同数据 p50=2.37ms，慢 ~10x）
assertJsonValue(全量 walk)          p50=13.51ms
jsonDepth(全量 walk)                p50=15.00ms
utf8ByteLength(已序列化串)          p50=0.35ms
M13 structurallyEqualJson(camera-only) p50=0.002ms —— 无瓶颈 ✓
domain.update motion-only（chunks 完全共享、仅 camera/motion delta）p50=121.86ms p95=232.25ms
domain.update camera-only                                p50=122.84ms
domain.update visual-changed（新 tileVisuals、共享 chunks） p50=195.04ms
```

逐条回答设计问题：

1. **是**——ordinary movement 会让完整 large state 重走 full-state 校验：`RenderManager.update()` 无条件对合并后的**全量** nextState 调 `probeLimit`（assertJsonValue + jsonDepth + stringifyJson + utf8ByteLength），与 delta 大小无关。
2. chunks/tileVisuals 结构不变（共享同一批 frozen 对象）**不能**降低成本——probe 是 state-size 驱动，不是 change 驱动（实测共享 chunks 的 motion-only 仍 121.9ms）。
3. M13 structural equality **不**构成瓶颈（0.002ms）。
4. Map-local immutable projection identity **已被实测否定**为解法（见 2）。
5. refresh/viewport change 才重建大 projection 的设计正确，但 ordinary 小 delta 仍付全量 probe 成本——**不可避免**。

**结论：STOP A 成立且定位到 Core 单点**：`packages/subsystem/src/internal/render-manager.ts` `update()` 的 `probeLimit(nextState)`（约 :658）每 update 全量执行三个 O(state) 遍历 + 一个慢 10× 的 wire 序列化。最小 Core 修订选项（需 Core owner 裁定，Map agent 不越权实施）：a) probe 仅 delta 或按 frozen-subtree digest 缓存；b) wire `stringifyJson` 性能复核（Fast canonical serializer）。在此之前 1080 ordinary ≤50ms gate 无法由 Map 侧达成（640 dense 原测 14.9ms p50 也已占 gate 30%）。

## R3. STOP B 复审（1080 Canvas memory）——设计决策材料

实现结构评估结论（对照任务清单）：

- 空 depth bucket：adversarial fixture 无空 bucket（每行含 p0..p5）；
- window-sized 代替 world-sized：破坏 §6 "camera-only 仅 CSS translate"（canvas 须含 overscan 世界内容），不可行；
- 复用 unchanged backing / 仅 dirty-entering candidate：viewport 变更的 entering 条带横跨全部行×priority → 全部 bucket 受染，仍需整份 candidate；仅 autotile-refresh 稀疏，但预算须覆盖 worst-case；
- detached 必须**完整**以维持 atomic visual semantics（§7 paired commit）。

```text
original rule : 同时存活 visible+detached 全部 Canvas backing ≤ 128MiB（§5）
measured      : 1920x1080 dense 178.13MiB（visible-only 89MiB；320–1280 全档 ≤102.38MiB 达标）
minimal proposed replacement（需项目负责人明确批准，本任务指令不构成批准）:
               accepted/visible Canvas backing ≤ 128MiB
               AND accepted + detached candidate + decoded image peak ≤ 256MiB
论证要点:
  - capacity 定义修正而非为过测：128MiB 语义本意是"已接受可见画面的常驻上界"，
    transient 双 stage 峰值与常驻混在同一限额是定义缺陷（detached 生命周期有界：
    同 JS task swap 后即释放）；
  - 128MiB visible budget 保证常驻显存/内存上界（实测 1080 dense 89MiB）；
  - 256MiB total transient peak 保证准备期旧+新+已解码图的总上界（实测 209.8MiB）；
  - ImageBitmap cache 按 current scene/window 所有权计入 total 项，scene transfer 后
    stale bitmap `close()` 释放、不常驻 max1080 envelopes；
  - 若不批准：保持 §5 原文 → 1080 dense 设计不可行 → 需改 §6 分配策略（如允许同
    depth 拆多 canvas/行条带复用）后重审。
```

## R4. 修订版结果汇总

| Evidence（PR0-revised @ 737a4bd+） | Result |
|---|---|
| synthetic dense 6 档 × 位置 guard/shape | PASS（复测 5/5，max 61201B） |
| real Map002/066 | PASS（30/30 guardPass） |
| Core update residual | **STOP A 确认**（R2 精确反证：probeLimit 全量三遍历+慢序列化；Map-local 不可解） |
| M13 equality camera-only | PASS（0.002ms） |
| Chromium private `::slotted` stacking | PASS |
| Canvas memory | **STOP B 维持**（R3：原文 128MiB 于 1080 dense 不可行；双预算修正待 owner 明确批准） |
| Hostra 640 baseline（复测） | ordinary p95=43.3ms / refresh p95=109.1ms（与原 41.1/93.6 同特征，refresh 既有失败归 PR1） |
| **Map Docs Freeze** | **HOLD**（STOP A 未解 + STOP B 未获明确批准） |
| PR1/PR2/PR3 | **BLOCKED**（依主合同 §12 顺序：Freeze → PR1） |
