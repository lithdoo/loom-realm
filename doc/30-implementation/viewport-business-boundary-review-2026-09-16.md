# Viewport / Map 业务边界 Review — 历史索引

2026-09-16 的 BB-01–05 修订审查属于完成的设计过程；不可变[原始 finding 与 disposition](https://github.com/lithdoo/loom-realm/blob/78ba3999f9064fbbfcf90e55c3b027d4fe25a397/doc/30-implementation/viewport-business-boundary-review-2026-09-16.md)供追溯。

当前 Core Viewport 必须是通用 Renderer 指定 CSS logical surface，不能让 Map player/terrain、PR0 性能或菜单策略成为 Core ABI。当前权威：[Viewport v1](../15-contracts/viewport-state-v1.md)、[ADR 0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)、[Map 实现](../20-modules/loom-map/README.md)；未完成：[路线图](./roadmap.md)。
