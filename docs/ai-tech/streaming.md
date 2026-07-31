---
title: 结果输出
icon: streaming
order: 9
category:
  - 语图技术方案
---

# 流式输出

## 核心设计：思考流式 + 数据一次性

语图的生成链路产出两类内容，消费特征完全不同：

| 内容 | 消费者 | 时间线 | 推送策略 |
|------|--------|--------|----------|
| CoT 思考过程 | 给用户看 | 流式逐 token | **SSE 实时推送** |
| FlowDraft JSON | 给程序用（渲染） | 必须完整 | **前端 fetch 一次性拉取** |

不在同一个 SSE 连接里用 event type routing 分流——那会让一条连接既运"展示内容"又运"程序数据"，混用后靠事件类型打补丁区分。分开两个连接、各自独立：

```
前端                         后端
 │                           │
 │── POST /api/ai/chat ──────→│ 发起对话，启动 LangGraph
 │←── { threadId }  ─────────│ 立即返回，不等生成完成
 │                           │
 │── SSE /api/ai/think/:id ──→│ 连接 CoT 流
 │←── event: think           │ 逐 token 推送思考过程
 │←── event: think           │
 │←── [连接关闭]             │ 思考结束
 │                           │
 │── GET /api/ai/result/:id ─→│ 拉 FlowDraft
 │←── { nodes, edges } ──────│ 一次性返回完整 JSON
 │                           │
 │  renderToCanvas()         │
```

**职责边界**：SSE 管展示层（给人看），fetch 管数据层（给程序用）。两者耦合只有一个点——SSE 关闭后前端发起 fetch。

## CoT 思考流式推送（SSE + takeUntil）

SSE 连接专用于推送 `<thinking>` 标签内的 token。后端用 RxJS Observable 承载 token 流，`@Sse()` 消费。

```typescript
// 后端：CoT SSE 控制器
@Sse('ai/think/:threadId')
think(
  @Req() req: Request,
  @Param('threadId') threadId: string
): Observable<MessageEvent> {
  const abort$ = new Subject<void>();
  req.on('close', () => abort$.next());

  return this.aiService.getThinkingStream(threadId).pipe(
    takeUntil(abort$),
    map(chunk => ({ data: JSON.stringify({ token: chunk }) }))
  );
}
```

```typescript
// 前端：监听 CoT 流
function startThinkStream(threadId: string): Promise<void> {
  return new Promise((resolve) => {
    const es = new EventSource(`/api/ai/think/${threadId}`);
    es.onmessage = (e) => {
      const { token } = JSON.parse(e.data);
      thinkingPanel.append(token); // 灰色小字实时追加
    };
    es.onerror = () => {
      thinkingPanel.collapse(); // 思考结束，折叠收起
      es.close();
      resolve(); // resolve → 触发 fetch 拉 JSON
    };
  });
}
```

连接关闭时（思考结束或用户离开）`takeUntil(abort$)` 终止 Observable，不浪费 token。

## FlowDraft 完整拉取（fetch）

思考 SSE 关闭后，前端用 fetch 一次性拉完整 JSON。如果生成尚未完成，后端返回 `202` + `Retry-After`，前端轮询。

```typescript
// 后端：FlowDraft 拉取接口
@Get('ai/result/:threadId')
async getResult(@Param('threadId') threadId: string) {
  const state = await this.aiService.getState(threadId);

  if (!state.flowDraft) {
    // 尚未生成完成
    throw new HttpException('Not ready', HttpStatus.ACCEPTED);
  }

  return state.flowDraft; // 完整 JSON，一次性返回
}
```

```typescript
// 前端：轮询拉取（SSE 关闭后触发）
async function fetchResult(threadId: string): Promise<FlowDraft> {
  while (true) {
    const res = await fetch(`/api/ai/result/${threadId}`);
    if (res.status === 202) {
      await sleep(500); // 等 0.5 秒重试
      continue;
    }
    return res.json();
  }
}

// 完整调用链
const { threadId } = await fetch("/api/ai/chat", {
  method: "POST",
  body: JSON.stringify({ message: userInput }),
}).then(r => r.json());

await startThinkStream(threadId);  // 等 SSE 关闭
const flowDraft = await fetchResult(threadId); // 拉 JSON
renderToCanvas(flowDraft);
```

::: warning 为什么不在 SSE 关闭时直接捞？
SSE 关闭 = 思考过程结束 = 模型输出已经进入 `<output>` 阶段。但 JSON 也可能还没写完（思考标签闭合后还有几百个 token 的 JSON 要生成）。用轮询而非"SSE 关闭即捞"更稳妥，重试最多一次就到了。
:::

## LangGraph 事件流对接

生成节点通过 LangGraph 的 `astream_events()` 拿到 token 流，按标签状态分发到不同分支：

```typescript
// 后端 aiService：生成节点的 token 分发逻辑
async *getThinkingTokens(threadId: string) {
  const stream = app.streamEvents(
    { messages: [...], intent: "generate" },
    { version: "v2", configurable: { thread_id: threadId } }
  );

  let inThinking = false;

  for await (const event of stream) {
    if (event.event !== "on_chat_model_stream") continue;

    const text = event.data.chunk.content;

    // 检测 <thinking> 标签
    if (text.includes("<thinking>")) {
      inThinking = true;
      continue;
    }
    if (text.includes("</thinking>")) {
      inThinking = false;
      continue;
    }

    if (inThinking) {
      yield text; // → 流向 SSE /api/ai/think/:id
    }
    // 非思考 token 忽略，不做 SSE 推送
  }
}
```

`on_chat_model_stream` 只用于思考过程的实时推送。FlowDraft 的完整 JSON 不从这里拿，而是由 `on_chain_end`（generate 节点完成事件）把 `flowDraft` 写入 State，供 `GET /api/ai/result/:id` 读取。两者数据源分离。

## Prompt 标签约定

模型在同一个回复中先输出 `<thinking>` 再输出 `<output>`。token 序列天然是从思考到结果——自回归生成机制决定了 `<thinking>` 在前的 token 先生成。

```
# System Prompt 中的格式约束

你需要先输出思考过程，再输出最终结果。格式如下：

<thinking>
从用户描述中识别出以下流程要素：
- 角色/参与方：...
- 流程步骤：...
- 决策分支：...
- 节点映射：共 N 个节点
确认无遗漏后输出结果。
</thinking>

<output>
{
  "nodes": [...],
  "edges": [...]
}
</output>
```

::: tip 为什么思考一定会先生成？
LLM 是逐 token 自回归的。`<thinking>` 在 prompt 里写在 `<output>` 前面，模型就必然先产出思考内容、再产出 JSON。思考 token 写进 KV Cache 后，后续 JSON 生成时注意力能"看到"思考过程——这是真正的 CoT，不是前端障眼法。
:::

## 连接生命周期与泄露防护

两个连接各自独立管理生命周期：

| 连接 | 关闭时机 | 泄露风险 |
|------|---------|---------|
| SSE `/api/ai/think/:id` | `<thinking>` 标签结束 或 用户离开 | token 持续推送浪费 |
| fetch `/api/ai/result/:id` | 拿到 JSON 即刻断 | 无泄漏（单次请求） |

SSE 的防泄露和旧版一致——`takeUntil(abort$)`：

```typescript
const abort$ = new Subject<void>();
req.on('close', () => abort$.next());
return stream.pipe(takeUntil(abort$));
```

fetch 侧不需要特殊防护——单次 REST 请求天然不会泄露。

## 对话接口：启动生成

`POST /api/ai/chat` 的职责是接收用户输入、启动 LangGraph 工作流、立即返回 `threadId`。不等待生成完成。

```typescript
@Post('ai/chat')
async chat(@Body() dto: ChatDto) {
  const threadId = nanoid();

  // 异步启动 graph（不 await）
  this.aiService.runGraph(threadId, dto.message).catch(err => {
    this.logger.error(`Graph run failed: ${threadId}`, err);
  });

  return { threadId };
}
```

LangGraph 在后台执行，SSE 和 fetch 通过 `threadId` 各自取各自需要的数据——三者解耦。
