# ADR 0027：冻结 Renderer Control v1 与 M7 Preimplementation Closure

> 状态：Accepted  
> 日期：2026-09-03  
> 影响范围：M7 Renderer Control、`@loomrealm/renderer-control`、`@loomrealm/main`、`@loomrealm/renderer`、`@loomrealm/platform-ports`  
> 依赖：[ADR 0021](./0021-runtime-control-preimplementation-closure.md)、[ADR 0026](./0026-session-scoped-platform-instance.md)、[Main ⇄ Renderer Control v1](../15-contracts/main-renderer-control-v1.md)  
> 实施文档：仓库根目录 `M7_01_*` → `M7_05_*`

## 背景

M7 的目标不是建立通用 RPC/状态同步框架，而是把 Main 已提交的 Runtime / Frame / Activation / InputTarget authority 以一个具体、bounded、fail-closed 的 Renderer Control v1 链路镜像到当前 Renderer。

冻结前复核关闭以下实施期架构决策：

```text
Renderer carrier/token 如何进入 live Main
Renderer capability 缺席时 Main 如何运行
hello version negotiation 与 Main authority 的 ownership
hello Snapshot representability 与 current switch 的原子顺序
replacement 如何撤销 old Renderer participant
old peer 已 in-flight send 的可保证语义
Main Session terminal 如何终止 Renderer authority
Runtime stopped 如何投影
opaque identity/credential material 从何取得
```

本 ADR 规定后续实现只能在发现 correctness/security contradiction 时 reopen，不得因编码便利重新设计边界。

---

## 决策 1：M7 冻结最窄 `RendererControlBinding`

`@loomrealm/platform-ports` 在 M7 增加：

```ts
import type { MessageCarrier } from "@loomrealm/foundation";

export interface RendererControlBinding {
  acquire(
    rendererControlToken: string,
    signal: AbortSignal,
  ): Promise<MessageCarrier>;
}
```

语义固定：

```text
one acquire call
= one Main-issued Renderer Control Connection Attempt
= Platform physically delivers that exact token to one candidate Renderer bootstrap
= Platform establishes exactly one already-connected MessageCarrier<string>
```

`acquire()` 成功只表示 candidate carrier 已建立；**不表示 candidate 已认证或成为 current Renderer**。currentness 只能由成功 `renderer.hello` 的 Main authority transaction 决定。

约束：

```text
Main at most one pending acquire/candidate attempt at a time
one acquire resolves at most once
abort-before-resolution prevents later live carrier delivery
late physical carrier after abort is closed/discarded by Platform
binding does not parse Renderer Control messages
binding does not authenticate token
binding does not negotiate protocol version
binding does not decide current Renderer
binding does not retry/replay a protocol attempt
```

Main Session 存活期间，某 attempt settle 后 MAY 使用 fresh token 启动下一次 acquire；这是 fresh Connection Attempt，不是 protocol retry。成功 current peer 存在时也可保持 exactly one future candidate acquire，从而支持 reload/replacement。

M7 deterministic implementation使用 MemoryCarrier realization；Hostra WebSocket / PWA MessagePort physical realization分别在后续 product milestone qualification。

---

## 决策 2：Renderer Control Platform capability 是 optional

M7 关闭的是 **capability contract + real deterministic consumer vertical**，不是要求所有当前 concrete Platform 立刻具备 physical Renderer hosting。

因此 M7 `MainPlatform` frozen shape：

```ts
interface MainPlatform {
  readonly scheduler: DeadlineScheduler;
  readonly opaqueMaterial: OpaqueMaterialGenerator;
  readonly runtimeHosting: RuntimeHosting;
  readonly rendererControl?: RendererControlBinding;
}
```

固定语义：

```text
rendererControl absent
→ this Platform/Session composition has no Renderer Control physical capability
→ Main runs Runtime/Frame business normally
→ Main issues no Renderer Control token/attempt
→ no fake/no-op Binding is required

rendererControl present
→ Main starts the frozen bounded Renderer accept loop
```

这使：

```text
M7 deterministic test Platform → provides RendererControlBinding
M6 Hostra Runtime-only baseline → may omit until M14 physical Renderer Control
headless/CLI composition        → may omit
PWA                              → provides physical realization by M16
```

Optional capability **不是 optional protocol semantics**：一旦 Binding 存在并产生 attempt，Renderer Control v1 的 hello/currentness/terminal semantics全部强制适用。

---

## 决策 3：opaque material capability 收敛为 `OpaqueMaterialGenerator`

M5 的 `BootstrapTokenGenerator` 已有真实 Runtime bootstrap consumer。M7 又需要：

```text
Session-unique opaque sessionId material
Renderer Control bearer token material
```

因此 M7 将 material source current-v1 重命名/泛化为：

```ts
export interface OpaqueMaterialGenerator {
  generate(): string;
}
```

Main 使用同一窄 capability取得**彼此独立的 fresh value**：

```text
Session identity material
Runtime bootstrap credential material
Renderer Control credential material
```

固定：

```text
material generation = Platform capability
semantic identity/currentness/registration/binding/consumption = Main authority
```

Generator 不是 identity service、token registry、crypto facade 或 credential broker。每次调用结果必须 fresh/high-entropy/opaque；Main 仍按各协议长度/格式要求做防御性验证。

项目尚未承诺兼容性，因此直接用 current-v1 名称修正，不保留 `BootstrapTokenGenerator` compatibility alias。

---

## 决策 4：version negotiation 归 Renderer Control peer，Main 不拥有协议协商

Ownership 固定：

```text
renderer-control Main peer
    parses renderer.hello
    validates protocolVersions
    selects protocolVersion = 1
    rejects unsupported version
    then invokes Main authority acceptance with the already-selected v1 fact

Main
    validates Session/candidate/token/currentness
    does NOT parse protocolVersions
    does NOT choose protocol version
```

这样保持：

```text
protocol mechanics → @loomrealm/renderer-control
application authority/currentness → @loomrealm/main
```

Main acceptance可接收一个 protocol-package typed `selectedProtocolVersion: 1` / equivalent already-negotiated fact，但不得重新实现 negotiation logic。

---

## 决策 5：hello representability preflight 必须发生在 current switch 之前

`@loomrealm/renderer-control` MUST 提供 side-effect-free exact outbound preparation/preflight capability，供 Main 在 serialized authority lane 内确认 `renderer.hello` Success 对应的**完整实际 JSON text application unit**可合法表示。

精确函数名不属于架构契约，但语义冻结：

```text
input  = already-selected protocolVersion 1 + request id 1 + Snapshot R
output = exact sendable prepared text OR deterministic preflight failure
no carrier I/O
no Main mutation
same schema/UTF-8/depth/member/1 MiB rules as actual send
```

Main hello acceptance 的原子顺序固定：

```text
renderer-control peer has already validated hello + selected v1

inside Main serialized authority lane:
    require Session live + candidate attempt current
    validate exact candidate rendererControlToken
    capture exact current committed Snapshot R
    exact outbound prepare/preflight hello Result(R)

    if preflight fails:
        invalidate candidate attempt/token
        do NOT change current Renderer
        do NOT retire old peer
        candidate fails closed

    if preflight succeeds:
        consume token
        install candidate as only current Renderer participant
        detach/retire old current peer from future publication
        commit accepted {R, prepared hello result}

outside/after commit:
    send the prepared hello Result verbatim
    retire/close old carrier
```

这样同时保证：

```text
unrepresentable candidate cannot evict a healthy old current Renderer
capture R → current install 之间不存在丢失 R+1 的窗口
prepared result 与 preflight 不发生 TOCTOU 编码漂移
```

如果 prepared hello Result 发送失败：new candidate terminal；old peer不复活；Main current peer按 terminal identity check清空；恢复只能 fresh attempt/token。

---

## 决策 6：revision / Snapshot source 冻结

Main Session 初始化：

```text
fresh sessionId
rendererRevision = 1
capture/freeze initial Renderer-visible authority payload
currentRendererPeer = null
```

Revision 只在 Renderer-visible **committed payload excluding revision** 改变时推进。transport、candidate、replacement、terminal bookkeeping本身不推进 revision。

Main 不维护 Renderer Runtime/Frame/InputTarget shadow authority；Snapshot永远从现有 Main Runtime/Frame/Stack/currentActivation/currentInputTarget authority纯投影。

M7 `dataAuthorities = []`；真实 DataAuthority policy M8 才关闭。

---

## 决策 7：replacement 是 active revocation，但不虚构 send cancellation

B hello atomic acceptance成功后：

```text
B immediately becomes the only current Renderer participant
A immediately ceases to be current
A accepts no new publication submission
A pendingLatest is discarded/settled
A carrier close/retirement is requested
```

Foundation `MessageCarrier.send()` 只承诺 local acceptance，不承诺可取消已开始的 send。因此 Core 能冻结的保证是：

```text
replacement commit 后 old peer MUST NOT initiate any new send
already-started inFlight send MAY still settle / physically arrive
its completion or late delivery has no current-authority effect
old peer late Snapshot/terminal cannot overwrite/clear new Renderer role state
```

不得为了禁止物理 late bytes 引入 cancelable writer、connection-generation replay filter 或 transport-specific ACK。

未来 Data/Input realization MUST绑定 Main current Renderer participant；old participant 的本地 stale Snapshot 不是继续授权依据。

---

## 决策 8：Renderer hello handoff 冻结

Renderer peer：

```text
send renderer.hello(id=1)
validate Result Snapshot R
return/resolve initial accepted R
```

Renderer role必须先原子安装：

```text
currentPeer = newPeer
currentSnapshot = R
```

然后才开始消费该 peer 的 later `renderer.state` sequence。

Later state surface必须 lazy/explicit-start 或等价地保证 initial install 先发生；不允许 callback 在 role 安装 R 前抢先暴露 R+1。

Renderer role不建立第二套 revision/session validator。

---

## 决策 9：Session terminal 是 Renderer authority terminal boundary

Main 一旦 latch Session terminal（root outcome / external shutdown / fatal）：

```text
no new Renderer Control attempt/token may be issued
abort pending RendererControlBinding.acquire
retire/close any candidate peer
retire/close current Renderer peer
stop/discard further Renderer publication
```

Renderer Control cleanup不改变已提交 Session result，也不成为 Runtime shutdown coordinator；Main 不需要等待 physical Renderer carrier close 才提交 Session terminal/result。

Renderer最终通过 current Control terminal进入：

```text
currentPeer = null
currentSnapshot = null
InputTarget/DataAuthority unusable
```

v1 不增加 `session.ended`/final Snapshot notification。

---

## 决策 10：Runtime lifecycle projection 不再留 reopen 条件

M7 pure projection固定：

```text
no RuntimeRecord                         → declared
failure != null                          → failed
physicallyTerminated && expected stop    → stopped
starting                                 → starting
connected                                → connected
identified / initializing                → identified
ready                                    → ready
stopping                                 → stopping
```

failure precedence高于 stopped。

M7 Main 在 Session terminal latch 后立即终止 Renderer Control，因此 normal Session cleanup 期间出现的 stopping/stopped transition **不要求继续发布**。`stopped` 保留为协议合法状态及 future nonterminal lifecycle projection，不要求 M7 shutdown trace观察它。

---

## 决策 11：representation failure 只终止 Renderer Control

Renderer Control v1 的 1 MiB / JSON depth/member limits是 wire/connection safety limits，不是 Runtime count、Frame Stack depth或 DataAuthority policy业务上限。

如果完整 current Snapshot不可表示：

```text
Main Runtime/Frame/Stack authority不变
无 rollback
无 truncation/drop
无 Renderer-specific frame.call error
candidate/current Renderer Control fail closed
```

Frozen Frame v1 不新增 Renderer stack-limit 语义。

---

## 决策 12：M7 closure 与后续 physical qualification 分离

M7 必须实现并 qualification：

```text
@loomrealm/renderer-control concrete peers
@loomrealm/platform-ports M7 OpaqueMaterialGenerator + RendererControlBinding
@loomrealm/main projection/revision/optional-binding accept-loop/currentness
@loomrealm/renderer minimal current peer + Snapshot holder
deterministic MemoryCarrier vertical with rendererControl capability present
hello/replacement/session-terminal races
1 in-flight + 1 pendingLatest structural boundedness
representation failure isolation
```

M7 不宣称完成：

```text
Hostra Renderer Control WebSocket
PWA Renderer Control MessagePort
concrete stalled-write timeout policy
DataAuthority/Data Broker
Input/Render/Content
```

Desktop physical Renderer Control 在 M14 full E2E前关闭；PWA physical Renderer Control 在 M16前关闭。

---

## Compatibility / Supersession

本 ADR：

1. 延续 ADR 0026 的 session-scoped concrete Platform + narrow Main-facing view；
2. 将 `BootstrapTokenGenerator` current-v1 直接修正为 `OpaqueMaterialGenerator`，无 compatibility alias；
3. 冻结 optional M7 `RendererControlBinding` exact semantics；
4. 冻结 protocol negotiation 归 renderer-control、currentness归 Main；
5. 对 `phase-1-delivery-plan.md` 原 M7 summary给出精确 closure：M7关闭 logical Binding + MemoryCarrier semantic vertical，不要求 Hostra/PWA physical Renderer transport；
6. 不建立 universal Platform/Renderer service interface或 public Main Session attach controller。

---

## Reopen Rule

从本 ADR accepted 起，Renderer Control v1 / M7 preimplementation 视为冻结。

只有以下证据允许 reopen：

```text
实现发现 formal semantics 自相矛盾或不可实现
安全边界存在真实漏洞
两个已冻结 contract 产生无法同时满足的 correctness conflict
真实 consumer 证明冻结 port 无法表达必须 capability
```

以下理由不得 reopen：

```text
为了代码复用
为了 generic RPC/Store/Manager 抽象
为了未来 M8+
为了目录/命名对称
为了让测试更容易
某个 concrete transport 偏好不同 API
```

---

## Final Invariants

1. Main 是 Renderer currentness / Runtime / Frame / Activation / InputTarget / revision 的唯一 authority。  
2. Renderer Control version negotiation 由 `@loomrealm/renderer-control` peer拥有，Main不重复协商。  
3. `RendererControlBinding.acquire(token, signal)` 只建立一个 candidate physical carrier；hello 才能授予 currentness。  
4. `MainPlatform.rendererControl` 是 optional physical capability；absence 不阻塞 Runtime/Frame Session，也不要求 fake Binding。  
5. Binding存在时 Main 同时最多一个 current Renderer + 一个 candidate/pending attempt。  
6. Initial hello exact outbound preflight发生在 current switch之前。  
7. hello capture/preflight/current-install/old-retire 与 Renderer-visible mutation共享 Main serialization。  
8. Replacement主动撤销 old current，但不假设能取消已开始的 carrier send。  
9. Renderer先安装 initial Snapshot再消费 later state。  
10. Session terminal终止所有 Renderer attempts/current authority，但不等待 Renderer physical close决定 Session result。  
11. Renderer Control representation failure不改变 Frozen Frame / Runtime business authority。  
12. M7 Main DataAuthority保持空；Data policy留给 M8 real consumers。  
13. `OpaqueMaterialGenerator`只供 fresh opaque material，所有语义 authority仍由 Main拥有。  
14. M7不引入 generic RPC、Publisher、Store framework、Renderer Platform mega-port或 shadow authority。  
15. 本 ADR + Frozen Renderer Control contract + `M7_01`–`M7_05` 构成 M7 实施事实源。