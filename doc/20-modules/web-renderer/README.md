# Web 渲染端模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Web 渲染端内部模块和依赖方向  
> 依赖：[渲染系统](../../10-architecture/rendering-system.md)、[Client State Tree v1](../../15-contracts/client-state-tree-v1.md)  
> 最近复核：2026-07-29

## 1. 建议模块

```text
Web Renderer
├── Main Control Connection
├── Stack Store
├── Frame Connection Registry
├── Frame / Scope Store
├── Input Router
├── Scope Tree Validator
├── Scope Reconciler
├── Node Registry
├── Resource Client
└── Presentation State
```

## 2. Stack Store

只接受程序主系统控制消息，保存 Stack Revision、Frame 描述和输入目标。不得根据 DOM 层级推断栈顶。

## 3. Frame Connection Registry

按 `frameId` 管理子系统数据连接，处理建立、替换、断开和 Frame 出栈清理。

## 4. Frame / Scope Store

每个 Frame 独立保存：

- Activation；
- State Revision；
- Last Sequence；
- Scope 集合。

消息先校验并提交 Store，再进入 DOM 协调阶段。

## 5. Input Router

- 采集并归一化输入；
- 只发送给当前 Input Target；
- 维护持续方向意图；
- 页面失焦或目标变化时释放意图；
- 将节点事件绑定完整 Frame、Scope 和 Key 来源。

## 6. Validator 与 Reconciler

Validator 校验 Scope 数量、树深、Key 唯一、Tag、Data Schema 和消息大小。

Reconciler 按 Key 复用、移动、创建和销毁 Element。Tag 变化时重建；未变化节点不重建。

## 7. Node Registry

Registry 将可信 Tag 绑定到：

```text
Data Schema
Renderer
允许的事件 Schema
```

Registry 不接受运行时下发 JavaScript 或任意 HTML。

## 8. Resource Client

通过逻辑资源 Key 获取资源，验证 MIME 和版本并管理浏览器缓存。资源失败不破坏 Frame/Scope Store。

## 9. Presentation State

只保存非权威表现信息，例如 CSS 动画进度、焦点、滚动和图片解码状态。不得改变碰撞、选择或调用结果。

## 10. 核心不变量

- Stack Store 只由 Main 控制消息更新；
- 一个 Scope 的完整身份包含 Frame；
- 旧 Activation 和旧 Revision 不覆盖新状态；
- DOM 不是恢复源；
- Frame 出栈后整体清理；
- 一个 Frame 的节点事件不能任意调用另一个 Frame。

## 11. 测试入口

- Stack Snapshot 与 Revision 缺口；
- Frame Snapshot、Scope Replace 和删除；
- Sequence 缺口与 Resync；
- Key 复用、移动、删除和 Tag 变化；
- 输入目标切换；
- Renderer 重载恢复；
- Frame 出栈资源清理。

现有详细资料：[Web 渲染端 Frame/Scope 状态协调与 DOM 呈现](../../design/web-client-reconciliation.md)。
