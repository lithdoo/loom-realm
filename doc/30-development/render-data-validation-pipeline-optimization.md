# Render Data Validation Pipeline Optimization

> 状态：**架构设计提案 / Documentation-only；尚未实现、尚未通过资格验证**
>
> 触发证据：[Issue #133 — Map 投影窗口刷新卡顿来自整表瓦片的 JSON 校验](https://github.com/lithdoo/loom-realm/issues/133)
>
> 适用范围：packages/wire、packages/data、packages/subsystem、packages/renderer。
>
> 本文不引入 Map、Tile、depth、bridge 或 Canvas 语义。Map 是暴露共享热路径成本的高负载使用者，不是通用数据协议的特殊例外。

---

## 1. 摘要

Issue #133 的真实物理机诊断显示，projection refresh 的主要成本不是 Canvas overlap readback，而是同一份大型 Render Data 在 Worker 和主线程被多次完整遍历、验证、复制、计算深度和序列化。

目标不是关闭验证，而是：

> 对不可信输入保留严格安全检查；在数据进入可信、不可变状态后，避免同一对象在同一生命周期内被重复完整验证。对增量更新，只重新计算发生变化的子树及其祖先的精确元数据。

核心设计方向：

1. 将结构检查、业务约束检查、深复制/冻结和元数据计算合并为一次入口遍历。
2. 为可信不可变 JSON 保存精确的 depth、UTF-8 serialized bytes、member/node count 等元数据。
3. 在 RenderManager 的 copy-on-write update 中复用未变化子树和元数据。
4. 避免每次小 Patch 都对完整 Snapshot 再执行 assertJsonValue、jsonDepth 和 stringify。
5. 在 Data Codec 中区分任意 JavaScript 对象与 JSON.parse 产生的 parser-owned JSON；合并重复验证，但保留 Schema、有限数字、深度、成员数和字节限制。
6. Renderer Store 对更新后的数据使用增量元数据验证，不再无条件重新扫描整个 node.data。

## 2. Issue #133 的实测证据

Issue #133 报告的特定物理机 / Chromium / PokeMan Map 7 路线：

- 1920×1080，y=21 窗口刷新：Worker 步进任务约 145ms，随后主线程 MessagePort::Accept 约 136ms。
- y=16 另一刷新：Worker 约 128ms，主线程约 95ms。
- 其中 Canvas getImageData / putImageData 只有数毫秒级；不读像素的对照仍出现 88–103ms 长任务。
- Worker CPU profile：validateJsonValueAt 自耗时约 248ms，JSON.stringify 约 141ms，stringifyValidatedJson 约 50ms，depthOfValidatedJson 约 17ms。
- 主线程 CPU profile：validateJsonValueAt 自耗时约 130ms，RenderStore validateData 约 11ms，getImageData 约 14ms。

这些是整段行走采样中的 CPU 自耗时与单次窗口刷新 tracing 的不同统计口径，不能把它们直接相加成一次刷新延迟。它们共同证明：Worker 和主线程都在为大型 JSON 做显著的重复处理。

此证据不是 Hostra full/native qualification 结果。正式门槛仍由 doc/30-development/performance.md 定义。

## 3. 当前重复工作清单

以下是本设计所依据的当前 main 实现路径。实现 PR 应在开工时重新核对调用关系与行号。

### 3.1 RenderManager：输入 Delta 验证、复制和冻结

文件：packages/subsystem/src/internal/render-manager.ts

validateDelta 对 data.set 中每个值调用 validateJsonValue。该函数依次：

1. assertJsonValue：检查 plain object/array、prototype、property descriptor、cycle、finite number 等；
2. 再做递归 walk：检查 string、容器成员数和 key 长度；
3. detachedFrozen：再次递归，深复制并冻结对象。

随后 applyDataDelta 构造完整 next data，并调用 validateJsonData。后者又执行：

- assertJsonValue；
- depthOfValidatedJson；
- 全对象/数组成员遍历；
- stringifyValidatedJson 计算完整 UTF-8 bytes。

同一份输入子树可能因此先被验证、再被复制、随后与旧数据合并，最后又连同未变化字段一起重新扫描。

### 3.2 RenderManager：小 Patch 触发完整 Snapshot probe

同一文件的 update 路径在 applyCow 之后执行：

- probeLimit(render.snapshot)：对完整 nextState 执行 assertJsonValue、depthOfValidatedJson、stringifyValidatedJson；
- probeLimit(render.patch)：对 Patch 再执行相应检查。

即使本次只修改 cameraX 等小字段，Snapshot probe 仍遍历整个 roots；当 roots 中包含大型 Tile 数组时，成本与完整状态大小相关，而不是与本次 Patch 大小相关。

必须保留 Snapshot / Patch 的深度与消息大小约束，以及“验证失败不得提交非法状态”的事务语义；需要改变的是约束计算方式，不是约束本身。

### 3.3 Data Codec：encode/decode 的验证重叠

文件：

- packages/data/src/profile-codec.ts
- packages/data/src/render-codec.ts
- packages/data/src/validation-common.ts
- packages/wire/src/json-text.ts

当前 encodeForRole 大致执行：

1. validateByType；
2. assertJsonValue；
3. jsonDepth；
4. stringifyJson；
5. UTF-8 byte length。

而 stringifyJson 自身也调用 assertJsonValue，因此存在重复结构检查。validateByType 内部的 object/array/exact/renderData 等 helper 也可能对同一子树重复调用 JSON assertion。

当前 decodeForRole：

1. parseJsonText；parseJsonText 在 JSON.parse 后调用 assertJsonValue；
2. jsonDepth；
3. assertBoundedJson；
4. validateByType；
5. Render Codec 对 data 再执行 renderJsonValue、assertBoundedJson 和 stringifyJson。

renderJsonValue 自身先 assertJsonValue 再遍历字符串/键；assertBoundedJson 又遍历 depth/member；stringifyJson 再做 JSON assertion。对大型 RenderNode.data，这些检查具有明显重叠。

### 3.4 Renderer Store：更新后重新扫描完整 data

文件：packages/renderer/src/internal/render-store.ts

update-only Patch 的 commitUpdateOnlyPatch 对 node.data 执行 shallow touch、applyDelta，然后 validateData(node.data)。

validateData 会：

- 计算完整 jsonDepth；
- 遍历整个 data 的对象/数组；
- 检查容器成员数和 key byte length；
- JSON.stringify 完整 data 并计算 MAX_DATA_BYTES。

当一个节点的 data 同时包含大数组和少量动态字段时，即使 Patch 只改了一个小字段，验证成本仍然覆盖整个 data。

Snapshot clone/validate 仍需要完整处理新输入；本方案主要减少稳定状态上的小 Patch 热路径重复扫描，不承诺消除真正的 Snapshot 处理成本。

## 4. 不变量：什么不能关闭

以下约束是协议与安全边界，不允许通过全局开关跳过：

- 任意 JavaScript 输入必须拒绝循环引用、非 plain object、symbol property、accessor、稀疏数组、非有限数字和非法容器形状。
- 保留闭合 Schema、exact keys、消息方向、revision continuity、RenderNode identity/tag 不变等协议检查。
- 保留 MAX_MESSAGE_BYTES、MAX_PAYLOAD_BYTES、MAX_DATA_BYTES、最大深度、容器成员数、节点数和树深度限制。
- 保留 Unicode scalar / UTF-8 byte length 约束。
- 保留 RenderManager 更新的原子性：非法 Patch 不得部分提交状态。
- 保留 Renderer 对跨消息、跨 carrier、Snapshot/Patch 顺序和 stale identity 的检查。
- 保留发送端与接收端各自的信任边界；发送端的对象 brand / WeakMap 元数据不能穿过 MessagePort 或 JSON 文本后自动成为接收端的信任凭证。

本方案不提供 disableValidation、skipJsonCheck 或 Map-only bypass。

## 5. 目标模型：Validated Immutable JSON

建议在内部建立可信不可变 JSON 表示。以下是概念接口，不是要求直接暴露为 public API：

~~~ts
interface JsonMetadata {
  readonly depth: number;
  readonly serializedUtf8Bytes: number;
  readonly containerMembers: number;
  readonly valueCount: number;
}

interface ValidatedJson<T> {
  readonly value: T;
  readonly metadata: JsonMetadata;
}
~~~

### 5.1 一次遍历完成入口检查与 ownership transfer

对于来自任意 JavaScript caller 的 unknown：

1. 以严格 descriptor/prototype/cycle 检查验证结构；
2. 同时执行对应的业务约束（字符串长度、容器成员数、深度等）；
3. 在同一次遍历中创建 detached immutable copy；
4. 计算精确 metadata；
5. 冻结并将结果标记为内部可信对象。

不要先完整 assert、再完整 walk、再完整 clone/freeze。入口遍历应把这些职责融合，但不能降低任何检查强度。

metadata 的 serializedUtf8Bytes 必须与当前 canonical JSON serializer 输出的 UTF-8 byte length 精确一致，包含 key escaping、string escaping、逗号、括号和数字文本长度；不得用对象数量乘平均值等近似方法决定硬上限。

### 5.2 信任凭证与可变对象

- 不可信可变输入不能直接获得可信 brand。
- 可信 metadata 只能关联到 detached、deep-frozen、不可变对象。
- 可以使用模块私有 brand 或 WeakMap；调用方不能自行伪造 metadata。
- 对未冻结对象、可被外部修改的对象或跨边界重新构造的对象，不得复用旧 metadata。
- 不能仅因为 TypeScript 类型是 JsonValue 就认为运行时对象已验证。

### 5.3 增量 metadata

对不可变树执行结构共享：

- 未变化子树继续复用原对象和 metadata；
- 只对新增/替换的子树执行严格入口验证和 copy/freeze；
- 对受影响的祖先重新计算 depth、serialized bytes、member/value count；
- 删除字段时按子树 metadata 进行精确扣减；
- 对数组/对象分隔符、key、字段名和 envelope overhead 做精确计量。

任何缓存元数据都必须能由一个独立 full recompute oracle 验证。元数据不一致时应 fail closed，而不是绕过限制。

## 6. 各层改造方向

### 6.1 packages/wire

目标：

- 保留 assertJsonValue 作为任意 unknown 输入的严格检查入口。
- 增加内部的“验证并 detach/freeze/measure”能力，避免多个 helper 各自遍历。
- 提供只接受内部可信值的 serializer/byte-accounting 路径；公开 stringifyJson 的安全语义不能被无意削弱。
- 将 parser-owned JSON 与任意 JavaScript object 区分开。

JSON.parse 产生的对象天然没有 getter、symbol、proxy、cycle 或 sparse array；但 JSON 数字溢出仍可能产生 Infinity，因此 parser-owned 路径仍必须检查 finite number、Schema、depth、member 和 byte limits。不能因为数据来自 JSON.parse 就跳过所有验证。

### 6.2 packages/data

目标：

- encodeForRole 在一个明确的入口做一次严格输入验证 + Schema validation，然后序列化一次；不能 validateByType、assertJsonValue、stringifyJson 三次反复扫描同一树。
- decodeForRole 对 raw string 先保留 MAX_MESSAGE_BYTES 的输入保护，再 parse；随后通过一次面向 parser-owned JSON 的 Schema/limit pass 生成可信消息。
- renderData、renderJsonValue、assertBoundedJson 不应各自对同一 subtree 完整 walk；可共享一次 traversal context / metadata。
- 保留每种消息的 exact keys、字段类型、消息方向、深度与字节上限。
- Render Patch 的 data.set 必须在新增子树入口完成约束验证；不能信任发送端声明的 metadata。

### 6.3 packages/subsystem / RenderManager

目标：

- 将 validateDelta 中的 validate + walk + detachedFrozen 合并为一次严格验证、copy/freeze 和 metadata 计算。
- applyDataDelta 使用不可变子树结构共享；不要为了修改一个字段而重新复制或遍历所有未变化嵌套数据。
- 以缓存的准确 metadata 验证更新后的 data/snapshot limit。
- 不再每次 update 都对完整 Snapshot 调用 probeLimit 的全量 assert/depth/stringify。
- Patch 的大小单独精确计算；Snapshot 的合法性通过 state metadata 增量维护。
- 在 commit domain.state 前完成所有必要的 limit 与 Schema 检查，保持现有失败原子性。
- 发送前最终消息仍需要一次真实序列化；不要为了测大小再序列化一遍。

### 6.4 packages/renderer / RenderStore

目标：

- 接收来自 Data Codec 的内部 validated-message contract；不能依赖普通 TypeScript interface 作为信任证明。
- Snapshot 入口仍进行必要的完整构建、identity/tree 验证和 ownership transfer。
- update-only Patch 只验证新 delta 与受影响 data metadata；未变化子树的限制可以复用可信 metadata。
- 应用 Patch 后仍精确检查整个 data 的总深度和字节限制，但通过增量 metadata 计算，不通过重新 walk + stringify 全量数据。
- 任何不在可信内部调用链中的直接入口仍必须严格验证。

## 7. 建议实现顺序

### Phase 0 — instrumentation / baseline

为测试构建诊断计数器，至少记录：

- assertJsonValue 完整访问的 object/array 数；
- bounded/depth traversal 访问的节点数；
- clone/freeze 创建的对象数；
- stringify 次数和输入字节数；
- Snapshot probe 的遍历节点数与计算字节数；
- Patch data 更新的 changed subtree 与 unchanged subtree 大小；
- Worker 与 Renderer 端各阶段耗时。

诊断计数器应只用于测试或显式 profiling，不在普通生产热路径增加大量对象分配。

### Phase 1 — wire primitive

实现并验证严格的一次遍历入口与不可变 metadata。先证明所有现有错误场景仍被拒绝，metadata 与独立 full recompute 完全一致。

### Phase 2 — RenderManager

引入可信不可变子树与增量 metadata。先改 validateDelta / applyDataDelta，再改 probeLimit(snapshot/patch)。每个阶段都保持 state commit 原子性。

### Phase 3 — Data Codec

合并 encode/decode 中的重复 assertion、depth、bounded walk 和 stringify。保留最终序列化与接收端 Schema/limit 验证。

### Phase 4 — Renderer Store

在明确的 validated-message boundary 下复用 metadata，优化 update-only Patch。Snapshot 全量入口继续保持严格检查。

### Phase 5 — integrated physical workload

用 Issue #133 相同 PokeMan Map 7 路线验证 Worker 和主线程。Map 专属 payload 缩减由独立 Map PR 负责；本架构 PR 必须在大型普通 RenderNode.data fixture 上也能证明收益，不能只为 Map 数据形状优化。

## 8. 测试与安全验证

### 8.1 安全负例

必须保留或新增测试：

- cyclic object / repeated shared reference 的正确语义；
- getter/setter、non-enumerable property、symbol property；
- Proxy / 无法检查的对象；
- 非 plain prototype；
- sparse array、array extra property；
- NaN、Infinity、-Infinity；
- invalid Unicode scalar sequence；
- 超深对象、超大数组、超多 object members；
- 恰好达到与超过每一个 byte/depth/member/node limit 的边界。

重复引用不是循环引用：如果协议允许同一个子对象被多个字段引用，detached copy 必须保留或按现有约定处理其语义；不能错误地将所有重复引用判定为 cycle。

### 8.2 不可变与 ownership

- 外部在调用后修改原始输入，不得影响 RenderManager state。
- 已验证对象和所有嵌套容器必须被冻结或以等价方式不可变。
- caller 不能修改 metadata 或伪造可信标记。
- metadata 缓存对象不得被跨消息复用。
- Patch set/remove 后，snapshot 与 patch 的完整参考序列化大小必须与增量 metadata 一致。

### 8.3 协议等价

- 同样的合法 Snapshot/Patch/Event 在新旧路径得到相同接受结果。
- 同样的非法消息仍被拒绝，错误类别和 fatal/recoverable 语义不意外变化。
- revision continuity、identity、tag immutability、message direction 和 queue coalescing 行为不变。
- Snapshot + Patch 序列最终 RenderStore state 与完整 Snapshot oracle 深度相等、数据相等。
- reconnect / peer replacement / stale message 场景保持既有行为。

### 8.4 性能对比

使用固定规模 fixture：小对象、中型 RenderNode.data、大型 1,675 / 3,000+ Tile 等价嵌套数组、稀疏更新、字段替换、深层嵌套。

至少报告：

- 每次 update 的对象访问数；
- 完整 Snapshot 被扫描的次数；
- stringify 次数与字节数；
- clone/freeze 对象数；
- Worker 和 Renderer 端 P50/P95/P99；
- heap allocation / GC 观察；
- 大对象 patch 与 camera-only patch 分开统计。

预期结构性结果：

- 已验证且未变化的子树不会被再次完整遍历；
- 小 Patch 不触发完整 Snapshot stringify；
- 每次发送消息仍只进行必要的最终序列化；
- 接收端仍保留严格的 Schema 与 resource limits。

毫秒阈值必须由目标运行环境基准制定，不得通过放宽 validator、message limit 或样本过滤获得 PASS。

## 9. 与 Map PR 的边界

Map 专项 PR 负责：

- projection window / Tile Band 数据形状；
- 减少完整 Tile payload 的生产和传输；
- Map 专属 projection byte accounting；
- Map Browser 对 band 更新的正确性。

本架构 PR 负责：

- 任意 Render Data 的严格验证、可信不可变表示和 metadata；
- RenderManager / Codec / RenderStore 的重复遍历消除；
- 通用 Snapshot/Patch 的精确大小与深度维护。

架构层不得识别 Map tag 或 Tile tuple；Map 层不得跳过架构验证。两项改造独立评审，集成时共同使用 Issue #133 的物理机工作负载复测。

## 10. 合并门槛

- [ ] 不存在全局 disable/skip validation 开关。
- [ ] 所有不可信 JavaScript 输入仍经过严格入口检查。
- [ ] 所有协议 Schema、消息方向、depth/byte/member/node limits 保持有效。
- [ ] 验证、copy/freeze 和 metadata 计算已合并为一次入口 traversal。
- [ ] 已验证不可变子树的 metadata 可以安全复用；mutable 或跨边界对象不能复用旧 metadata。
- [ ] RenderManager 小 Patch 不再完整扫描并 stringify 全部 Snapshot。
- [ ] Data Codec 不再对同一 subtree 重复 assertion/depth/bounded traversal。
- [ ] Renderer Store update-only Patch 不再无条件 stringify 全部 node.data。
- [ ] 增量 metadata 与独立 full recompute oracle 在随机化和边界 fixtures 上完全一致。
- [ ] 所有原有 wire/data/subsystem/renderer 测试通过。
- [ ] Issue #133 同一路线的 Worker 与主线程长任务均有对比报告。
- [ ] 正式 qualification 按 doc/30-development/performance.md 执行；不得用 PWA diagnostic run 代替 Hostra full/native qualification。

## 11. 非目标

- 删除 assertJsonValue 或让 public stringifyJson 默认为 unchecked。
- 信任跨 MessagePort / JSON 的 sender-side brand 或 WeakMap。
- 放宽 MAX_MESSAGE_BYTES、MAX_PAYLOAD_BYTES、MAX_DATA_BYTES、depth/member/node limits。
- 为 Map 增加通用协议例外。
- 在本 PR 实现 Map Tile Band / fixed-world Canvas cache。
- 将所有 Snapshot 入口改为只验证 Patch；真正的新 Snapshot 仍需完整验证。
- 为减少遍历而改变 RenderDomain authority、Patch revision 或 Renderer identity 语义。

