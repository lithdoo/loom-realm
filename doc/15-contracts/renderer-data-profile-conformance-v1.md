# Renderer Data Application Profile v1 Conformance — revision 3

> 层级：正式 conformance；状态：**revision3 candidate / Docs Freeze HOLD / not executed**；2026-09-18。
> [Profile /1](./renderer-data-profile-v1.md) · [Viewport conformance](./viewport-state-conformance-v1.md) · [原 revision2 全文](./renderer-data-profile-conformance-v1-previewport-baseline.md) · [freeze ledger](../30-implementation/viewport-core-freeze-ledger.md)。

**继承规则：** 原 revision2 §§1–11 每条 fixture/observable/old child obligation 原样保留，以下只覆盖 closed child set/direction/fresh/terminal family，新增 revision3 assertions。不得删掉原 revision2 容量、ordering、Input mutation-gate、Render publication、Hostra/PWA equivalence 等义务。旧已执行 PASS 只属于旧 executable，不转移给新版。

## 1. Revised composition

`loomrealm.renderer-data/1 = Connection1 + Input1 + Render1 + Viewport1`；fixtureSetRevision=3 是测试集修订，不是新的 identity/child版本。Subsystem outbound 仍只有 `input.interest` 和四个 `render.*`；Renderer outbound 是三条 `input.*` 加唯一 `viewport.state`。必须有一个 reader、一个 serialized writer，共同 text JSON actual UTF-8≤1MiB/depth≤64 预检；所有旧 Input/Render 规则不变。

## 2. Exact 新增测试 ID

| ID | 输入/断言 |
|---|---|
| P3-01 | 新 `/1` 四 child 完整；Renderer outbound viewport 合法，反方向 fatal `viewport`；old peer 混版禁止资格声明，不做 `/2`/dual mode。 |
| P3-02 | `viewport.state` valid exact only；missing/extra/inherited/wire fraction/negative/zero/NaN/unsafe value fatal `viewport`；unknown `viewport.foo` fatal `profile`。 |
| P3-03 | `carrier.messages()` 每 peer 一次；Viewport 与 Input/Render exact 一次 dispatch；先 common gate 再 child，invalid 不产生任何 role state mutation。 |
| P3-04 | 所有 outbound 共用一个 writer，concurrent physical send≤1，admitted FIFO 不撤回、不重排，Viewport burst 不填满 generic writer queue、Input/Render 不因其饥饿。 |
| P3-05 | Viewport 每 carrier≤1 inFlight + ≤1 pending；阻塞 send 注入 10000 changes 和并发 Input/Render，最终 latest 收敛；A→B→A 去掉 B；B admitted 后 C 必须等 B settle。 |
| P3-06 | fresh peer 即使与旧 size 相同仍发独立 baseline；不继承 old pending/cursor；same-G/new-G/Renderer source callback 均 fenced；Scope equal callback suppress。 |
| P3-07 | recognized viewport child invalid/explicit protocol-fatal→DataTerminal.protocol=`viewport`；common/unknown=`profile`；Input/Render 分别旧 family；first-wins terminal 仅退休当前 Data。 |
| P3-08 | 旧 revision2 全量 suite + Connection/Input/Render child conformance 原样保留；不得改旧测试期望掩盖回归。 |
| P3-09 | fake source→真正 Renderer holder→Data peer→Subsystem host→scope.viewport 的 currentness、backpressure、terminal 全链；只 mock 组件不算通过。 |

## 3. 资格和证据

Profile 组合测试不能替代 [Viewport conformance](./viewport-state-conformance-v1.md) 的 source/Scope 详细 fixture；后者不能替代本规范旧 child regressions。实施阶段新增显式 revision3/Viewport test runner，记录测试目录、命令、退出码、最终**同一个** executable/cohort SHA、原始日志，不能只复用 revision2 PASS。架构资格不证明 Desktop/PWA 真 source、`play.bat` 动态地图或运动性能。