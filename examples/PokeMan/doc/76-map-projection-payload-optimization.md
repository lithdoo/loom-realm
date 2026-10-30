# Map Projection Payload Optimization v1

> 状态：**设计提案 / Documentation-only；尚未实现、尚未通过性能资格**
>
> 关联实测：[#133 — Map 投影窗口刷新卡顿来自整表瓦片的 JSON 校验](https://github.com/lithdoo/loom-realm/issues/133)
>
> 相关设计：[Map v1.1](./75-map-presentation-v1.1.md)
>
> 相关后续：[PR #128 — 固定世界坐标投影缓存提案](https://github.com/lithdoo/loom-realm/pull/128)、[PR #129 — 增量投影正确性与性能验证方案](https://github.com/lithdoo/loom-realm/pull/129)、[PR #131 — stale-pixel 修复](https://github.com/lithdoo/loom-realm/pull/131)。共享架构优化见 [PR #135](https://github.com/lithdoo/loom-realm/pull/135)。

---

## 1. 目标与问题边界

本方案处理 Map 模块产生的大型投影载荷，不修改 LoomRealm 通用 JSON 安全边界。

目标是：

1. Camera-only movement 不重新生成或传输 Tile 数据。
2. Projection window 移动时，不再把整个窗口的 Tile tuple 数组作为一个整体反复替换。
3. 只更新新进入、内容变化或确实失效的有界 Tile 区域。
4. 保留精确的投影 payload 字节预算，不通过放大预算或 prefetch margin 隐藏卡顿。
5. 保持 Runtime 的地图事实 authority、RenderDomain 的单一权威数据流，以及 Map Browser Presentation 的 accepted/staging scene 语义。

本 PR 的职责是定义 Map 侧的数据形状、更新策略、测试与验收标准。Wire、Data Codec、RenderManager、Renderer Store 的通用验证优化由独立的 Realm 架构 PR 负责。

## 2. Issue #133 的实测基线

Issue #133 在已发布 subject 19ae9146、PokeMan Map 7、真实物理机 Chromium 路径上观察到：

- Map 7 尺寸为 60×43。
- 1920×1080 布局的一次窗口刷新包含约 3,289 个 tile tuple。
- y=21 刷新时 overlap 为 2,502,656 像素，dirty cell 为 2,546。
- Worker 步进任务约 145ms；紧接着主线程 MessagePort::Accept 约 136ms。
- y=16 的另一轮刷新中，Worker 约 128ms、主线程约 95ms，即使 dirty cell 只有 60 个，主线程仍明显卡顿。
- 1280×720 路径约 1,675 个 tile；7 次窗口移动观察到 50–83ms 帧间隔。

CPU profile 指向 JSON 校验与序列化，而不是 Canvas overlap readback：

- Worker 采样中 validateJsonValueAt 自耗时约 248ms，JSON.stringify 约 141ms，stringifyValidatedJson 约 50ms。
- 主线程采样中 validateJsonValueAt 自耗时约 130ms；getImageData 约 14ms，RenderStore validateData 约 11ms。
- 去掉真实像素读回的对照仍出现 88–103ms 长任务。

这些数字是 Issue #133 的特定设备、浏览器、路线和 subject 的诊断证据；它们不是 doc/30-development/performance.md 定义的 Hostra full/native P95 qualification 结果。后续比较必须使用相同路线和环境复测，并另行运行正式资格测试。

## 3. 当前 Map 热路径

主要位置：

- game-libs/map/src/runtime.ts：viewportPayload、projectionBytes、selectProjectionWindow、renderState。
- game-libs/map/browser/map.browser.js：VIEW_KEYS、assertMapViewData、Tile tuple 校验和 projection raster。
- packages/subsystem：RenderDomainUpdate 的通用节点更新入口；不属于本 PR 的实现范围。

当前 Runtime 在 projection window 不再覆盖 required bounds 时，按 margin 4、3、2、1 尝试候选窗口。每次尝试会：

1. expandTileBounds；
2. projectTilesInBounds 并创建 TileTuple；
3. 构造完整 viewport payload；
4. 对 payload 执行 JSON.stringify；
5. 用 TextEncoder 计算 UTF-8 字节数，以 VIEW_DATA_GUARD（当前 196,608 bytes）判断是否接受。

最终刷新时，viewport data 的 tiles 字段整体替换为 nextWindow.tiles。对一个只新增少量边缘 Tile 的窗口移动，这会把窗口内原本未变化的 Tile 一并放入更新载荷。

Map Browser 当前也将 tiles 作为 lr-map-view 的一个整体字段消费。因此，缩小 Runtime 生成的载荷必须同时定义 Browser Presentation 如何接收并组合这些有界分块，不能只在 Runtime 侧发送不完整数组。

## 4. 设计原则

### 4.1 保留 Map 与 Realm 的职责边界

- Map Runtime 决定地图、Tile、投影 bounds、camera 和视觉版本。
- Map Browser Presentation 消费 Map 专属投影数据并负责像素呈现。
- Realm 通用层只处理 RenderNode、JSON、Patch、Snapshot 和消息边界，不理解 Tile、depth、bridge 或 map chunk。
- 不增加绕过 assertJsonValue、Render Codec 或 RenderStore 安全约束的 Map-only 通道。
- 不将 Canvas、ImageData、缓存对象或 Browser DOM 状态放入 RenderDomain data。

### 4.2 不扩大 projection window 来掩盖刷新成本

保留当前 margin 优先顺序与 VIEW_DATA_GUARD。不得通过增加 prefetch margin、扩大 196,608-byte guard 或静默裁剪 Tile 来降低刷新频率。

### 4.3 区分 payload 优化与像素缓存优化

本方案解决 Runtime → RenderDomain → Renderer 的 Tile 数据表示与更新量。

PR #128 讨论的是 Map Browser Presentation 内部固定世界坐标 chunk cache / ring buffer，目标是避免 overlap 像素复制。两者是不同成本面：

- 本方案不宣称消除 getImageData / putImageData。
- PR #128 不替代本方案对整表 Tile payload 的缩减。
- 两条路径可以独立实现和测量，最终集成时再共同验证。

## 5. 候选方案：有界 Tile Band / Chunk Slots

建议将单个 lr-map-view.data.tiles 大数组拆成固定数量、稳定 key 的 Map 专属 Tile Band RenderNodes。每个 Band 表示一个有界世界坐标区域，数据只包含该区域内的 Tile tuple。

概念结构：

~~~text
lr-map-view
  data:
    sceneEpoch / visualEpoch
    map identity / map dimensions
    camera / viewport geometry
    projection bounds
    tileset / autotile refs
    bridgeLevel
  children:
    lr-map-tile-band:slot-0
    lr-map-tile-band:slot-1
    ...
    lr-map-sprite:player
    lr-map-sprite:npc-...
~~~

Band data 至少包含：

- map / scene identity；
- band 的世界坐标原点和覆盖范围；
- 当前 slot generation 或等价的 stale-update 防护标识；
- 该 band 内按现有顺序排列的 Tile tuple；
- 必要的 visual/resource identity。

### 5.1 使用稳定 slot，避免热路径结构性增删节点

当前 RenderDomainUpdate 主要提供对既有 RenderNode 的 attrs/data 更新。为了让 projection shift 继续使用现有增量更新路径，优先预建一个有界 slot 集合：

- slot key 在同一 map/layout 生命周期内稳定；
- slot 被重新分配到新的世界 band 时，只替换该 slot 的有界 data；
- 未变化的世界 band 保留原数据引用或版本；
- resize、map transfer 或 slot 容量确实变化时，才走现有完整 state replace / accepted-staging 流程；
- slot 数量由最大支持 viewport、当前 guard margin 和 band 尺寸推导，并设硬上限。

不要为每个 Tile 建立一个 RenderNode；那会把一个大数组问题换成数千个节点和更大的树管理开销。

### 5.2 Band 尺寸是 benchmark 参数，不在设计阶段冻结

可从 8×8 tile band 开始，并比较 4×4、8×8、16×8 等尺寸。选择依据：

- 每次窗口移动实际触及多少 band；
- 每个 band 的最大 tuple 数和字节数；
- 每次刷新更新的 slot 数；
- RenderNode 总数、Tree walk 成本；
- Browser raster dirty-cell 数和 band 准备耗时；
- 1920×1080 与 1280×720 两种布局的 P50/P95/P99。

Band 过大，会把少量进入 Tile 扩大成大块重发；Band 过小，会增加节点数量和管理开销。最终值必须由真实地图基准决定。

### 5.3 只更新进入或变化的 band

窗口移动时：

1. 根据新旧 projection bounds 计算需要的世界 band 集合。
2. 对仍覆盖相同世界坐标、且 resource/visual identity 未变化的 band 复用现有数据。
3. 只为新进入窗口或发生内容变化的 band 更新 slot。
4. 对退出窗口的 slot，按 slot generation 和 accepted projection 生命周期安全回收或重新分配。
5. Map Browser 只处理变化的 band，并在 band 内按 depth + cell membership 清理删除项、绘制新增或视觉变化项。

对于只移动 camera、projection bounds 和 band membership 均未变化的普通移动，不应更新任何 Tile Band。

若一个 band 内仅有少数 cell 变化，可以评估 band 内部 cell delta；但第一阶段优先采用简单、可验证的有界 band replacement，避免过早引入复杂的多层 patch 语义。

## 6. Projection byte accounting

VIEW_DATA_GUARD 仍是硬限制。字节计量必须覆盖完整的 Map 投影消息，包括 view metadata、band payload、必要的 sprite/resource refs 和协议字段。

当前 projectionBytes 对每个 margin 候选执行完整 JSON.stringify + TextEncoder。改造目标：

- 不为每个候选重新序列化完整 viewport payload；
- Tile tuple 被生成时即可累计其精确 JSON UTF-8 编码长度，或通过等价的精确 JSON byte counter 计算；
- 固定 envelope / key / punctuation 开销只计算一次；
- 对不同 margin 的候选复用已计算的 Tile/band 元数据；
- 预算判断仍使用精确字节数，不使用可能低估的平均值或近似值；
- 最终消息仍由 Realm 通用边界进行必要的 Schema、大小和序列化处理。

若后续 Realm 架构 PR 提供通用、可信的 JSON size metadata，Map 可以在不引入 Map 语义到通用层的前提下复用该能力；本 PR 不依赖关闭或绕过通用验证。

### 验证要求

建立独立 byte-accounting 测试，至少覆盖：

- 空 band、单 Tile、多层 Tile stack；
- 正负数、边界整数和不同位数的数字；
- Unicode map/resource key；
- JSON 需要转义的字符串；
- 0、1、196,607、196,608、196,609 bytes 附近的预算边界；
- 新计量结果与 JSON.stringify + TextEncoder 参考实现逐字节等价。

## 7. 正确性与兼容性约束

实现必须保留：

- #131 已修复的窗口移动 + 删除 / depth 迁移无残影行为；
- depth + cell 的旧像素清理；
- autotile、bridgeLevel、priority、同 cell stack 的排序语义；
- projectionBounds 与 map edge 的半开 / 闭区间约定；
- sceneEpoch、visualEpoch、motionId 的现有含义；
- player、NPC、camera 的同步；
- acceptedVisualScene / stagingVisualScene 原子提交；
- Browser Presentation failure 不回滚 Runtime authority；
- 有界 surface / cache / slot 生命周期；
- camera-only movement 的轻量路径。

Band 重分配、异步 raster 或资源加载必须防止旧 generation 覆盖新 projection。未完成新投影准备时，不能显示空洞或混合新旧 scene。

## 8. 测试计划

### 单元与协议层

- projection bounds 到 band 集合的确定性映射；
- 不同方向移动时进入、保留、退出 band 的 membership；
- slot generation 防止 stale update；
- band byte accounting 与 JSON.stringify 参考结果完全一致；
- band tuple 顺序、depth 和 cell stack 与原始整表投影一致；
- resize / map transfer 时 slot 集合重建边界明确。

### Browser 正确性

- 对同一地图和 camera，旧的完整 tiles projection 与 band projection 产生完全相同的 RGBA 输出；
- 比较完整像素缓冲区，不只采样单点；
- 覆盖 sparse cells、删除、depth migration、视觉替换、autotile、bridge、地图边界；
- 连续向上、向下、向左、向右和对角移动；
- 多次 slot 重分配后不得残留旧 Tile；
- map transfer 保持旧 accepted scene 完整，target scene ready 后原子提交。

### 增量工作量断言

- camera-only update：Tile Band 更新数为 0；
- 小幅 projection shift：更新量只与进入 / 变化 band 有关，不随完整窗口 Tile 总数线性增长；
- slot 总数和最大单 slot payload 有固定上限；
- 不得以增加完整 raster、Canvas allocation 或主线程大对象复制来换取更小的 Worker patch。

## 9. 物理机性能验证

复用 Issue #133 的同一 Map 7 路线、同一 subject 构建方式和 viewport：

- 1920×1080：Map 3 出生点 → Map 7 → 连续向北走过多个 projection boundary；
- 1280×720：同一路线，覆盖水平和垂直窗口移动；
- 至少重复多轮，保留每一轮结果，不挑最快的一轮；
- 记录 Worker movement/update 耗时、主线程 MessagePort::Accept、Long Task、RAF 间隔、band 数、band bytes、Tile tuple 数、完整 Snapshot/Patch bytes；
- 同时记录 dirty-cell raster、Canvas copy 和 allocation 指标，以免把成本转移到 Browser；
- 对比 baseline 与改造后同一环境下的 P50/P95/P99 和最大值。

Issue #133 的物理机数据是诊断基线，不等同于 Hostra full qualification。正式资格仍按 doc/30-development/performance.md 执行。

## 10. 实施阶段与合并门槛

### Phase 0 — instrumentation

在不改变输出的前提下，记录 projection candidate 次数、Tile tuple 数、每候选精确字节数、最终发送字节数、band/slot 数和各阶段耗时。

### Phase 1 — data model prototype

在 Map 私有实现中验证固定 slot 的 band model。先用旧完整 projection 作为 oracle，对照同一地图的所有像素和 Tile membership。

### Phase 2 — incremental publication

camera-only 不更新 band；projection shift 只更新进入或变化的 slot。保留原始整表路径作为测试参考，不作为生产双权威路径。

### Phase 3 — physical-device qualification

使用 Issue #133 相同路线和设备/浏览器基线复测，报告 Worker、主线程和 Browser 三段成本，不以单一总耗时掩盖成本转移。

### Merge gates

- [ ] 不放宽 VIEW_DATA_GUARD 或 Realm message/data limits。
- [ ] projection byte counter 与真实 JSON UTF-8 bytes 精确一致。
- [ ] camera-only 不发送 Tile payload。
- [ ] projection shift 不再发送未变化的整个 Tile window。
- [ ] band/slot 数、单 slot payload 和内存均有上限。
- [ ] 与 full projection oracle 的像素结果完全一致。
- [ ] #131 回归、Map/PokeMan Browser 测试和 map package 测试通过。
- [ ] 物理机结果同时报告 Worker 与主线程耗时。
- [ ] 不把本次优化描述为消除了 overlap pixel copy；该目标属于独立的 raster cache 方案。

## 11. 非目标

- 修改 packages/wire 的通用 JSON trust boundary。
- 修改 packages/data 的 Render Snapshot/Patch ABI。
- 为 Map 增加跳过通用验证的特权 API。
- 在通用 RenderStore 中加入 Tile/depth/bridge 语义。
- 在本 PR 中实现 PR #128 的固定世界 Canvas cache / ring buffer。
- 放宽性能资格、消息大小限制或 Map projection guard。
- 用这次 PWA 物理机路线代替正式 Hostra full/native qualification。
