# Map Projection 正确性修复与性能验证方案

> 状态：Proposed — implementation / regression validation plan  
> 适用实现：Map Presentation v1.1，`game-libs/map/browser/map.browser.js`  
> 相关设计：[75-map-presentation-v1.1.md](./75-map-presentation-v1.1.md)  
> 相关优化提案：[PR #128 — fixed-world projection cache v1.2](https://github.com/lithdoo/loom-realm/pull/128)  
> 相关实现：[PR #127](https://github.com/lithdoo/loom-realm/pull/127)；[Issue #124](https://github.com/lithdoo/loom-realm/issues/124)

---

## 1. 目的与范围

本方案针对 Map v1.1 增量 raster 路径的两个 P1 验收缺口：

1. **正确性：** 投影窗口移动时，重叠区域中已删除或已迁移到其他 depth 的旧 Tile 像素可能被复制到新 Canvas，且没有清理。
2. **性能可观测性：** 移动窗口时会对重叠像素区域调用 `getImageData()` / `putImageData()`；现有测试只统计 Canvas 与 Tile 绘制计数，无法量化该复制的像素面积、字节量和耗时。
3. **计数器语义：** `_fullRasterPasses` 目前主要在 scene 被判定为不同的时候递增。同一 scene 下因没有重叠区域或 Canvas resize 而重绘全部 Tile 时，计数器可能没有反映实际的全量绘制。

本文件定义修复原则、回归测试、性能基准和合并门槛，不预先规定最终的缓存后端。实现应先保证像素正确性，再以可复现数据决定是否需要采用固定世界坐标 chunk cache / ring buffer 等方案。不得把“Dirty-cell draw 较少”直接等同于“整次更新成本低”。

## 2. 当前实现与风险点

核心实现位于 `game-libs/map/browser/map.browser.js` 的 `_rasterIncremental()`：

- 当投影边界变化且有重叠时，先对重叠矩形执行 `getImageData()`。
- 调整 Canvas 尺寸 / 世界坐标，清空 Canvas，再用 `putImageData()` 恢复快照。
- 旧 cell 的清理被限制在 `previous && !shifted && !resized` 分支。
- 后续绘制循环遍历的是新投影中的 Tile，旧投影中已删除且不再出现的 cell 不会由该循环自动清除。

因此，窗口移动同时发生 Tile 删除或 depth 变化时，恢复的重叠快照可能包含不再属于新投影的像素。现有 sparse projection 测试虽然使用精确的 5×5 projection bounds，但窗口内每个 cell 都被填充，且只检查一个采样像素；它不能证明删除场景无残影，也不能证明整帧与完整 raster 等价。

### 2.1 像素复制成本

设重叠快照尺寸为 (W_o \times H_o)：

- 快照像素数：(P_o = W_o H_o)
- RGBA 读取数据量：(R_o = 4P_o) bytes
- 恢复数据量：(W_o' = 4P_o) bytes
- 单次更新最少涉及的逻辑像素数据传输量：约 (8P_o) bytes（读取 + 写入；不代表浏览器内部的实际内存流量上限）

`getImageData()` 可能触发同步像素读回；`putImageData()` 也需要处理整个快照。以上成本可能与重叠区域面积成比例，而不是与新增 Tile 数量成比例。实际延迟必须在目标浏览器中测量，不能仅从理论字节量推断。

## 3. 修复原则

### 3.1 首选：清理每个 depth 中已失效的旧 cell

在快照恢复之后、绘制新 / 变化 Tile 之前，按 **depth + cell 坐标** 比较旧、新投影 membership：

1. 对旧 scene 的每个 cell stack，判断相同 depth 的 cell 是否仍存在于新 scene。
2. 如果旧 cell 已不存在于该 depth，且该 cell 的像素可能通过重叠快照进入当前 Canvas，则清理其对应像素区域。
3. 对新投影中的新增或视觉发生变化的 cell，按现有路径清理 cell 后重新绘制。
4. 对无法安全复用的层（例如没有有效重叠、尺寸变化导致快照不可恢复、坐标映射不可靠），回退到该层的完整 raster。
5. 只有确认像素可复用的 cell 才能跳过绘制。

**必须以 depth 为 membership 的一部分。** Tile 从 depth A 移到 depth B 时，应清除 A 中的旧像素，并在 B 中绘制新像素。仅检查同一坐标是否在任意 depth 存在是不够的。

清理逻辑应受实际 Canvas 世界坐标、有效重叠矩形和层边界约束；不得因清理旧 cell 而误删新投影中应保留的像素。若 membership diff 不能保证正确性，应优先重建受影响的深度层，而不是冒险复用快照。

### 3.2 保留现有场景提交语义

修复不得破坏 Map v1.1 的以下约束：

- accepted / staging visual scene 的原子提交与失败隔离；
- 不同 scene、资源 identity、autotile frame 的现有失效规则；
- depth 顺序、同 cell tile stack 和 sprite/tile stacking 语义；
- Canvas surface pool 的有界生命周期；
- camera-only fast path 的既有行为。

不得为了让测试通过而放宽输入校验、跳过必要重绘或改变 projection bounds 契约。

### 3.3 不在缺少基准数据时强行选定缓存后端

固定世界坐标 chunk cache 与 tile-aligned ring buffer 是潜在优化方向，详见 [PR #128](https://github.com/lithdoo/loom-realm/pull/128)。本次修复应先建立正确性 oracle 和复制成本基线。若测量证明大面积像素复制是主要瓶颈，再依据真实基准选择后端；不得只因为某个方案理论上更快就宣称性能问题已解决。

## 4. 正确性回归测试

建议在现有 `test/map-layering-browser.test.mjs` 中扩展测试，或在同目录建立职责清晰的独立 browser test。测试应使用确定性资源（例如不同 Tile 使用固定不透明色、背景使用透明像素），避免依赖随机素材、动画时序或肉眼观察。

### 4.1 必须覆盖的场景

| 场景 | 输入变化 | 必须验证 |
|---|---|---|
| 重叠区删除 | 窗口平移；旧窗口重叠 cell 中删除一个 Tile | 旧 Tile 像素被清除，不出现残影 |
| depth 迁移 | 窗口平移；同坐标 Tile 从 depth A 移到 B | A 层不残留；B 层正确绘制；最终合成结果正确 |
| 同 cell 视觉替换 | 窗口平移；Tile identity / stack 发生变化 | 旧颜色完全消失，新颜色与参考结果一致 |
| sparse overlap | 重叠区有空洞，且删除位置位于空洞附近 | 空白像素保持透明，不被旧快照污染 |
| 新增 strip | 窗口平移并加入进入窗口的新 Tile | 新增 Tile 完整绘制，未改动的重叠 Tile 保持正确 |
| 无重叠窗口 | 新旧 projection bounds 不相交 | 安全全量重绘；没有旧像素泄漏 |
| resize / 边界变化 | 更新导致 Canvas 尺寸变化或投影触及地图边界 | 正确回退或正确复用；无裁切、拉伸和残影 |
| scene / 资源变化 | scene epoch、tileset 或相关视觉资源改变 | 按现有失效规则重建，不复用不兼容快照 |
| 多 depth / stack | 同 cell 多个 tile stack，或相邻 cell 属于不同 depth | 清理范围和层顺序正确，不误删邻格 |

至少要有一条确定性测试同时覆盖“窗口移动 + 重叠 cell 删除”，以及一条覆盖“窗口移动 + depth 变化”。测试数据必须真的删除 / 迁移重叠区域中的 cell，而不是仅将窗口内所有 Tile 整体平移。

### 4.2 完整 raster 像素 oracle

不能只检查一个采样像素、Canvas 分配数或 draw 次数。对每个关键用例：

1. 使用同一份目标 projection 输入生成增量渲染结果。
2. 通过独立的完整 raster 参考路径，从空白目标 surface 绘制该 projection；参考路径不得调用增量复用或旧快照恢复逻辑。
3. 对每个受影响 depth layer 比较完整 RGBA 像素缓冲区；同时比较最终合成输出（如果测试 harness 能可靠读取该输出）。
4. 比较宽、高、透明度与全部像素字节；差异时输出第一个不匹配坐标、期望值、实际值和对应 depth。
5. 对动画 autotile 测试固定 frame 或冻结时间，避免把合法动画变化当作渲染错误。

**通过条件：所有像素完全一致。** 不允许使用“差异像素占比很小”作为残影缺陷的豁免条件。

## 5. 性能可观测性与基准

### 5.1 增加明确的计数器

为避免只观察 Tile 绘制数量，建议至少暴露或在测试中收集以下指标（命名可遵循现有私有字段风格）：

- overlap snapshot 次数；
- overlap snapshot 总像素数、最大单次像素数；
- 读取字节数、写入字节数，以及两者合计；
- `getImageData()` 耗时、`putImageData()` 耗时和两者总耗时；
- 每次更新的 Dirty-cell draw 数与 full-raster tile draw 数；
- 全量 raster 更新次数，以及触发原因（新 scene、无重叠、resize、显式安全回退等）；
- Canvas allocations、resizes、active surfaces 与 pooled surfaces。

耗时采样应围绕真实像素操作计时；测试报告要说明计时来源与浏览器环境。若生产路径中增加计时会带来可测量开销，可采用轻量计数 + 可控诊断模式，但不能让测试指标与真实代码路径脱节。

### 5.2 修正 full-raster 统计语义

`_fullRasterPasses` 应按实际工作量定义，而不是仅按 scene identity 定义。凡一次更新实际重绘了该更新中全部可见 / 投影 Tile，都应计为一次全量 raster（或者增加语义更精确的独立计数器，并保留旧字段兼容性）。

测试必须明确区分：

- scene 变化触发的全量 raster；
- 无有效重叠导致的全量 raster；
- resize 或不安全复用触发的全量 raster；
- 真正只绘制新增 / 变化 cell 的增量 raster。

不要把全量重绘隐藏在 `_rasterIncremental()` 中，也不要只通过一个 counter 不变就推断没有全量工作。

### 5.3 确定性成本测试

构造固定尺寸的窗口与已知重叠矩形，断言 snapshot 像素数和字节数与几何面积严格相符。例如 RGBA 读取字节数应为 `overlapWidth * overlapHeight * 4`；读取和写入均完整执行时，逻辑读写总字节数应分别累计，而不是只计入一次。

这些测试验证的是**成本是否被准确计量**，不是要求任意窗口移动都达到某个未经基准支持的耗时阈值。

### 5.4 浏览器基准矩阵

至少比较修复前与修复后版本，在同一机器、同一 Chromium 版本、同一数据集下运行：

- viewport：320×240、640×480、1280×720、1920×1080；
- 重叠比例：高重叠（小幅移动）、中等重叠、低重叠、零重叠；
- 地图密度：dense、sparse（含空洞）、多个 depth；
- 更新序列：单次平移、连续至少 100 次平移、删除 / depth churn、resize；
- 记录：P50 / P95 / max update latency、snapshot pixels / bytes per update、copy time、Dirty-cell draws、full-raster count、Canvas allocation / resize。

报告必须包括机器与浏览器版本、视口、输入规模、预热 / 采样次数和原始数据。不要把不同设备的绝对毫秒数直接横向比较。若本次只补齐测量而没有移除大面积复制路径，应如实记录这一点，不能声称复制成本已被优化。

## 6. 合并验收门槛

### P1-A：像素正确性（阻塞）

- [ ] 移动窗口 + 重叠 Tile 删除回归测试失败于旧实现、通过于修复后。
- [ ] 移动窗口 + depth 迁移回归测试通过。
- [ ] 至少一个 sparse projection 用例使用真实空洞 / 删除，而非完整填充网格。
- [ ] 所有关键用例的增量输出与独立完整 raster 的整幅像素比较完全一致。
- [ ] 既有 stacking、autotile、camera-only、scene/resource invalidation 测试通过。

### P1-B：性能真实性（阻塞验证，不预设结果）

- [ ] overlap snapshot 的像素面积、读写字节数与几何计算一致。
- [ ] 计时覆盖真实 `getImageData()` / `putImageData()` 调用。
- [ ] 无重叠与 resize 的全量绘制被正确统计。
- [ ] 性能报告能回答：窗口每次移动到底复制了多少像素、花了多少时间、绘制了多少 Tile。
- [ ] 对比结果明确说明复制成本是否仍然随重叠区域面积增长，以及是否需要单独提交缓存后端优化。

### 回归与交付

- [ ] 运行 map browser layering 的定向测试和项目已有的 Map / RPGMap 测试入口。
- [ ] 运行相关构建与文档链接检查（若仓库脚本适用）。
- [ ] 在 PR 描述中列出测试命令、通过 / 失败结果、浏览器环境和基准摘要。
- [ ] 不将未运行的测试描述为通过；无法运行的项目应标明原因与后续步骤。

## 7. 推荐执行顺序

1. 先添加会失败的删除 / depth 迁移回归测试。
2. 修复 stale-cell 清理，必要时对受影响层执行安全的全量重建。
3. 增加独立完整 raster oracle，确认所有像素完全一致。
4. 纠正 full-raster 统计语义并增加像素复制计数与计时。
5. 运行定向测试和现有 Map 测试套件。
6. 运行同环境基准，记录复制成本与更新延迟。
7. 根据数据决定是否另行实现固定世界坐标 chunk cache / ring buffer；该后端选择不应凌驾于像素正确性与有界内存要求之上。

本方案的首要成功标准是**无残影且与完整 raster 像素等价**。性能成功标准则是获得真实、可复现的工作量与延迟证据；任何进一步优化都必须在该正确性基线上进行。
