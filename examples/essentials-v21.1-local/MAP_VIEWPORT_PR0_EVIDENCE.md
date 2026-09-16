# Map Viewport PR0 — 冻结前可行性证据账本

> 状态：**TEMPLATE / PR0 NOT RUN / Map Docs Freeze HOLD**；2026-09-16。本文只记录实测结果，不定义schema/规则；唯一规范为[Map机械实施主合同](./MAP_DYNAMIC_VIEWPORT_PERFORMANCE_REFACTOR_DRAFT.md) §0–§14，motion细节见同目录子规范。旧历史M15 latency/旧三child `/1`的PASS不能作为本subject证据。

## 1. 证据身份（运行时必须完整填写）

```text
Owner / reviewer / timestamp: PENDING
Git base / exact executable subject SHA: PENDING
Build mode; Node/npm; Hostra source/version; Electron/Chromium; OS/CPU/GPU/DPR: PENDING
Hosted material source/checksum; local exact Essentials v21.1 FSDB path/checksum: PENDING
Commands and exit codes; raw stdout/stderr; tracing/screenshot artifacts: NOT RUN
```

本文件不得因设计已书写就打PASS。正式提交真实数据时为每次运行固定一个exact executable/cohort SHA；任何代码/fixture变化更新subject，旧证据不可挪用。找不到local FSDB或真正的production Hostra/Chromium时标`EVIDENCE MISSING`，不可用synthetic proxy推断真实素材通过。

## 2. 不改生产代码的固定 hosted dense fixture

按主合同§10生成 Map(width128,height96,z0..2均填充)：`z0=384+((x+y)%8); z1=48+((x+2*y)%48); z2=384+((x+3*y)%8)`，有效Tileset indexes 0..391，regular384..391 priorities依次0,1,2,3,4,5,0,1，autotile48..95使用有效slot0资源。完整shape/byte guard、128/256MiB、CSS `::slotted` stacking的pixel oracle必须覆盖：

```text
320x240, 640x480, 800x600, 960x540, 1280x720, 1920x1080
center player (64,48); 4 edges; center -> right one tile
priority0..5 / equal depth / tall sprite / autotile / source-target union
```

任何用减小density、空z layer或静态fake byte估算替换均不合格。Map-private data每一字段/tuple/chunk集按主合同§4，真实bytes只认`TextEncoder().encode(JSON.stringify(fullMapViewData)).byteLength`；记录最大和所有尺寸/position样本，要求 `<196608`。另单测完整`RenderDomain.update` author total/full-state+snapshot residual、M13 recursive structural equality（固定large chunks仅camera变）、Browser当前640 baseline raster+candidate private-shadow stacking与peak backings/decode；不得通过跳过Frozen validation/修改M13测试来减时间。

## 3. Real Essentials exact-local evidence（不得从 hosted 推断）

使用受治理的 Essentials v21.1本地FSDB，分别Map002、Map066，加载真实Map/Tileset及resources，按同一§4 schema在640/720/1080与地图四边、可能的densest窗口建全data，记录：map id/position、TileVisual unique entries、chunk count、UTF-8 bytes、resource dimensions、canvas decoded+backing budget、旧Browser当前640 latency。发现local资源不存在/不符合支持范围/超guard/源事实冲突→STOP并如实报告；不自行改importer或资源名单。

## 4. 调查 harness、唯一时钟

PR0允许新增：`test/map-viewport-pr0.test.mjs`、`test/map-viewport-pr0-hostra.test.mjs`，以及更新本证据文件；不改production/既有Frozen断言。已有命令`npm run build:m14`；新增测试**创建后**执行：

```bash
node --test test/map-viewport-pr0.test.mjs test/map-viewport-pr0-hostra.test.mjs
npm run docs:check-links
```

必须复用现有 `test/map-layering-browser.test.mjs` 的PNG/Chromium及 `test/m15-hostra-product.test.mjs` Hostra product harness。单一window `performance.now()` 记录`input-captured.at→browser-first-motion-paint.at`和非resize refresh trigger→paint（见M15已存在seam）；Browser screenshot/pixel oracle另验实际正确像素，不能把screenshot/CDP往返算到历史P95或拿RenderData receive充当paint。异进程now不相减；720/1080未实现dynamic只能写`prototype-only`，不填product PASS。记录每桶与三轮原始样本（若为当前640基线）及 CPU/memory诊断；缺失数据标MISSING而非0。

## 5. 必填结果（当前全未取得）

| Evidence | Result | Raw data / artifacts |
|---|---|---|
| Fixed synthetic schema + all sizes + max bytes | NOT RUN | PENDING |
| Exact-local Map002 / Map066 true sources + dense1080 | NOT RUN | PENDING |
| Full `RenderDomain.update` validation and snapshot cost | NOT RUN | PENDING |
| M13 full structural equality cost for camera-only changes | NOT RUN | PENDING |
| Current Browser raster/receive baseline and peak memory | NOT RUN | PENDING |
| Shadow-only slotted Sprite, pixel priority0..5/equal/tall | NOT RUN | PENDING |
| Current Hostra 640 ordinary/refresh historical-seam baseline | NOT RUN | PENDING |
| No unresolved Core/M13 independent latency bottleneck | NOT VERIFIED | PENDING |
| Reviewer/date/docs subject SHA / Map Docs Freeze | PENDING / HOLD | PENDING |

PR0要求**设计可行性、数值风险归因、真实输入合法和无未解阻塞**，不要求尚未写出的PR1/PR2已经达到camera-only zero tile draw、目标640/720/1080 P95或动态真实产品PASS。发现任何问题立刻提交expected/actual、resource/input与trace，冻结保持HOLD；负责人修订主合同、重新审查并记录新docs SHA，不能授权低判断力Agent擅自换算法。只有PR1/PR2实施后在PR3同一新executable/cohort SHA通过主合同§10的完整性能/功能/P95/内存门槛，才能称Product Closed。
