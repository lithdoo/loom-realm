# M11 Render Qualification

> 状态：**Closed**（current implementation / qualification-input subject `a0a2da064d39489644f332379718aaa25cd6ed3f`）
> 日期：2026-10-08
> 规范入口：仓库根目录 `M11_05_QUALIFICATION_CLOSURE.md`
> 最终评审：[M11 Render 最终闭环评审结论](./m11-final-closure-review.md)
> 协议：`loomrealm.render-update / 1`
> Fixture：`fixtureSetRevision = 1`

> **Current notice：** 旧 subject `c642cda9cee2b318b3aa8f6285de05d6b6ed6bea` 的本地 PASS 不用于签署 current closure。其后共享 Renderer/Data/Desktop/Main/Subsystem 实现继续演进；审计到最新影响 M11 build/runtime surface 的提交为 `a0a2da064d39489644f332379718aaa25cd6ed3f`。qualification PR 从 `main` checkout `db05277191e166c69110c252bafc8933ae876d70` 创建；该 checkout 在 `a0a2da...` 之后的变更不再改变 M11 executable behavior 或 `npm run test:m11` qualification input。Hosted [run 37789130711](https://github.com/lithdoo/loom-realm/actions/runs/37789130711) 在同一 PR merge checkout 上完成 Node 20 + Node 24 canonical root gate，两个 job 均 PASS，因此 M11 对 current subject 正式 Closed。

M11 production architecture、Render representation validation、Subsystem-owned business Render authority、current Data publication、Renderer internal replica 与 Hostra/Desktop same-generation Render vertical 已实现并通过 current-subject hosted requalification。

DOM/Canvas/WebGL presentation、Content resolution 与 Hostra/PWA transport equivalence仍不属于 M11。

## Current Executable Evidence

Fail-closed catalog parser 直接读取 Frozen Required blocks；role-specific runner 分别执行 sender/receiver assertion callback。当前 source-derived 结果：

```text
unique fixtures       = 203
subsystem-sender      = 82
renderer-receiver     = 185
role evidence pairs   = 267
transport             = 0
```

这些数字由 executable catalog/audit 派生；expected、registered、executed 与 passed role/fixture pair sets 严格相等。

角色证据不再通过两个 wrapper 委托同一个 group callback。`evidence-role-specific.mjs`
为 dual-role obligation 提供缺失一侧的独立生产 seam assertion；基础 callback 只归属一个角色，
runner 继续对 267 个 `(role, fixture)` identity 做 exact-set audit。被点名的 reconnect、旧流隔离、
Runtime/Frame 独立性与 Domain close 证据复用真实 Main → Desktop → Hostra vertical 的共享装配，
在第二条 Data carrier 提交前观察旧 Store retirement，并在同一 Frame 中完成 reconnect 后再次发布。

## Subject Audit

旧 `c642cda9...` 之后不能自动继承历史资格。当前审计按 M11 workflow 的实际触发/消费路径核对：

- `packages/renderer` 的最新相关提交为 `a0a2da064d39489644f332379718aaa25cd6ed3f`；
- `packages/data` 的最新相关行为提交不晚于 `344f9b60e798574872881fb66338fb2be2dd9ffb`；
- `packages/main` 的最新相关行为提交不晚于 `d0f9e77ef3f9c5eb791b443ddf8361e4e5d3c585`；
- `packages/subsystem` 的最新相关行为提交不晚于 `9a3e5f6e4abdd3f23326d1a474ca2c6be0a3d798`；
- 后续 M14/M15 evidence/ledger changes do not alter `npm run test:m11` or M11 production behavior.

因此 current implementation / qualification-input subject 取这些受消费路径中时间上最后的 `a0a2da064d39489644f332379718aaa25cd6ed3f`。本 PR 的 ledger-only changes 不创建新的 implementation subject。

## Hosted Requalification Evidence — 2026-10-08

- Workflow: [M11 Render qualification run 37789130711](https://github.com/lithdoo/loom-realm/actions/runs/37789130711), success.
- PR merge checkout: `8f8d9143561d8f253e119b01ce55040059a8b445` = ledger-only PR head merged over `db05277191e166c69110c252bafc8933ae876d70`; implementation / qualification-input subject remains `a0a2da064d39489644f332379718aaa25cd6ed3f`.
- Node 20 job: Node `20.20.2`, canonical `npm run test:m11`, qualification suite 10/10 PASS, M11 vertical/boundary suite 4/4 PASS, 0 fail / 0 skip.
- Node 24 job: Node `24.21.0`, canonical `npm run test:m11`, qualification suite 10/10 PASS, M11 vertical/boundary suite 4/4 PASS, 0 fail / 0 skip.
- Both jobs uploaded their qualification TAP artifact; production code, test harness, thresholds and workflow were unchanged by this qualification PR.

## Requalification Closure

最终评审要求已一次完成：

```text
production Render representation validation closure
strict fail-closed normative catalog extraction
(role, fixture) evidence identity
complete exact/one-over hard-limit matrix
discriminating role-specific production-seam assertions
```

Hard-limit audit 对 application-message bytes、global JSON depth 与 zIndex 同样执行完整四象限：
exact outbound、exact inbound、one-over/outside outbound 零发送，以及 one-over/outside inbound
在 handler/store commit 前 protocol-fatal。该矩阵同时发现并闭合了 outbound codec 缺失的 global
JSON depth preflight；修复仅位于现有 private profile codec，没有增加 public API。

不得为本次修复引入新的 Render authority、Runtime/Session/Connection abstraction、generic validator service、scenario DSL 或 conformance framework。

ADR 0035 新 subject 的判别性 evidence 已进入现有 sender/receiver/root gate：

```text
exact five Render root exports including RenderDomainUpdate
update existing-node attrs/data and Domain zIndex local-atomic validation
zIndex-only Patch and 4096/4097 update-op boundaries
prebaseline / baseline-in-flight / post-baseline update publication
full-queue incoming Event oldest-drop / no-Event incoming-drop
authoritative coalescing, send failure, reconnect and revision rollover
Renderer update-only COW result equivalence and per-op hard-limit atomicity
```

这些项目扩展现有 M11 sender/receiver/root gate，不创建第二个 qualification framework。`npm run test:m11` 已在 Node 20 + Node 24 对同一 qualification checkout 通过。

## Implemented Boundaries Retained

```text
@loomrealm/subsystem
    exact RenderNode / RenderDomainState / RenderEvent / RenderDomain author types
    SubsystemScope.createRenderDomain
    synchronous validate → detach → atomic local commit
    business Domain/Node one-shot identity and explicit close
    Snapshot-first bounded current-carrier publication

@loomrealm/renderer
    one internal Render replica per existing Data slot identity
    atomic Registry/Snapshot/Patch application
    transient Event deliver/drop trace
    same-generation identity history across carrier and Control participant replacement
    no public Render Store/subscription API
```

旧 sender subject 使用 Frozen v1 允许的 full-Snapshot fallback。ADR 0035 target 中 `replace()` 与 fresh recovery 继续 full Snapshot；ordinary post-baseline `update()` 固定使用 existing Patch，baseline queued/in-flight 与 bounded capacity coalescing才使用 latest Snapshot。仍不引入 diff/reconciler，Renderer Receiver 继续实现完整 Frozen Patch semantics。

## Vertical Evidence Retained

现有 Desktop/Hostra vertical 已证明：

```text
Main DataAuthority → Desktop DataConnectionBroker → Hostra SubsystemDataPeer
→ RenderManager publication → RendererDataPeer → internal Render replica

create → Registry → Snapshot
replace → next authoritative commit → Event
same-generation carrier close → fresh Registry/Snapshot
old Event is not replayed
business Domain survives Data reconnect
close → Registry removal → replica retirement
```

该 vertical 继续作为 requalification 的 integration evidence，不需要重写 production composition。

## Root Gate

唯一 closure command 仍是：

```text
npm run test:m11
```

当前关闭结果：

```text
hosted Node 20 npm run test:m11 PASS
+ hosted Node 24 npm run test:m11 PASS
+ same qualification checkout
→ M11 Render Closed
```

本次 qualification PR 不修改 production、test harness、阈值或 `.github/workflows/m11.yml`；ledger-only evidence commit 不创建新的 implementation subject。

```text
M11 Render = Closed
M16 transport-equivalence = not claimed
```
