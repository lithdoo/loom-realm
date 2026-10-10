# 性能资格

## Performance Qualification Profile v1

2026-10-09 maintainer decision 定义当前产品 movement first-motion-paint gate。Current threshold authority 与当前 measurement contract 在本页；历史 implementation spec / strict uniform-50 measurement 只保留 provenance。

| Viewport | ordinary P95 | refresh P95 |
| --- | ---: | ---: |
| 640×480 | ≤50ms | ≤50ms |
| 1280×720 | ≤50ms | ≤75ms |
| 1920×1080 | ≤50ms | ≤100ms |

旧的 uniform refresh `<=50ms` 规则属于历史 measurement，不再控制 Current qualification，也不能用来否定符合本 Current profile 的结果。

## Full/native measurement contract

Current full/native qualification 使用当前 product Hostra/Browser path，并固定：

```text
qualified viewports: 640×480 / 1280×720 / 1920×1080
rounds:              3 per viewport
warmup:              20 valid samples / round
ordinary target:     100 / round = 300 / viewport
refresh target:       30 / round =  90 / viewport
max attempts:        1500 / round
metric clock:        same Browser Window performance.now()
metric interval:     input-captured.at → browser-first-motion-paint.at
percentile:          nearest-rank P95, ordinary / refresh separately
```

`ordinary` 是 accepted movement 没有改变 `visualEpoch` 的 retained/camera-only sample；`refresh` 是该 movement 使 `visualEpoch` 改变、需要 current tile projection refresh 的 sample。两类不得混成一个 percentile，也不得用 ordinary PASS 掩盖 refresh FAIL。

一次 movement sample 只有在当前 Map/Player 实际向前推进、同时观察到合法的 `input-captured` 和不早于它的 `browser-first-motion-paint`、且 viewport identity 仍等于当前被测尺寸时才是 valid。超时、事件缺失/乱序、未实际前进或 viewport mismatch 计为 invalid，而不是静默丢弃。

每轮必须满足：

```text
invalid / attempts ≤ 5%
ordinary.length    = 100
refresh.length     = 30
```

未收满目标样本、超过 invalid 比率或超过 maxAttempts 都是 qualification failure；不得通过改变 validator、timeout、sample target、filter 或 maxAttempts 来获得 PASS。

如果收集多次完整 full run，必须逐次保留并报告结果；**禁止 best-of-two / best-of-N selection**。不得只挑最快一轮形成 qualification evidence。

## PR/reduced profile

PR profile 是快速 regression signal，不是 full/native closure evidence。当前 harness 使用：

```text
viewport:          640×480 only
rounds:            1
warmup:            5
ordinary target:   20
refresh target:    10
max attempts:      300
latency gate:      median (P50), not P95
invalid rule:      invalid / attempts ≤ 5%
```

PR profile 不能替代 full profile 的三视口 P95 结论。

## Correctness / hot-path invariants

Latency PASS 不能牺牲正确性。Current profile 同时要求：

- ordinary camera-only sample 中，`cameraOnlyDelta >= 1` 的命中率 **≥95%**；
- ordinary sample 中，`tileDrawsDelta === 0` 的命中率 **≥95%**；
- first-motion-paint qualification 另有真实 screenshot pixel-difference 检查，证明 logical first paint 产生可见像素变化；
- pixel stacking/compositing correctness 继续由 Browser/product regression 覆盖，不能通过隐藏层、漏画或 stale image 获得低延迟；
- authoritative path 仍是 `Input → Runtime → RenderDomain → Renderer → Web Presentation → Browser changed pixel`；
- 不允许建立绕开 authoritative Render stream 的 background/predictive business state、第二 authoritative scheduler 或 Browser-owned gameplay truth；
- timeout / failure filters 不得为了门槛而放宽。

对三视口完整 full run，300 ordinary samples / viewport 对应最多 900 个 ordinary observations；历史 current-subject evidence 记录了两轮各 `900/900` camera-only 与 `900/900` zero-tile-draw。未来 subject 必须由当期 harness/evidence 自己证明，不能继承这些命中数。

## Memory guard

Full profile 同时保留 Browser tile-backing / resource memory guard：

```text
visible tile backing  ≤ 128 MiB
live + decode         ≤ 256 MiB
```

当前已记录 evidence 的 1920×1080 case 为：

```text
visible backing: 124,502,016 bytes
live + decode:    249,167,872 bytes
```

这些数值是 subject-specific evidence，不是未来实现可以硬编码的 allocation target；真正 normative 的是 ceilings 与当前 correctness/resource-lifetime semantics。

## Environment / evidence

Native/full performance evidence使用冻结 Desktop/Hostra product path，而不是 PR reduced-mode timing替代。报告至少保留：

- executable / qualification-input subject SHA；
- OS/runtime/Hostra/Electron frozen product baseline；
- exact command / full-mode switch；
- viewport、round/sample counts、ordinary/refresh P50/P95/max；
- attempts / invalid counts per round；
- camera-only / zero-tile-draw hit counts；
- pixel/compositing correctness 与 memory results；
- raw/sanitized evidence digest。

`LOOMREALM_M15_FULL_QUALIFICATION=1` 或 canonical `test:m15:hostra:full` 进入 full profile；普通 PR delta 使用 reduced profile。改变 profile/harness/threshold/validator 属于 qualification-input change，必须按 [Qualification 与 Subject](./qualification.md)重新判断 staleness。

## Recorded closed-subject evidence

对 subject `8131f6dd140ac21edb52879eb9ec1fd1a8cd7ba9`，两次完整 native full run 的 1920×1080 refresh P95 分别为：

```text
Run 1: 62.1ms
Run 2: 50.5ms
```

两轮都满足 Current 100ms ceiling；不得把旧 uniform 50ms historical gate 重新当作 Current threshold，也不得因为第二轮更快而丢弃第一轮。

同一证据集的 raw digests：

```text
full run 1: d83be71bbd66cbdd1a884f7a8ce54f4a9327b2d53b9cc91939f5f43cb89e60bc
full run 2: 37e059c3959b3859c43a6c0f072640d0ed84d075af25b143bf895f9aca06875c
pixel/memory: 7ab41a407dce91993fc0709eee4cfbd7b90566183cf1e1569793a31d3d5b1c98
```

这些结果只证明该 subject/input/environment；未来 behavior 或 qualification-input 变化必须重新判断 required gates。

## Historical implementation material

`../30-implementation/render-movement-latency-spec.md` 和相关 final-performance ledger 继续保存旧 hot-path 设计、uniform-50 failure、阶段性分段诊断与原始测量。它们可以解释为什么当前实现/门槛形成，但不覆盖本页 Current threshold authority。