---
title: 介绍
icon: creative
order: 1
category:
  - 语图技术方案
---

# 介绍

## 产品介绍

**语图是一款支持自然语言生成流程图的 Agent。** 它并非"大模型 + 提示词"的简单封装，而是将流程图生成拆解为一条有记忆、能调用工具、可自我反思校验的 Agent 工作流——用户输入业务需求，Agent 自主完成语义结构生成经前端解析转换为 JSON 并渲染到画布。

::: tip 一句话定位
把"用文字描述流程"变成"画布上的合规流程图"，并把不可控的大模型输出，收敛为可渲染、可校验、可增量修改的确定性数据结构。
:::

### 核心功能

生成后的流程图提供两种更新方式，覆盖"自动生成 + 人工精修"的完整闭环：

- **AI对话生成**：在对话框中输入需求，系统自动在画布中生成流程图
- **AI 对话修改（增量生成）**：在对话框中描述修改意图，系统自动改写画布中的流程图
- **拖拉拽（人工精修）**：在画布中直接对 AI 生成的流程图做二次编辑、调整布局与样式
- **项目管理**：支持项目创建、删除、编辑

### 应用方向

除了作为独立产品使用，语图 Agent 还有几个延伸方向：

- **作为子 Agent 集成**：探索将当前的 Agent 作为子 Agent，集成到更大的系统中（如知识管理平台、企业协作工具），为宿主系统提供"文本→流程图"的可视化能力，这也是潜在的变现路径。
- **导出与跨文档集成**：支持将生成的流程图导出为通用图形格式，方便嵌入到其他文档、报告、Wiki 中，让图表成为知识传递的载体。
- 由一个工具到真实场景完整的一件事，这件事是什么呢，我现在还没有想好。画布可以完成什么事呢？设计、思路整理、黑板。设计具体是哪个方面呢？

## 架构总览

### 整体技术概述

| 层       | 技术选型                  | 职责                                              |
| -------- | ------------------------- | ------------------------------------------------- |
| 前端     | React + TypeScript + antd | UI、画布交互、对话窗、流式渲染                    |
| 编辑引擎 | AntV X6                   | 流程图的画布                                      |
| 自动布局 | @antv/layout              | 层级布局算法计算节点坐标                          |
| 后端     | NestJS + TypeScript       | 按模块组织：auth / user / project / editor / ai   |
| AI 编排  | LangGraph 状态图          | 意图识别→生成→反思 的图编排，条件边 + 循环 + 重试 |
| 数据校验 | Zod Schema                | 模型输出格式合法性校验                            |
| 通信     | SSE（@Sse + RxJS）        | 对话接口流式推送，逐 token 产出                   |
| 可观测性 | Langfuse                  | 全链路 trace + 日志，打开 LLM 黑盒                |

### 存储分层

| 存储                  | 职责                                                                    | 备注                                   |
| --------------------- | ----------------------------------------------------------------------- | -------------------------------------- |
| PostgreSQL + pgvector | AI 记忆/用户画像/编辑器文档(JSONB)/项目·用户管理/全文检索(tsvector+GIN) | 关系 + JSONB + 向量 + 全文检索一身多职 |
| Redis                 | 登录鉴权(JWT 令牌态)                                                    | —                                      |

::: tip 统一存储说明
所有业务数据与 AI 数据统一落在 **PostgreSQL + pgvector**：项目/用户用关系表，编辑器文档用 JSONB，AI 长期记忆用 Store + pgvector 向量列，全文检索用 tsvector + GIN 索引。Redis 仅负责登录鉴权（JWT 令牌态）。两个数据服务覆盖全部场景。
:::

### agent架构图

<div align="center">
  <img src="/架构图.png" alt="语图 架构图" width="100%" />
</div>

## 设计原则与模型策略

### 设计原则

| 原则                       | 落地方式                                                                                                                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 确定性程序优先             | 意图识别用正则+关键词规则覆盖 generate/modify/consult 三类，模型仅兜底规则未命中场景；反思校验用 Zod schema 做格式校验 + 拓扑 set-diff 比对计划骨架与执行结果；布局坐标用 @antv/layout 层级算法计算，模型不输出坐标 |
| 单一职责 / 显式优于隐式    | 每个 LangGraph 节点只读写自己需要的 State 片段；模型只输出 FlowDraft 语义结构（节点/边/类型/标签），坐标、样式、ports 由前端转换层程序化生成                                                                        |
| 优雅降级                   | 工具调用失败按类型分级：网络错误自动重试，参数错误降级提示，模型超时返回兜底响应；模糊语义不盲改，触发人在回路由用户确认                                                                                            |
| human-in-the-loop / 可观测 | Langfuse 按 traceId 串联意图→生成→反思→工具全链路，记录每次 LLM 调用的 input/output/duration；模糊语义暂停执行，交用户确认后继续                                                                                    |

**原则之间的协同**：**确定性优先**划定"什么不该交给模型"的边界，把可控性收回到代码层；**单一职责**确保边界内的每个组件职责清晰、行为可预期，出了问题能精准定位到具体节点；**可观测**让组件运行状态透明化，通过 trace 排查故障；**优雅降级**是系统的可靠性底线——工具失败、模型超时、语义模糊时，不崩溃、始终返回有价值的响应。

### Harness Engineering 视角

本方案的技术设计大量借鉴了 **Harness Engineering** 的思想。AI 应用的工程化可以分为三层：

| 层         | 英文                | 定义                                                                     | 本项目体现                                                              |
| ---------- | ------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| 提示词工程 | Prompt Engineering  | 优化单次交互的质量——措辞、结构、示例                                     | System Prompt 设计、输出格式约束                                        |
| 上下文工程 | Context Engineering | 管理模型一次能看到多少信息——检索哪些文档、如何压缩历史、上下文窗口放什么 | 记忆管理、向量检索、Token 预算、上下文组装                              |
| 驾驭工程   | Harness Engineering | 构建 Agent 运行的世界——工具、知识源、验证逻辑、架构约束                  | 确定性程序（规则意图识别、Zod 校验、图结构验证、@antv/layout 布局算法） |

::: tip 关键认知
前两层决定单次质量，第三层决定 Agent 能否在数百次决策中稳定可靠地运行。本方案大量篇幅即在设计这第三层——harness 虽然没有体现在某一个具体模块中，但可以说无处不在，它是"确定性优先"哲学的系统化落地。
:::

### 模型分层策略

系统采用模型分层策略以平衡成本与质量：

| 层级          | 模型             | 用途                           | 选择理由                                                 |
| ------------- | ---------------- | ------------------------------ | -------------------------------------------------------- |
| 高级模型      | 大参数 LLM       | 核心生成（流程图语义结构生成） | 需要最强的语义理解和结构化输出能力                       |
| 中等模型      | 中参数 LLM       | 反思校验                       | 校验不需要最强的生成能力，但需要可靠的逻辑推理           |
| 低级模型/规则 | 小模型或规则引擎 | 意图识别、简单判断             | 意图分类是简单分类任务，规则覆盖 80%+ 场景，模型只做兜底 |

## 核心数据结构

系统的数据结构分四层：业务领域模型（持久化实体）、AI 中间结构（模型↔代码）、渲染目标结构（代码↔画布）、运行时 State（LangGraph 执行）与记忆画像。

### 业务领域模型

```typescript
// 项目
interface Project {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

// 用户
interface User {
  id: string;
  username: string;
  email: string;
  avatar?: string;
}

// 流程图文档：X6 序列化后的完整 JSON，含坐标、样式、ports
// 持久化于 PostgreSQL JSONB，通过 projectId 关联项目
interface FlowchartDocument {
  id: string;
  projectId: string;
  cells: unknown[]; // X6 cells 数组，节点 + 边
  metadata: {
    version: number;
    updatedAt: string;
  };
}
```

### AI 中间结构（模型输出，仅语义）

模型不输出 X6 完整 JSON，只输出"描述流程语义的中间结构"，由前端程序化转接为 X6 数据。坐标与样式全部交给确定性代码。

::: tip 设计哲学
"让模型做更擅长的语义理解，让代码做格式转换和布局"——这是确定性优先在架构层面的体现。模型输出越简单，出错空间越小。
:::

```typescript
// 模型返回的中间结构（FlowDraft）—— 不含坐标、不含样式
interface FlowDraft {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

interface FlowNode {
  id: string; // 节点唯一 ID
  label: string; // 显示文本
  type: NodeType; // 节点类型（决定样式/ports 映射）
  // 注意：无 x/y，无 style，无 ports 定义
}

type NodeType = "start" | "end" | "process" | "decision" | "io" | "subprocess";

interface FlowEdge {
  id: string;
  source: string; // 源节点 ID
  target: string; // 目标节点 ID
  label?: string; // 分支标签（如 是/否）
}

// 前端转换层：中间结构 -> X6 完整 JSON
// 1) @antv/layout 层级布局算法计算坐标
// 2) 节点类型映射表生成 style + ports
// 3) 拼装注册到画布
```

### Modify 场景输出结构

modify 场景下，模型不再输出完整 FlowDraft，而是输出增量操作序列（`ModifyPatchOutput`）。每个 operation 描述一个原子变更——改一个节点的颜色、加一条边、删除一个节点等——系统按序执行后合并到当前画布。操作分两类：结构变更通过 `semantic` 字段描述（label、nodeType），视觉变更通过 `visual` 字段描述（fillColor、borderColor 等受限枚举字段）。

```typescript
// Modify 场景 — 增量 Patch 输出类型定义
// NodeType 与 FlowDraft 共享同一套定义，此处不重复

/** 节点视觉 patch — 只描述变化量，未出现的字段保持原值 */
interface NodeVisualPatch {
  fillColor?: string;
  borderColor?: string;
  borderWidth?: 1 | 2 | 3 | 4 | 5;
  borderStyle?: "solid" | "dashed" | "dotted";
  // ... 点击下方展开完整定义
}
```

::: details 展开完整类型定义

```typescript
// ============================================================
// 语图 Modify 场景 — 增量 Patch 输出类型定义
// ============================================================
// NodeType 与 FlowDraft 共享同一套定义，保证两种场景类型词汇一致。

// ────────────────────────────────────────
// 1. 语义枚举（复用 FlowDraft）
// ────────────────────────────────────────

/** 节点类型 — 与 FlowDraft 共享，不单独定义 */
type NodeType = "start" | "end" | "process" | "decision" | "io" | "subprocess";

// ────────────────────────────────────────
// 2. 视觉属性（受限枚举，非自由 JSON）
// ────────────────────────────────────────

type BorderStyle = "solid" | "dashed" | "dotted";
type FontWeight = "normal" | "bold";
type MarkerType = "classic" | "diamond" | "block" | "circle" | "none";
type Direction = "top" | "bottom" | "left" | "right";

/** 节点视觉 patch — 只描述变化量，未出现的字段保持原值 */
interface NodeVisualPatch {
  fillColor?: string;
  borderColor?: string;
  borderWidth?: 1 | 2 | 3 | 4 | 5;
  borderStyle?: BorderStyle;
  borderRadius?: number;
  width?: number;
  height?: number;
  fontColor?: string;
  fontSize?: 10 | 12 | 14 | 16 | 18 | 20 | 24;
  fontWeight?: FontWeight;
  shadow?: boolean;
}

/** 边视觉 patch */
interface EdgeVisualPatch {
  strokeColor?: string;
  strokeWidth?: 1 | 2 | 3 | 4 | 5;
  strokeDasharray?: string;
  targetMarker?: MarkerType;
  sourceMarker?: MarkerType;
  labelFontColor?: string;
  labelFontSize?: 10 | 12 | 14 | 16;
}

// ────────────────────────────────────────
// 3. Target 定位（按 label 或 id）
// ────────────────────────────────────────

/** 节点定位 — label 和 id 至少提供一个 */
interface NodeTarget {
  label?: string;
  id?:    string;
}

/** 按端点 label 定位边 */
interface EdgeTarget {
  type: "edge";
  source: string;
  target: string;
}

// ───────────────────────────────────────
// 4. 相对定位（新增节点时使用）
// ───────────────────────────────────────

interface RelativePosition {
  relativeTo: { label: string };
  direction: Direction;
  offset?: number; // 间距 px，默认 150
}

// ─────────────────────────────────────
// 5. 语义 patch
// ────────────────────────────────────────

interface NodeSemanticPatch {
  label?: string;
  nodeType?: NodeType; // 复用 FlowDraft 的 NodeType
}

interface EdgeSemanticPatch {
  label?: string;
}

// ────────────────────────────────────────
// 6. Operation 联合类型
// ────────────────────────────────────────

interface ModifyNodeOp {
  op: "modify_node";
  target: NodeTarget;
  semantic?: NodeSemanticPatch;
  visual?: NodeVisualPatch;
}

interface ModifyEdgeOp {
  op: "modify_edge";
  target: EdgeTarget;
  semantic?: EdgeSemanticPatch;
  visual?: EdgeVisualPatch;
}

interface AddNodeOp {
  op: "add_node";
  semantic: { label: string; nodeType: NodeType };
  visual?: NodeVisualPatch;
  position?: RelativePosition;
}

interface AddEdgeOp {
  op: "add_edge";
  semantic: {
    source: { label: string };
    target: { label: string };
    label?: string;
  };
  visual?: EdgeVisualPatch;
}

interface DeleteNodeOp {
  op: "delete_node";
  target: NodeTarget;
}
interface DeleteEdgeOp {
  op: "delete_edge";
  target: EdgeTarget;
}

interface RepositionOp {
  op: "reposition";
  target: NodeTarget;
  position: RelativePosition;
}

type Operation =
  | ModifyNodeOp
  | ModifyEdgeOp
  | AddNodeOp
  | AddEdgeOp
  | DeleteNodeOp
  | DeleteEdgeOp
  | RepositionOp;

// ───────────────────────────────────────
// 7. 顶层输出
// ───────────────────────────────────────

interface ModifyPatchOutput {
  operations: Operation[];
}
```

:::

::: tip 与 FlowDraft 的关系
FlowDraft 用于 generate 场景的全量输出，ModifyPatchOutput 用于 modify 场景的增量输出。两者的语义枚举（NodeType 等）保持一致，区别在于 FlowDraft 描述完整图结构，ModifyPatchOutput 只描述变化量。
:::

### 渲染目标结构

FlowDraft 经前端转换层生成 X6 完整 JSON（含坐标、样式、ports、zIndex），作为画布渲染的输入。编辑器保存时，X6 JSON 序列化后存入 PostgreSQL JSONB。

```typescript
// X6 渲染目标结构（前端转换层输出，画布输入）
// 完整结构见 editor.md，此处为接口示意
interface X6GraphData {
  cells: Array<X6Node | X6Edge>;
}

interface X6Node {
  id: string;
  shape: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  attrs: Record<string, unknown>;
  ports?: Record<string, unknown>;
}

interface X6Edge {
  id: string;
  shape: "edge";
  source: string;
  target: string;
  attrs?: Record<string, unknown>;
}
```

### 记忆与画像结构

```typescript
// 短期记忆索引：由 BaseMessage[] 派生的轻量特征层
// Checkpointer 负责 State 持久化，TurnRecord 在此基础上补充 intent、topicId 等特征
// 用于话题漂移检测和记忆检索，不独立写入
interface TurnRecord {
  turnId: number;
  role: "user" | "assistant";
  content: string; // 原文（拼 context 直接用）
  timestamp: string;
  intent?: IntentType; // 轻量特征提取
  entities?: Record<string, unknown>;
  topicId?: string; // 话题 ID，用于漂移检测
}

// 长期记忆：摘要 + 关键词 + 实体槽 + 元数据
// 注意：向量由 Store 的 index.embed 内部生成，不暴露在接口契约中
interface LongTermMemory {
  summary: string; // 摘要文本（召回后给 LLM 看，Store 据此自动生成向量建索引）
  keywords: string[];
  sessionEntitySlot: Record<string, unknown>; // 精确实体，避免压缩丢失
  metadata: {
    sessionId: string;
    isSummarized: boolean; // 未压缩的原始记忆也要召回
    topics: string[];
    timestamp: string;
  };
}

// 用户画像：稳定特征集合（JSON 文档，独立命名空间）
interface UserProfile {
  basic_info: Record<string, unknown>;
  preferences: {
    language?: string;
    interaction_style?: string;
    content_types?: string[];
  };
  background?: string;
  metadata: {
    updated_at: string;
    version: number;
  };
}
```

### 接口契约类型

```typescript
// 意图类型
type IntentType = "generate" | "modify" | "consult";

// 反思校验结果
interface ReflectionResult {
  passed: boolean;
  category?: "format" | "structure" | "semantic";
  message?: string; // 失败原因，供 Rewriter 修正用
}

// 工具调用结果
interface ToolResult {
  status: "success" | "error";
  toolName: string;
  data?: unknown; // 成功时的结构化返回
  error?: ToolError; // 失败时的结构化错误（见 tool-calling.md）
}
```

### LangGraph State 定义

```typescript
// LangGraph 状态图的核心 State 结构
interface AgentState {
  messages: BaseMessage[]; // 对话消息历史（LangChain MessagesState）
  intent?: IntentType; // 意图识别结果
  flowDraft?: FlowDraft; // 生成结果（中间结构）
  canvasContext?: FlowDraft; // modify 场景注入当前画布语义结构（带 ID），供模型复用
  reflectionResult?: ReflectionResult; // 反思校验结果
  userProfile?: UserProfile; // 用户画像（按需注入）
  rollingSummary?: string; // 滚动摘要
  toolResults?: ToolResult[]; // 工具调用结果
}
```

## 难点

### 用于渲染的antv X6的json数据的可靠性如何保证？

1. 模型只输出语义结构，前端程序负责解析转换为X6的json数据，坐标样式的数据也由前端程序负责计算
2. 反思反馈层对输出的语义结构进行两层校验，不通过重新生成
3. 在system prompt 中添加语义结构的json示例

### 上下文长度如何控制？

Context 的本质是模型的注意力预算，塞进去的每一段都在跟其他段抢注意力。Context 越长，模型对关键信息的注意力越稀释。这不是省 token 的问题，是保注意力的问题。具体策略：

1. 模型输出只有语义信息，不输出坐标样式等数据
2. 在modify场景使用增量输出不使用全量
3. 意图识别后按类型组装上下文
4. 短期记忆判断够用后，不再添加长期记忆
5. 上下文组装环节兜底，对占比过高的部分进行截断

### 增量修改如何实现？

modify 场景下，用户已在画布上手动调整的节点坐标与样式不能被覆盖。

1. 拿模型返回的 FlowDraft 与当前画布数据做 diff，按节点 ID 一对一比对：ID 和内容均一致判未变化，ID 一致但内容变了判修改，旧画布有但模型输出中没有判删除，模型输出中有但旧画布没有判新增。

::: details 多次模型调用 ID 不稳定，怎么做 diff？

LLM 跨调用保持 ID 一致性不可靠（漏写、重编、大小写偏差均会发生），单靠 ID 匹配会误判。于是设计了四层降级匹配，上一层命中即停：

```typescript
type MatchLevel = "id" | "semantic" | "topology" | "edge_check";
```

- **L1 ID 精确匹配**：旧节点 `id === 新节点.id` 直接配对。modify 注入带 ID 的完整 FlowDraft，模型复用 ID 概率较高，这是主路径。
- **L2 语义匹配**：L1 未配对的剩余节点，按 `(label, type)` 归一化比较。`label.trim().toLowerCase()` 后字符串相等且 `type` 严格相等才配对（`type` 作硬约束，避免 start 误配成 process）。命中判为修改，保留旧 ID，用新内容覆盖。覆盖场景：模型漏写或重写 ID 但节点语义未变，如 `n3:{label:"审批",type:"process"}` → `n3_:{label:"审批",type:"process"}`。
- **L3 拓扑匹配**：L2 仍剩余节点，比较邻居签名 `(前驱 id 集合, 后继 id 集合)`，前驱 / 后继由 L1/L2 已配对结果确定。签名一致判为修改，保留旧 ID，用新 label 覆盖。覆盖场景：label 变更或重复导致 L2 失配，如 `n5:{label:"通知A"}` → `n5_x:{label:"通知B"}`，label 不同但前后继与旧 n5 一致。
- **L4 边校验兜底**：L1-L3 均未配对的旧节点，不直接判删除。查当前画布中该节点是否仍被边引用：有边连接 → 判定模型误删，保留节点；无边连接 → 判定为真删除。

:::

::: details 现在模型输出的 FlowDraft 不含样式坐标等信息，如果用户说”修改审批节点为红色”怎么处理？

核心矛盾：语义结构省 token 但丢视觉信息，完整 X6 cell 结构有视觉信息但不可靠且费 token。解决思路是**让模型输出增量 patch（变化量），而非完整 cell 结构**。

patch 将修改分为两类，统一在一个操作序列中：

- **结构变更**：label 修改、节点/边增删 —— 通过 `semantic` 字段描述
- **视觉变更**：颜色、大小、边框等 —— 通过 `visual` 字段描述，字段名是高层语义（`fillColor`、`borderColor`），系统侧映射为 X6 的 attr 路径

每个操作通过 `target` 定位目标元素（按 label、id 或语义角色），只输出要修改的字段，不写的字段保持原值。系统拿到 patch 后直接合并到现有 cell，不需要输出完整结构。

```typescript
// 示例：用户说”把审批节点改成红色，并在后面加一个归档节点”
{
  operations: [
    {
      op: "modify_node",
      target: { type: "node", oldLabel: "审批" },
      visual: { fillColor: "#ff0000", fontColor: "#ffffff" },
    },
    {
      op: "add_node",
      semantic: { label: "归档", nodeType: "process" },
      position: { relativeTo: { label: "审批" }, direction: "bottom" },
    },
    {
      op: "add_edge",
      semantic: { source: { label: "审批" }, target: { label: "归档" } },
    },
  ];
}
```

支持的操作类型：`modify_node`（改节点）、`modify_edge`（改边）、`add_node`（加节点）、`add_edge`（加边）、`delete_node`（删节点）、`delete_edge`（删边）、`reposition`（移动节点）。一次请求可以混合多种操作。

visual 字段是受限枚举而非自由 JSON —— 模型只能从预定义的字段中选择（`fillColor`、`borderColor`、`borderWidth` 等），不能输出 schema 之外的字段。这样 token 开销小（改一个节点只需几十个 token），可靠性由 schema 约束保证。

:::

2. 选择性应用

- 未变化节点：保持原样，含用户手动调整的坐标与样式
- 修改节点：只更新内容字段（如 label），保留布局位置
- 新增节点：重新计算位置

3. 新增节点布局与碰撞检测

`@antv/layout` 面向全图全局布局，无法用于单节点。新增节点位置按以下步骤确定：

1. 初始位置：取该节点所有 source/target 已有节点坐标的中心点，使其落在逻辑关联区域附近
2. 碰撞检测：放入初始位置，检测与已有节点的矩形重叠
3. 逐步偏移：碰撞则沿固定方向（先向下、再向右）按步长偏移，每次偏移重新检测，直至无重叠
