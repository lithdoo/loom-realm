# Data Viewport 增量：历史修订索引

> 状态：**Superseded by current four-child implementation**。这份独立增量最初写于四子项 `/1` 仅为候选、源码仍为三子项时；原先的 `Not implemented / Not qualified` 已过时，**不可用作当前实现或资格结论**。

现行包级职责、发送/接收方向与准确源码：[Data DESIGN](./DESIGN.md)；`ViewportStateV1`、`DataProtocolFamily:viewport`、`onViewportState`、`viewport.sendState` 的真正公开类型在 [`src/model.ts`](./src/model.ts)、[`src/index.ts`](./src/index.ts)、[`src/profile-codec.ts`](./src/profile-codec.ts)。规范看 [Viewport v1](../../doc/15-contracts/viewport-state-v1.md)和[修订后的 Profile `/1`](../../doc/15-contracts/renderer-data-profile-v1.md)；精确历史及当前 subject 资格见[Viewport ledger](../../doc/30-implementation/viewport-profile-v1-qualification.md)，下一阶段见[路线图](../../doc/30-implementation/roadmap.md)。

需要旧版完整实施差异及逐轮设计推理时，使用[固定、已清理根目录的 Git 历史版本](https://github.com/lithdoo/loom-realm/blob/c00fe76b20ab07aeebe18a8056e39a024a9f9859/packages/data/VIEWPORT_V1_IMPLEMENTATION_DELTA.md)。本页仅保留旧入链兼容，不再维护另一份当前 API、M8/M11 状态或三子项实现计划。
