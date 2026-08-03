# ADR 0008：冻结 Desktop Node.js Launcher Profile v1

> 状态：Accepted  
> 日期：2026-08-03  
> 影响范围：Game Package v2、Runtime Bootstrap、Main Launcher、Runtime Supervisor、Desktop Host  
> 补充并部分替代：[ADR 0007：Subsystem Descriptor MVP 收敛](./0007-subsystem-descriptor-mvp.md) 中 `launcher.entry` 尚未冻结的结论

## 背景

ADR 0007 已冻结 Descriptor `key`、Desktop `nodejs`、完整 Descriptor 集合、eager / all-required Bootstrap 和 unsupported Launcher failure，但仍留下会阻塞实际执行能力的空白：

- `launcher.entry` 的路径基准与文件系统安全；
- Node Runtime 由谁选择；
- Entry module type 是否依赖 `package.json.type` 等宿主状态；
- Shell / argv / cwd 行为；
- Descriptor env 与 Main ambient env 的关系；
- Bootstrap Context 的精确 Desktop 传递方式；
- Bootstrap Credential 与 Process spawn 的先后关系；
- Process Supervisor、退出分类和自动 restart 策略；
- Node.js executable code 的信任边界。

如果这些内容继续留给实现自行决定，不同 Desktop 实现会在安全、身份、模块加载和失败语义上产生不可互操作差异。

## 决定

采用独立的 [Desktop Node.js Launcher Profile v1](../15-contracts/nodejs-launcher-profile-v1.md)，并由 [Game Package v2 Bootstrap / Descriptor Contract](../15-contracts/game-package-v2.md) 冻结 Descriptor 声明侧语义。

核心决定：

```text
launcher.entry
    = Installation Root 相对的 package logical path

Entry module type
    .mjs = ECMAScript Module
    .cjs = CommonJS
    plain .js 不属于 v1

Desktop Node Runtime
    = LoomRealm Host 选择

Process creation
    shell = false
    argv = [validated physical entry]
    cwd = Installation Root

Child environment
    = Host Safe Baseline
    + validated descriptor.env
    + LoomRealm Bootstrap Context

Bootstrap Context
    = LOOMREALM_BOOTSTRAP_CONTEXT
    = Base64URL(UTF-8 JSON)

Process supervision
    spawn success 仍属于 public "starting"
    Supervisor 观察实际 exit
    unexpected exit 即 failure
    exit code 0 不自动表示正常

Restart
    v1 不自动 restart
```

普通 `.js` 被暂缓，是因为其模块解释可能依赖最近的 `package.json.type`、Node 版本或其他隐式宿主解析状态；v1 通过 `.mjs` / `.cjs` 让模块语义直接由 Entry 扩展名决定。

## Entry 安全

v1 Entry：

- 只能是 package-relative path；
- 禁止绝对路径、URL、`..`、反斜杠等逃逸形式；
- 从 Installation Root 到 Entry 的路径链禁止 symlink / junction / reparse redirect；
- 最终目标必须是 Installation Root 内 regular file；
- Desktop v1 只接受 `.mjs` / `.cjs`；
- 安装/校验阶段拒绝可执行 namespace 的 case collision。

未经验证的 Entry string 不能直接提交给 Process Creation API。

## Bootstrap 顺序

冻结：

```text
Create Launch Attempt
→ Generate Bootstrap Token
→ Register Token + key in Main Control authentication state
→ Construct child environment
→ Spawn Process
```

Token 注册必须发生在 Process 可开始执行之前，避免子进程快速连接 Main 时出现认证竞态。

## Trust Model

Desktop `nodejs` Profile 中，被执行的 Subsystem JavaScript 属于 trusted executable code。

Entry 路径安全只限制 Main 执行哪个 package 文件，不构成 Node.js OS sandbox。

因此：

```text
safe launcher.entry != sandboxed Node.js process
```

不可信第三方 executable sandbox、权限 Broker、签名与 Publisher Trust 均不在本阶段解决。

## 链路边界

Launcher 链只负责：

```text
Descriptor
→ resolve target
→ Launch Attempt
→ Bootstrap Context
→ spawn
→ Supervisor registration
```

链路完成不等于 Runtime ready。

```text
spawned != connected != identified != ready
```

Control Transport、`subsystem.hello`、identity binding 与 `subsystem.status` 继续由 Main ⇄ Subsystem Control Protocol v1 独立定义。

## 暂缓

本阶段明确不定义：

- PWA Launcher Descriptor 映射；
- 第二种 Launcher Type；
- `.js` + `package.json.type` module resolution Profile；
- 不可信 executable sandbox；
- 自动 Runtime restart / checkpoint / crash recovery；
- lazy / idle recycle；
- 一个 `key` 多 Runtime instance；
- remote Subsystem；
- Game-supplied Node executable / flags / argv；
- Node version negotiation in Game Entry；
- timeout 默认数值；
- graceful shutdown wire method；
- executable integrity/signature verification。

这些能力未来必须通过新的 Contract / Profile / ADR 显式引入，不能作为 v1 实现优化偷偷增加。

## 结果

- `launcher.entry` 不再是架构待冻结项；
- Entry module type 不依赖隐式 `package.json.type`；
- Game Package Validator 和 Main Launcher 可以共享稳定 conformance fixture；
- Main 父进程环境不再默认泄露给 Subsystem；
- spawn / connect / identified / ready 的边界保持清楚；
- Supervisor exit observation 与 Runtime self-reported status 保持分离；
- v1 crash 后行为确定为 failure 而非隐式 restart；
- Desktop Node.js Launcher 的安全声明不再与 Content API 能力模型混淆。
