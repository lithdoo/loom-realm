# Framework Responsibility and Validation Boundary

> 层级：系统架构 / Framework design principle
> 状态：Proposed in PR #135；合并后成为 Current Architecture 准则
> 决策：[ADR 0038 — Developer Authority and Minimal Runtime Enforcement](../decisions/0038-developer-authority-minimal-runtime-enforcement.md)
> 关联：[系统架构总览](./system-overview.md)、[Render Update v1](../15-contracts/render-update-v1.md)、[Renderer Data Profile /3](../15-contracts/renderer-data-profile-v3.md)、[性能资格](../30-development/performance.md)
> 最近复核：2026-10-30

## 1. 核心原则

**LoomRealm 负责保证框架按协议正确运行，不负责替开发者决定应用数据规模或业务数据是否正确。**

开发者拥有应用数据的业务含义、业务 Schema、跨字段关系、领域规则和资源使用决策。框架拥有自己的协议、authority、identity、lifecycle、state transition、ownership contract 与 atomicity。

框架不得仅因为应用数据经过某个 framework API，就默认对整个对象图执行额外的、与当前操作无关的严格审查；也不得用自己设定的容量数字拒绝平台本来能够处理的数据。

## 2. 三项设计准则

### 2.1 Developer Authority

开发者是应用业务正确性的 owner，包括：

- 应用数据的业务 Schema 与字段语义；
- 业务状态转换、跨字段约束和领域不变量；
- 游戏规则、业务数值范围、业务资源引用；
- 应用自身希望强制执行的数据质量和容量规则。

框架不得推断并强制执行没有被 framework protocol 明确拥有的业务规则或数据容量规则。

### 2.2 Minimal Runtime Enforcement

默认 Runtime Guard 仅执行框架自身正确运行所必需的检查：

- 当前操作实际读取或依赖的类型、字段和前置条件；
- 消息 envelope、协议 discriminator、direction 和当前 contract；
- authority、identity、generation、revision、lifecycle 和 state continuity；
- Patch / Snapshot 的 candidate isolation、commit atomicity 和 framework-owned structural invariants；
- 当前正式契约明确规定的 JSON representation、字段语义和协议不变量。

默认 Runtime 不得自行添加以下容量上限或对应拒绝逻辑：

- application message bytes；
- JSON nesting depth；
- Domain Registry entries、RenderNode count、tree depth；
- Patch operation count；
- attrs / JSON members、array elements；
- key / string byte length；
- Render data payload bytes；
- pending message count、queue bytes、retained work 或 candidate growth。

这些数字不能以固定常量、默认配置、可配置 ResourceBudgetPolicy 或 Host/Product 强制配置的形式重新引入。平台、浏览器、操作系统和实际传输 API 自身的能力边界仍然存在；框架不应另行缩窄它们。

默认 Runtime 也不应额外执行：

- 应用业务 Schema 或跨字段业务语义审查；
- 与本次操作无关的完整 Snapshot preflight；
- 对已经处理过的数据重复进行全树 JSON / depth / byte traversal；
- 仅为证明业务数据“足够严格”而进行的无差别深复制或深冻结。

### 2.3 Opt-in Strictness

更严格的检查由开发者主动选择，可在开发、测试、CI 或明确配置的生产环境使用。

Strict Validation 可以提供 JSON representation、exact application Schema、业务 validator、深度/成员/字符串/大小限制和诊断信息，但必须满足：

- 默认不进入普通 Runtime 热路径；
- 不成为框架运行的强制依赖；
- 不改变既有 wire ABI；
- 不替代当前协议本身的强制约束；
- 具体 API / package / configuration 由独立设计决定。

开发者选择的限制只约束该开发者启用的验证流程，不得被包装成所有应用必须遵守的框架容量上限。

## 3. Operation-first 与错误处理

对开发者拥有、处于受信任执行路径的数据，默认采用 operation-first：

1. 不为每次小更新预先完整扫描整个应用状态；
2. 在实际读取、应用、编码或提交时执行该操作和当前协议真正需要的检查；
3. 让实际操作报告类型、序列化、平台 API 或前置条件错误；
4. 在清晰的 API / subsystem / transport 边界传播或捕获实际异常；
5. 失败操作必须放弃候选状态，不得部分提交或污染 current state。

错误分类必须反映真实原因：

- malformed JSON、错误 message type、closed-schema violation：protocol failure；
- authority、identity、revision 或 Patch 前置条件不成立：authoritative continuity failure；
- 开发者输入、getter、Proxy、JSON serialization 或本地实现操作抛出的异常：local operation error，不得伪装成 peer protocol violation；
- carrier / host API 实际 send 或 receive 失败：传播实际 transport failure。

Catch 不能让失败后的 current state 继续被当作有效状态使用。对于 authoritative Patch，失败时丢弃 candidate；如果无法继续证明 stream continuity，则退休当前 Data carrier，但不得把本地异常归咎于远端协议。

框架不通过自设 byte、depth、count 或 queue cap 预防这些异常。平台本身无法完成操作时，报告平台实际产生的异常；不可捕获的进程级 OOM 不承诺能够由 JavaScript catch。

## 4. Ownership 与不可变性

- 不得把深复制 / 深冻结当作默认业务严格验证，但也不得为了性能删除必要的 authority / ownership isolation。
- RenderManager authoring API 若承诺在异步 publication 前与 caller-owned input 脱离，就必须兑现该 ownership contract；API 返回后 caller mutation 不得改变 retained state、pending work 或 emitted message。
- 将必要的类型/shape 检查与 detached clone / freeze 融合为一次必要遍历；不得为了资源计量再执行第二轮完整遍历。
- Renderer 收到的 JSON.parse object 已由 parser 创建；RenderStore 可在证明无外部别名后利用其 ownership，并通过 isolated candidate + atomic commit 保证 current state 不被失败 Patch 污染。
- Strict Validation 可以在 opt-in 模式检测业务 mutation / shape 问题。
- 缓存 metadata 只能用于它实际证明的内部计算；不得将其作为业务正确性证明或跨进程信任凭证。

## 5. 平台能力与实际异常

框架不定义通用的 message-size、parser-depth、tree-size、Patch-count、payload-size、queue-capacity 或 retained-memory budget。

平台原生限制由平台拥有。例如 WebSocket、MessagePort、JavaScript engine、浏览器和操作系统可能因实际能力或故障拒绝操作；框架应传播可观察到的真实异常，不应在其前面再放一道人为数字门槛。

序列化应在实际编码过程中完成，不得先完整扫描对象计算一个框架容量值，再重复 stringify。解析应直接使用既定 Wire / ECMAScript JSON.parse 语义，不得先做 raw-byte gate 或额外 depth preflight。结构检查只验证协议和 Render Tree 不变量，不验证节点数、深度或业务数据规模。

队列只承担既定的 FIFO、single-reader / single-writer、lifecycle 和 coalescing 语义；不得因框架自设容量而丢弃消息或终止 peer。状态型数据仅在协议允许时 coalesce；Event 不因队列容量压力而静默丢弃。真实 carrier send failure 按 transport failure 处理。

## 6. Frozen Contract 兼容规则

本原则不允许静默修改正式契约。Render Update v1 历史固定数字和容量触发的队列行为曾经属于可观察的 accept/reject/drop 语义；本次必须作为明确的首次发布前 correction 处理，而不能声称它们从未影响协议行为。

Render Update /1 与受影响 Renderer Data Profile identity（包括 /3）的 same-identity correction，只允许在兼容性核查确认没有已部署旧实现、独立旧 Peer、rolling/rollback cohort 或 persisted compatibility obligation 时采用。若任何此类义务存在，必须停止 same-identity correction，另行提交明确的 protocol version / migration ADR。

本次 correction 保留 JSON representation、closed message schema、authority/identity/revision、Patch atomicity、framework structural invariants 和必要 Event ordering；删除人为 numeric capacity 和容量触发的丢弃语义。首次正式发布后，任何 wire-observable accept/reject/drop semantics 变化必须按版本治理处理。

## 7. 设计审查清单

新增或修改 framework validation 时，必须回答：

- 这个检查保护的是 framework invariant、protocol compatibility，还是开发者业务规则？
- 这个数字是否来自协议语义，还是框架自行估计的平台容量？
- 如果平台实际能够处理更大的数据，框架是否仍会因为自己的数字拒绝？
- 检查能否融合到实际 parse / serialize / operation / commit？
- 是否对本次操作没有改变的数据做了全量重复遍历？
- 是否能通过 operation-first error handling 和 atomic candidate commit 处理？
- 若需要 strict validation，它是否与默认 Runtime Guard 解耦？
- 如果修改 wire-observable behavior，是否有明确 correction / migration / qualification 计划？

若无法说明检查的 framework owner 和必要性，不应默认把它加入每次 Runtime 热路径。
