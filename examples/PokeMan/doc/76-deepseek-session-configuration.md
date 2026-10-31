# PokeMan DeepSeek Session 配置与启动 Gate 设计

> 状态：Proposed / Design-only
> 适用范围：examples/PokeMan 当前产品集成
> 不修改 Framework / Battle Core frozen contract
> 目标：在接入 PokeMan Battle 前，为当前 Session 建立一个已验证可用的 DeepSeek API Key，并阻止未完成配置的游戏继续进入后续 Frame。

## 1. 背景

PokeMan 当前 Game Entry 以 base subsystem 作为入口：

~~~text
Game Entry
→ Base Frame
   → create game-controls-input
   → frame.call("map", initial params)
~~~

未来 PokeMan 接入 @loomrealm-game/battle 时，Battle v0 的 concrete Decision implementation 使用 DeepSeek。Battle 已经冻结：

~~~text
Simulation
→ DecisionPort
→ DeepSeekDecision
→ DeepSeekTransport
→ DeepSeek Responses API
~~~

DeepSeekDecision 的 public constructor 只接收 configured DeepSeekTransport，不接收 apiKey。Battle Core、Simulation、Replay 与 Presentation 都不应获得 credential source/storage 语义。

当前 PokeMan 尚未提供 DeepSeek credential 的产品级配置入口，因此在 Battle 接入前增加一个启动配置 Gate。

本设计选择当前阶段的最小产品实现：

~~~text
Browser localStorage
→ 记住用户上一次提交的 DEEPSEEK_API_KEY 草稿

PokeMan Shared State
→ 保存当前 Session 已经验证成功的 DEEPSEEK_API_KEY

Base
→ 在进入 Map 之前负责配置 Gate

future Battle composition
→ 从 PokeMan Session State 读取 key
→ 构造 PokeMan-private DeepSeekTransport
→ 注入 DeepSeekDecision
~~~

该方案是 PokeMan 当前阶段的 product-private integration decision，不建立 Framework 通用 credential storage pattern。

## 2. 目标

本改造必须满足：

1. PokeMan 启动进入 base Frame 后，在进入 Map 或其他 gameplay Frame 前保证 DeepSeek credential 已配置。
2. 配置 UI 使用 @loomrealm-game/schema-form。
3. 表单只有一个字段：DEEPSEEK_API_KEY。
4. 表单不可取消。
5. localStorage 记住用户上一次提交的内容，避免重新输入。
6. 用户提交后必须实际验证 DeepSeek credential / provider connectivity。
7. 只有远程验证成功并且 Session Shared State 写入成功，表单才能关闭。
8. Base 只有在配置 Gate 完成后才允许调用后续 Frame。
9. future Battle 不修改 DeepSeekDecision public API，而是继续通过 DeepSeekTransport 注入。
10. API Key 不进入 Frame params、Session Events、Content、Battle Simulation state、Replay 或 Presentation retained business state。
11. future Save/Load 明确不持久化该 Session credential Record。

## 3. 非目标

当前阶段明确不解决：

~~~text
password-style input masking
localStorage encryption
OS keychain / secure enclave
server-side credential proxy
generic Framework credential capability
generic secret store
provider registry
multiple provider selection
multiple DeepSeek API keys
account/profile credential management
credential rotation UI
Save/Load implementation
Battle gameplay integration implementation
~~~

这些后续能力不得改变本设计中已经固定的启动 Gate 和 Battle transport seam。

## 4. Base 的职责

PokeMan 当前 base 是 example/product-private infrastructure subsystem。它已经承担长期 controls producer composition，并位于初始 Frame 链最前端。

因此 DeepSeek startup Gate 放在 Base 是合适的：

~~~text
Base Frame begins
    ↓
ensureDeepSeekConfiguration()
    ↓
DeepSeek Session config READY
    ↓
create game-controls-input
    ↓
frame.call("map", frame.params)
~~~

Base 拥有的是“是否允许游戏继续启动”的产品流程，不因此成为 Battle gameplay authority。

建议 controls RenderDomain 在配置 Gate 完成后再创建，因为 API Key 配置阶段还没有 gameplay controls producer 的必要。

目标结构：

~~~text
Base.frame(frame)
│
├─ ensureDeepSeekConfiguration(frame)
│
├─ create game-controls-input RenderDomain
│
├─ await frame.call("map", frame.params)
│
└─ finally close inputHost
~~~

配置逻辑应提取成 PokeMan-private helper，而不是把所有逻辑堆在 base.frame()：

~~~text
examples/PokeMan/
└─ subsystems/
   ├─ base.mjs
   └─ deepseek-config.mjs
~~~

文件名不是 public contract；重点是该逻辑保持 PokeMan-private，不创建新的通用 game library。

## 5. Session Shared State Record

当前设计新增一个非 gameplay-core、Session-only 的 PokeMan Shared State Record：

~~~text
namespace = pokeman.SessionConfig
key       = deepseek
~~~

value：

~~~json
{
  "apiKey": "..."
}
~~~

语义：

pokeman.SessionConfig/deepseek 存在，表示当前 live Session 已经获得一个通过启动 probe 的 DeepSeek API Key。

因此不增加冗余字段：

~~~text
validated: true
connected: true
ready: true
~~~

Record presence 本身就是当前 Session 的 ready fact。

该 Record 不修改 67-shared-state-records.md 已冻结的四类 PokeMan gameplay-core Shared State。它属于 product/session integration configuration，而不是 World、Event、Relationship 或 Card gameplay state。

### 5.1 为什么独立 Record

禁止把 API Key 加进：

~~~text
pokeman.PlayerWorld/current
pokeman.EventStateList/current
pokeman.Relationship/*
pokeman.CarriedCards/*
~~~

也禁止为了该配置建立巨大 pokeman.GameState/current。

独立 SessionConfig Record 可以保持：

~~~text
gameplay business records
!=
session-only provider configuration
~~~

并让未来 persistence 通过 Record allowlist 明确排除它。

## 6. Base 启动时的 State 检查

Base 每次进入配置 Gate 时先读取：

~~~text
pokeman.SessionConfig / deepseek
~~~

规则：

~~~text
record value has valid expected shape
→ 当前 Session 已配置
→ 不打开表单
→ 继续启动

record absent / null
→ 打开 Schema Form

record malformed
→ 不信任该值
→ 按未配置处理
~~~

正常情况下初始 Game baseline 不声明该 Record，因此新 Session：

~~~text
value = null
version = 0
~~~

read() 不 materialize unknown Record。

当前设计不要求 Base 对一个已经存在的 SessionConfig/deepseek 每次重新 probe。Record 的创建规则保证它只在成功 probe 后写入。

如果 Session 存活期间 credential 后续被 provider 撤销，future Battle 仍必须按现有 Decision/provider failure semantics 处理；startup Gate 不承担持续健康监控。

## 7. Schema Form

配置 UI 使用 @loomrealm-game/schema-form。

概念 request：

~~~ts
{
  schema: {
    version: 1,
    title: "DeepSeek API",
    description: "PokeMan 需要 DeepSeek API Key 才能继续。",
    fields: [
      {
        key: "DEEPSEEK_API_KEY",
        kind: "string",
        label: "DEEPSEEK_API_KEY",
        required: true,
        localstorageKey: "pokeman.deepseek.api-key"
      }
    ]
  },
  cancelable: false,
  onSubmit: async (value, control) => {
    // remote validation + Shared State commit
  }
}
~~~

字段业务 key 固定：

~~~text
DEEPSEEK_API_KEY
~~~

localStorage draft key 固定建议：

~~~text
pokeman.deepseek.api-key
~~~

如果实现阶段需要调整 exact localStorage key，应在同一个 PokeMan integration change 中保持稳定，不把它提升成 Framework ABI。

## 8. localStorage 的精确语义

本设计明确选择：

localStorage 记住用户上一次提交的内容，而不是只保存验证成功的 key。

这正好复用 Schema Form 当前 localstorageKey 的 submit-attempt draft semantics。

固定行为：

~~~text
用户填写 key
↓
点击 Submit
↓
Schema Form 在 Browser 侧 best-effort 写 localStorage
↓
Submit event 到 Runtime
↓
onSubmit 开始远程验证
~~~

因此以下行为是预期行为：

~~~text
用户输入错误 key
→ Submit
→ 错误 key 已写入 localStorage
→ DeepSeek probe 返回认证失败
→ 表单显示错误并继续打开
→ 下次新 Session 打开表单时恢复该错误 key
~~~

这样做的产品目的不是证明该 key 已通过验证，而是避免用户反复从空白重新输入。

localStorage 与 Shared State 的意义必须严格分开：

~~~text
Browser localStorage
= last submitted credential draft
= 可以是无效 key
= Browser/origin-local
= Presentation-side best effort

pokeman.SessionConfig/deepseek
= current Session validated credential
= 只在 probe success 后写入
= cross-Subsystem Session authority
~~~

不得因为 localStorage 有值就跳过 DeepSeek probe。

## 9. Submit lifecycle

Schema Form 的 caller-controlled submit lifecycle 正好用于本场景。

提交后的目标顺序固定：

~~~text
valid Submit
↓
onSubmit
↓
control.setLoading()
↓
probe DeepSeek
↓
probe success
↓
commit pokeman.SessionConfig/deepseek
↓
commit success / reconciled success
↓
control.close()
↓
openSchemaForm settles
↓
Base continues
~~~

失败：

~~~text
probe / provider / State write recoverable failure
↓
control.sendValidateError(...)
↓
control.cancelLoading()
↓
form remains active
↓
user edits / retries
~~~

最关键的顺序 invariant：

~~~text
DeepSeek probe success
→ Shared State known-ready
→ control.close()
→ next Frame
~~~

禁止：

~~~text
probe success
→ control.close()
→ state.commit(...)
~~~

否则可能出现 Form 已经 terminal、Base 开始进入 gameplay，但 future Battle 读取不到 credential 的状态分裂。

## 10. DeepSeek credential probe

启动 Gate 使用低成本 authenticated endpoint 验证 credential 与 provider connectivity：

~~~text
GET https://api.deepseek.com/models
Authorization: Bearer <DEEPSEEK_API_KEY>
~~~

官方参考：

- https://api-docs.deepseek.com/api/list-models/
- https://api-docs.deepseek.com/quick_start/error_codes/

成功条件建议固定为：

~~~text
HTTP 200
+
response body 是可解析的模型列表
+
data 中存在 Battle v0 当前要求的 model id: deepseek-flash
~~~

这样 probe 不只是证明 API Key 能认证，还证明当前 Battle v0 固定模型对该 provider profile 可见。

probe 不执行实际 Battle Decision，也不调用 POST /responses，因此不会为了启动游戏额外生成一轮 LLM response。

### 10.1 Provider error mapping

预期 provider/network failure 必须作为可恢复表单错误处理，不应让 onSubmit Promise 直接 reject。

建议 mapping：

~~~text
401
→ API Key 无效，请检查后重试

402
→ DeepSeek 账户余额不足

429
→ DeepSeek 请求受限，请稍后重试

500 / 503 / other 5xx
→ DeepSeek 服务暂时不可用，请稍后重试

network failure / timeout
→ 无法连接 DeepSeek，请检查网络后重试

200 but malformed model response
→ DeepSeek 返回了无法识别的响应，请重试

200 but deepseek-flash absent
→ 当前 DeepSeek 账号/服务未提供 Battle 所需模型
~~~

其他 non-2xx 状态可显示 generic provider configuration failure，并保留重试能力。

只有真正的 programmer/invariant failure 才应让 onSubmit throw/reject，从而升级为 Schema Form operation failure。

## 11. Shared State commit

probe 成功后写：

~~~text
pokeman.SessionConfig/deepseek
→ { apiKey }
~~~

写入必须使用 Shared State v1 的普通 OCC transaction。

概念流程：

~~~text
read current record
→ obtain current version
→ commit:
     condition = current version
     put { apiKey }
~~~

State commit 成功后才允许 control.close()。

### 11.1 commit failure

State failure 与 provider validation failure 是不同问题，UI 不应混成“API Key 无效”。

例如：

~~~text
CONFLICT
BINDING_UNAVAILABLE
OUTCOME_UNKNOWN
TERMINAL
other state failures
~~~

应映射为配置保存失败或按 Shared State evidence 做 reconciliation。

禁止 blind retry OUTCOME_UNKNOWN。

对于 OUTCOME_UNKNOWN：

~~~text
commit outcome unknown
↓
read pokeman.SessionConfig/deepseek
↓
if current value is valid-shaped Session config
   → Gate 已经存在 authoritative ready fact
   → 可视为 reconciled success
else
   → 保持表单 active
   → 告知无法确认配置是否保存
~~~

对于 CONFLICT：

~~~text
re-read current record
↓
if another valid SessionConfig/deepseek already exists
   → 当前 Session 已 READY
   → 可完成 Gate
else
   → 保持表单 active / retry with fresh version
~~~

在正常 PokeMan topology 中 Base 是该启动 Gate 的唯一预期 writer，因此 conflict 是异常并发而不是普通 happy path。

## 12. Abort / Frame lifecycle

probe 必须绑定当前 Base Frame 的 abort lifecycle。

目标：

~~~text
Base Frame abort
→ outstanding probe best-effort cancelled
→ Schema Form abort
→ 不进入 Map
~~~

Shared State commit() 按 v1 contract 不接受远程 mutation cancellation。

因此：

~~~text
probe success
→ before dispatching commit, if Frame already aborted: do not begin new commit

commit already dispatched
→ do not pretend abort means no-commit
→ respect commit evidence / OUTCOME_UNKNOWN semantics
~~~

即使迟到 commit 最终写入 SessionConfig，也不得让已经 aborted 的 Base Frame 继续调用 child Frame。

## 13. Base 与后续 Frame 的 Gate invariant

Base 的核心启动 invariant：

~~~text
before frame.call("map", ...)
pokeman.SessionConfig/deepseek MUST be current valid-shaped record
~~~

因此完整启动拓扑变成：

~~~text
Game Entry
→ Base
   ↓
   read SessionConfig/deepseek
   │
   ├─ present
   │   → ready
   │
   └─ absent
       → non-cancelable Schema Form
       → localStorage restore draft
       → Submit
       → loading
       → GET /models probe
       → Shared State commit
       → close form
       → ready
   ↓
   create game-controls-input
   ↓
   call Map
~~~

配置失败不会创建 Map Frame。

## 14. Future Battle integration

本设计不修改 @loomrealm-game/battle 的 frozen public API。

未来 PokeMan battle subsystem 的 product composition 应保持：

~~~text
scope.state.read(pokeman.SessionConfig/deepseek)
↓
apiKey
↓
construct PokeMan-specific configured DeepSeekTransport
↓
new DeepSeekDecision({ transport })
↓
inject DecisionPort into BattleRuntime
~~~

禁止改成：

~~~ts
new DeepSeekDecision({
  apiKey
})
~~~

DeepSeekDecision 仍然不知道 credential source/storage。

Battle Simulation 仍然只看到 DecisionPort。

### 14.1 credential propagation prohibition

即使当前 API Key 在 Shared State 中，以下路径仍禁止携带 raw key：

~~~text
Frame params
Session Events
Content
RenderData outside active credential form needs
BattleObservation
DecisionRequest
PlanSubmission
Battle Simulation state
BattleSnapshot
Replay
BattleResult
diagnostics / logs
~~~

PokeMan concrete integration 读取 key 的唯一目的，是建立当前 provider transport / startup probe。

## 15. 当前阶段的 authority 例外

Shared State v1 的 general guidance 把 transport credential 默认归为 Platform binding；Battle v0 Integration 也把 credential source/storage 与 physical network realization 放在 trusted product/platform composition。

本设计有意识地选择一个阶段性 PokeMan product exception：

~~~text
DEEPSEEK_API_KEY
→ pokeman.SessionConfig/deepseek Shared State
→ concrete PokeMan integration may read it
~~~

理由是：

~~~text
当前优先关闭 PokeMan Battle 接入所需的 credential configuration gap
+
已有 Shared State 已能提供 cross-Subsystem Session fact
+
未来 Save/Load 尚未实现
+
当前安全 hardening 明确延期
~~~

该决定不得推广成：

~~~text
Framework credentials should live in Shared State
Battle library should read Shared State credentials
all games should use SessionConfig
Shared State is a generic secret store
~~~

这只是 PokeMan 当前阶段的 product-private choice。

未来若引入正式 credential capability/store，应只替换：

~~~text
PokeMan key source
+
DeepSeekTransport construction
~~~

而不修改：

~~~text
DecisionPort
DeepSeekDecision public API
Simulation
Replay
Battle gameplay rules
~~~

## 16. Save / Load 规则

future Save 必须采用明确的 Record allowlist，而不是：

~~~text
state.scan()
→ serialize everything
→ blacklist secret fields
~~~

目标：

~~~text
Save persistence allowlist
├─ pokeman.PlayerWorld
├─ pokeman.EventStateList
├─ pokeman.Relationship
└─ pokeman.CarriedCards

DO NOT persist
└─ pokeman.SessionConfig
~~~

因此：

~~~text
new Session / Load Session
→ SessionConfig/deepseek absent
→ Base Gate runs
→ localStorage may restore last submitted draft
→ user submits / probe
→ new Session gets validated credential
~~~

Save document 不应知道 apiKey 字段，也不应依赖“过滤 JSON 某个字段名”。

Record-level exclusion比字段 blacklist 更稳定；未来 SessionConfig 增加其他 session-only configuration 时，也默认不会进入 save。

## 17. Security / UX deferred work

当前阶段明确接受：

~~~text
Schema Form string field may display key as ordinary text
localStorage stores ordinary Schema Form draft encoding
Shared State stores raw apiKey JSON string
PokeMan concrete Runtime can read raw credential
~~~

这是已知技术债，不在本改造中隐藏或伪装成 secure storage。

后续计划可以分别增加：

~~~text
Schema Form password/secret presentation hint
localStorage encrypted-at-rest encoding
formal credential capability / secret store
platform-specific secure storage
trusted backend/proxy transport
credential replacement / reset UX
~~~

这些是 hardening / architecture migration，不阻塞当前 PokeMan Battle integration。

即使未来 localStorage 增加 encryption，也必须保持本设计已选择的 product semantics：

~~~text
localStorage
= last submitted draft
!= validated credential authority
~~~

## 18. 推荐 implementation boundary

后续实现 PR 建议保持小范围：

~~~text
examples/PokeMan/package.json
→ add @loomrealm-game/schema-form dependency if needed

examples/PokeMan/subsystems/base.mjs
→ add startup Gate call

examples/PokeMan/subsystems/deepseek-config.mjs
→ PokeMan-private form/probe/state helper

PokeMan tests
→ startup Gate qualification

future battle integration
→ separate PR
~~~

本设计不要求修改：

~~~text
@loomrealm/subsystem
@loomrealm/shared-state
@loomrealm-game/schema-form contract
@loomrealm-game/battle contract
Main
Renderer/Data protocol
Session Events
Framework launch protocol
~~~

如果实现发现必须修改这些 frozen surfaces，应停止并重新审查设计，而不是在 implementation PR 中顺带扩展 Framework。

## 19. 最小测试 / qualification 要求

实现阶段至少覆盖：

1. SessionConfig absent 时 Base 在 Map 前打开不可取消表单。
2. localStorage 有 draft 时字段恢复该值，但不会跳过 probe。
3. 空值被 Schema Form built-in validation 拦截。
4. valid key Submit 后进入 loading，重复 submit/cancel 被阻止。
5. 401 显示字段错误，Shared State 仍 absent，Map 未启动。
6. network/5xx 显示可恢复错误，Shared State 仍 absent。
7. probe 200 但模型列表 malformed 时不能完成 Gate。
8. probe 200 但缺少 deepseek-flash 时不能完成 Gate。
9. probe success + State commit success 后才 close form。
10. Gate 完成后 Map 只启动一次。
11. SessionConfig 已存在时重新进入 ensure logic 不再打开表单。
12. Shared State commit failure 不被错误显示成 credential invalid。
13. OUTCOME_UNKNOWN 按 State read reconciliation，不 blind retry。
14. Base Frame abort 会终止/失效 probe，且绝不进入 Map。
15. API Key 不出现在 Frame params、Session Events、Battle payload 或 Replay 测试快照中。
16. future Save qualification 必须证明 SessionConfig 不进入 save document。

Browser qualification 应至少有一条真实 Schema Form + localStorage restore + async submit path，避免只用纯 unit test 模拟 caller-controlled submit。

## 20. Acceptance summary

本设计完成后的产品 invariant：

~~~text
Browser localStorage
= last submitted DEEPSEEK_API_KEY draft

pokeman.SessionConfig/deepseek
= current Session successfully validated DeepSeek credential

Base
= startup configuration gate

Map / later gameplay
= cannot start before Gate success

future Battle
= reads Session credential only in concrete product composition
→ creates configured DeepSeekTransport
→ keeps DeepSeekDecision({ transport }) unchanged

Save
= allowlist gameplay records
→ never serializes pokeman.SessionConfig
~~~

最重要的状态转换是：

~~~text
UNCONFIGURED
→ FORM_ACTIVE
→ VALIDATING
→ SESSION_CONFIG_COMMITTED
→ READY
→ downstream Frame
~~~

失败只能回到可继续编辑/重试的 FORM_ACTIVE；不能在 credential 未验证或 Shared State 未形成 authoritative ready fact 时越过 Gate。
