# 测试策略

测试目标不是“消息能通”，而是证明每层不能绕过 authority、lifecycle、failure domain、public author API 与 frozen seam。

## Evidence ownership

```text
Foundation / Wire          carrier + bounded encoding mechanics
Protocol packages          schema/profile validation + conformance
Main / Realm State         session authority + shared state lifecycle
Subsystem                  domain execution + RenderDomain authority
Renderer                    readonly replica + input producer gate
Platform / Launchers       physical hosting/provisioning/currentness
Game libraries             business semantics and consumer behavior
Apps                        product-level physical/security/lifecycle E2E
```

Nearest owner owns nearest evidence；大 E2E 不替代 package/contract tests。

## Current root gates

历史脚本名仍保留以避免一次文档重构同时改变 CI interface：

```text
npm run test:m11           render replication/current render path
npm run test:m12           content/storage integration
npm run test:m13           web presentation
npm run test:m14           real Map game consumer
npm run test:m15           Hostra Desktop product aggregate
npm run test:m16           PWA runtime
npm run test:m17           PWA product/equivalence
npm run test:pwa           PWA aggregate
npm run test:regression    repository regression
```

这些 `mXX` 是现有 command aliases，不再定义 Current 文档信息架构。未来可以在独立工程 PR 中重命名 workflow/script；不得只改名字而降低 coverage 或 required-check fail-closed 语义。

## Test rules

- no test-only business truth；
- frozen seam 存在时，不直接注入 authority 绕过生产路径；
- 不为测试新增平行 state/patch protocol；
- physical-edge fake 只能替代物理外部依赖，不能替代被测 production seam；
- 不因 test convenience 引入 registry/manager/retry/framework；
- Desktop/PWA 比较 logical outcome，不要求 physical implementation 相同。

精确 qualification 是否有效由[资格规则](./qualification.md)决定，而不是由脚本历史名称决定。
