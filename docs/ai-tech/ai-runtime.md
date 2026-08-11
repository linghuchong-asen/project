---
title: AI 编排运行时
icon: sitemap
order: 2
category:
  - 语图技术方案
---

# AI 编排运行时（LangGraph 状态图）

语图的"智能"不在某个大模型里，而在一个**状态图（StateGraph）**里。传统 LangChain Chain 是线性执行、状态传递有限；语图的 意图识别→生成→反思→工具调用 链路天然需要条件分支和循环重试，LangGraph 的图形化执行模型 + Checkpointer 持久化 + Human-in-the-loop 是最自然的表达方式。本页讲清这张图怎么搭、状态怎么流转、记忆怎么持久化。

::: tip 关于"规划"节点
部分架构图（如后端模块结构图）会标出"规划"步骤。实际上语图没有独立的规划节点——规划内化在生成节点的 CoT（Chain of Thought）中：模型先在 `<thinking>` 标签内列出拓扑结构（角色/步骤/分支/节点映射），确认无遗漏后再输出 FlowDraft。这种"先思考后输出"的自回归机制天然实现了规划→执行的分离，不需要额外图节点。
:::

## 为什么用 LangGraph 而不是 Chain

| 维度 | 传统 Chain | LangGraph |
| --- | --- | --- |
| 执行模型 | 线性 pipe | 图形：节点 + 条件边 + 循环 |
| 状态管理 | 有限、单向 | State 在全程被维护与更新 |
| 持久化 | 需自行实现 | Checkpointer 原生支持 |
| 人工干预 | 难 | Human-in-the-loop 原生支持 |
| 重试/回退 | 手写 | 条件边自然表达 |

语图的反思校验会触发"回到生成"，重试时保持上下文不变——这些回路用 Chain 要把状态外挂、自己管理循环；用 LangGraph 只是一组条件边。

## 状态图节点与边

![语图 LangGraph 状态图：节点与条件边](/assets/ai-tech/langgraph-state-graph.svg)

- **START / END**：LangGraph 状态图的入口与出口。
- **意图识别**：规则（动词特征 + 上下文状态）优先，模型兜底，输出 `generate` / `modify` / `consult` 三条路由。
- **上下文组装**：`generate` / `modify` 路径共用，拼 System Prompt + 项目上下文 + 记忆召回 + 工具描述；按意图组装不同的输出 Schema 引导（`generate` 引导全量 FlowDraft，`modify` 引导增量操作指令）；`modify` 场景额外注入当前画布语义结构。
- **用户咨询**：`consult` 路径专属，纯问答场景（如用法说明、概念解释），不触发生成流程，直达 END。
- **生成 / 修改**：`generate` 输出全量 FlowDraft（仅语义），内化 CoT（先在 `<thinking>` 中列拓扑结构）防漏；`modify` 采用增量输出，按修改类型（新增/修改/删除节点或边、样式变更）输出结构化操作指令，复用上下文组装阶段注入的画布语义结构做指代消解。
- **反思校验**：Zod Schema + 图遍历两层确定性校验，不依赖 LLM 自评。
- **工具调用**：Skill / MCP 工具节点，失败分级重试或降级。
- **用户确认**：模糊语义（分支标签歧义、节点归类不确定）不盲改，由反思层产出待确认项，SSE 推给前端确认后继续。

## State 定义

```typescript
// LangGraph 状态图的核心 State 结构
interface AgentState {
  messages: BaseMessage[];        // 对话消息历史（LangChain MessagesState）
  intent?: IntentType;             // 意图识别结果
  flowDraft?: FlowDraft;           // 生成结果（中间结构）
  canvasContext?: FlowDraft;       // modify 场景注入当前画布语义结构（带 ID），供模型复用
  reflectionResult?: ReflectionResult; // 反思校验结果
  userProfile?: UserProfile;       // 用户画像（按需注入）
  rollingSummary?: string;         // 滚动摘要
  toolResults?: ToolResult[];      // 工具调用结果
}
```

每个节点只读取自己需要的 State 片段、写回自己负责的片段——单一职责、显式优于隐式。

## Checkpointer：短期记忆持久化

Checkpointer 把每一轮的 State 按 `thread_id` 落库，实现**短期记忆**与断点恢复。

```typescript
import { StateGraph, START, END } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph/checkpoint/postgres";

const checkpointer = PostgresSaver.fromConnString(
  "postgresql://devUser:123456@localhost:5432/flowchart_editor"
);

const app = new StateGraph(AgentState)
  .addNode("intent", intentNode)
  .addNode("generate", generateNode)
  .addNode("reflect", reflectNode)
  .addNode("tools", toolNode)
  // ... 条件边
  .compile({ checkpointer });

const config = { configurable: { thread_id: "session-123" } };
const result = await app.invoke(userInput, config); // 状态自动落 PG
```

- 语图用 **PostgresSaver**：短期记忆与业务库同 PostgreSQL（pgvector 扩展），避免再引入 Redis 存短期记忆态。
- 召回最近 N 轮：Checkpointer 本身保留完整 State 历史，按 **token 预算**（而非固定轮数）截取，更准——3 轮≠最后 6 条，长消息会撑爆预算。

## Store：长期记忆与用户画像

长期记忆（摘要 + 向量 + 关键词）与用户画像落在 **PostgresStore**，用命名空间隔离。

```typescript
import { PostgresStore } from "@langchain/langgraph/store/postgres";

const store = PostgresStore.fromConnString(
  "postgresql://devUser:123456@localhost:5432/flowchart_editor",
  {
    index: {
      dims: 1024,                 // BGE-M3 嵌入维度
      embed: bgeM3Embed,          // 嵌入函数
    },
  }
);

// 长期记忆：命名空间 ("memory", projectId)
// Store 依据 index.embed 配置自动对 summary 生成向量建索引，调用方不传 vector
await store.put(["memory", projectId], "turn-1", {
  summary: "...",
  keywords: [...],
});

// 用户画像：独立命名空间，纯 JSON 无向量
await store.put(["user_profile", userId], "profile", {
  basic_info: {...},
  preferences: { language: "zh", interaction_style: "concise" },
});
```

PostgresStore 类似一层持久化 ORM：文档命名空间（namespace）做隔离，向量列由 pgvector 提供语义检索。AI 模块的短期/长期/画像统一在 PG，后续用户/项目模块亦计划迁 PG。

> 记忆的架构定位、召回策略、生命周期管理详见 [记忆管理](./memory.md)。

## 条件边与循环重试

反思校验返回结构化结果，由条件边决定走向：

| reflectionResult | 路由 |
| --- | --- |
| 格式/结构问题 | 回到 生成修改（Rewriter 改答案） |
| 通过 | 结束，回推前端 |
| 模糊语义 | 用户确认（Human-in-the-loop） |

> 结果修正（Rewriter）改的是"这一步的输出"，在反思层内部复用生成模块，**不重走**意图识别→上下文组装主流程。

## modify 增量输出

`modify` 场景不再输出全量 FlowDraft 再做 diff，而是输出结构化操作指令，按修改类型区分：

```typescript
type ModifyOperation =
  | { op: "add_node"; node: FlowNode }
  | { op: "add_edge"; edge: FlowEdge }
  | { op: "update_node"; nodeId: string; patch: { label?: string; style?: Partial<NodeStyle> } }
  | { op: "delete_node"; nodeId: string }
  | { op: "delete_edge"; edgeId: string };
```

上下文组装阶段根据意图组装不同的输出 Schema 引导：`generate` 引导模型输出完整 FlowDraft（Zod Schema 校验 nodes + edges），`modify` 引导模型输出增量操作指令（Zod Schema 校验 op + payload）。

增量输出的优势：

- 模型只输出变更部分，不重复输出未变化节点，Token 开销显著降低
- 指代消解在模型内部隐式完成——`canvasContext` 注入带 ID 的画布语义结构，模型直接引用已有 ID
- 样式变更通过 `update_node` 的 `style` patch 表达，不需要独立路径
- 结构变更和样式变更可在同一批操作指令中混合输出

反思校验对两种输出分别处理：全量 FlowDraft 走 L1-L4 分层 diff（节点 ID 精确匹配 → 语义匹配 → 拓扑匹配 → 边校验兜底），增量操作指令走逐条校验（nodeId 是否存在、引用是否合法、操作语义是否完整）。

## Human-in-the-loop

模糊语义（如分支标签歧义、节点归类不确定）不盲改，由反思层产出待确认项，SSE 推给前端让用户确认，确认结果作为下一轮输入回到生成节点。这依赖 Checkpointer 的中断/恢复能力——流程可在任意节点暂停、等人工、再继续。

## 与 NestJS 的集成

`ai` 模块的 Controller 用 `@Sse()` 暴露对话接口，内部订阅 LangGraph 的事件，经 RxJS `Observable` 把 token/思考过程逐条推给前端；连接断开时由 `AbortController` 终止底层 Observable，避免 SSE 连接泄漏浪费 Token（踩坑记录见《流式输出》）。

- 相关：[存储层设计](./storage.md) · [后端](./index.md)
