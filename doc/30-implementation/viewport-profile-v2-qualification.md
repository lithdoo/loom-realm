# Viewport State v1 / Renderer Data Profile v2 Qualification Ledger

> 层级：Implementation / Qualification Ledger（唯一 live status）  
> 状态：**Preimplementation / Docs Closure In Progress — not Frozen**  
> 日期：2026-09-16  
> Architecture：[Viewport Capability](../10-architecture/viewport-capability.md) · [ADR0036](../decisions/0036-viewport-state-and-renderer-data-profile-v2.md)  
> Contracts：[Viewport v1](../15-contracts/viewport-state-v1.md) · [Profile v2](../15-contracts/renderer-data-profile-v2.md)  
> Conformance：[Viewport](../15-contracts/viewport-state-conformance-v1.md) · [Profile](../15-contracts/renderer-data-profile-conformance-v2.md)  
> Review：[Core Freeze Review 2026-09-16](./viewport-core-docs-freeze-review-2026-09-16.md)

Architecture/contract定义语义；本文只记录 docs Freeze、implementation SHA、tests与实际证据。**Docs Freeze ≠ Implemented ≠ Qualified/Closed**；各状态不能互相代替或沿用历史 executable SHA。

## 1. Current state

```text
ADR0036                     Accepted
Architecture/formal contracts Draft candidates (revised for CF-01..07, not frozen)
Conformance specifications  Draft / executable-ready candidates
Executable implementation   Not started
Main canonical /2 policy     Not implemented
Desktop/PWA physical source  Not implemented
Local/hosted/product tests   Not run
Docs Freeze subject         PENDING
Executable qualification    PENDING
```

## 2. Docs Freeze Gate — contract/specification only

审查通过才能填写唯一 docs-only subject SHA 与 reviewer/decision：

- [ ] ADR0036、Viewport architecture、Subsystem model、protocol layers、system overview authority/lifetime无冲突；
- [ ] Viewport exact shape + **single layout viewport semantics** + bounded latest sender + old source/carrier fencing；
- [ ] 初始 null、same G reconnect、fresh G、fresh Renderer、无 legal sample、Runtime terminal transition matrix闭合；
- [ ] author synchronous subscribe、callback failure、unsubscribe、Runtime terminal全覆盖；
- [ ] Profile v2 exact composition/direction/common gate/one reader/writer/terminal + `protocol:"viewport"` diagnostic；
- [ ] Frozen Control v1/Connection v1/ Profile v1 兼容性解释清楚；`/1` exact acceptance不变；
- [ ] Main canonical target所有 current DataAuthorities `/2`、fresh G、broker exact matching、无 negotiation/fallback；
- [ ] Desktop/PWA共同使用 single document layout viewport CSS pixel定义；
- [ ] 两份 conformance为完整 executable-ready specification（**此时不要求可执行 PASS**）；
- [ ] Core review CF-01..07逐项关闭，剩余 map MF-01..03分别治理，不把 PR0性能 PASS冒充 Core docs 前置条件。

```text
Docs Freeze subject SHA: PENDING
Review decision/date: PENDING
Frozen contract versions: PENDING
```

未取得上述签署前 formal contracts维持 Draft/Not Frozen。

## 3. Implementation subject / minimum change

Docs Freeze后首个改变可执行语义的 commit建立新 qualification subject：

```text
Executable subject SHA: PENDING
```

最小实现：`@loomrealm/data` `/2` peer + viewport namespace/diagnostic/dispatch + child-local bounded sender；Renderer trusted current layout viewport source；Subsystem retained readonly `scope.viewport`；Main canonical `/2` profile selection；Desktop actual source；all `/1` regressions。Broker仍只按 Main authority exact `(S,G,P)`配对。实现者不得把 frozen v1 acceptance扩张、把尺寸存入 Main、添加 Environment manager或强迫修改 Render Update v1。PWA source遵循同 contract且在相应平台 qualification证明。

## 4. Executable qualification — after Docs Freeze

同一 subject记录实际命令、PASS raw logs/artifacts、Node20/24（按仓库要求）、Desktop/Chromium/Hostra环境与 product build。必须覆盖：

```text
Viewport representation + protocol:"viewport" diagnostic
layout viewport source / stale Renderer+carrier fencing
>1024 resize under blocked shared writer + concurrent Input/Render
Runtime retained transitions + synchronous subscribe + containment
non-InputTarget suspended-map observation (no Input authority)
Profile v2 exact direction, demux, preflight, serialized writer, first-wins terminal
Main all-current-authorities /2 + broker exact (S,G,P), fresh G profile replacement
Fresh carrier/fresh Renderer baselines + equal-value no callback
Profile v1, Connection v1, Input v1, Render v1 regression
M13 presentation regression / M14 map consumer / M15 Hostra integration
```

Map performance（dense 1080p bytes、Core residual、Browser raster、canonical latency）是另一个 map PR0/Freeze gate，不能拿 viewport protocol PASS代替。

## 5. Compatibility matrix

| Pairing | `viewport.state` | Expected |
|---|---|---|
| `/1` sender/receiver | illegal | Data-fatal by v1 semantics |
| `/2` exact paired | legal shape/direction | accepted / retained |
| `(S,G,P)` mismatch | any | no current carrier installation |
| same G profile change | any | forbidden / no installation |
| `/2` unavailable | any | Data absent; **no implicit `/1` fallback** |

## 6. Evidence record

| Gate | Subject | Result / artifacts |
|---|---|---|
| Docs Freeze review | PENDING | CF-01..07 resolution review PENDING |
| Local core + `/1` regression | PENDING | NOT RUN |
| Hosted Node20/24 | PENDING | NOT RUN |
| M13 regression | PENDING | NOT RUN |
| M14 consumer | PENDING | NOT RUN |
| M15 Hostra product | PENDING | NOT RUN |
| PWA equivalent source (platform milestone) | PENDING | NOT RUN |

只有同一 executable subject的必需 evidence均 PASS，才能写 Qualified/Closed。任何改变 schema、currentness、bounded sender、profile selection或 diagnostic 的后续修订须记录新 docs subject，改变可执行行为则使用新 executable subject并重跑受影响矩阵。