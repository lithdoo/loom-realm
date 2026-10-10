# 性能资格

## Performance Qualification Profile v1

2026-10-09 maintainer decision 定义当前产品 movement first-motion-paint gate。Current threshold authority 在本页；历史 implementation spec / strict uniform-50 measurement 只保留 provenance。

| Viewport | ordinary P95 | refresh P95 |
| --- | ---: | ---: |
| 640×480 | ≤50ms | ≤50ms |
| 1280×720 | ≤50ms | ≤75ms |
| 1920×1080 | ≤50ms | ≤100ms |

旧的 uniform refresh `<=50ms` 规则属于历史 measurement，不再控制 Current qualification，也不能用来否定符合本 Current profile 的结果。

## Measurement contract

Current full/native qualification 必须保留以下 measurement shape；改变这些内容属于 qualification-input change，必须重新判断 subject/staleness，而不是当作普通文档编辑：

```text
qualified viewports: 640×480 / 1280×720 / 1920×1080
full run:            3 rounds per viewport
ordinary samples:    100 / round = 300 / viewport
refresh samples:      30 / round =  90 / viewport
metric:               trusted input → first changed pixel latency
percentile:           P95 evaluated separately for ordinary and refresh
```

`ordinary` 是 retained projection window 不需要 tile-window refresh 的移动样本；`refresh` 是需要 current tile projection refresh 的移动样本。两类不得混合成一个 percentile，也不得用 ordinary PASS 掩盖 refresh FAIL。

Invalid-sample classification、样本过滤和计数规则由当前 qualification harness 固定实现；文档/执行者不得为获得 PASS 修改 validator、过滤器、sample count、timeout 或把失败样本静默丢弃。Qualification report 必须同时记录 valid/invalid counts；invalid samples 只按冻结 harness 规则处理。

如果收集多次完整 full run，必须逐次保留并报告结果；**禁止 best-of-two / best-of-N selection**。不得只挑最快一轮形成 qualification evidence。

## Correctness / hot-path invariants

Latency PASS 不能牺牲正确性。Current profile 同时要求保留下列 product/harness invariants：

- ordinary camera-only movement 不因性能优化重新绘制 tile backing；
- qualification 中的 camera-only / zero-tile-draw assertions 必须通过；
- pixel stacking/compositing correctness 必须通过，不能通过隐藏层、漏画或 stale image 获得低延迟；
- authoritative path 仍是 `Input → Runtime → RenderDomain → Renderer → Web Presentation → Browser changed pixel`；
- 不允许建立绕开 authoritative Render stream 的 background/predictive state、第二 scheduler 或 Browser-owned business truth；
- timeout / failure filters 不得为了门槛而放宽。

历史 current-subject full runs 记录了每轮 `900/900` camera-only / zero-tile-draw observations，并由独立 pixel-stacking evidence 覆盖 4/4 scenarios。未来 subject 必须由当期 harness/evidence 自己证明，不继承这些计数。

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

这些数字是 subject-specific evidence，不是未来实现可以硬编码的 allocation target；真正 normative 的是上面的 ceilings 与当前 correctness/resource-lifetime semantics。

## Environment / evidence

Native/full performance evidence使用冻结 Desktop/Hostra product path，而不是 PR reduced-mode timing替代。报告至少保留：

- executable / qualification-input subject SHA；
- OS/runtime/Hostra/Electron or equivalent frozen product baseline；
- exact command / full-mode switch；
- viewport、round/sample counts、ordinary/refresh P50/P95/max；
- invalid-sample counts；
- correctness/memory results；
- raw/sanitized evidence digest。

PR reduced profile 可以做 regression signal，但不能冒充缺失的 native/full evidence。

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

这些结果只证明该 subject/input/environment；未来 behavior 或 qualification-input 变化必须按[Qualification 与 Subject](./qualification.md)重新判断 required gates。

## Historical implementation material

`../30-implementation/render-movement-latency-spec.md` 和相关 final-performance ledger 继续保存旧 hot-path 设计、uniform-50 failure、阶段性分段诊断与原始测量。它们可以解释为什么当前实现/门槛形成，但不覆盖本页 Current threshold authority。