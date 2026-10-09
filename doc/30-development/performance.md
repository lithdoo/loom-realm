# 性能资格

## Performance Qualification Profile v1

2026-10-09 maintainer decision 定义当前产品 movement first-motion-paint gate：

| Viewport | ordinary P95 | refresh P95 |
| --- | ---: | ---: |
| 640×480 | ≤50ms | ≤50ms |
| 1280×720 | ≤50ms | ≤75ms |
| 1920×1080 | ≤50ms | ≤100ms |

旧的 uniform refresh `<=50ms` 规则属于历史 measurement，不再控制 Current qualification。

Sample counts、invalid-sample rules、camera-only/zero-draw、pixel stacking/correctness、memory limits 和 raw-evidence provenance 继续是 qualification 的一部分，不得只看单个 P95 数字。

对 subject `8131f6dd140ac21edb52879eb9ec1fd1a8cd7ba9`，记录的两次 1920×1080 refresh P95 为 `62.1ms` 与 `50.5ms`，均满足 current 100ms ceiling；该结果不能自动继承给未来 behavior/qualification-input subject。

历史 hot-path 实施规格和旧失败样本保留在 legacy evidence 中，用于 provenance，不再拥有 Current threshold authority。
