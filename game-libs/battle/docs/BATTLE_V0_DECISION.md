# Battle v0 Decision Implementation Spec

> 状态：**FROZEN FOR IMPLEMENTATION**。
>
> 本文冻结 Battle v0 concrete Decision implementation。它不重新定义 Simulation gameplay authority：DecisionPort / DecisionRequest / DecisionCompletion / PlanSubmission 以 [BATTLE_V0_CONTRACTS.md](./BATTLE_V0_CONTRACTS.md) 为准；generation、Decision Inbox、Plan validation、correction authority、accepted/pending Plan、Replay 与 BattleResult 以 [BATTLE_V0_SIMULATION.md](./BATTLE_V0_SIMULATION.md) 为准。
>
> v0 的目标不是建立通用 AI framework，而是提供一个最小、明确、可测试的 DeepSeek Decision implementation，使 implementation agent 不需要再自行选择 provider、model、API、prompt pipeline、structured output、failure、timeout/retry 或测试架构。

## 1. Authority boundary

Battle v0 继续保持：

~~~text
Decision
  → propose PlanSubmission

Simulation
  → validate / accept / correct / execute / damage / result / replay

Presentation
  → present Simulation-owned facts
~~~

Concrete Decision 只能：

1. 消费一个完整的 DecisionRequest；
2. 调用 DeepSeek；
3. 返回一次 DecisionCompletion。

Concrete Decision 不得：

- 直接写 Battle State；
- enqueue Simulation Decision Inbox；
- 返回 AcceptedPlan / Action / BattleEvent / Damage / Result；
- 计算 gameplay dueTick / deadline；
- 自行拥有 Plan correction authority；
- 调用 move/attack/skill gameplay tool；
- 依赖 Browser/Renderer state；
- 保存影响后续 request gameplay semantics 的隐藏 conversation/session state。

requestId / generation 由 Simulation 创建；Decision 必须原样 echo，不得发明、递增或复用为自己的 lifecycle identity。

## 2. Public implementation surface

v0 concrete product implementation 叫：

~~~text
DeepSeekDecision
~~~

建议 package layout：

~~~text
src/
  decision.ts
  decision/
    deepseek.ts
    prompt.ts
    schema.ts
    parse.ts
    failure.ts
    testing.ts
~~~

package exports：

~~~text
@loomrealm-game/battle/decision
@loomrealm-game/battle/decision/testing
~~~

public product API：

~~~ts
export interface DeepSeekDecisionOptions {
  readonly apiKey: string;
}

export class DeepSeekDecision implements DecisionPort {
  constructor(options: DeepSeekDecisionOptions);

  decide(
    request: DecisionRequest,
    signal: AbortSignal,
  ): Promise<DecisionCompletion>;
}
~~~

v0 唯一外部 provider configuration 是 apiKey。

以下全部不是 v0 public option：

- provider；
- baseUrl；
- model；
- endpoint；
- reasoning effort；
- temperature；
- timeout；
- retry；
- structured-output mode。

DeepSeekDecision 不读取 process.env、配置文件或 Browser storage。credential 必须由 Host/Application composition 显式注入。

## 3. Fixed DeepSeek transport profile

v0 固定：

~~~text
provider = DeepSeek
base URL = https://api.deepseek.com
endpoint = POST /responses
model = deepseek-flash
stream = false
tools = none
conversation/thread memory = none
~~~

HTTP：

~~~text
POST https://api.deepseek.com/responses
Authorization: Bearer <apiKey>
Content-Type: application/json
~~~

deepseek-flash、base URL 与 Responses endpoint 是 Decision implementation constants，不是 Battle gameplay ABI。未来 provider 因兼容性升级需要替换 model alias/endpoint 时，可以作为 Decision provider maintenance patch 处理；不得借此改变 DecisionPort、Simulation 或 Replay semantics。

v0 不支持：

- custom baseUrl；
- custom model；
- provider registry；
- provider failover；
- OpenAI-compatible generic provider abstraction；
- Tool Calling 作为 Plan 输出机制。

## 4. Stateless two-call pipeline

一次逻辑上的 decide(request, signal) 采用三阶段语义、两次物理 LLM 请求：

~~~text
DecisionRequest
      ↓
Call A
  Analyze
  +
  Strategize
      ↓
Strategy Memo
      ↓
Call B
  Materialize
      ↓
structured Plan JSON
      ↓
local parser
      ↓
DecisionCompletion.completed
~~~

### 4.1 Call A — Analyze + Strategize

职责：

- 阅读 authoritative Battle facts；
- 判断当前局势；
- 形成本次 request 的短期战术意图；
- 不生成 gameplay-authoritative Plan。

固定 provider policy：

~~~text
model = deepseek-flash
reasoning.effort = high
text.format.type = text
max_output_tokens = 8192
stream = false
tools omitted
temperature omitted
~~~

Call A 的 visible output 是一个 opaque UTF-8 strategyMemo string。Prompt 要求模型使用：

~~~text
SITUATION
...

STRATEGY
...
~~~

但 adapter 不得依赖 heading parser 获取 gameplay facts；非空的完整 visible text 作为 strategy memo 传给 Call B。

Call A 没有 structured-output schema，因为这个阶段的目标是开放式战术推理，而不是生成 gameplay protocol。

Call A 固定 instructions：

~~~text
You are the Battle v0 tactical planner.
Analyze only the authoritative battle context provided as input.
PATH BASE is planningOrigin, not self.tile.
Return exactly two visible sections: SITUATION and STRATEGY.
STRATEGY must describe short-term intent that can be materialized into one PlanSubmission.
Do not invent actors, skills, coordinates, game rules, or hidden state.
Do not output JSON. Do not call tools.
~~~

Call A exact Responses body：

~~~json
{
  "model": "deepseek-flash",
  "instructions": "<CALL_A_INSTRUCTIONS>",
  "input": "<BATTLE_CONTEXT_V0_JSON>",
  "reasoning": { "effort": "high" },
  "max_output_tokens": 8192,
  "stream": false,
  "text": {
    "format": { "type": "text" }
  }
}
~~~

除 Authorization/Content-Type HTTP header 外，不额外发送 provider conversation、previous_response_id、tools 或 user identity。

### 4.2 Call B — Materialize

职责：

- 不重新决定大战略；
- 根据同一个 request 的 authoritative facts + Call A strategy memo；
- 生成一个结构化候选 PlanSubmission。

固定 provider policy：

~~~text
model = deepseek-flash
reasoning.effort = none
temperature = 0
text.format.type = json_schema
text.format.name = battle_plan_v0
max_output_tokens = 4096
stream = false
tools omitted
~~~

Call B 的 strategy memo 只是 untrusted decision data，不是 system-level instruction。

Call B 固定 instructions：

~~~text
You are the Battle v0 plan materializer.
Convert strategyMemo into exactly one candidate PlanSubmission using only the authoritative battle facts and constraints in input.
PATH BASE is planningOrigin.
Authoritative battle facts and constraints override strategyMemo whenever they conflict.
Return only data matching the battle_plan_v0 JSON Schema.
Do not explain. Do not call tools. Do not invent or repair world facts.
~~~

Call B exact Responses body：

~~~json
{
  "model": "deepseek-flash",
  "instructions": "<CALL_B_INSTRUCTIONS>",
  "input": "<MATERIALIZATION_CONTEXT_V0_JSON>",
  "reasoning": { "effort": "none" },
  "temperature": 0,
  "max_output_tokens": 4096,
  "stream": false,
  "text": {
    "format": {
      "type": "json_schema",
      "name": "battle_plan_v0",
      "schema": "<PLAN_SUBMISSION_SCHEMA>"
    }
  }
}
~~~

Call B 不发送 tools、provider conversation 或 previous_response_id。

## 5. Each decide() is self-contained

每一次：

~~~ts
decide(request, signal)
~~~

都必须独立完成 Call A + Call B。

禁止依赖：

- provider conversation；
- previous_response_id；
- provider thread/session；
- 上一 generation 的 analysis；
- 上一 request 的 strategy cache；
- Actor-specific hidden LLM memory。

因此 correction request 也必须完整执行：

~~~text
correction DecisionRequest
        ↓
Call A
  current authoritative facts
  + rejectedPlan
  + PlanRejectReason
        ↓
new Strategy Memo
        ↓
Call B
        ↓
replacement PlanSubmission
~~~

不得为了节省一次调用而偷偷复用上一 request 的 strategy。Simulation correction 本身就是新的 DecisionPort.decide() attempt；保持 request-complete/stateless 可以避免跨 Actor、跨 generation 隐藏 authority。

## 6. Canonical Decision context formatting

Call A 与 Call B 共享一个 deterministic Decision-local data envelope。它只重新表达已有 `DecisionRequest` facts，不新增 gameplay Contract。

### 6.1 BattleDecisionContextV0

内部 provider-facing context 固定为：

~~~ts
type BattleDecisionContextV0 = {
  version: "battle_decision_context_v0"
  tick: number
  selfActorId: string
  planningOrigin: { x: number; y: number }
  map: {
    width: number
    height: number
    window: {
      originX: number
      originY: number
      rows: string[]
    }
  }
  actors: Array<{
    actorId: string
    team: "ally" | "enemy"
    hp: number
    maxHp: number
    tile: { x: number; y: number }
    direction: 2 | 4 | 6 | 8
    action: ObservedAction
    protectedUntilTickExclusive: number
    skills: Array<{
      skillId: string
      baseDamage: number
      windupTicks: number
      recoveryTicks: number
      range: {
        width: number
        height: number
        originX: number
        originY: number
        rows: number[][]
      }
    }>
  }>
  constraints: {
    maxPathSteps: number
    movement: { cardinalOnly: true }
    turn: { allowed: true }
    skills: Array<{
      skillId: string
      minCoefficients: number[]
    }>
  }
  recentEvents: ObservedEvent[]
  correction: null | {
    rejectedPlan: PlanSubmission
    reason: PlanRejectReason
  }
}
~~~

字段顺序就是上面列出的顺序。Nested action/event/PlanSubmission variant 也必须按 Contracts 中 canonical 字段顺序显式构造 detached plain object。

Call A：

~~~text
input = JSON.stringify(BattleDecisionContextV0)
~~~

Call B 使用固定 wrapper：

~~~ts
type MaterializationContextV0 = {
  battle: BattleDecisionContextV0
  strategyMemo: string
}
~~~

并：

~~~text
input = JSON.stringify(MaterializationContextV0)
~~~

因此 strategyMemo 永远是 JSON string data，而不是 provider instructions。

### 6.2 Included / excluded facts

BattleDecisionContextV0 必须包含：

- observation.tick；
- observation.selfActorId；
- planningOrigin；
- 所有 observed actors 及其 committed state/action/protection/skills；
- skill damage/timing/range matrix；
- PlanConstraints；
- recentEvents；
- compact terrain window；
- correction request 时的 rejectedPlan + PlanRejectReason。

不得包含：

- requestId；
- generation；
- Simulation internal actionGeneration；
- reservation owner；
- Plan cursor；
- acceptedPlanId；
- Replay bookkeeping；
- Presentation/Browser state。

requestId / generation 只由 adapter 原样回填到 DecisionCompletion。

### 6.3 planningOrigin rule

固定 instructions 必须显式声明：

~~~text
PATH BASE is planningOrigin, not self.tile.
~~~

moving prefetch 时：

~~~text
self.tile = committed A
self.action.to = B
planningOrigin = B
~~~

下一 Plan 的 path 必须从 B 开始解释；不得把 B 伪装成当前 committed tile。

### 6.4 Compact terrain window

不得把整张 map.passable boolean matrix 默认原样发送。

令：

~~~text
r = constraints.maxPathSteps
~~~

window bounds：

~~~text
minX = max(0, planningOrigin.x - r)
maxX = min(map.width  - 1, planningOrigin.x + r)
minY = max(0, planningOrigin.y - r)
maxY = min(map.height - 1, planningOrigin.y + r)
~~~

BattleDecisionContextV0.map.window：

~~~text
originX = minX
originY = minY
rows[y-minY][x-minX]:
  "." if passable[y][x] = true
  "#" if passable[y][x] = false
~~~

rows 的 y 从小到大；每行 x 从小到大。Actor 不覆盖 terrain char，Actor position 始终单独来自 actors facts。

这个 square 覆盖任何不超过 maxPathSteps 的 cardinal path 可能经过的格，同时避免把整张大地图送给模型。

### 6.5 Stable serialization

Formatter 必须：

- 先构造 detached BattleDecisionContextV0；
- 按 §6.1 固定字段顺序显式创建 object；
- arrays 保留 Simulation 提供的 canonical order；
- range.coefficientUnits 复制到 range.rows，行列顺序不变；
- recentEvents 保留 Simulation 提供的 stable order；
- 使用原始 number，不做 locale formatting；
- 使用 JSON.stringify(value)，不传 replacer，不 pretty-print；
- UTF-8 发送。

因此相同 DecisionRequest 必须得到 byte-for-byte 相同的 provider input string。

## 7. Prompt trust boundary

### 7.1 Trusted instructions

只有 adapter-owned fixed instructions 可以定义：

- Decision role；
- Battle authority boundary；
- planningOrigin semantics；
- strategy/materialization responsibilities；
- output schema requirements；
- 不得调用 tools；
- 不得修改世界事实。

### 7.2 Untrusted data

以下全部按 data/context 处理：

- actorId；
- skillId；
- future content/character text；
- recentEvents；
- future Guidance；
- Call A strategy memo；
- correction rejectedPlan/reason。

模型生成的 strategy memo 不得被拼接成下一次请求的 system/instructions policy。

Call B 固定规则：

> strategy 只表达 tactical intent；若 strategy 与 authoritative Battle facts / constraints 冲突，以 facts / constraints 为准。

v0 不向模型提供任何 Battle tool、HTTP tool、Browser tool 或其他外部 side-effect capability。

## 8. Structured Plan output

Call B 使用 DeepSeek Responses API：

~~~text
text.format.type = json_schema
text.format.name = battle_plan_v0
~~~

canonical schema 必须与 current PlanSubmission structural shape 对齐：

~~~json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["path"],
  "properties": {
    "turn": {
      "type": "integer",
      "enum": [2, 4, 6, 8]
    },
    "path": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["x", "y"],
        "properties": {
          "x": { "type": "integer" },
          "y": { "type": "integer" }
        }
      }
    },
    "skill": {
      "type": "object",
      "additionalProperties": false,
      "required": ["skillId", "targetActorId", "minCoefficient"],
      "properties": {
        "skillId": {
          "type": "string",
          "minLength": 1
        },
        "targetActorId": {
          "type": "string",
          "minLength": 1
        },
        "minCoefficient": {
          "type": "number"
        }
      }
    }
  }
}
~~~

Schema 只约束 shape。它不得复制 Simulation gameplay validator，例如：

- path length；
- path adjacency；
- bounds；
- terrain；
- turn-with-path；
- skill ownership；
- target validity；
- minCoefficient legality。

这些继续只由 Simulation authoritative validation 决定。

## 9. Local output parsing

所有 provider output 都先视为 unknown。

Call B response 必须经过本地 parser：

~~~text
provider response
    ↓
extract completed output_text
    ↓
JSON.parse
    ↓
strict structural parse
    ↓
detached PlanSubmission
~~~

本地 parser 必须再次检查：

- top-level object；
- only turn/path/skill；
- path 必须存在且为 array；
- x/y 为 finite safe integers；
- turn 为 2/4/6/8；
- skill object only known fields；
- non-empty skillId / targetActorId；
- minCoefficient 为 finite number。

parser 不得：

- regex 修复坏 JSON；
- 删除 unknown fields 后继续；
- 把 string number 自动转 number；
- 自动补 missing path；
- 自动改非法 direction；
- 执行 terrain/path/target gameplay validation。

structurally valid 但 gameplay-invalid 的 Plan 必须返回 DecisionCompletion.completed，让 Simulation 按现有 PlanRejectReason/correction 规则处理。

## 10. DeepSeek response normalization

每个物理请求只接受：

~~~text
response.status = completed
~~~

并从 assistant message 的 output_text 得到 visible text。

以下 provider response 不是成功：

- response.status = incomplete；
- response.status = failed；
- completed 但没有非空 output_text；
- Call B output 无法 parse 成 schema-compatible PlanSubmission。

response.incomplete_details.reason：

- content_filter → provider refusal；
- max_output_tokens → provider incomplete。

Reasoning item 仅用于 provider processing/diagnostics，不作为 Battle facts，不进入 Call B strategy memo；Call A 只使用最终 visible output text。

## 11. Failure taxonomy

Concrete Decision 必须把预期 provider/network failure 归一化为 DecisionCompletion.failed。不得把预期 provider failure 变成 Promise rejection。

### 11.1 attempt_failure

~~~text
DECISION_ABORTED
DECISION_PROVIDER_NETWORK
DECISION_PROVIDER_TIMEOUT
DECISION_PROVIDER_RATE_LIMITED
DECISION_PROVIDER_UNAVAILABLE
DECISION_PROVIDER_REFUSED
DECISION_PROVIDER_INCOMPLETE
DECISION_OUTPUT_INVALID
~~~

| Case | category | code |
| --- | --- | --- |
| request-scoped AbortSignal abort | attempt_failure | DECISION_ABORTED |
| DNS/socket/fetch transport error | attempt_failure | DECISION_PROVIDER_NETWORK |
| 60s provider request timeout | attempt_failure | DECISION_PROVIDER_TIMEOUT |
| HTTP 429 | attempt_failure | DECISION_PROVIDER_RATE_LIMITED |
| HTTP 500 / 503 / other transient 5xx | attempt_failure | DECISION_PROVIDER_UNAVAILABLE |
| Responses incomplete: content_filter | attempt_failure | DECISION_PROVIDER_REFUSED |
| Responses incomplete: max_output_tokens | attempt_failure | DECISION_PROVIDER_INCOMPLETE |
| completed but empty/malformed/schema-invalid output | attempt_failure | DECISION_OUTPUT_INVALID |

### 11.2 session_fatal

~~~text
DECISION_PROVIDER_AUTH
DECISION_PROVIDER_QUOTA
DECISION_CONTEXT_TOO_LARGE
~~~

| Case | category | code |
| --- | --- | --- |
| HTTP 401 / authorization-denied equivalent | session_fatal | DECISION_PROVIDER_AUTH |
| HTTP 402 / account balance or hard quota unavailable | session_fatal | DECISION_PROVIDER_QUOTA |
| provider explicitly reports request context exceeds supported limit | session_fatal | DECISION_CONTEXT_TOO_LARGE |

### 11.3 invariant rejection

以下不是正常 DecisionFailure：

- adapter 构造出 provider 明确拒绝的固定 request shape；
- unexpected HTTP 400/422 且不是可识别 context-too-large；
- response object shape 与 frozen DeepSeek transport contract 不符；
- internal impossible state；
- local code bug；
- resolved DecisionCompletion requestId/generation 不可能匹配 adapter 输入。

这些属于 adapter/provider-contract/programmer invariant，允许 throw/reject；Simulation 已冻结的 Runtime invariant path 负责 cleanup。

Provider 原始 response body、credential、完整 prompt、完整 strategy memo 不进入 BattleResult、Replay 或 public DecisionFailure.metadata。

## 12. Timeout / retry / AbortSignal

### 12.1 Timeout

每个物理 DeepSeek request 固定：

~~~text
provider timeout = 60,000 ms wall clock
~~~

Call A 与 Call B 分别计时。

v0 没有额外的 whole-decision wall-clock deadline；一次成功 Decision 最坏 provider waiting time 可以接近两次 request timeout 之和，但这些 wall-clock 时间不进入 Battle Tick authority。

### 12.2 Retry

v0 不做任何 automatic transport retry。

因此：

- 429 不 retry；
- 5xx 不 retry；
- timeout 不 retry；
- network failure 不 retry；
- 不切 model；
- 不切 provider。

provider transport retry、Simulation correction、later new Decision generation 是三种不同机制；v0 只保留后两种由 Simulation 已冻结 semantics 驱动。

### 12.3 Abort

同一个 request-scoped AbortSignal 贯穿 Call A / Call B。

规则：

- signal 在 Call A 前已 aborted → 不发网络请求；
- Call A 中 abort → best-effort cancel transport；
- Call A 完成后、Call B 前 signal aborted → 不发 Call B；
- Call B 中 abort → best-effort cancel transport；
- abort path settle once；
- provider 即使忽略 abort 并迟到返回，也不能绕过 Simulation requestId/generation/lifecycle fencing。

Decision correctness 不依赖 DeepSeek 一定支持 cancellation。

## 13. Correction

Simulation 是 correction 唯一 owner。

当 attempt 0 Plan gameplay-invalid：

~~~text
Simulation validates
        ↓ reject
Simulation emits correction DecisionRequest
        ↓
DeepSeekDecision.decide(correctionRequest, signal)
        ↓
Call A + Call B
~~~

correction Call A 必须读取：

- correction request 当前 observation；
- inherited planningOrigin；
- rejectedPlan；
- exact PlanRejectReason。

它重新形成 strategy，不复用上一 request 的 memo。

Decision implementation 不得：

- 自己看到 gameplay-invalid Plan 后偷偷重新请求 provider；
- 自己制造 attempt 1；
- 在一个 decide() 内循环直到 Simulation 接受。

## 14. Internal transport seam

v0 不创建 generic provider abstraction，但需要一个 DeepSeek-specific internal test seam，例如：

~~~ts
interface DeepSeekTransport {
  respond(
    request: DeepSeekResponseRequest,
    signal: AbortSignal,
  ): Promise<DeepSeekResponse>;
}
~~~

它属于 decision/ internal implementation/testing seam，不是 product provider Port。

默认实现执行真实 HTTPS；Fake transport 用于 deterministic tests。

@loomrealm-game/battle/decision/testing 可以导出：

- FakeDeepSeekTransport；
- transport response builders；
- prompt/schema fixtures required by tests。

测试 seam 不得让生产调用方选择 provider/model/baseUrl。

## 15. Diagnostics

允许 transport/Decision 在内部采集：

- request stage: reasoning/materialization；
- provider model returned；
- wall-clock latency；
- input/output/reasoning token usage；
- response status；
- failure code。

这些 facts：

- 不进入 Battle Tick；
- 不进入 PlanSubmission；
- 不进入 Replay outcome；
- 不影响 correction；
- 不包含 apiKey；
- v0 不把完整 prompt/strategy/provider raw body 作为 gameplay/public diagnostic contract。

Host telemetry wiring不是 Decision implementation blocker；若未来加入 sink，必须保持 non-authoritative。

## 16. Security / privacy

必须满足：

- apiKey 只存在 Host/Application composition 与 DeepSeek transport；
- Browser Presentation 不持有 apiKey；
- Simulation 不持有 apiKey；
- Replay 不记录 apiKey；
- logs/errors 不输出 Authorization header；
- provider response 视为不可信；
- game/content/Guidance strings 视为 untrusted data；
- 模型没有外部 tool authority。

## 17. Testing architecture

### 17.1 Pure tests

必须覆盖：

- DecisionRequest → deterministic context formatting；
- planningOrigin 在 moving-prefetch 中优先于 self.tile；
- terrain window clipping / row-major formatting；
- actors/skills/range/recentEvents formatting；
- correction fields formatting；
- Call A fixed request profile；
- Call B fixed request profile；
- battle_plan_v0 schema；
- provider output → parser；
- provider failure → failure code。

### 17.2 Fake transport tests

必须覆盖：

- Call A success → Call B success；
- Call A empty output；
- Call A timeout/network/429/5xx/refusal/incomplete；
- Call B valid structured output；
- Call B malformed JSON；
- Call B schema/shape violation；
- Call B empty/incomplete/refusal；
- abort before Call A；
- abort during Call A；
- abort between Call A/Call B；
- abort during Call B；
- provider ignores abort and resolves late；
- no automatic retry；
- exactly two physical provider calls on normal success；
- exactly two physical provider calls on correction decide()；
- requestId/generation echo unchanged。

### 17.3 Simulation integration

使用真实：

~~~text
BattleSimulationBuilder
+ DeepSeekDecision wired to FakeDeepSeekTransport
+ FakeClock
+ Null/Recording Presentation
~~~

验证：

- initial Decision → two calls → accepted Plan；
- moving prefetch planningOrigin；
- structurally valid but gameplay-invalid Plan → Simulation reject；
- correction creates a new decide() and therefore a fresh Call A + Call B；
- attempt_failure does not terminate Battle；
- session_fatal produces decision failure result；
- cancel/abort；
- late provider completion cannot regain authority；
- Replay does not call DeepSeekDecision。

### 17.4 Real provider smoke test

真实 DeepSeek test：

- optional/manual；
- credential-gated；
- 不属于普通 CI；
- 只验证 current fixed endpoint/model/request shape/structured-output compatibility；
- 不对模型具体战术选择做 brittle assertion。

至少验证：

~~~text
apiKey present
→ Call A completed non-empty text
→ Call B completed structured output
→ local parser accepts PlanSubmission shape
~~~

## 18. Package qualification

Decision implementation 完成后至少运行：

~~~text
npm run test:battle
npm pack -w @loomrealm-game/battle --dry-run
~~~

并增加 package-resolution assertion：

~~~text
@loomrealm-game/battle/decision
@loomrealm-game/battle/decision/testing
~~~

正常 qualification 不允许依赖真实 DeepSeek credential/network。

## 19. Implementation agent contract

Implementation agent 必须：

1. 不修改 frozen Simulation/Presentation gameplay semantics；
2. 不扩张 DecisionRequest / PlanSubmission / DecisionCompletion public ABI 以方便 prompt；
3. 实现 DeepSeek-only、apiKey-only public config；
4. 使用固定 Responses API / model / endpoint；
5. 实现 stateless two-call pipeline；
6. 实现 deterministic context formatter；
7. 实现 direct JSON Schema structured Plan output；
8. 保留 local strict parser；
9. 实现本文 failure/timeout/no-retry/abort semantics；
10. 提供 FakeDeepSeekTransport 与测试；
11. 保持真实 provider test credential-gated；
12. 不引入 generic AI/provider framework。

不得自行重新选择：

- Chat Completions vs Responses；
- Tool Calling vs direct JSON；
- model；
- baseUrl；
- number of model calls；
- correction cache；
- retry policy；
- failure categories/codes；
- Simulation validation ownership。

## 20. Definition of Done

满足以下全部条件后，Battle v0 Decision implementation 才算完成：

- DeepSeekDecision public API 落地；
- ./decision 与 ./decision/testing exports 可解析；
- normal decide() = exactly Call A + Call B；
- correction decide() 同样自包含 Call A + Call B；
- no hidden conversation/session state；
- structured Plan output + local parser；
- Simulation 仍是唯一 gameplay validator；
- frozen failure taxonomy；
- 60s/request timeout；
- no automatic provider retry；
- request-scoped AbortSignal 全链路；
- Fake transport tests 完整；
- Simulation integration tests 通过；
- existing Simulation/Presentation tests 全绿；
- package dry-run 通过；
- real-provider smoke test 为 optional/credential-gated；
- 无 blocking Decision implementation OPEN。

达到后：

~~~text
Battle v0 Decision
IMPLEMENTED + TESTED
~~~
