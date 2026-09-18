# Viewport State v1 Conformance — architecture-only

> 状态：**Executable-ready candidate / Docs Freeze HOLD / NOT RUN**；2026-09-18。
> [Child contract](./viewport-state-v1.md)；[Profile revision3](./renderer-data-profile-conformance-v1.md)；[freeze ledger](../30-implementation/viewport-core-freeze-ledger.md)。这是待实施的自动化测试要求，不是已有测试或 PASS。

| ID | 可控输入 | 必须断言 |
|---|---|---|
| V-01 | trusted raw source：640.9×480.9；0、负、0.1、NaN、Infinity、unsafe、missing/extra/getter；DPR-only | 640×480 接受；非法源样本忽略且 retained 不清空；normalized equal 不重复；getter 不读取。这里不是 wire JSON 检查。 |
| V-02 | 有尺寸 source 在 start 内同步 emit；无初值后出现尺寸；surface 从不可测恢复 | 首次可测时必须发 baseline；不等用户拖窗；startup staged slot≤1，不提前发送。 |
| V-03 | start throw、return 非函数、stop throw；旧 source 回调晚到；participant replace | source 标 local unavailable；不伪造尺寸、不 Data/Control terminal；旧 token inert；新 participant 不继承旧 raw sample。 |
| V-04 | inbound raw JSON：合法 exact `viewport.state`；已识别类型但 JSON 合法的 wrong size/extra/missing；非法 JSON（`NaN`/`Infinity` 字面量）、unknown `viewport.foo`、错误方向、bytes/depth；outbound trusted JS invalid | 已识别合法 JSON schema/方向错→viewport；非法 JSON/unknown/common→profile；trusted local invalid outbound→local-fatal；先检验、零 role mutation；仅 Data terminal；不能以原始 wire JSON 模拟 inherited/getter。 |
| V-05 | inFlight A，offer B→A；A settle | B 不发送；同值 A 不重复。 |
| V-06 | A admitted→B admitted→C，A/B settle；10000 burst 与 Input/Render 并发 | admitted FIFO、pending latest、≤1 inFlight+1 pending、底层放行后最后 C；无 Viewport 导致 generic overflow、send concurrent≤1；底层永久阻塞不虚报 eventual convergence。 |
| V-07 | inFlight reject/terminal、retire，随后旧 Promise settle；fresh peer | 旧 cursor inert/无 retry/unhandled rejection，fresh new baseline 独立；不转移 pending。 |
| V-08 | same participant two current Data peers、single source、reconnect/new G | 各 peer 首次 baseline 各一份；Control snapshot 未替换不重启 source；每 peer cursor 独立。 |
| V-09 | Runtime start/null、live subscribe、A、equal A、B、新 subscribe | live 首次同步一次；getter-before-callback；equal suppress；size immutable/detached；get→subscribe race 收敛。 |
| V-10 | listener 同步 throw/thenable reject、unsubscribe twice、callback 内 unsubscribe/subscribe | 错误 contain、不阻塞其他 observer、不 unhandled rejection；新 observer 仅自有 initial；退订后零 delivery。 |
| V-11 | Data carrier loss、same G fresh same/different、fresh G/Renderer、旧合法 unit 晚到 | last value retain；fresh wire baseline 必发；业务同值不重通知；仅当前 peer 更新；不把历史尺寸当 current 可绘制证明。 |
| V-12 | Runtime abort/normal shutdown/fatal terminal，持有旧 viewport 引用后 subscribe | 新 subscribe inert 零初始回调；旧 listeners 零 late delivery；manager close；Frame 不自动失败。 |
| V-13 | A/B 两 Runtime/Frame 变更 InputTarget、Frame suspend、Input producer unavailable | viewport 独立接收，绝不修改 Frame/Activation/Input/Render facts、不授予 mutation permit。 |
| V-14 | 真实 holder、真实 Data peers、真实 Subsystem host、fake source 的 vertical | 观察 source→wire→Scope 全链 first/equal/new/backpressure/reconnect/retire/terminal；不能只 mock manager 或断言 emit 调用。 |

Fixtures 必须复用现有 test infrastructure，可注入 gate 控制 writer/reader 串行化；禁止用 sleep/壁钟碰运气证明竞态。分别记录实际发送字节、dispatch 数、Scope event 序列、peer identity 和 terminal 分类。原 Input/Render、Connection/Profile revision2 测试原义保留。

退出：最终受测 executable/cohort SHA 一致、全部上述用例 PASS、旧 regressions PASS、运行命令与原始日志可追溯；缺实际 Desktop/Map 物理 source 标 OUT OF SCOPE/NOT RUN，不得称产品完成。