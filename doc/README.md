# LoomRealm 开发文档

本目录用于保存 LoomRealm 的产品设计、系统架构、数据模型、运行时设计、编辑器设计、开发计划与技术决策。

## 文档原则

1. 讨论结论应沉淀为结构化开发文档，而不是仅保留在聊天记录中。
2. 文档描述当前有效设计；重大变更需要同步更新相关文档。
3. 架构决策应记录背景、约束、方案、取舍与最终结论。
4. 项目数据设计以 FSDB 为基础，并优先保证 AI 易分析、AI 易修改、程序易读取。
5. 编辑器架构以 MVVM、Signal、Command/Transaction 和可序列化项目模型为核心。

## 当前文档

### 开发计划

- [第一阶段：FSDB 驱动的地图运行时原型](./roadmap/phase-1-fsdb-map-runtime.md)
- [第一阶段设计待办](./roadmap/phase-1-design-todos.md)

### 系统架构

- [运行时通信与状态同步](./architecture/runtime-rpc-and-state-sync.md)

### 运行时

- [第一阶段 Pokémon Essentials v21.1 地图与行走运行时](./runtime/phase-1-pokemon-essentials-map-runtime.md)

### 渲染

- [第一阶段 DOM 渲染与渲染状态](./renderer/phase-1-dom-rendering.md)

### FSDB

- [第一阶段项目 FSDB 数据模型](./fsdb/phase-1-project-fsdb-design.md)
- [FSDB 文件存储系统目录结构详解](./fsdb/FSDB目录结构详解.md)

## 建议目录结构

```text
doc/
├── README.md
├── overview.md
├── architecture/
├── project-model/
├── editor/
├── runtime/
├── renderer/
├── fsdb/
├── plugins/
├── roadmap/
└── decisions/
```

后续文档将随着设计讨论逐步补充。
