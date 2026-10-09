# 开发工作流

## 1. 以 capability 开始

任何非 trivial 变更先回答：

```text
Problem / capability
Scope / non-goals
Authority owner 是否变化？
Contract / ABI 是否变化？
哪些 packages / apps / game-libs 受影响？
哪些 qualification input 会变化？
```

重大 authority、协议、物理 ownership 或 compatibility change 必须先有 ADR；普通内部重构不为治理形式制造 ADR。

## 2. Work tracking

进行中的任务放在 GitHub Issue/PR。不要在 `doc/` 新建 `Mxx_PLAN.md`、`*_REVIEW.md`、`NEXT_STAGE.md` 作为进度看板。

## 3. 合并前传播

```text
Architecture change → Architecture → Contracts when observable → Modules → tests/docs
Contract change     → Contract → Architecture projection → Modules → conformance
Implementation only → Module/package docs when public realization changed
```

## 4. 合并后

关闭临时任务；把 durable facts 合入 Current 文档。纯过程计划、prompt、review 默认删除，Git 保存历史。包含不可替代环境、digest、样本/P95 或外部兼容证据的材料可以标记 Historical Evidence。

## 5. 文档 gate

```bash
npm run docs:check-links
npm run docs:build
```

文档结构调整必须同时检查旧路径兼容页和仓库外部链接。
