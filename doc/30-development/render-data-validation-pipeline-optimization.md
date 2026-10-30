# Framework Validation Boundary & Render Data Runtime Optimization

> 状态：**架构设计提案 / Documentation-only；尚未实现、尚未通过资格验证**
>
> 架构准则：[Framework Responsibility and Validation Boundary](../10-architecture/framework-validation-boundary.md)
>
> 决策记录：[ADR 0038 — Developer Authority and Minimal Runtime Enforcement](../decisions/0038-developer-authority-minimal-runtime-enforcement.md) · [ADR 0039 — Render Update v1 Pre-release Removal of Framework-Imposed Capacity Caps](../decisions/0039-render-update-v1-resource-budget-correction.md)
>
> 触发证据：[Issue #133 — Map 投影窗口刷新卡顿来自整表瓦片的 JSON 校验](https://github.com/lithdoo/loom-realm/issues/133)
>
> 配套 Map 专项：[PR #134 — Incremental Projection Payload Optimization](https://github.com/lithdoo/loom-realm/pull/134)
>
> 适用范围：packages/wire、packages/data、packages/subsystem、packages/renderer，以及 PWA carrier adapter（apps/pwa）。当前运行时绑定的 Renderer Data Profile 是 /3；本文同时修正 /1 与 /3 中继承的框架容量门槛，不引入新的 Data Profile identity。
>
> 本文不引入 Map、Tile、depth、bridge 或 Canvas 语义。Map 是暴露共享热路径成本的高负载使用者，不是通用数据协议的特殊例外。

---

## 1. 目标：让框架少做不属于自己的工作

Issue #133 的真实物理机诊断显示，大型 Render Data 在 Worker 和主线程被多次完整遍历、验证、复制、计算深度和序列化。

此前方案把“框架必须提前限制数据规模并完整验证”当成固定前提，只尝试把检查合并为一次遍历。这个前提本身不成立。

> LoomRealm 默认只验证协议和框架自身正确运行所必需的条件。应用数据的业务正确性和数据规模由开发者决定。框架不以自设数字限制平台本来能够处理的数据；实际操作失败时，报告实际异常。

本 PR 的目标：

1. 明确区分协议/框架不变量与开发者拥有的业务正确性。
2. 删除固定数值容量限制，不以可配置 ResourceBudgetPolicy 替代。
3. 删除重复 JSON traversal、byte/depth preflight 和与当前操作无关的 Snapshot 扫描。
4. 对开发者控制的数据采用 operation-first / error-first；失败时在明确边界报告异常。
5. 保留必要 ownership isolation、candidate isolation、atomic commit 和协议连续性。
6. 将额外业务 Schema、数据深度/大小/成员数等严格检查设计为开发者 opt-in 能力。
7. 用 Issue #133 的同类真实工作负载证明 CPU、遍历次数、分配和 GC 改善。

本 PR 不建立新的全局资源治理体系，不引入强制 ValidatedImmutableJson，也不要求对所有应用数据默认全量深复制或深冻结。

## 2. 核心责任边界

### 2.1 Framework 必须保留

- message envelope、message type、direction、exact closed schema；
- 当前 contract 明确规定的 JSON wire representation；
- authority、identity、generation、revision、lifecycle 和 state continuity；
- Patch operation preconditions；
- Render Tree 的 identity uniqueness、parent/sibling consistency、reachability、acyclicity、one-shot key/tag history；
- caller/framework ownership contract；
- isolated candidate、atomic commit 和失败后的 no-partial-state；
- single reader / single serialized writer、FIFO、terminal first-wins 和既定 coalescing semantics。

这些检查保护的是协议和框架自己的状态，不是替开发者审查业务。

### 2.2 默认 Runtime 必须删除

不得以常量、默认配置、可配置选项、Product/Host policy 或新的 ResourceBudgetPolicy 限制：

- message bytes；
- JSON nesting depth；
- Domain Registry entries；
- RenderNode count、tree depth；
- Patch operation count；
- attrs / JSON members、array elements；
- identity/tag/Event/key 的 byte length；
- Render data / Event data payload bytes；
- pending send count、queue count、queue bytes；
- retained work、candidate growth 或其他框架自行估计的容量。

也不得因为这些数字拒绝 send、终止 Data peer、丢弃已接受 Event 或跳过 authoritative work。

平台、浏览器、JavaScript engine、操作系统和实际 carrier API 自身可能有能力边界；框架不应在平台前面再设置一道人为门槛。实际操作失败时传播可观察到的异常。进程级 OOM 可能无法被 JavaScript 捕获，不承诺能够恢复。

### 2.3 开发者可选 Strict Validation

Strict Validation 可以由开发者主动选择，提供：

- application JSON / exact Schema；
- 业务字段、跨字段和领域约束；
- 开发者自定的 depth/member/string/payload size limits；
- cycle / unsupported value / mutation diagnostics；
- 开发、测试、CI 或开发者明确选择的生产诊断。

Strict Validation 默认不进入 Runtime 热路径，不成为框架依赖，也不改变 wire contract。开发者选择的限制只约束其 opt-in 验证流程。

## 3. 目标执行路径

### 3.1 Inbound

~~~text
carrier string
→ Wire / ECMAScript JSON.parse
→ 必要的 wire representation 与 exact schema 检查
→ authority / identity / revision 检查
→ message-specific preconditions
→ candidate mutation
→ final framework structural invariants
→ atomic commit
~~~

不在 parse 前执行 raw-byte gate，不执行 JSON depth/member/byte preflight，不因超过历史 1 MiB / depth 64 / 16384 members 等数字拒绝消息。

malformed JSON、wrong message type、closed-schema violation 仍按协议失败处理。协议结构正确但 Patch continuity/precondition 不成立，按 authoritative continuity failure 处理。

### 3.2 Outbound

~~~text
developer input
→ API ownership contract
→ actual JSON serialization (one pass)
→ one complete application unit
→ current carrier serialized writer
~~~

- 不先执行完整 assertJsonValue/depth/byte scan，再重复 stringify。
- 不计算一个框架 byte cap。
- 使用单次 Wire JSON encoder：在生成输出的同一遍历中拒绝 Wire representation 不支持的值；不能依赖 JSON.stringify 静默省略 undefined/function/symbol，或把 NaN/Infinity 改写为 null。
- 如果实际 serialization 遇到循环引用、getter/Proxy 或其他编码异常，将真实异常返回给本次调用；不得先完整 preflight，再重复 stringify。
- 只有完整 application unit 生成后才能交给 carrier；不得发送部分 JSON。
- carrier.send 实际失败按 transport failure 处理，不伪装成资源预算错误。

### 3.3 Authoritative Patch

~~~text
current committed state
→ isolated candidate
→ apply ordered operations with their own preconditions
→ validate final framework structural invariants
→ commit once
~~~

失败：

~~~text
discard candidate
keep current state and revision unchanged
report the actual failure class
~~~

不因每个 operation 或每次小更新重新扫描整棵 Tree。最终 candidate 仍必须满足 identity、parent/sibling、reachability、acyclicity 等框架不变量；不设置 node-count、tree-depth 或 operation-count cap。

## 4. Ownership 与复制

- RenderManager authoring API 若承诺在异步 publication 前与 caller-owned input 脱离，必须继续执行必要 detach/clone。
- caller 在 API 返回后修改原对象，不得改变 retained state、pending work 或已发出的 message。
- 将必要 shape/type 检查与 detached clone/freeze 融合到一次必要遍历；不得为计量容量再遍历一次。
- Renderer 收到的 JSON.parse object 已由 parser 创建；RenderStore 通过 isolated candidate / COW 保证失败 Patch 不污染 committed state。
- 不为严格验证而默认冻结所有业务对象；不引入强制 ValidatedImmutableJson public wrapper。
- 如果实际 ownership contract 允许直接 transfer，则必须由显式 API contract 定义，不能擅自推断现有 API 已 transfer ownership。

## 5. Package 改造清单

### 5.1 packages/wire

目标文件：packages/wire/src/json-text.ts 及相关 JSON representation helpers。

- 保留既定 JSON wire representation 与错误语义。
- 删除 raw-message byte cap、JSON depth cap 和为这些 cap 服务的 preflight。
- 不在 stringify 前先完整 assertJsonValue/depth traversal，再执行第二次 stringify。
- 使用单次 Wire JSON encoding，在输出过程中完成必要的 representation 检查；不得另做完整 preflight traversal。
- Parse 使用既定 JSON.parse semantics；只保留 contract 真正要求的 representation 检查。
- 不计算 UTF-8 byte length 作为框架拒绝条件。
- 对同一对象图不得重复执行完整 traversal。

### 5.2 packages/data codecs

目标文件包括：

- packages/data/src/validation-common.ts
- packages/data/src/render-codec.ts
- packages/data/src/profile-codec.ts
- packages/data/src/presentation-codec.ts

改造要求：

- 删除旧 message/data/depth/member/element/string byte capacity caps。
- 删除 assertBoundedJson、固定 depth、member、payload byte 和字符串长度上限中仅服务于容量拒绝的部分。
- 保留 message kind、exact schema、direction、field type、identity/revision 与各 child contract 的语义检查。
- 不对同一 subtree 重复 assertJsonValue、depth traversal 或 stringify。
- Presentation / Interest 中的数量限制必须逐项判断：若它只是历史容量数字则删除；若它是明确的 closed-schema / role semantic 则保留并说明 owner。不得因为位于 codec 就自动认定所有数字都是协议语义。
- Render zIndex 接受 signed safe integer；Render revision/baseRevision 继续为 positive safe integer。
- Generic Render data Patch set/remove 接受空字符串 key；attrs key 仍遵守其非空语义。

### 5.3 packages/data Runtime send queue

目标文件：packages/data/src/runtime.ts。

当前 MAX_PENDING_SENDS = 1024 是框架自行设定的容量拒绝条件，应删除。

- 保留单 serialized writer 和 FIFO。
- 不限制 pending send count 或累计 encoded bytes。
- 不在昂贵编码前执行 queue-count admission。
- 每个 send 保持自己的 once-settle 结果；调用者可以 await 自己的 send completion。
- JSON serialization error 只失败当前 send/API 调用，不自动 terminal 整个 Data Connection。
- carrier.send 实际 rejection 按 carrier failure / transport failure 处理。
- terminal 时 settle pending operation 并释放队列引用；不得静默丢弃仍属于 current stream 的 authoritative unit。

### 5.4 packages/subsystem RenderManager

目标文件：packages/subsystem/src/internal/render-manager.ts。

当前 MAX_PENDING_WORK = 1024、probeLimit 和固定 string/data capacity checks 不应继续作为默认拒绝逻辑。

- 删除 pending-work 数量上限及其触发的 Event 丢弃、peer invalidation。
- 删除为 node/depth/data/byte capacity 执行的完整 Snapshot probe。
- 保留 RenderManager authoring API 所要求的 caller/framework ownership isolation。
- 保留 Registry / Domain desired-state coalescing，但只能合并尚未 emitted 且语义允许重建的 state。
- 保留 Event barrier；已接受 Event 不因队列容量而丢弃。
- Patch operation 依序应用，不能丢弃中间操作后继续发送基于旧 revision 的 Patch。
- 对实际 getter/Proxy/clone/encode exception，在 authoring API 边界报告本次调用失败；不得仅因异常 retire peer。
- 对外发送前生成完整 application unit；carrier 实际失败时按 transport failure 处理。

### 5.5 packages/renderer RenderStore

目标文件：packages/renderer/src/internal/render-store.ts。

删除以下人为容量检查：

- MAX Nodes / Tree depth；
- attrs / JSON member count；
- JSON depth / array element count；
- Render data byte / payload size；
- 对这些容量数字执行的 validateData 全对象图扫描。

保留：

- exact Render message schema；
- identity uniqueness / one-shot history / stable tag；
- parent/sibling consistency、reachability、acyclicity；
- Patch operation preconditions；
- final candidate structural invariants；
- isolated candidate、COW 和 atomic commit。

Snapshot 可以执行一次必要的完整 Tree structural validation；Update-only Patch 应处理受影响的目标和路径，不重复检查未变化的 data subtree。结构操作在最终 commit 前验证最终框架不变量，不因每个 operation 重扫整棵 Tree。

错误处理必须区分：

- malformed wire / schema invalid：protocol-fatal；
- revision / identity / Patch precondition violation：authoritative continuity failure；
- unexpected local candidate operation exception：discard candidate、报告 local implementation error；若 continuity 无法证明，可退休当前 carrier，但不能标记为 peer protocol-fatal。

当前 catch-all → fatal(String(cause)) 不能把所有本地异常一律映射为 protocol-fatal。

### 5.6 PWA MessagePort carrier

目标文件：apps/pwa/src/message-port-carrier.ts。

- 不增加 inbound message count 或 retained-string byte cap。
- 保留接收顺序和单 reader。
- 可用 head-index / ring-buffer 避免反复 Array.shift 搬移。
- terminal / finish 时清空已积压引用并使 pending waiter once-settle。
- postMessage / carrier 实际失败时传播真实 transport error。
- 不因人为 queue capacity 关闭 Carrier 或丢弃中间消息。

### 5.7 Renderer Data Profile / Presentation producer

目标文件：Renderer Data Profile v1、v3 与对应 conformance。

- 删除 common message-byte/depth budget。
- 删除 Presentation Event 的 256 pending cap 和满载丢弃新 Event。
- 删除 DataRuntime 的 1024 pending-send cap 及 encoded-byte budget。
- 保留 single reader / single serialized writer / FIFO / once-settle。
- Viewport 是 latest-value state；只 coalesce 尚未发送的旧 size，这是该 state child 的语义，不是通用容量限制。
- Stale/inapplicable Event 仍按其 contract drop；carrier loss 不 replay；不得因 queue capacity 压力丢弃已接受 Event。

## 6. Failure semantics

| 实际情况 | 处理 |
|---|---|
| malformed JSON / invalid Wire representation | protocol-fatal |
| unknown message kind / wrong direction / exact closed-schema violation | protocol-fatal |
| authority / identity / revision / Patch precondition violation | authoritative continuity failure |
| developer input / getter / Proxy / JSON serialization exception | 失败当前 API 调用并报告实际异常；不自动终止 peer |
| inbound candidate 的意外本地实现异常 | discard candidate、报告 local implementation failure；continuity 不可证明时 retire 当前 carrier，但不归咎 peer |
| carrier.send / receive 实际失败 | transport failure，按 carrier lifecycle 处理 |
| well-formed but stale/inapplicable Event | drop only |
| failed Patch | no partial commit；current state/revision unchanged |
| failed serialization | no partial application unit |

不引入 ResourceBudgetExceeded、local-resource-exhaustion 或其他为了框架人为容量限制服务的错误体系。

## 7. Conformance 与测试

### 7.1 Protocol behavior

保留并验证：

- exact message schema / direction / identity；
- revision continuity；
- Registry / Snapshot / Patch / Event semantics；
- Patch operation order 与 preconditions；
- final Tree structural invariants；
- no partial commit；
- no partial application unit；
- Event ordering barrier、applicability 和 no replay；
- carrier loss / fresh baseline recovery。

### 7.2 Historical-cap regression

使用测试运行环境能够正常处理的代表性数据，超过历史数字：

- message > 1 MiB；
- JSON depth > 64；
- Node count > 16384；
- Tree depth > 30；
- Patch operations > 4096；
- Render data > 256 KiB；
- attrs / JSON members / array elements 超过旧上限；
- identity/tag/Event strings 超过旧 byte thresholds。

这些是证明旧数字不再拒绝数据的测试样本，不建立新的上限。若测试平台自身真实失败，应记录实际 platform failure，不得把失败改写成协议 cap。

### 7.3 Error behavior

- malformed JSON 仍为 protocol-fatal；
- 开发者 serialization error 只失败当前调用，不自动关闭 Data peer；
- unexpected local candidate exception 不被映射为 peer protocol-fatal；
- Patch failure 丢弃 candidate，revision/current state 不变；
- carrier send failure 保留真实 transport cause；
- 不测试 ResourceBudgetExceeded 或 budget exhaustion，因为默认 Runtime 不定义这些机制。

### 7.4 Performance evidence

使用 Issue #133 同等 PokeMan Map 7 路线，以及大型普通 RenderNode.data fixture。

至少报告：

- 每次 update 的 object/container visits；
- 完整 Snapshot 被扫描的次数；
- JSON parse / stringify 次数；
- clone/freeze 对象数；
- changed data subtree 与 unchanged subtree 大小；
- Worker 与 Renderer 端 P50/P95/P99；
- heap allocation / GC 观察；
- 普通 camera-only Patch 与真正 Snapshot refresh 分开统计。

结构性预期：

- 普通小 Patch 不触发与本次操作无关的完整 Snapshot stringify；
- 同一 encode/decode 路径不重复完整验证同一 subtree；
- 没有 raw-byte/depth/member/queue capacity preflight；
- 每条实际 application unit 只执行一次必要 serialization；
- 默认 Runtime 不执行 opt-in business strict validation。

毫秒阈值由目标运行环境基准制定。不得通过样本过滤或弱化协议/atomicity 语义获得 PASS。

## 8. 实施顺序

### Phase 0 — Validation inventory

逐项标记现有检查属于：

- protocol / authority invariant；
- framework structural invariant；
- developer-owned business validation；
- arbitrary capacity cap；
- duplicate / implementation-only preflight。

没有明确 framework owner / protocol obligation 的默认验证和容量拒绝逻辑，不应保留。

### Phase 1 — Wire / Data codec

删除固定数值校验、raw-byte/depth preflight 和重复 traversal；实现单次实际 JSON serialization / representation handling。先用 wire/data tests 证明行为一致。

### Phase 2 — RenderManager

删除 MAX_PENDING_WORK、probeLimit 和容量触发的 drop/peer invalidation；保留 ownership isolation、desired-state coalescing、Event barrier、revision 和 publication ordering。

### Phase 3 — Renderer Store

删除 node/depth/data/member/byte caps；保留 final structural invariants、COW、candidate isolation 和 atomic commit。拆分 protocol/continuity/local exception 分类。

### Phase 4 — Queue / carrier lifecycle

删除 DataRuntime 与 Presentation 的人为队列容量；保留 FIFO、single writer、once-settle。PWA terminal 时释放 queue references，优化 head-index。不得引入新的 queue cap。

### Phase 5 — Optional Strict Validation design

单独设计 strict validation module / configuration / authoring API。它不得成为默认 Runtime 依赖，也不得覆盖协议必需检查。本 PR 不实现该模块。

### Phase 6 — Integrated physical workload

使用 Issue #133 同一路线验证 Worker 与主线程。Map 专属 payload 缩减由 PR #134 负责；本 PR 必须使用大型普通 RenderNode.data fixture 证明通用收益。

## 9. PR 合并与激活门槛

### 9.1 Design merge gate（本 docs-only PR）

- [ ] ADR0038 明确 Developer Authority / Minimal Runtime Enforcement / Opt-in Strictness。
- [ ] ADR0039 明确删除固定 numeric caps，不以 local budgets 替代。
- [ ] Framework Validation Boundary、Render Update v1、Renderer Data Profile v1/v3、Conformance 与本实施方案不存在相互矛盾的 budget / cap 要求。
- [ ] 明确 same-identity pre-release compatibility gate；存在 deployed/independent/rollback/persisted compatibility obligation 时必须 STOP 并 version/migrate。
- [ ] 保留协议、identity、revision、Tree structural invariants、ownership isolation 和 atomicity。
- [ ] 将设计状态标为 proposed/candidate；不声称 Runtime 已实现或 Conformance 已通过。

### 9.2 Runtime activation gate（后续 implementation work）

- [ ] 所有历史固定容量拒绝逻辑已从默认 Runtime 删除；无 ResourceBudgetPolicy 替代。
- [ ] 无 raw-byte、depth、member、payload-byte、queue-count 或 retained-work preflight。
- [ ] Data Codec 不再对同一 subtree 重复完整 traversal。
- [ ] 普通小 Patch 不再完整 stringify 与本次操作无关的 Snapshot。
- [ ] Renderer Store 不再对未变化 data subtree 重复扫描。
- [ ] DataRuntime / RenderManager / Presentation 不因人为 queue cap 拒绝或丢弃消息。
- [ ] PWA carrier terminal 时释放 queue references；无容量上限。
- [ ] zIndex 在 RenderManager 与 Codec 两端接受完整 signed-safe-integer 范围，拒绝范围外值；不再使用 int32。
- [ ] generic data Patch set/remove 接受空字符串 key，与 Snapshot 和 wire Codec 一致；attrs key 仍保持非空。
- [ ] 序列化异常返回调用者，不自动 terminal 整个 Data peer。
- [ ] 本地 candidate exception 不被映射成 peer protocol-fatal；失败 Patch 不改变已提交状态。
- [ ] 超过历史数值阈值的代表性 fixture 被正确处理，且不建立新最大值。
- [ ] 所有 wire/data/subsystem/renderer 现有测试通过。
- [ ] Issue #133 同一路线的 Worker 与主线程长任务均有对比报告。
- [ ] 正式 qualification 按 performance.md 执行；不得用 PWA diagnostic run 代替 Hostra full/native qualification。

## 10. 与 Map PR 的边界

Map 专项 PR #134 负责：

- projection window / Tile Band 数据形状；
- 减少完整 Tile payload 的生产和传输；
- Map 专属 projection byte accounting；
- Map Browser 对 band 更新的正确性。

本架构 PR #135 负责：

- 将框架强制检查限制在 protocol / framework correctness 所必需的范围；
- 删除框架自行设定的 Render/Data 容量限制；
- 移除 Realm 通用数据通路的重复与无关全量预检；
- 保持 authority、identity、revision、atomicity 与 Event ordering；
- 为未来 opt-in Strict Validation 留出独立边界。

架构层不得识别 Map tag 或 Tile tuple；Map 层不得绕过通用协议约束。两项改造独立评审，集成时共同使用 Issue #133 的物理机工作负载复测。

## 11. 明确非目标

- 将所有应用数据默认做完整业务 Schema 审查。
- 将所有应用对象包装成强制 ValidatedImmutableJson public abstraction。
- 仅为严格验证而强制深复制或深冻结所有应用数据。
- 通过全局 disableValidation 开关绕过当前协议。
- 用可配置 ResourceBudgetPolicy 替代旧固定容量限制。
- 引入 ResourceBudgetExceeded / local-resource-exhaustion 作为人为容量机制。
- 引入 ACK/NACK、budget negotiation、通用资源协调器或 Map 专属协议例外。
- 在本 PR 实现 Map Tile Band / fixed-world Canvas cache。
- 改变 RenderDomain authority、Patch revision、Renderer identity 或事务提交语义。
