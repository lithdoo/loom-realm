# 固定对话

> 独立技术设计记录。不改写 `../DESIGN.md`。本文只设计作者写好的固定 Dialogue Content；Card 模式的 AI 自由对话是另一套独立系统，不在这里讨论。

归宿总表见 [数据落点](./60-data-placement.md)，人物身份见 [人物](./61-character.md)，整体模型见 [世界数据模型](./63-world-data-model.md)。

## 目标

固定 Dialogue 保持一个很小的模型：

> **一个 Dialogue 就是一段线性台词列表；列表播放完后可以结束，也可以在末尾出现选择。每个选择只负责跳到另一个 Dialogue。**

因此不在 Dialogue 内设计通用 Node、Flow、脚本命令或任意位置跳转。

人物日常对话、主线剧情对话、支线剧情对话使用同一种 Dialogue Content。区别只在于“谁在什么情况下启动这段 Dialogue”，不在 Dialogue 本身再分系统。

## 基本结构

概念上：

```text
Dialogue
├─ id
├─ lines[]
│  ├─ speaker?
│  └─ text
└─ choices?[]
   ├─ text
   └─ target Dialogue
```

第一版不要求额外的 Node 层。

例如：

```json
{
  "id": "rival-challenge",
  "lines": [
    {
      "speaker": "rival",
      "text": "终于来了。"
    },
    {
      "speaker": "rival",
      "text": "要打一场吗？"
    }
  ],
  "choices": [
    {
      "text": "来吧",
      "target": "rival-challenge-accept"
    },
    {
      "text": "现在不了",
      "target": "rival-challenge-refuse"
    }
  ]
}
```

被引用的目标仍然是普通 Dialogue：

```json
{
  "id": "rival-challenge-accept",
  "lines": [
    {
      "speaker": "rival",
      "text": "这才像话。"
    }
  ]
}
```

```json
{
  "id": "rival-challenge-refuse",
  "lines": [
    {
      "speaker": "rival",
      "text": "哼，那下次吧。"
    }
  ]
}
```

没有 `choices` 的 Dialogue 播放完以后自然完成。

## Line

一个 Line 表示一句固定台词。

对于持久 Character，`speaker` 引用 Character identity，而不是在每一句里复制人物名称、头像或其他人物资料：

```json
{
  "speaker": "rival",
  "text": "你来晚了。"
}
```

Runtime 可以通过 Character Content 取得人物名称与需要的表现数据。

没有 `speaker` 的 Line 表示旁白：

```json
{
  "text": "门外传来一阵脚步声。"
}
```

临时 Encounter NPC 等非持久 Character 的 speaker identity 如何表达，等 Encounter / Dialogue 真正接起来时再确定，不在这里提前扩大 Character 模型。

## Choice 只能出现在末尾

一个 Dialogue 内部始终是线性的。`choices` 如果存在，只能在全部 `lines` 播放完以后出现。

不设计这种结构：

```text
Line
→ Choice
→ Line
→ Choice
```

如果作者需要中途选择后继续说话，就拆成多个 Dialogue：

```text
Dialogue A
→ Choice
   ├─ Dialogue B
   └─ Dialogue C
```

这样每个 Dialogue 自身始终只有：

```text
顺序播放 lines
→ complete
```

或者：

```text
顺序播放 lines
→ 显示末尾 choices
→ 进入被选择的 target Dialogue
```

## Choice 只负责选择下一段 Dialogue

Choice 当前只表达：

```text
玩家看到的选项文本
+
选择以后进入哪个 Dialogue
```

Dialogue 不直接通过 Choice 修改世界业务事实，因此不在 Choice 里加入：

```text
修改 affinity
修改 hostile
建立 Contract
开始 Battle
改变 Event State
移动 NPC
任意 Realm State mutation
```

这些后果由调用 Dialogue 的 World / Story 业务在 Dialogue 完成后解释和提交。

这样固定 Dialogue 保持“说什么、怎么在对话片段之间选择”的职责，不演变成第二套 Event / World 脚本系统。

## 分支与循环

虽然单个 Dialogue 是线性的，但多个 Dialogue 通过末尾 Choice 可以形成分支：

```text
A
→ Choice
   ├─ B
   │  → Choice
   │     ├─ D
   │     └─ E
   └─ C
```

也允许形成循环：

```text
question
→ Choice
   ├─ done
   └─ explanation
        ↓
      question
```

因此 Builder **不能因为 Dialogue 引用图存在 cycle 就报错**。

当前 Dialogue 之间只有玩家 Choice 才产生跳转，不存在无交互的自动连续 jump，所以允许 cycle 不等于 Runtime 会自动死循环。

## Runtime

概念执行过程：

```text
调用某个 Dialogue
↓
读取 Dialogue Content
↓
按顺序播放 lines
↓
是否有 choices？
├─ 否 → 本次固定对话完成
└─ 是 → 玩家选择
         ↓
       读取 target Dialogue
         ↓
       从该 Dialogue 的第一句重新开始
```

Runtime 当前只需要维护很小的临时工作状态，例如：

```text
current dialogue id
current line index
pending choice interaction
```

这些都属于当前 Dialogue Frame 的临时状态，不进入 Realm State，也不作为存档事实。

## Content 与 State 边界

Dialogue definitions 是 immutable Content：

```text
Content
└─ Dialogue
   ├─ id
   ├─ lines[]
   └─ choices?[]
```

Realm State 不保存 Dialogue 的展开副本，也不保存当前播放到第几句。

如果玩家的某次选择最终造成长期世界变化，例如 Relationship、Event progress、Contract 或其他业务事实，由调用方把真正需要持久化的结果提交到 Realm State。

## Builder 检查

Builder 应检查能够静态确定的固定 Dialogue 内容错误：

- Dialogue identity 重复；
- Choice `target` 引用了不存在的 Dialogue；
- 持久 Character speaker 引用了不存在的 Character；
- Line 缺少需要的文本；
- Choice 缺少显示文本或 target。

Builder 不因为 Dialogue 之间形成合法循环而失败。

## 当前不冻结

以下内容等实际需求出现后再决定：

- Dialogue Content 的最终 namespace / key 格式；
- 是否需要给最终 Dialogue 增加显式 outcome / result；
- 本地化文本的最终组织方式；
- 临时 Encounter NPC 的 speaker identity 表达；
- 对话中的头像切换、表情、音效等 presentation metadata；
- 根据 Realm State 动态隐藏 / 显示 Choice 的条件系统。

当前优先保持：

```text
Dialogue = 线性 lines + 可选的末尾 choices
Choice = 下一段 Dialogue 的引用
```
