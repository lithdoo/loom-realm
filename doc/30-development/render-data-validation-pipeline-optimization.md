# Render Data Runtime Guard & Developer-Owned Validation

> 状态：**架构设计提案 / Documentation-only；尚未实现、尚未通过资格验证**
>
> 架构准则：[Framework Responsibility and Validation Boundary](../10-architecture/framework-validation-boundary.md)
>
> 决策记录：[ADR 0038 — Developer Authority and Minimal Runtime Enforcement](../decisions/0038-developer-authority-minimal-runtime-enforcement.md)
>
> 触发证据：[Issue #133 — Map 投影窗口刷新卡顿来自整表瓦片的 JSON 校验](https://github.com/lithdoo/loom-realm/issues/133)
>
> 配套 Map 专项：[PR #134 — Incremental Projection Payload Optimization](https://github.com/lithdoo/loom-realm/pull/134)
>
> 适用范围：packages/wire、packages/data、packages/subsystem、packages/renderer。
>
> 本文不引入 Map、Tile、depth、bridge 或 Canvas 语义。Map 是暴露共享热路径成本的高负载使用者，不是通用数据协议的特殊例外。

---

## 1. 目标：减少框架强制的验证成本

Issue #133 的真实物理机诊断显示，projection refresh 的主要 CPU 成本之一来自大型 Render Data 在 Worker 和主线程被多次完整遍历、验证、复制、计算深度和序列化。

此前方案把“保留完整严格验证”作为固定前提，只尝试把它合并为一次遍历。本修订改变这个前提：

> LoomRealm 默认只强制执行框架自身正常运行、协议兼容、状态一致性和资源安全所必需的 Runtime Guard。应用数据的业务正确性由开发者负责；额外严格验证必须由开发者显式选择。

本 PR 目标：

1. 区分框架不变量、协议兼容约束、资源安全约束与应用层业务校验。
2. 移除没有对应框架运行需求的重复或预先全量验证。
3. 将必要的检查融合到实际解析、序列化、Patch 应用和提交过程，避免“先完整扫描，再做真正工作”。
4. 对开发者控制的可信应用数据采用 operation-first / error-first 路径；失败时在明确边界捕获，并保证状态提交原子性。
5. 将更严格的 JSON / Schema / 业务数据审查设计为独立、opt-in 的能力，不默认进入生产热路径。
6. 保留当前已冻结协议的可观察行为；不在本 PR 静默放宽现有 Render Update v1 契约。

本 PR 不再要求建立一个覆盖所有数据的强制 ValidatedImmutableJson 类型，也不要求仅为严格验证而对所有应用数据执行全量深复制和深冻结。

## 2. 架构准则

规范来源：[Framework Responsibility and Validation Boundary](../10-architecture/framework-validation-boundary.md)。

### 2.1 Developer Authority

开发者拥有应用数据的业务语义与正确性责任，包括：

- 业务 Schema、字段含义与跨字段约束；
- 游戏规则、业务状态转换和领域不变量；
- 应用资源引用、业务 ID 与业务数值范围；
- 业务希望执行的严格数据审查。

LoomRealm 不应仅因为数据经过 Render/Data API，就擅自推断并验证上述业务语义。

### 2.2 Minimal Runtime Enforcement

默认 Runtime Guard 只覆盖：

- 框架执行时实际读取/依赖的字段和必要的类型前提；
- 消息 envelope、message type、方向和当前协议要求；
- Session / Runtime / DataAuthority / generation / revision / identity / lifecycle；
- Render tree / Patch 的框架状态不变量与原子提交；
- 当前冻结协议要求的表示、硬限制和失败语义；
- 防止无界解析、序列化、队列增长或资源耗尽所需的边界。

不应默认对任意应用数据执行额外的完整业务 Schema 审查、重复 JSON 全树扫描或与本次操作无关的 Snapshot 预检。

### 2.3 Opt-in Strictness

更严格的能力可以作为独立验证模块或显式诊断配置提供：

- 开发者在开发、测试、CI 或明确选择的生产场景启用；
- 可提供 JSON shape、exact Schema、业务 Schema、深度/成员/字符串约束等检查；
- 默认不进入普通 Runtime 热路径；
- 不改变既有协议 ABI，也不能绕过协议本身的强制约束；
- 具体 public API / package 名称不在本 PR 冻结。

### 2.4 Operation-first / Error-first

对于开发者拥有且处于受信任执行路径的数据：

- 不为了“提前证明整个对象树永远正确”而在每次小更新前扫描整个 Snapshot；
- 在真正读取、应用、编码或提交数据时执行所需操作；
- 让实际操作产生的类型/序列化/前置条件错误在明确边界抛出；
- 捕获错误并放弃本次候选更新；
- 不允许失败操作部分污染已提交状态。

这不是对所有外部输入都“只靠 try/catch”。异常捕获不能防止内存耗尽、超大消息解析或无界队列，因此资源安全仍需要前置或流式 bounded guard。

## 3. Issue #133 的实测证据

Issue #133 报告的特定物理机 / Chromium / PokeMan Map 7 路线：

- 1920×1080，y=21 窗口刷新：Worker 步进任务约 145ms，随后主线程 MessagePort::Accept 约 136ms。
- y=16 另一刷新：Worker 约 128ms，主线程约 95ms。
- Canvas getImageData / putImageData 只有数毫秒级；不读像素的对照仍出现 88–103ms 长任务。
- Worker CPU profile：validateJsonValueAt 自耗时约 248ms，JSON.stringify 约 141ms，stringifyValidatedJson 约 50ms，depthOfValidatedJson 约 17ms。
- 主线程 CPU profile：validateJsonValueAt 自耗时约 130ms，RenderStore validateData 约 11ms，getImageData 约 14ms。

这些是整段行走采样中的 CPU 自耗时与单次窗口刷新 tracing 的不同统计口径，不能直接相加成一次刷新延迟。它们共同证明：Worker 和主线程都为大型 JSON 承担了显著的重复处理成本。

其中 Map Runtime 的 projectionBytes() / JSON.stringify 属于 PR #134 的 Map 专项范围；本 PR 处理 Realm 共享 Render Data 路径。

此证据不是 Hostra full/native qualification 结果。正式门槛仍由 [性能资格](./performance.md) 定义。

## 4. 验证分类：什么必须做，什么不应默认做

| 类别 | 默认策略 | 责任 |
|---|---|---|
| 消息 envelope、type、方向、必要字段 | 必须 | Framework |
| authority、identity、generation、revision、lifecycle | 必须 | Framework |
| Patch 前置条件、状态一致性、失败原子性 | 必须 | Framework |
| 实际序列化所需的可表示性检查 | 必须在操作中完成 | Framework |
| 防止无界输入、队列和资源耗尽的硬边界 | 必须，按协议/平台 threat model | Framework |
| 当前 Frozen Contract 明确规定的 JSON 表示和 hard limits | 必须，直至正式修订 | Framework / Protocol |
| 游戏/业务 Schema 与字段语义 | 不默认执行 | Developer |
| 跨字段业务约束、领域数值范围 | 不默认执行 | Developer |
| 对整个应用对象图重复执行 strict JSON audit | 不默认执行 | Opt-in Strict Validation |
| 仅为证明输入“安全”而执行的重复深复制/深冻结 | 不默认执行 | 明确 ownership contract |

**关键区别：** 业务 Schema 检查不是协议 envelope 检查；开发者选择不启用业务严格验证，不等于可以绕过 current wire contract、identity/revision 或资源保护。

## 5. Frozen Contract 兼容边界

当前 [Render Update v1](../15-contracts/render-update-v1.md) 已冻结以下可观察约束：

- Render data 必须符合当前 Wire JSON representation；
- message、data、depth、member、node、tree 等 hard limits；
- Patch 每个 operation 后的 bounded candidate 约束；
- Snapshot / Patch 的 isolated candidate 与 atomic commit；
- representation/schema/limit failure 的 protocol-fatal 行为。

这些要求见 Render Update v1 §10、§12、§16、§18、§19。

本 PR **不修改**这些已冻结的 accept/reject、retire、limit 或 state outcome。不能用“开发者负责”作为理由，在实现中静默删除既有协议限制。

但 Frozen Contract 也不意味着实现必须为同一数据重复完整扫描多次：

- 一项限制应在真正需要时检查；
- 可以在实际编码时一次性执行 bounded serialization 与字节计量；
- Patch 每个 op 的限制可通过精确的局部/增量 accounting 执行；
- 不应在每次 Patch 前额外 stringify 与本次操作无关的完整 Snapshot；
- 结构性操作仍需执行其确实影响的 tree invariants。

如果后续决定将现有 Render Update v1 的某项 hard limit / strict representation 检查降为可选，必须单独提交 contract correction / ADR，明确兼容义务、accept/reject/failure 变化和 qualification impact。本 PR 不预先作出该协议变更。

## 6. 当前热路径与改造方向

以下路径基于当前 main；实现 PR 开工时必须重新核对代码与调用关系。

### 6.1 RenderManager：Delta 验证、复制和合并

文件：packages/subsystem/src/internal/render-manager.ts

当前 validateDelta()、validateJsonValue()、detachedFrozen() 和 applyDataDelta() 会对输入及合并后的 data 进行多轮处理：

- 读取/检查输入对象；
- 遍历字符串、Key 和容器；
- 深复制并冻结；
- 对包含未变化字段的完整 data 再做 depth / byte 检查。

改造方向：

- 先按 API 契约明确 caller 与 RenderManager 的 ownership / mutation 约定；
- 仅执行 Patch operation、协议和当前 hard limits 所要求的检查；
- 避免在同一个输入值上重复执行结构 walk、copy、freeze；
- 不要求所有业务 data 都先转换为强制 ValidatedJson wrapper；
- 如果现有 API 必须隔离 caller mutation，应明确选择 ownership transfer、必要复制或开发者约定，不能把“深冻结”当成免费验证；
- 对每个 Patch operation 保留当前 Frozen Contract 要求的中间状态限制和原子提交。

### 6.2 RenderManager：完整 Snapshot probe

当前 update() 路径会对完整 next Snapshot 和 Patch 调用 probeLimit()。

改造方向：

- 不要为了每次小 Patch 预先完整 stringify 一个并未发送的 Snapshot；
- 只有在实际构造/发送 Snapshot 时才对该 Snapshot 执行必要的 message bound；
- Patch 的限制在 Patch 编码/发送时检查；
- 如需维护当前 Frozen Contract 的总量限制，使用由实际更新维护的精确 accounting；不能使用低估值或未经证明的缓存；
- 不得将完整 Snapshot 的业务正确性扫描伪装成 message-size guard。

### 6.3 Data Codec：把检查融合到实际 parse / encode

文件：

- packages/data/src/profile-codec.ts
- packages/data/src/render-codec.ts
- packages/data/src/validation-common.ts
- packages/wire/src/json-text.ts

当前 encode/decode 路径可能对同一 subtree 重复执行：

- assertJsonValue；
- jsonDepth；
- bounded walk；
- Schema helper 内的递归检查；
- stringifyJson 内部的结构检查；
- 再次 UTF-8 byte count。

改造方向：

- Decode：先检查原始 carrier string 的 message byte bound，再 parse；随后一次性执行当前协议所需的 discriminator、direction、exact message schema、字段约束和 Render hard limits。
- 不要把 JSON.parse 生成的 parser-owned JSON 当成任意可执行 JavaScript 对象，再重复做 getter/proxy/accessor 审查。
- Encode：对框架 envelope / 协议字段执行必要检查；在实际 bounded serializer 中完成可表示性检查和精确 byte accounting，不先完整 assert/depth walk 再 stringify。
- stringifyJson 的 public contract 和 frozen compact JSON semantics 必须保持；不能通过 unchecked public serializer 逃避协议约束。
- 业务 payload 的额外 Schema 检查由 opt-in Strict Validation 提供，不嵌入默认 codec。

### 6.4 Renderer Store：Snapshot 与 Patch 的不同路径

文件：packages/renderer/src/internal/render-store.ts

改造方向：

- 新 Snapshot：按 Frozen Contract 构造 isolated candidate，执行一次必要的完整 baseline / tree / data bounded validation，再 atomic commit。
- Update-only Patch：对每个 operation 的目标、delta 和受影响状态执行必要检查；通过精确增量 accounting 维护当前 Frozen Contract 的 per-op hard bounds。
- data-only Patch 不应无条件重新 stringify 全部未变化的 node.data。
- Insert / Remove / Move 等结构操作仍需检查其影响的 identity、reachability、parent、tree depth 和 node count；不承诺消除所有 tree work。
- 失败 Patch 不改变 revision、zIndex、tree 或 current presentation。

### 6.5 packages/wire：保持必要能力，不强制全量预检

- 保留安全的 public JSON serializer/parser 语义和错误处理。
- 避免在同一调用链中重复完整 assertJsonValue、depth walk 和 stringify。
- 对需要硬字节限制的实际编码，优先使用 bounded serialization，在生成输出时达到上限立即失败。
- 对外部 carrier input，在 parse 前执行 raw message byte gate。
- 不引入一个必须由所有业务调用者创建的公开可信 JSON wrapper。
- 不要求用深复制/深冻结证明每份业务数据正确；ownership 与 mutation contract 应由相应 API 明确。

## 7. 可选 Strict Validation 模块

严格验证可以作为未来独立能力提供，而不是默认 Runtime 的隐式行为。

建议能力：

- JSON representation / descriptor / cycle 检查；
- exact application Schema；
- 自定义业务 validator；
- depth/member/size 等额外诊断限制；
- 开发时错误定位与可读诊断。

使用场景：

- 单元测试和集成测试；
- CI；
- 开发者显式开启的 debug / diagnostic profile；
- 开发者明确选择的生产场景。

边界：

- strict mode 不能成为普通 Runtime 的强制依赖；
- strict mode 不能改变当前协议本身的强制约束；
- public API、配置名称和 package 拆分待独立设计；
- 本 PR 不实现该模块，只定义责任边界。

## 8. Error-first 与事务提交模型

对一次 authoritative update：

~~~text
current committed state
→ create isolated candidate / apply operation
→ perform checks required by this operation and current contract
→ operation/encoding error?
    yes → capture at boundary → discard candidate
    no  → commit once
~~~

要求：

- 不允许失败 Patch 部分提交；
- 不允许吞掉协议 continuity / authority / lifecycle failure；
- 不允许把 malformed external message 当作普通业务异常继续消费；
- 不允许通过 catch 继续使用可能已被破坏的 current state；
- 对资源耗尽风险必须在资源被无界消耗之前执行 bounded guard；
- 对开发者自有业务数据，不默认增加与实际操作无关的全量验证。

## 9. 测试与性能验收

### 9.1 Frozen Contract 行为等价

- 合法消息的 accept / commit 结果保持一致；
- 非法 envelope、方向、identity、revision、hard limit 仍按当前契约拒绝；
- protocol-fatal / authoritative-continuity failure 的 retire 语义不变；
- Patch 每个 op 的 intermediate bound 保持；
- 失败时旧 state / revision / presentation 不变；
- Snapshot + Patch 序列结果与 reference full snapshot 相同。

### 9.2 Runtime Guard 与 opt-in Strict 分离

- 默认 Runtime 不执行额外的业务 Schema validator；
- Strict Validation 未启用时，不调用其全树遍历路径；
- Strict Validation 开启时能检测其声明覆盖的错误；
- strict mode 开关不改变 frozen wire accept/reject 语义；
- 开发者自定义 validator 失败时，失败结果按明确的业务/API 边界处理，不污染已提交状态。

### 9.3 错误与资源边界

- malformed carrier / oversized raw message 在进入业务处理前被拒绝；
- bounded serializer 在超过 byte cap 时停止继续生成输出；
- getter / Proxy trap 等异常在 authoring boundary 明确失败，不产生 partial commit；
- cyclic / unsupported value 在实际编码时产生确定错误；
- Patch 中间超限不能靠后续 op 缩回；
- queue / node / depth / message caps 继续有效。

### 9.4 性能对比

使用固定规模 fixture：小对象、中型 RenderNode.data、大型 1,675 / 3,000+ Tile 等价嵌套数组、稀疏更新、字段替换、结构 Patch。

至少报告：

- 每次 update 的 object/container visits；
- 完整 Snapshot 被扫描的次数；
- stringify / bounded serialize 次数与字节数；
- clone/freeze 对象数；
- changed data subtree 与 unchanged subtree 大小；
- Worker 与 Renderer 端 P50/P95/P99；
- heap allocation / GC 观察；
- 普通 camera-only Patch 与真正 Snapshot refresh 分开统计。

结构性预期：

- 普通小 Patch 不触发与本次操作无关的完整 Snapshot stringify；
- 同一 encode/decode 路径不重复完整验证同一 subtree；
- Patch 的 hard bounds 通过局部/增量方式满足，而不是重复全树预检；
- 每条实际发送消息仍执行一次必要的 bounded serialization；
- 默认 Runtime 不执行 opt-in business strict validation。

毫秒阈值必须由目标运行环境基准制定。不得通过删除 Frozen Contract 限制、样本过滤或弱化失败语义获得 PASS。

## 10. 实施顺序

### Phase 0 — Validation inventory

为现有检查逐项标注：

- protocol / authority invariant；
- resource-safety guard；
- frozen-contract compatibility requirement；
- developer-owned business validation；
- duplicate / implementation-only preflight。

没有明确 owner 和必要性证明的默认热路径验证，不应自动保留。

### Phase 1 — Remove redundant work without changing the contract

先合并 wire/data codec 的重复 traversal，并让实际 bounded serialization 同时完成必要的字节计量。所有 Frozen Contract accept/reject 行为保持不变。

### Phase 2 — RenderManager operation-first update

移除与当前 Patch 无关的 Snapshot 预检；在实际 Snapshot/Patch encode 时执行必要 message bound。保留 candidate isolation、每个 op 的 hard bounds 与 atomic commit。

### Phase 3 — Renderer Store incremental enforcement

对 data-only Patch 做局部/增量 accounting；结构操作保留所需的 tree invariants。通过 full recompute oracle 测试 accounting 正确性，但生产热路径不因每次小 Patch 重跑 oracle。

### Phase 4 — Optional Strict Validation design

单独设计 strict validation module / configuration / authoring API。它不得成为默认 Runtime 依赖，也不得覆盖协议必需检查。

### Phase 5 — Integrated physical workload

使用 Issue #133 相同 PokeMan Map 7 路线验证 Worker 与主线程。Map 专属 payload 缩减由 PR #134 负责；本 PR 必须使用大型普通 RenderNode.data fixture 证明通用收益。

## 11. 与 Map PR 的边界

Map 专项 PR #134 负责：

- projection window / Tile Band 数据形状；
- 减少完整 Tile payload 的生产和传输；
- Map 专属 projection byte accounting；
- Map Browser 对 band 更新的正确性。

本架构 PR #135 负责：

- 将框架强制检查限制在 runtime / protocol / resource safety 所必需的范围；
- 移除 Realm 通用数据通路的重复与无关全量预检；
- 保持 Frozen Render Update v1 的当前可观察约束；
- 为未来 opt-in Strict Validation 留出独立边界。

架构层不得识别 Map tag 或 Tile tuple；Map 层不得绕过通用协议约束。两项改造独立评审，集成时共同使用 Issue #133 的物理机工作负载复测。

## 12. 合并门槛

- [ ] Framework Responsibility and Validation Boundary 已进入 Current Architecture 文档。
- [ ] Developer Authority、Minimal Runtime Enforcement、Opt-in Strictness 三项原则有明确规范定义。
- [ ] 未将应用业务 Schema / 业务正确性检查强制放入默认 Runtime。
- [ ] 未静默改变 Render Update v1 的 schema、hard limits、failure classification 或 atomicity。
- [ ] 原始消息大小在 parse 前受限；实际序列化执行 bounded byte guard。
- [ ] 普通小 Patch 不再完整 stringify 与本次操作无关的 Snapshot。
- [ ] Data Codec 不再对同一 subtree 重复完整 traversal。
- [ ] Renderer Store data-only Patch 不再无条件重新扫描全部未变化 data。
- [ ] 每个 Patch op 的 Frozen Contract intermediate bounds 仍得到满足。
- [ ] 失败 Patch 不改变已提交状态。
- [ ] 可选 Strict Validation 与默认 Runtime Guard 在代码依赖和测试上可分离。
- [ ] 所有 wire/data/subsystem/renderer 现有测试通过。
- [ ] Issue #133 同一路线的 Worker 与主线程长任务均有对比报告。
- [ ] 正式 qualification 按 performance.md 执行；不得用 PWA diagnostic run 代替 Hostra full/native qualification。

## 13. 明确非目标

- 将所有应用数据默认做完整业务 Schema 审查。
- 将所有应用对象包装成强制 ValidatedImmutableJson public abstraction。
- 仅为严格验证而强制深复制或深冻结所有应用数据。
- 通过全局 disableValidation 开关绕过当前协议。
- 静默放宽 Render Update v1 已冻结的 JSON representation / hard limits / failure semantics。
- 信任跨 MessagePort / JSON 的 sender-side brand 或 WeakMap metadata。
- 为 Map 增加通用协议例外。
- 在本 PR 实现 Map Tile Band / fixed-world Canvas cache。
- 改变 RenderDomain authority、Patch revision、Renderer identity 或事务提交语义。
