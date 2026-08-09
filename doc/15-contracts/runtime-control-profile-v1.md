# Main ⇄ Subsystem Runtime Control Application Profile v1 — Abandoned

> 层级：历史契约 / Application Profile Tombstone  
> 状态：Abandoned Before Implementation  
> Profile 版本：1  
> 稳定程度：Superseded  
> 当前替代：[Runtime Control Application Profile v2](./runtime-control-profile-v2.md)  
> 决策记录：[ADR 0017：实现前废弃 Subsystem Control v1](../decisions/0017-abandon-subsystem-control-v1.md)  
> 最近复核：2026-08-09

## 1. 当前地位

Profile v1 曾静态组合：

```text
Subsystem Control v1
+
Frame / Call v1
```

由于 Subsystem Control v1 在首次 conformant implementation 前已被废弃，本 Profile 同样没有形成任何需要保护的互操作兼容边界。

因此：

```text
Profile v1 MUST NOT be used by new deployments
Profile v1 MUST NOT be selected as a runtime compatibility target
no Profile v1 fallback / downgrade is defined
```

## 2. 当前 Profile

当前 Runtime Control 组合固定为：

```text
Runtime Control Application Profile v2
=
Subsystem Control Protocol v2
+
Frame / Call Protocol v1
```

Frame / Call v1 本身保持 Active / Normative / Frozen；只有 enclosing Control/Profile major version发生变化。

见 [Runtime Control Application Profile v2](./runtime-control-profile-v2.md)。

## 3. 历史兼容性

不存在：

```text
Control v1 implementation
Profile v1 deployment
v1 persisted wire state
third-party v1 dependency
```

因此不提供：

```text
Profile 1 ↔ 2 migration
Control 1 ↔ 2 dual stack
runtime downgrade
ready.rendererDataEndpoint compatibility behavior
```

旧设计历史由 Git 与 ADR 保存即可。

最终原则：

> **Profile v1 只作为历史路径保留；当前 Main/Subsystem Runtime 必须实现 Profile v2。**
