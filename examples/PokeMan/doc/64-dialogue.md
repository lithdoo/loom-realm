# 固定对话

> 独立技术设计记录。不改写 `../DESIGN.md`。本文只设计作者写好的固定 Dialogue Content；Card 模式的 AI 自由对话是另一套独立系统，不在这里讨论。

归宿总表见 [数据落点](./60-data-placement.md)，人物身份见 [人物](./61-character.md)，Event / EventStateMutation 见 [事件](./62-event.md)，整体模型见 [世界数据模型](./63-world-data-model.md)。

## 目标

固定 Dialogue 保持一个很小的模型：

> **一个 Dialogue 是一段线性台词列表；列表末尾可以结束，或者出现 Choice。Choice 只跳到另一个 Dialogue。没有 Choice 的 Dialogue 可以在正常完成时引用一个 EventStateMutation。**

因此不在 Dialogue 内设计通用 Node、Flow、脚本命令或任意业务 action。

人物日常对话、主线剧情对话、支线剧情对话使用同一种 Dialogue Content。区别只在于谁从哪里启动它，以及无 Choice Dialogue 完成后是否引用一个 EventStateMutation。

Content 永远只是定义数据。**真正解释 Dialogue graph 并执行 Mutation 的是 PokeMan Dialogue Subsystem。**

## 基本结构

概念上：

```text
Dialogue
├─ id
├─ lines[]
│  ├─ speaker?
│  └─ text
├─ choices?[]
│  ├─ text
│  └─ target Dialogue
└─ mutation? → EventStateMutation
```

其中有一个明确互斥约束：

```text
choices 存在
=> mutation 不允许存在

mutation 存在
=> choices 不允许存在
```

因此 Dialogue 只有三种形态：

```text
1. 普通结束 Dialogue
   lines
   → complete

2. 分支 Dialogue
   lines
   → choices
   → target Dialogue

3. 状态变更 Dialogue
   lines
   → mutation ref
   → Dialogue Subsystem 执行 EventStateMutation
   → complete
```

## Line

一个 Line 表示一句固定台词。

对于持久 Character，`speaker` 引用 Character identity，而不是复制人物名称、头像或其他人物资料：

```json
{
  "speaker": "rival",
  "text": "你来晚了。"
}
```

没有 `speaker` 的 Line 表示旁白：

```json
{
  "text": "门外传来一阵脚步声。"
}
```

临时 Encounter NPC 等非持久 Character 的 speaker identity 等 Encounter / Dialogue 真正接起来时再定，不提前扩大 Character 模型。

## Choice 只能出现在末尾

一个 Dialogue 内部始终是线性的。`choices` 如果存在，只能在全部 `lines` 播放完以后出现。

不设计：

```text
Line
→ Choice
→ Line
→ Choice
```

如果作者需要选择后继续说话，就拆成多个 Dialogue：

```text
Dialogue A
→ Choice
   ├─ Dialogue B
   └─ Dialogue C
```

Choice 当前只表达：

```text
玩家看到的选项文本
+
选择以后进入哪个 Dialogue
```

不在 Choice 上增加：

```text
mutation
action
result
setEventState
setAffinity
startBattle
任意 Realm State mutation
```

## Choice 分支需要状态变化时

如果某个 Choice 分支最终需要改变 Event state，Choice 仍然只跳到新的 Dialogue；由新的无 Choice Dialogue 在完成时引用 Mutation。

例如：

```text
professor-intro
→ Choice
   ├─ [接受] → professor-contract-accept
   │              ├─ lines
   │              └─ mutation: professor-contract-accepted
   │
   └─ [拒绝] → professor-contract-refuse
                  └─ lines
```

概念 Content：

```yaml
id: professor-intro
lines:
  - speaker: professor
    text: "准备好了吗？"
choices:
  - text: "接受"
    target: professor-contract-accept
  - text: "拒绝"
    target: professor-contract-refuse
```

```yaml
id: professor-contract-accept
lines:
  - speaker: professor
    text: "那么，契约成立。"
mutation: professor-contract-accepted
```

```yaml
id: professor-contract-refuse
lines:
  - speaker: professor
    text: "等你准备好再来。"
```

这样：

```text
Choice
= 只选择下一段 Dialogue

无 Choice Dialogue
= 可以在完成时声明一个 EventStateMutation ref
```

## 分支与循环

多个 Dialogue 通过末尾 Choice 可以形成任意分支，也允许循环：

```text
question
→ Choice
   ├─ done
   └─ explanation
        ↓
      question
```

Builder **不能因为 Dialogue 引用图存在 cycle 就报错**。

当前 Dialogue 之间只有玩家 Choice 才产生跳转，不存在无交互的自动连续 jump，所以允许 cycle 不等于 Runtime 会自动死循环。

## Dialogue `mutation`

`mutation` 是可选的 `EventStateMutation` Content reference。

它只允许出现在 **没有 `choices` 的 Dialogue** 上。

这里的职责边界是：

```text
Dialogue Content
= 保存 mutation ref

EventStateMutation Content
= 保存 from / to

PokeMan Dialogue Subsystem
= Runtime executor

Realm State
= EventStateList authority
```

Dialogue Content 本身不会“执行”任何东西。

## PokeMan Dialogue Subsystem 如何执行 Mutation

PokeMan Dialogue Subsystem 组合两层能力：

```text
@loomrealm-game/rpg-dialogue
→ 当前 Conversation interaction / presentation

PokeMan Dialogue business runtime
→ Dialogue graph
→ Choice target 跳转
→ EventStateMutation 解释
→ Realm State commit
```

当一个无 Choice Dialogue 播放完成并带有 `mutation` 时：

```text
读取 EventStateMutation Content
↓
scope.state.read(EventStateList)
↓
根据 EventStateList 解释每个 from：
  有 eventId entry → current = entry.stateId
  无 eventId entry → current = null
↓
全部 from AND 匹配
↓
生成新 EventStateList：
  to = stateId → upsert entry
  to = null    → 删除 entry
↓
scope.state.commit()
  condition = EventStateList Record version
  write     = 新 EventStateList
↓
commit 成功后 Dialogue 正常完成
```

因此多个 Event 的 `to` 变化通过**一次 EventStateList Record replacement**原子完成。

`EventStateMutation` 仍然只改变 Event current state，不修改 Relationship / Contract / Card / Battle / player position 等其他业务事实。

## Terminal Dialogue 与完成结果

没有 `choices` 的 Dialogue 播放完全部 `lines`，并在需要时由 Dialogue Subsystem 成功应用 `mutation` 后，是本次调用的 terminal Dialogue。

Dialogue Frame 正常完成时仍返回：

```text
terminalDialogueId
```

例如：

```text
rival-challenge
→ Choice
   ├─ rival-challenge-accept
   └─ rival-challenge-refuse
```

最终分别返回对应的 terminal Dialogue id。

`terminalDialogueId` 仍然只是完成结果，不是 Realm State。Event state mutation 不再依赖 caller 根据 `terminalDialogueId` 再查一张映射；terminal Dialogue 自己声明 Mutation ref，PokeMan Dialogue Subsystem 在完成路径中执行它。

## Runtime

概念执行过程：

```text
PokeMan Dialogue Subsystem 收到入口 Dialogue
↓
读取 Dialogue Content
↓
调用 @loomrealm-game/rpg-dialogue 展示当前 lines / choices
↓
是否有 choices？
├─ 是 → 玩家选择 target Dialogue
│       ↓
│     PokeMan Dialogue Subsystem 读取 target Dialogue
│       ↓
│     从 target Dialogue 第一行继续
│
└─ 否 → 是否有 mutation？
         ├─ 否 → complete
         └─ 是 → 读取 Mutation + EventStateList
                  ↓
                校验 from
                  ↓
                生成新 EventStateList
                  ↓
                scope.state.commit()
                  ↓
                complete
↓
返回 terminalDialogueId
```

Runtime 临时工作状态仍很小：

```text
current dialogue id
current line index
pending choice interaction
```

这些都不进入 Realm State，也不作为存档事实。

## Content 与 State 边界

Dialogue definitions 是 immutable Content：

```text
Content
└─ Dialogue
   ├─ id
   ├─ lines[]
   ├─ choices?[]
   └─ mutation?
```

EventStateMutation 也是 immutable Content。

Realm State 不保存 Dialogue 展开副本、当前 line index 或 Mutation definition，只保存实际 EventStateList 等业务事实。

如果某次对话还需要造成 Relationship、Contract、Card、Battle 等非 Event-state 后果，这些不进入 EventStateMutation；由相应 PokeMan 业务逻辑 / Subsystem 明确处理。这里不把 EventStateMutation 扩成通用 action DSL。

## Builder 检查

Builder 应检查：

- Dialogue identity 重复；
- Choice `target` 引用了不存在的 Dialogue；
- 持久 Character speaker 引用了不存在的 Character；
- Line 缺少需要的文本；
- Choice 缺少显示文本或 target；
- 同一个 Dialogue 同时存在 `choices` 与 `mutation`；
- `mutation` 引用了不存在的 EventStateMutation；
- EventStateMutation 的非空 `from` / `to` state 引用了不存在的 Event / state。

Builder 不因为合法的 Dialogue cycle 失败。

## 当前不冻结

以下内容等实际需求出现后再决定：

- Dialogue Content 的最终 namespace / key 格式；
- 本地化文本的最终组织方式；
- 临时 Encounter NPC 的 speaker identity 表达；
- 对话中的头像切换、表情、音效等 presentation metadata；
- 根据 Realm State 动态隐藏 / 显示 Choice 的条件系统；
- Dialogue Mutation 的 `from` mismatch / OCC conflict 时具体 UI / Message 表现。

当前优先保持：

```text
Dialogue = 线性 lines + choices? + mutation?
choices 与 mutation 互斥
Choice = 下一段 Dialogue 的引用
无 Choice Dialogue = 可以声明 EventStateMutation ref
PokeMan Dialogue Subsystem = Mutation executor
EventStateList = Event current state authority
Completion = terminalDialogueId
```