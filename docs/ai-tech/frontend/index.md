---
title: 前端
icon: code
order: 1
category:
  - 语图技术方案
---

# 前端

语图的前端不是"调接口的壳"，而是整个产品里**确定性与模型解耦**的关键执行层：模型只负责"这张图该长什么样"（语义），前端负责"怎么画出来"（坐标、样式、连线、渲染）。本页先说清前端在语图里的位置、技术选型与四大模块，后续《编辑器》再逐块展开。

## 1. 技术选型

| 模块      | 技术                | 职责                                                   |
| --------- | ------------------- | ------------------------------------------------------ |
| 应用框架  | React + TypeScript  | UI 组织、状态管理、组件化                              |
| UI 组件库 | antd                | 表单、弹窗、列表、项目管理的现成组件                   |
| 编辑引擎  | AntV X6             | 流程图编辑（undo/redo、节点增删改、连线、样式、导入导出）|
| 自动布局  | @antv/layout        | 层级布局算法计算节点坐标                               |
| 流式通信  | SSE（EventSource）  | 对话接口流式推送，逐 token 渲染 AI 思考与生成内容      |

## 2. 四大前端模块

| 模块        | 技术                    | 说明                                                       |
| ----------- | ----------------------- | ---------------------------------------------------------- |
| 画布编辑    | AntV X6                 | 撤销/重做、节点增删改、连线、样式调整                       |
| 对话窗      | SSE 流式渲染            | 悬浮于画布右侧，逐步展示 AI 生成内容与思考过程             |
| 项目管理    | React + antd            | 项目列表、创建、删除、编辑，数据保存，跨项目记忆隔离       |

两种数据生成方式：
1. **拖拉拽**：用户在 X6 画布上手动创建和编辑流程图。
2. **AI 生成**：用户通过对话窗输入自然语言，AI 自动生成流程图（支持 generate / modify / consult 三种意图）。

## 3. 确定性优先在前端的落地

贯穿整个产品的核心思想是 **「确定性程序 → 小模型 → 大模型」** 的分层降级。在前端这一层，最典型的表现是**中间数据结构（FlowDraft）**：

- 模型**不输出** X6 完整 JSON（坐标、样式、ports、zIndex），只输出描述流程语义的中间结构。
- 前端程序化地把中间结构转接为 X6 数据：**① @antv/layout 层级布局算法算坐标 → ② 节点类型映射表生成 style + ports → ③ 拼装注册到画布**。
- 坐标与样式全部交给确定性代码，模型输出越简单，出错空间越小。

```typescript
// 模型返回的中间结构（FlowDraft）—— 不含坐标、不含样式
interface FlowDraft {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

interface FlowNode {
  id: string;       // 节点唯一 ID
  label: string;    // 显示文本
  type: NodeType;   // 节点类型（决定样式/ports 映射）
  // 注意：无 x/y，无 style，无 ports 定义
}

type NodeType = "start" | "end" | "process" | "decision" | "io" | "subprocess";

// 前端转换层：中间结构 -> X6 完整 JSON
// 1) @antv/layout 层级布局算法计算坐标
// 2) 节点类型映射表生成 style + ports
// 3) 拼装注册到画布
```

### Token 优化（前端视角）

中间结构的引入同时是前端渲染稳定性的关键，也是 Token 优化的关键：

| 阶段       | 方案                  | 输出内容                                 | Token 消耗        |
| ---------- | --------------------- | ---------------------------------------- | ----------------- |
| 早期       | 直接输出 X6 完整 JSON | 坐标、样式、ports、zIndex 全部由模型生成 | ~2000             |
| 第一次优化 | 引入中间表示层        | 模型只输出流程语义结构                   | ~600-700（1/3）   |
| modify 注入 | 完整 FlowDraft（带 ID） | 带节点/边 ID 支撑增量 diff（不再降级为摘要，摘要会破坏 ID 匹配前提） | ~600-700          |

X6 完整 JSON 有多臃肿？一个简单的 2 节点 1 边图，X6 序列化后约 500 行 JSON，其中每个节点约 20 个 port 定义、坐标、样式细节——这些在前端转换层由确定性代码生成，不需要模型操心。

## 4. 前端模块结构图

```mermaid
graph TB
  subgraph App["前端 React + TS + antd"]
    direction TB
    CW["对话窗\nSSE 流式渲染"]
    Canvas["画布编辑\nAntV X6"]
    PM["项目管理\nReact + antd"]
    MW["中间数据层\n@antv/layout + 节点类型映射"]
  end
  Gateway["网关层\nSSE 流式接口 + Redis JWT 鉴权"]
  Server["后端 NestJS\nauth / user / project / editor / search / ai"]
  Agent["AI 模块\nLangGraph 状态图"]

  CW -->|自然语言意图| Gateway
  Gateway --> Agent
  Agent -->|FlowDraft 中间结构| MW
  MW -->|X6 完整 JSON| Canvas
  Canvas -->|拖拉拽增删改| MW
  Canvas -->|导入导出| Server
  PM --> Server
```

## 5. 端到端数据流（前端视角）

```mermaid
flowchart TD
  U["用户输入自然语言"] --> CW["对话窗 SSE 接收流式输出"]
  CW --> FD["AI 产出 FlowDraft\n仅语义：节点/边/类型"]
  FD --> LAY["@antv/layout 计算坐标"]
  LAY --> MAP["节点类型映射\nstyle + ports"]
  MAP --> ASM["拼装 X6 完整 JSON"]
  ASM --> RENDER["X6 画布渲染"]
  RENDER --> SAVE["保存 X6 JSON\n后端 PostgreSQL"]
```

::: warning 编辑器的能力边界
编辑器的定位是"为展示做一个流程图效果的模板"，本质是工具；具体怎么展示（是否对接实时数据状态）由数据汇聚平台决定。编辑器**无法**对接数据库数据、实时显示数据是否正常状态——这类实时态由数据汇聚平台展示侧负责。两者职责要做到清晰切分。
:::

## 6. 相关页面

- [编辑器（AntV X6）](./editor.md)：画布能力、undo/redo、数据管理、导入导出
- [登录鉴权](../backend/auth.md)：表单、头像、token 携带、JWT 校验
