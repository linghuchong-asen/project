---
title: 记忆管理
icon: database
order: 2
category:
  - 语图技术方案
---

# 记忆管理

记忆管理分为**短期记忆、长期记忆、用户画像**三个子模块，覆盖"写入 → 压缩 → 召回 → 遗忘"全生命周期。约束条件始终是：**存储成本、召回成本、注意力成本**。

::: tip 核心认知
记忆模块是一个需要全生命周期管理的模块——写入、压缩、召回、遗忘，整个流程需要管理起来。如何存：存的时候如何保证不漏数据？更新时得考虑性能问题。如何取：取的时候要考虑节省 token，节省注意力。
:::

## 记忆的架构定位：不是节点，是横切关注点

记忆要做的事情很多——储存、召回、判断、更新——但它是**基础设施层的能力，不是状态图中的业务节点**。原因在于记忆的四个操作发生在流程的不同阶段，无法用单个图节点覆盖：

- **召回**在生成前（为模型提供上下文）
- **储存**在每个节点执行后（Checkpointer 自动落库）
- **判断**在召回时（决定召回什么、多少）
- **更新**在生成后（滚动摘要）和会话后（长期记忆、画像）

一个 LangGraph 节点在图中有固定位置，无法同时位于生成前和生成后。Checkpointer 的"每节点后自动储存"更是图模型无法表达的横切关注点——它和日志、错误处理一样，属于框架层能力。

![记忆操作在状态图各阶段的分布](/assets/ai-tech/memory-distribution.svg)

记忆逻辑的代码归属：

- **召回 + 判断**内聚于上下文组装节点（策略依赖 intent，结果直接进 Prompt，拆开只增加 State 传递而无收益）
- **储存**由 Checkpointer 框架自动完成（每节点后执行，无法用图节点表达）
- **摘要更新**在生成节点内部完成（依赖模型输出，写回 State 后由 Checkpointer 自动持久化）
- **长期记忆 + 画像更新**在会话结束后异步执行（不影响主流程延迟，不在状态图中体现）

::: tip 节点粒度 ≠ 函数粒度
LangGraph 节点是状态图的执行单元，不是代码的组织单元。上下文组装节点内部调用多个记忆相关的 Service 函数，但对外是一个图节点。类比 NestJS：一个 Controller 方法内部可能调用多个 Service，但对外是一个 HTTP 端点。
:::

## 分层架构

| 类型 | 载体 | 生命周期 | 内容 |
|------|------|---------|------|
| 短期记忆 | LangGraph Checkpointer（PostgreSaver） | 跟随当前对话；结束清空；>3 天归档长期 | 每轮结构化提取（意图/实体/话题 ID）后的 State |
| 长期记忆 | LangGraph Store（PostgresStore + pgvector） | 跟随用户，跨项目 | 摘要 + 向量 + 关键词索引 + sessionEntitySlot + 元数据 |
| 用户画像 | PostgresStore（独立命名空间，JSON） | 长期，异步更新 | 基本信息/偏好/交互风格/职业背景等稳定特征 |

### 金字塔类比

- **短期记忆** = 流水（当前对话上下文）
- **长期记忆** = 水库（历史交互的具体事件和事实）
- **用户画像** = 水质报告（对水库水质的整体评估和特征总结）

## 存储与更新

### 短期记忆

进入 PostgreSaver 的会话，元数据先打 `isSummarized=false`；每够 2 轮做一次摘要写入 `rollingSummary` 变量（State 内的滚动摘要，仍在短期记忆范畴），对应标记 `isSummary=true`。

::: tip 摘要 vs 持久化的区别
- **每 2 轮摘要**（rollingSummary）：在 State 内做有损压缩，把近期对话压成摘要，控制短期记忆的 token 占用。这是"内存内"操作。
- **每 10 轮 / 会话结束写 Store**：把摘要 + 实体 + 元数据异步持久化到 PostgresStore（长期记忆），跨会话可召回。这是"落库"操作。

两个操作频率不同、目的不同：前者管注意力预算，后者管跨会话记忆。
:::

短期记忆存储的是**结构化 JSON**（非原始字符串，非 Embedding 向量），包含原文 + 轻量特征提取结果：

```typescript
interface TurnRecord {
  turnId: number;
  role: 'user' | 'assistant';
  content: string;          // 原文保持，拼 prompt 时直接取出来用
  timestamp: string;
  intent?: string;          // 轻量特征提取：意图
  entities?: Record<string, unknown>;  // 实体槽位
  topicId?: string;         // 话题 ID，用于漂移检测
}
```

::: warning 为什么短期记忆不做 Embedding？
短期记忆是给 LLM 直接消费的，不是给检索系统做相似度计算的。Redis/Checkpointer 里存人能读懂的结构化文本，向量库里才存向量。两者职责不同。
:::

### 长期记忆

短期记忆溢出后，**每 10 轮或用户结束对话**，由节点**异步写入** Store，数据含：摘要 + 向量 + 关键字索引 + sessionEntitySlot + 元数据。

长期记忆采用**向量 + 摘要双储存**策略：

```typescript
interface LongTermMemory {
  summary: string;                 // 摘要文本（召回后给 LLM 看）
  // 注意：无 vector 字段——向量由 Store 的 index.embed 内部从 summary 自动生成，
  // 调用方只传 summary + keywords，不暴露在接口契约中
  keywords: string[];              // 关键词索引
  sessionEntitySlot: Record<string, unknown>; // 精确实体，避免压缩丢失
  metadata: {
    sessionId: string;
    isSummarized: boolean;         // 未压缩的原始记忆也要召回
    topics: string[];
    timestamp: string;
  };
}
```

压缩流水线：

1. 把对话按主题切分成若干块
2. LLM 生成每块摘要
3. BGE-M3 编码成向量（1024 维，`normalize_embeddings=True`）
4. 存入 PostgresStore（向量 + 摘要 + 元数据）

### 用户画像

借助模型从记忆中提炼稳定特征，以 JSON 文档独立维护。

**调用时机**——由意图识别决定是否触发画像检索（详见[意图识别](./intent.md#与记忆检索的联动)），按需动态注入，非全量、非每次调用。

**更新时机**——会话结束后异步触发（Session-based Update，性价比最高）。

::: warning 为什么不能每次对话都更新画像？
1. **成本爆炸**：每次都要调用大模型进行信息抽取
2. **价值稀释**：大多数日常对话不包含能刻画用户长期特征的有效信息
3. **画像抖动**：用户可能随口表达一个临时偏好（如"今天不想吃辣"），立即更新会污染长期画像数据
:::

画像更新内部逻辑（伪代码）：

```python
def update_user_profile(user_id, conversation_text):
    # 1. 获取现有画像
    current_profile = db.get_profile(user_id)
    # 2. 调用大模型进行信息抽取
    prompt = f"""
    以下是用户与助手的对话记录。请分析对话，提取用户的长期稳定特征。
    只提取确定性的偏好，忽略临时性需求。
    现有用户画像：{current_profile}
    对话记录：{conversation_text}
    请以JSON格式输出需要新增或修改的字段。如果没有有价值的信息，返回空JSON {{}}。
    """
    extracted_json = llm.invoke(prompt)
    if extracted_json == {}:
        return "No update needed"
    # 3. 冲突消解与合并
    merged_profile = deep_merge(current_profile, extracted_json)
    # 4. 写入数据库
    db.update_profile(user_id, merged_profile)
    # 5. 记录更新日志
    log_update(user_id, extracted_json)
```

## 遗忘策略（确定性衰减）

采用指数衰减函数，半衰期按访问次数动态调整；**每周扫描**一次：

```typescript
weight = exp(-0.693 * daysSinceLastAccess / halfLife)

// 每周扫描：
//   weight > 0.5         -> 不处理
//   0.3 <= weight <= 0.5 -> 对摘要再做一次压缩
//   weight < 0.3         -> 删除
```

::: tip 为什么用确定性衰减而不是让模型判断？
纯数学计算，不需要模型判断"这条记忆该不该忘"。省 token、省成本、可预测。遗忘策略是确定性优先原则的典型体现。
:::

### 用户画像标签的冷热衰减

- **热标签（近期偏好）**：如"最近在关注买房"。权重高，更新较频繁，但衰减快（1 个月不提就降权）
- **冷标签（固有属性）**：如"职业是程序员"。一旦确立，几乎不更新，也不衰减

## 召回策略

```mermaid
flowchart LR
  ST[("短期记忆\nPostgreSaver State")] -->|"溢出/每10轮/会话结束"| LT[("长期记忆\nPostgresStore+pgvector")]
  LT -->|"每周扫描 衰减"| FW{"weight"}
  FW -->|">0.5"| KEEP["保留 不处理"]
  FW -->|"0.3-0.5"| COMP["再压缩摘要"]
  FW -->|"<0.3"| DEL["删除"]
  ST -->|"超过3天"| ARCH["归档长期 清空短期"]
```

### 短期召回

`trim_messages` 取最近 3 轮，结合（向量相似度 + 时效性 + 话题一致性）判断是否够用；够用则不再召回长期。

::: tip 评估后召回 vs 直接召回
- **评估后召回**：90% 的请求只需走"评估"+"短期记忆"路径，成本极低；10% 的请求才触发昂贵的长期检索
- **直接召回**：100% 的请求都需要支付"长期记忆检索"的成本

"够不够"的判断是代码做的，不是模型做的——结合向量相似度 + 时效性 + 话题一致性。
:::

### 长期召回

向量 + 关键词**双路召回**，**RRF 融合排序**取 top 10，**Reranker 模型**重排取最高 3 条摘要入上下文。

召回流程：

1. **向量检索**：当前用户输入 → BGE-M3 编码 → pgvector 相似度检索 top-K
2. **关键词检索**：从用户输入提取关键词 → BM25/关键词索引检索 top-K
3. **RRF 融合**：两路结果按 Reciprocal Rank Fusion 公式合并排序，取 top 10
4. **Reranker 重排**：用 Reranker 模型对 top 10 做精排，取最高 3 条
5. **组装上下文**：按固定模板包装为纯文本段落

### 实体保真

若摘要涉及结构化实体（审批金额、电话等），用元数据 id 找 `sessionEntitySlot`，再按关键词取精确实体数据，避免摘要压缩导致的关键数值丢失。

::: warning 结构化实体不丢失
摘要是有损压缩，倾向保留语义而丢弃精确细节。ID、电话、金额等实体必须"分离存储、混合检索"——语义层可压缩，事实/实体层只索引不可压缩。

**黄金法则**：把 Agent 记忆压缩当作"数据库归档"而不是"文章缩写"来处理。能结构化的，绝不放进自然语言摘要里。压缩的对象是"叙事"，不是"事实"。
:::

### 未压缩记忆

Store 中 `isSummarized=false` 的原始记忆同样参与召回——不是所有记忆都需要先压缩再存储，未压缩的原始记忆在需要时也可以被检索到。

## 话题切换检测

多轮对话中用户可能突然跳到另一个话题，历史记忆污染当前上下文。系统通过**基于 Embedding 相似度的 topic shift 检测**解决：

```typescript
function detectTopicShift(messages: Message[]): boolean {
  if (messages.length < 4) return false;
  const recentVectors = messages.slice(-3).map(msg => getVector(msg.content));
  const earlierVectors = messages.slice(-6, -3).map(msg => getVector(msg.content));
  const similarity = calculateAverageSimilarity(recentVectors, earlierVectors);
  return similarity < 0.5; // 相似度低于阈值，认为话题发生变化
}
```

### 三种检测方案

| 方案 | 原理 | 适用场景 |
|------|------|---------|
| 意图与槽位继承 | 意图相同或槽位复用 → 同一 Topic ID | 任务型对话（推荐） |
| 规则触发词 | 命中"对了""换个话题"等触发词 → 新 Topic ID | 轻量级兜底 |
| LLM 实时归类 | 小模型判断是否继续上一个话题 | 复杂场景终极方案 |

::: tip 性能优势
在写入时就打好 Topic 标签，检索时直接比对字段——O(1) 的 Hash 比对 vs O(N) 的向量计算。这是工业界处理多轮对话最标准、最高效的做法。
:::

## Token 预算与注意力管理

### 用户画像的 Token 成本

用户画像约 2KB 数据（约 500 token），每次请求都拼接会导致额外的 Token 消耗和注意力分散。因此采用**按需检索、动态注入**策略——由意图识别决定是否拉取画像（决策逻辑见[意图识别](./intent.md#与记忆检索的联动)），只在个性化推荐、风格调整、实体指代消解等场景注入，事实性问答和明确指令不注入。

### 记忆注入 Prompt 模板

```text
[当前上下文 - lastK]
对话消息:
1. 加一个审批节点A
2. 把它连到节点B
3. 把节点A颜色改为红色

项目摘要 (summary):
- 用户正在绘制采购流程图，目前已完成申请阶段，正在设计审批阶段。

相关历史 (vector search):
- 请假流程审批链条：员工 -> 部门经理 -> 人事 -> 总经理
- 上次采购流程审批讨论：需要引入供应商审批人
```

## 记忆生命周期管理

语图的记忆生命周期围绕"写入 → 压缩 → 召回 → 遗忘"四个环节，每个环节有明确的确定性策略：

| 环节 | 语图实现 | 确定性体现 |
|------|---------|-----------|
| 写入 | 短期每轮写 PostgresSaver State；长期每 10 轮/会话结束异步写 PostgresStore | 触发条件固定（轮次/事件驱动），非模型判断 |
| 压缩 | 每 2 轮 rollingSummary 摘要；长期摘要 + 实体分离存储 | 摘要有损压叙事，实体槽无损保事实 |
| 召回 | 短期按 token 预算截取；长期双路检索 + RRF + Reranker | "够不够"由代码算（相似度+时效+话题），非模型判断 |
| 遗忘 | 指数衰减函数，每周扫描 | 纯数学计算，非模型判断 |

### 性能优化

- **异步批量写入**：中长期记忆采用异步批量提交，不阻塞生成链路
- **索引优化**：对 `user_id + timestamp` 建立复合索引，加速按用户和时间的查询
- **冷热分层**：短期记忆（PostgresSaver）按 thread_id 隔离，会话结束即不活跃；长期记忆（PostgresStore + pgvector）按命名空间隔离，向量检索走 GIN 索引
